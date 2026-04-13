// =============================================================================
// cli/scaffold.js — template substitution + file generation
//
// Reads templates/_base/{index.html,style.css} and
// templates/<category>/<name>/{body.html,app.js}, substitutes the HTML-comment
// markers in _base/index.html with the template's content, the app config,
// the inlined SDK, and the app name, and writes the composed index.html,
// manifest.json, icon.svg, and sw.js into the output directory.
//
// Marker format: <!-- KEY --> inside templates/_base/index.html. Every
// marker in the source must have a matching replacement, otherwise
// substituteMarkers throws (drift detector — a template adding a new
// marker without wiring it up in the scaffolder should fail loudly).
//
// Security: APP_CONFIG is the one substitution sourced from user input,
// so it runs through safeJSONForHTMLScript (from sdk/pocket.js) to neuter
// </script> breakouts and U+2028/2029. APP_NAME is validated at the prompt
// layer to a safe character class before it reaches here, but we also
// HTML-escape it as a belt-and-braces measure.
//
// Everything else (SDK_INLINE, STYLE_INLINE, APP_BODY, APP_SCRIPT) comes
// from files committed to the repo and is trusted verbatim.
// =============================================================================

'use strict';

const fs = require('fs/promises');
const path = require('path');

const Pocket = require(path.join(__dirname, '..', 'sdk', 'pocket.js'));

const MARKER_RE = /<!--\s*([A-Z][A-Z0-9_]*)\s*-->/g;

// -----------------------------------------------------------------------------
// Pure helpers (no filesystem, no Node specifics) — easy to unit test
// -----------------------------------------------------------------------------

function substituteMarkers(source, replacements) {
  const used = new Set();
  const result = source.replace(MARKER_RE, function (_, key) {
    if (!Object.prototype.hasOwnProperty.call(replacements, key)) {
      throw new Error('scaffold: unknown marker <!-- ' + key + ' --> in template');
    }
    used.add(key);
    return String(replacements[key]);
  });

  // It's fine for a replacement to be provided but unused (e.g. when we add
  // a new marker to the scaffolder before any template references it). What
  // we catch loudly is the reverse — a template marker with no replacement.
  return { text: result, used: used };
}

function escapeHTMLText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildAppConfig(opts) {
  // The runtime config blob embedded as <script type="application/json"
  // id="app-config">. Kept minimal on purpose — the stub PR only reads
  // appName/host/defaultModel. Richer fields (systemPrompt, schemas,
  // ageGroup-derived copy) land with the Spell Bee template PR.
  return {
    appName: opts.appName,
    appSlug: opts.slug,
    category: opts.category,
    template: opts.templateName,
    ageGroup: opts.ageGroup,
    defaultModel: opts.model,
    host: opts.host,
    sdkVersion: Pocket.VERSION,
    scaffoldedAt: opts.scaffoldedAt || new Date().toISOString(),
  };
}

