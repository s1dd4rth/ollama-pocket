// =============================================================================
// cli/test/scaffold.test.js — unit tests for cli/scaffold.js
//
// Covers the pure, filesystem-free helpers (marker substitution, config
// build, manifest/icon/sw generation) plus an end-to-end scaffold() run
// against a temp dir that uses the real repo templates. The end-to-end
// test is what gives us confidence that a PR touching any of:
//   - sdk/pocket.js
//   - templates/_base/*
//   - templates/kids-game/spell-bee/*
//   - cli/scaffold.js
// still produces a valid, loadable HTML file with the SDK inlined.
// =============================================================================

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');

const scaffold = require('../scaffold.js');
const Pocket = require('../../sdk/pocket.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// -----------------------------------------------------------------------------
// substituteMarkers
// -----------------------------------------------------------------------------

test('substituteMarkers replaces every marker in the source', () => {
  const source = '<h1><!-- APP_NAME --></h1><p><!-- APP_SLUG --></p>';
  const { text, used } = scaffold.substituteMarkers(source, {
    APP_NAME: 'Spell Bee',
    APP_SLUG: 'spell-bee',
  });
  assert.equal(text, '<h1>Spell Bee</h1><p>spell-bee</p>');
  assert.deepEqual([...used].sort(), ['APP_NAME', 'APP_SLUG']);
});

test('substituteMarkers tolerates whitespace inside marker braces', () => {
  const source = '<!--APP_NAME--><!-- APP_NAME --><!--   APP_NAME   -->';
  const { text } = scaffold.substituteMarkers(source, { APP_NAME: 'X' });
  assert.equal(text, 'XXX');
});

test('substituteMarkers throws on unknown marker', () => {
  const source = '<!-- SOMETHING_ELSE -->';
  assert.throws(
    () => scaffold.substituteMarkers(source, { APP_NAME: 'X' }),
    /unknown marker <!-- SOMETHING_ELSE -->/
  );
});

test('substituteMarkers allows unused replacements (no throw)', () => {
  // Extra keys in the replacement map are fine — lets the scaffolder add
  // a new marker before templates reference it, and vice versa.
  const source = '<!-- APP_NAME -->';
  assert.doesNotThrow(() =>
    scaffold.substituteMarkers(source, { APP_NAME: 'X', UNUSED: 'Y' })
  );
});

test('substituteMarkers ignores lowercase comments (not markers)', () => {
  const source = '<!-- normal comment --><!-- APP_NAME -->';
  const { text } = scaffold.substituteMarkers(source, { APP_NAME: 'X' });
  assert.equal(text, '<!-- normal comment -->X');
});

// -----------------------------------------------------------------------------
// escapeHTMLText
// -----------------------------------------------------------------------------

test('escapeHTMLText escapes &, <, >', () => {
  assert.equal(
    scaffold.escapeHTMLText('<script>&"' + "'"),
    '&lt;script&gt;&amp;"' + "'"
  );
});

// -----------------------------------------------------------------------------
// buildAppConfig / buildManifest / buildIconSVG / buildServiceWorker
// -----------------------------------------------------------------------------

const SAMPLE_OPTS = {
  appName: 'Spell Bee',
  slug: 'spell-bee',
  category: 'kids-game',
  templateName: 'kids-game/spell-bee',
  ageGroup: '6-8',
  model: 'qwen2.5:1.5b',
  host: 'http://localhost:11434',
  scaffoldedAt: '2026-04-13T00:00:00.000Z',
};

test('buildAppConfig surfaces the fields the runtime reads', () => {
  const cfg = scaffold.buildAppConfig(SAMPLE_OPTS);
  assert.equal(cfg.appName, 'Spell Bee');
  assert.equal(cfg.appSlug, 'spell-bee');
  assert.equal(cfg.category, 'kids-game');
  assert.equal(cfg.template, 'kids-game/spell-bee');
  assert.equal(cfg.ageGroup, '6-8');
  assert.equal(cfg.defaultModel, 'qwen2.5:1.5b');
  assert.equal(cfg.host, 'http://localhost:11434');
  assert.equal(cfg.sdkVersion, Pocket.VERSION);
  assert.equal(cfg.scaffoldedAt, '2026-04-13T00:00:00.000Z');
});

test('buildAppConfig defaults scaffoldedAt to now when omitted', () => {
  const cfg = scaffold.buildAppConfig({ ...SAMPLE_OPTS, scaffoldedAt: undefined });
  // ISO 8601 — loose sanity check
  assert.match(cfg.scaffoldedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('buildManifest produces a per-app PWA manifest', () => {
  const m = scaffold.buildManifest(SAMPLE_OPTS);
  assert.equal(m.name, 'Spell Bee (spell-bee)');
  assert.equal(m.short_name, 'Spell Bee');
  assert.equal(m.start_url, './index.html');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  assert.equal(m.icons[0].src, 'icon.svg');
  assert.equal(m.icons[0].type, 'image/svg+xml');
});

test('buildIconSVG emits deterministic SVG with initials', () => {
  const svg = scaffold.buildIconSVG(SAMPLE_OPTS);
  assert.match(svg, /<svg /);
  assert.match(svg, /viewBox="0 0 192 192"/);
  assert.match(svg, />SP</); // first two letters of "Spell Bee"
});

test('buildIconSVG is deterministic for the same slug', () => {
  const a = scaffold.buildIconSVG(SAMPLE_OPTS);
  const b = scaffold.buildIconSVG(SAMPLE_OPTS);
  assert.equal(a, b);
});

test('buildIconSVG derives different hues for different slugs', () => {
  const a = scaffold.buildIconSVG({ ...SAMPLE_OPTS, slug: 'alpha' });
  const b = scaffold.buildIconSVG({ ...SAMPLE_OPTS, slug: 'bravo' });
  assert.notEqual(a, b);
});

test('buildServiceWorker references the per-app cache name', () => {
  const sw = scaffold.buildServiceWorker(SAMPLE_OPTS);
  assert.match(sw, /pocket-spell-bee-v1/);
  assert.match(sw, /install/);
  assert.match(sw, /fetch/);
});

test('hashHue is deterministic and mod 360', () => {
  const h1 = scaffold.hashHue('spell-bee');
  const h2 = scaffold.hashHue('spell-bee');
  assert.equal(h1, h2);
  assert.ok(h1 >= 0 && h1 < 360);
});

// -----------------------------------------------------------------------------
// composeIndexHTML — security critical: APP_CONFIG must survive </script>
// -----------------------------------------------------------------------------

function fakeSources(overrides = {}) {
  return Object.assign(
    {
      baseHTML:
        '<html><head><title><!-- APP_NAME --></title>' +
        '<style><!-- STYLE_INLINE --></style>' +
        '<script type="application/json" id="app-config"><!-- APP_CONFIG --></script>' +
        '<script><!-- SDK_INLINE --></script>' +
        '</head><body><main><!-- APP_BODY --></main>' +
        '<script><!-- APP_SCRIPT --></script></body></html>',
      styleCSS: 'body{}',
      appBodyHTML: '<p>hi</p>',
      appScriptJS: 'console.log("hi");',
      sdkJS: '/* sdk */',
    },
    overrides
  );
}

test('composeIndexHTML substitutes every marker', () => {
  const html = scaffold.composeIndexHTML(fakeSources(), SAMPLE_OPTS);
  assert.match(html, /<title>Spell Bee<\/title>/);
  assert.match(html, /<style>body\{\}<\/style>/);
  assert.match(html, /<p>hi<\/p>/);
  assert.match(html, /\/\* sdk \*\//);
  assert.match(html, /console\.log/);
  // app-config block is present and parses
  const m = html.match(/<script type="application\/json" id="app-config">([\s\S]*?)<\/script>/);
  assert.ok(m, 'app-config block present');
  const parsed = JSON.parse(m[1]);
  assert.equal(parsed.appName, 'Spell Bee');
});

test('composeIndexHTML escapes </script> in APP_CONFIG values (XSS guard)', () => {
  const malicious = {
    ...SAMPLE_OPTS,
    appName: 'Inject</script><script>alert(1)</script>',
  };
  // composeIndexHTML escapes APP_NAME for the HTML text substitutions AND
  // runs APP_CONFIG through safeJSONForHTMLScript, so neither escape hatch
  // should leak a raw </script>.
  const html = scaffold.composeIndexHTML(fakeSources(), malicious);

  // The raw attack string must not appear anywhere in the output.
  assert.ok(!html.includes('Inject</script>'), 'raw </script> should not appear');
  assert.ok(!html.includes('<script>alert(1)'), 'inline attack payload must be neutered');

  // The app-config block must still be parseable and round-trip the
  // original string (JSON.parse will turn \u003c back into <).
  const m = html.match(/<script type="application\/json" id="app-config">([\s\S]*?)<\/script>/);
  assert.ok(m, 'app-config block still present');
  const parsed = JSON.parse(m[1]);
  assert.equal(parsed.appName, 'Inject</script><script>alert(1)</script>');
});

test('composeIndexHTML escapes U+2028 / U+2029 inside APP_CONFIG', () => {
  const opts = { ...SAMPLE_OPTS, appName: 'A\u2028B\u2029C' };
  const html = scaffold.composeIndexHTML(fakeSources(), opts);
  // The raw separators (which break JS parsers, not JSON.parse) must be
  // escaped to \u2028 / \u2029 in the app-config JSON string. Note that
  // escapeHTMLText does NOT strip these from the <title> substitution —
  // that's fine, they're legal inside HTML text content and they don't
  // break JSON parsers, only JS parsers in old runtimes.
  const configMatch = html.match(/id="app-config">([\s\S]*?)<\/script>/);
  assert.ok(configMatch);
  assert.ok(!configMatch[1].includes('\u2028'));
  assert.ok(!configMatch[1].includes('\u2029'));
});

// -----------------------------------------------------------------------------
// End-to-end scaffold() against the real repo templates
// -----------------------------------------------------------------------------

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pocket-scaffold-test-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('scaffold() produces a complete app from the real templates', async () => {
  await withTempDir(async (tmp) => {
    const outDir = path.join(tmp, 'spell-bee');
    const result = await scaffold.scaffold({
      repoRoot: REPO_ROOT,
      outputDir: outDir,
      opts: SAMPLE_OPTS,
      force: false,
    });

    assert.deepEqual(result.files.sort(), ['icon.svg', 'index.html', 'manifest.json', 'sw.js']);

    const files = await fs.readdir(outDir);
    assert.deepEqual(
      files.sort(),
      ['icon.svg', 'index.html', 'manifest.json', 'sw.js']
    );

    // index.html: SDK inlined, app-config present, no stray markers
    const html = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
    assert.match(html, /Pocket\.OllamaClient|OllamaClient/); // SDK is actually inlined
    assert.match(html, /<script type="application\/json" id="app-config">/);
    assert.ok(!/<!--\s*[A-Z][A-Z0-9_]*\s*-->/.test(html), 'no unresolved markers in output');

    // manifest.json: valid JSON with expected shape
    const manifest = JSON.parse(
      await fs.readFile(path.join(outDir, 'manifest.json'), 'utf8')
    );
    assert.equal(manifest.name, 'Spell Bee (spell-bee)');
    assert.equal(manifest.start_url, './index.html');

    // icon.svg: svg element
    const icon = await fs.readFile(path.join(outDir, 'icon.svg'), 'utf8');
    assert.match(icon, /^<svg /);

    // sw.js: contains the per-app cache name
    const sw = await fs.readFile(path.join(outDir, 'sw.js'), 'utf8');
    assert.match(sw, /pocket-spell-bee-v1/);
  });
});

test('scaffold() refuses to overwrite without --force', async () => {
  await withTempDir(async (tmp) => {
    const outDir = path.join(tmp, 'spell-bee');
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'placeholder'), 'x');
    await assert.rejects(
      () =>
        scaffold.scaffold({
          repoRoot: REPO_ROOT,
          outputDir: outDir,
          opts: SAMPLE_OPTS,
          force: false,
        }),
      /output directory exists/
    );
  });
});

test('scaffold() overwrites with force: true', async () => {
  await withTempDir(async (tmp) => {
    const outDir = path.join(tmp, 'spell-bee');
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'index.html'), 'old');
    const result = await scaffold.scaffold({
      repoRoot: REPO_ROOT,
      outputDir: outDir,
      opts: SAMPLE_OPTS,
      force: true,
    });
    assert.ok(result.files.includes('index.html'));
    const html = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
    assert.notEqual(html, 'old');
  });
});

// -----------------------------------------------------------------------------
// pathExists
// -----------------------------------------------------------------------------

test('pathExists returns true for existing files', async () => {
  const self = path.resolve(__dirname, 'scaffold.test.js');
  assert.equal(await scaffold.pathExists(self), true);
});

test('pathExists returns false for missing files', async () => {
  const missing = path.resolve(__dirname, 'definitely-not-here-' + Date.now());
  assert.equal(await scaffold.pathExists(missing), false);
});

// Silence unused-import lint for fsSync if removed later — keep the import
// so this file is one place to add sync fs tests if we ever need them.
void fsSync;
