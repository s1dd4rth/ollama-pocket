#!/usr/bin/env node
// =============================================================================
// cli/update.js — re-inline the current SDK into a scaffolded app
//
// Usage:
//   node cli/update.js apps/<slug>
//
// Reads <slug>/index.html, extracts its <script type="application/json"
// id="app-config"> block, reruns the scaffolder against the current
// templates + SDK with that config preserved, and overwrites the app's
// files in place. This is the escape hatch for "SDK bug fix propagating
// to already-scaffolded apps" without asking users to rm -rf and
// re-answer every prompt.
//
// The on-disk manifest, icon, and service worker are also regenerated,
// because a template change may have added fields to any of them. If
// you've hand-edited a scaffolded app, update will overwrite those edits
// — documented in CONTRIBUTING.
// =============================================================================

'use strict';

const fs = require('fs/promises');
const path = require('path');

const scaffold = require('./scaffold.js');
const appsManifest = require('./apps-manifest.js');

const APP_CONFIG_RE = /<script\s+type="application\/json"\s+id="app-config">([\s\S]*?)<\/script>/;

function unescapeHTMLScriptJSON(text) {
  // Inverse of sdk/pocket.js safeJSONForHTMLScript: the scaffolder escapes
  // <, >, &, U+2028, U+2029 as \uXXXX sequences inside the JSON string.
  // JSON.parse handles \u escapes natively, so we don't need to do anything
  // except hand it the raw text.
  return JSON.parse(text);
}

async function extractConfig(indexHTMLPath) {
  const html = await fs.readFile(indexHTMLPath, 'utf8');
  const m = html.match(APP_CONFIG_RE);
  if (!m) {
    throw new Error('update: could not find <script id="app-config"> in ' + indexHTMLPath);
  }
  try {
    return unescapeHTMLScriptJSON(m[1]);
  } catch (err) {
    throw new Error('update: app-config JSON was malformed: ' + (err && err.message));
  }
}

function configToScaffoldOpts(config) {
  // Translate the embedded runtime config back into the shape scaffold()
  // expects. Keep this symmetric with cli/scaffold.js buildAppConfig.
  //
  // ageGroup is only carried through if the source config had it —
  // productivity / creative templates omit the field entirely, and
  // re-scaffolding shouldn't introduce a spurious `ageGroup: undefined`
  // into the output.
  const opts = {
    appName: config.appName,
    slug: config.appSlug,
    category: config.category,
    templateName: config.template,
    model: config.defaultModel,
    host: config.host,
    // scaffoldedAt intentionally re-generated so each update rolls the timestamp
  };
  if (config.ageGroup) {
    opts.ageGroup = config.ageGroup;
  }
  return opts;
}

function findRepoRoot(startDir) {
  // Walk up until we find sdk/pocket.js. Keeps the CLI runnable from any
  // cwd inside the repo, not just the root.
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, 'sdk', 'pocket.js');
    try {
      require('fs').accessSync(candidate);
      return dir;
    } catch (_) {
      const parent = path.dirname(dir);
      if (parent === dir) {
        throw new Error('update: could not locate repo root (no sdk/pocket.js up the tree from ' + startDir + ')');
      }
      dir = parent;
    }
  }
}

async function runUpdate(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write('usage: node cli/update.js <app-dir>\n');
    process.stdout.write('\n');
    process.stdout.write('  Re-inlines the current sdk/pocket.js and re-renders index.html,\n');
    process.stdout.write('  manifest.json, icon.svg, and sw.js into <app-dir>, preserving the\n');
    process.stdout.write('  existing app-config block.\n');
    return 0;
  }

  const appDir = path.resolve(args[0]);
  const indexPath = path.join(appDir, 'index.html');

  if (!(await scaffold.pathExists(indexPath))) {
    process.stderr.write('update: ' + indexPath + ' does not exist\n');
    return 1;
  }

  const config = await extractConfig(indexPath);
  const opts = configToScaffoldOpts(config);
  const repoRoot = findRepoRoot(__dirname);

  process.stdout.write('update: refreshing ' + appDir + ' from ' + repoRoot + '\n');
  const result = await scaffold.scaffold({
    repoRoot: repoRoot,
    outputDir: appDir,
    opts: opts,
    onProgress: function (msg) {
      process.stdout.write('  ' + msg + '\n');
    },
    force: true,
  });

  // Refresh the launcher manifest entry so any metadata changes (appName,
  // category, etc) that came in via a template edit propagate through
  // without the user having to hand-edit pwa/apps.json. Apps sitting
  // outside pwa/apps/ stay untouched — registerScaffoldedApp returns null
  // for those.
  await appsManifest.registerScaffoldedApp(repoRoot, appDir, opts);

  process.stdout.write('update: wrote ' + result.files.length + ' files, index.html ' + result.sizeBytes + ' bytes\n');
  return 0;
}

if (require.main === module) {
  runUpdate(process.argv).then(
    function (code) {
      process.exit(code || 0);
    },
    function (err) {
      process.stderr.write('update: ' + ((err && err.message) || String(err)) + '\n');
      process.exit(1);
    }
  );
}

module.exports = {
  runUpdate: runUpdate,
  extractConfig: extractConfig,
  configToScaffoldOpts: configToScaffoldOpts,
  findRepoRoot: findRepoRoot,
};
