// =============================================================================
// cli/test/new.test.js — unit tests for cli/new.js flag parsing + helpers
//
// The interactive flow is not tested automatically (readline/promises in
// a non-TTY environment is awkward and low-value). We test the pure
// pieces: flag parsing, flag validation, opts derivation, slug/name
// helpers, and a full non-interactive end-to-end run against the real
// templates.
// =============================================================================

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const newCli = require('../new.js');

// -----------------------------------------------------------------------------
// parseFlags
// -----------------------------------------------------------------------------

function argv(...rest) {
  return ['node', 'cli/new.js', ...rest];
}

test('parseFlags handles --flag value', () => {
  const f = newCli.parseFlags(argv('--slug', 'spell-bee', '--model', 'qwen2.5:1.5b'));
  assert.equal(f.slug, 'spell-bee');
  assert.equal(f.model, 'qwen2.5:1.5b');
});

test('parseFlags handles --flag=value', () => {
  const f = newCli.parseFlags(argv('--slug=abc', '--age-group=6-8'));
  assert.equal(f.slug, 'abc');
  assert.equal(f['age-group'], '6-8');
});

test('parseFlags treats known booleans as no-value flags', () => {
  const f = newCli.parseFlags(argv('--non-interactive', '--force', '--skip-detection'));
  assert.equal(f['non-interactive'], true);
  assert.equal(f.force, true);
  assert.equal(f['skip-detection'], true);
});

test('parseFlags supports -h alias for help', () => {
  const f = newCli.parseFlags(argv('-h'));
  assert.equal(f.help, true);
});

test('parseFlags throws on a non-flag positional', () => {
  assert.throws(() => newCli.parseFlags(argv('oops')), /unexpected argument/);
});

test('parseFlags throws when a value flag is missing its value', () => {
  // --slug followed by another flag should be rejected.
  assert.throws(
    () => newCli.parseFlags(argv('--slug', '--force')),
    /flag --slug expects a value/
  );
});

// -----------------------------------------------------------------------------
// validateFlags / optsFromFlags
// -----------------------------------------------------------------------------

test('validateFlags requires slug/template/age-group/model', () => {
  assert.throws(() => newCli.validateFlags({}), /missing required flag/);
});

test('validateFlags rejects invalid slug', () => {
  assert.throws(
    () =>
      newCli.validateFlags({
        slug: 'Bad Slug!',
        template: 'kids-game/spell-bee',
        'age-group': '6-8',
        model: 'qwen2.5:1.5b',
      }),
    /slug must be lowercase/
  );
});

test('validateFlags rejects invalid template', () => {
  assert.throws(
    () =>
      newCli.validateFlags({
        slug: 'ok',
        template: 'no-slash',
        'age-group': '6-8',
        model: 'qwen2.5:1.5b',
      }),
    /template must be/
  );
});

test('validateFlags rejects invalid age group', () => {
  assert.throws(
    () =>
      newCli.validateFlags({
        slug: 'ok',
        template: 'kids-game/spell-bee',
        'age-group': '3-5',
        model: 'qwen2.5:1.5b',
      }),
    /age group must be/
  );
});

test('validateFlags rejects invalid host', () => {
  assert.throws(
    () =>
      newCli.validateFlags({
        slug: 'ok',
        template: 'kids-game/spell-bee',
        'age-group': '6-8',
        model: 'qwen2.5:1.5b',
        host: 'not-a-url',
      }),
    /host must be/
  );
});

test('validateFlags accepts a valid flag set', () => {
  assert.doesNotThrow(() =>
    newCli.validateFlags({
      slug: 'spell-bee',
      template: 'kids-game/spell-bee',
      'age-group': '6-8',
      model: 'qwen2.5:1.5b',
      host: 'http://localhost:11434',
    })
  );
});

test('optsFromFlags derives category from template and title-cases slug when no app-name', () => {
  const opts = newCli.optsFromFlags({
    slug: 'spell-bee-alpha',
    template: 'kids-game/spell-bee',
    'age-group': '6-8',
    model: 'qwen2.5:1.5b',
  });
  assert.equal(opts.appName, 'Spell Bee Alpha');
  assert.equal(opts.category, 'kids-game');
  assert.equal(opts.templateName, 'kids-game/spell-bee');
  assert.equal(opts.host, 'http://localhost:11434'); // default
});

test('optsFromFlags respects explicit --app-name', () => {
  const opts = newCli.optsFromFlags({
    slug: 'spell-bee',
    'app-name': 'SpellBot 9000',
    template: 'kids-game/spell-bee',
    'age-group': '6-8',
    model: 'qwen2.5:1.5b',
  });
  assert.equal(opts.appName, 'SpellBot 9000');
});

test('titleCase handles empty segments', () => {
  assert.equal(newCli.titleCase('a--b'), 'A  B');
  assert.equal(newCli.titleCase('x'), 'X');
});

test('defaultOutputDir is apps/<slug>', () => {
  assert.equal(newCli.defaultOutputDir('foo'), path.join('apps', 'foo'));
});

// -----------------------------------------------------------------------------
// Non-interactive main() end-to-end
// -----------------------------------------------------------------------------

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pocket-new-test-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function muteStdout(fn) {
  // Non-interactive mode writes progress lines; swallow them in tests
  // so `node --test` output stays readable.
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  return Promise.resolve(fn()).finally(() => {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  });
}

test('main() runs non-interactive scaffold against real templates', async () => {
  await withTempDir(async (tmp) => {
    const outDir = path.join(tmp, 'spell-bee');
    const code = await muteStdout(() =>
      newCli.main([
        'node',
        'cli/new.js',
        '--non-interactive',
        '--slug',
        'spell-bee',
        '--template',
        'kids-game/spell-bee',
        '--age-group',
        '6-8',
        '--model',
        'qwen2.5:1.5b',
        '--host',
        'http://localhost:11434',
        '--output',
        outDir,
        '--skip-detection',
      ])
    );
    assert.equal(code, 0);

    const files = (await fs.readdir(outDir)).sort();
    // Top-level entries: the four core artefacts plus a fonts/ directory
    // copied from pwa/fonts/. The fonts/ contents are exercised in
    // scaffold.test.js; here we just confirm the four core files are
    // present (the scaffolder may add other dirs in future).
    for (const name of ['icon.svg', 'index.html', 'manifest.json', 'sw.js']) {
      assert.ok(files.includes(name), 'expected scaffolded output to include ' + name);
    }
  });
});

test('main() returns 2 on unknown argument', async () => {
  const code = await muteStdout(() =>
    newCli.main(['node', 'cli/new.js', 'banana'])
  );
  assert.equal(code, 2);
});

test('main() prints help and returns 0 for --help', async () => {
  const code = await muteStdout(() =>
    newCli.main(['node', 'cli/new.js', '--help'])
  );
  assert.equal(code, 0);
});