function buildManifest(opts) {
  return {
    name: opts.appName + ' (' + opts.slug + ')',
    short_name: opts.appName,
    description: opts.description || (opts.appName + ' — a local AI app scaffolded by ollama-pocket'),
    start_url: './index.html',
    scope: './',
    display: 'standalone',
    background_color: '#0f0f0f',
    theme_color: '#0f0f0f',
    orientation: 'portrait',
    icons: [
      {
        src: 'icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
  };
}

function buildIconSVG(opts) {
  // Deterministic per-slug icon: first two letters on a dark square with a
  // slug-derived accent color. Good enough for a v1 PWA icon — a real art
  // pass can come later without breaking anything else.
  const initials = (opts.appName || opts.slug || '?').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
  const hue = hashHue(opts.slug || opts.appName || 'ollama-pocket');
  const accent = 'hsl(' + hue + ', 72%, 56%)';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">\n' +
    '  <rect width="192" height="192" rx="32" fill="#0f0f0f"/>\n' +
    '  <rect x="16" y="16" width="160" height="160" rx="24" fill="' + accent + '" fill-opacity="0.18"/>\n' +
    '  <text x="96" y="120" font-family="system-ui, -apple-system, sans-serif" font-size="96" font-weight="700" text-anchor="middle" fill="' + accent + '">' + escapeHTMLText(initials) + '</text>\n' +
    '</svg>\n'
  );
}

function buildServiceWorker(opts) {
  // Minimal same-origin cache-on-first-fetch. Enough to satisfy "installable
  // PWA" requirements. A smarter offline strategy is a per-template concern
  // and can replace this stub when a template actually needs it.
  const cacheName = 'pocket-' + opts.slug + '-v1';
  return (
    '// Auto-generated by cli/scaffold.js — do not edit by hand.\n' +
    "const CACHE = '" + cacheName + "';\n" +
    "const SHELL = ['./', './index.html', './manifest.json', './icon.svg'];\n" +
    "self.addEventListener('install', (e) => {\n" +
    '  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));\n' +
    '});\n' +
    "self.addEventListener('activate', (e) => {\n" +
    '  e.waitUntil(self.clients.claim());\n' +
    '});\n' +
    "self.addEventListener('fetch', (e) => {\n" +
    "  if (e.request.method !== 'GET') return;\n" +
    '  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));\n' +
    '});\n'
  );
}

function hashHue(input) {
  // djb2, mod 360. Deterministic and dependency-free.
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

// -----------------------------------------------------------------------------
// Compose an index.html from base + style + template + SDK + config
// -----------------------------------------------------------------------------

function escapeInlineScript(code) {
  // Neutralise stray `</script>` / `</style>` sequences inside code that will
  // land between <script>…</script> or <style>…</style>. The HTML5 parser
  // scans raw text script/style content for the literal closing tag byte
  // sequence regardless of surrounding JS/CSS syntax, so an innocent comment
  // like `// handles </script> injection` in the SDK source would prematurely
  // close the <script> element when inlined. `<\/script>` is identical to
  // `</script>` in both JavaScript and CSS string/comment contexts — the
  // backslash is a harmless escape that the language lexers discard — but the
  // HTML parser's literal byte match no longer triggers.
  //
  // Case-insensitive because HTML5 recognises </SCRIPT>, </Script>, etc. as
  // valid end tags.
  return String(code).replace(/<\/(script|style)\b/gi, '<\\/$1');
}

function composeIndexHTML(sources, opts) {
  // sources: { baseHTML, styleCSS, appBodyHTML, appScriptJS, sdkJS }
  const configJSON = Pocket.safeJSONForHTMLScript(buildAppConfig(opts));
  const replacements = {
    APP_NAME: escapeHTMLText(opts.appName),
    // STYLE_INLINE lands inside <style>…</style>; escape any stray </style>.
    STYLE_INLINE: escapeInlineScript(sources.styleCSS),
    // SDK_INLINE + APP_SCRIPT both land inside <script>…</script>. The SDK
    // source in particular has comments that reference `</script>` literally,
    // which would break out without this pass.
    SDK_INLINE: escapeInlineScript(sources.sdkJS),
    APP_CONFIG: configJSON,
    APP_BODY: sources.appBodyHTML,
    APP_SCRIPT: escapeInlineScript(sources.appScriptJS),
  };
  const { text } = substituteMarkers(sources.baseHTML, replacements);
  return text;
}

// -----------------------------------------------------------------------------
// Filesystem side — reads templates/sdk, composes, writes to outputDir
// -----------------------------------------------------------------------------

async function readTemplateSources(repoRoot, templateName) {
  // templateName: "category/name" — validated at the prompt layer.
  const baseDir = path.join(repoRoot, 'templates', '_base');
  const templateDir = path.join(repoRoot, 'templates', templateName);
  const sdkPath = path.join(repoRoot, 'sdk', 'pocket.js');

  const [baseHTML, styleCSS, appBodyHTML, appScriptJS, sdkJS] = await Promise.all([
    fs.readFile(path.join(baseDir, 'index.html'), 'utf8'),
    fs.readFile(path.join(baseDir, 'style.css'), 'utf8'),
    fs.readFile(path.join(templateDir, 'body.html'), 'utf8'),
    fs.readFile(path.join(templateDir, 'app.js'), 'utf8'),
    fs.readFile(sdkPath, 'utf8'),
  ]);
  return { baseHTML, styleCSS, appBodyHTML, appScriptJS, sdkJS };
}

async function pathExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
}

async function scaffold({ repoRoot, outputDir, opts, onProgress, force }) {
  // opts: { appName, slug, category, templateName, ageGroup, model, host }
  // onProgress: optional (msg) => void for CLI output
  const say = onProgress || function () {};

  if (!force && (await pathExists(outputDir))) {
    const err = new Error('output directory exists: ' + outputDir);
    err.code = 'EEXIST';
    throw err;
  }

  say('reading templates/_base/index.html');
  say('reading templates/_base/style.css');
  say('reading templates/' + opts.templateName + '/');
  say('reading sdk/pocket.js');
  const sources = await readTemplateSources(repoRoot, opts.templateName);

  say('composing index.html');
  const indexHTML = composeIndexHTML(sources, opts);

  say('generating manifest.json');
  const manifest = buildManifest(opts);

  say('generating icon.svg');
  const icon = buildIconSVG(opts);

  say('generating sw.js');
  const sw = buildServiceWorker(opts);

  say('writing ' + outputDir);
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'index.html'), indexHTML),
    fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'),
    fs.writeFile(path.join(outputDir, 'icon.svg'), icon),
    fs.writeFile(path.join(outputDir, 'sw.js'), sw),
  ]);

  return {
    outputDir: outputDir,
    files: ['index.html', 'manifest.json', 'icon.svg', 'sw.js'],
    sizeBytes: Buffer.byteLength(indexHTML, 'utf8'),
  };
}

module.exports = {
  // Pure helpers (exported for unit tests)
  substituteMarkers: substituteMarkers,
  escapeHTMLText: escapeHTMLText,
  escapeInlineScript: escapeInlineScript,
  buildAppConfig: buildAppConfig,
  buildManifest: buildManifest,
  buildIconSVG: buildIconSVG,
  buildServiceWorker: buildServiceWorker,
  composeIndexHTML: composeIndexHTML,
  hashHue: hashHue,
  // Filesystem side
  readTemplateSources: readTemplateSources,
  scaffold: scaffold,
  pathExists: pathExists,
};
