// =============================================================================
// cli/test/update.test.js — unit tests for cli/update.js
//
// Validates the config round-trip: scaffold() writes an app-config block,
// update.js can extract it, translate it back to scaffold() opts, and
// re-scaffold into the same dir without losing any of the original fields.
// This is the test that catches "we added a new opts field but forgot to
// round-trip it" silently.
// =============================================================================

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const scaffold = require('../scaffold.js');
const update = require('../update.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SAMPLE_OPTS = {
  appName: 'Spell Bee',
  slug: 'spell-bee',
  category: 'kids-game',
  templateName: 'kids-game/spell-bee',
  ageGroup: '6-8',
  model: 'qwen2.5:1.5b',
  host: 'http://localhost:11434',
};

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pocket-update-test-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// -----------------------------------------------------------------------------
// extractConfig
// -----------------------------------------------------------------------------

test('extractConfig reads the app-config JSON out of a scaffolded index.html', async () => {
  await withTempDir(async (tmp) => {
    const outDir = path.join(tmp, 'spell-bee');
    await scaffold.scaffold({
      repoRoot: REPO_ROOT,
      outputDir: outDir,
      opts: SAMPLE_OPTS,
    });
    const cfg = await update.extractConfig(path.join(outDir, 'index.html'));
    assert.equal(cfg.appName, 'Spell Bee');
    assert.equal(cfg.appSlug, 'spell-bee');
    assert.equal(cfg.template, 'kids-game/spell-bee');
    assert.equal(cfg.ageGroup, '6-8');
    assert.equal(cfg.defaultModel, 'qwen2.5:1.5b');
    assert.equal(cfg.host, 'http://localhost:11434');
  });
});

test('extractConfig throws when the block is missing', async () => {
  await withTempDir(async (tmp) => {
    const p = path.join(tmp, 'index.html');
    await fs.writeFile(p, '<html><body>no config</body></html>');
    await assert.rejects(() => update.extractConfig(p), /could not find/);
  });
});

test('extractConfig throws on malformed JSON', async () => {
  await withTempDir(async (tmp) => {
    const p = path.join(tmp, 'index.html');
    await fs.writeFile(
      p,
      '<script type="application/json" id="app-config">{not json</script>'
    );
    await assert.rejects(() => update.extractConfig(p), /malformed/);
  });
});

// -----------------------------------------------------------------------------
// configToScaffoldOpts
// -----------------------------------------------------------------------------

test('configToScaffoldOpts is the inverse of buildAppConfig (shape)', () => {
  const cfg = scaffold.buildAppConfig(SAMPLE_OPTS);
  const opts = update.configToScaffoldOpts(cfg);
  assert.equal(opts.appName, SAMPLE_OPTS.appName);
  assert.equal(opts.slug, SAMPLE_OPTS.slug);
  assert.equal(opts.category, SAMPLE_OPTS.category);
  assert.equal(opts.templateName, SAMPLE_OPTS.templateName);
  assert.equal(opts.ageGroup, SAMPLE_OPTS.ageGroup);
  assert.equal(opts.model, SAMPLE_OPTS.model);
  assert.equal(opts.host, SAMPLE_OPTS.host);
});

// -----------------------------------------------------------------------------
// findRepoRoot
// -----------------------------------------------------------------------------

test('findRepoRoot walks up to the sdk/pocket.js file', () => {
  const fromCliDir = update.findRepoRoot(path.join(REPO_ROOT, 'cli'));
  assert.equal(fromCliDir, REPO_ROOT);
  const fromTestDir = update.findRepoRoot(path.join(REPO_ROOT, 'cli', 'test'));
  assert.equal(fromTestDir, REPO_ROOT);
});

test('findRepoRoot throws when outside the repo', async () => {
  await withTempDir(async (tmp) => {
    assert.throws(() => update.findRepoRoot(tmp), /could not locate repo root/);
  });
});

// -----------------------------------------------------------------------------
// runUpdate end-to-end
// -----------------------------------------------------------------------------

function muteStdout(fn) {
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  return Promise.resolve(fn()).finally(() => {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  });
}

test('runUpdate re-renders a scaffolded app in place, preserving config', async () => {
  await withTempDir(async (tmp) => {
    const outDir = path.join(tmp, 'spell-bee');
    await scaffold.scaffold({
      repoRoot: REPO_ROOT,
      outputDir: outDir,
      opts: SAMPLE_OPTS,
    });

    const before = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
    const beforeCfg = await update.extractConfig(path.join(outDir, 'index.html'));

    // Hand-edit the file to simulate an outdated app
    await fs.writeFile(
      path.join(outDir, 'index.html'),
      before.replace('Pinging', 'STALE_MARKER')
    );

    const code = await muteStdout(() =>
      update.runUpdate(['node', 'cli/update.js', outDir])
    );
    assert.equal(code, 0);

    const after = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
    assert.ok(!after.includes('STALE_MARKER'), 'stale marker should be gone after update');

    const afterCfg = await update.extractConfig(path.join(outDir, 'index.html'));
    assert.equal(afterCfg.appName, beforeCfg.appName);
    assert.equal(afterCfg.appSlug, beforeCfg.appSlug);
    assert.equal(afterCfg.template, beforeCfg.template);
    assert.equal(afterCfg.ageGroup, beforeCfg.ageGroup);
    assert.equal(afterCfg.defaultModel, beforeCfg.defaultModel);
    assert.equal(afterCfg.host, beforeCfg.host);
  });
});

test('runUpdate returns non-zero when the app dir does not exist', async () => {
  await withTempDir(async (tmp) => {
    const code = await muteStdout(() =>
      update.runUpdate(['node', 'cli/update.js', path.join(tmp, 'nope')])
    );
    assert.equal(code, 1);
  });
});

test('runUpdate prints help when called with --help', async () => {
  const code = await muteStdout(() =>
    update.runUpdate(['node', 'cli/update.js', '--help'])
  );
  assert.equal(code, 0);
});
