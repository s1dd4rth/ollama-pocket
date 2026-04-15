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

test('validateFlags requires slug/template/model for every category', () => {
  assert.throws(() => newCli.validateFlags({}), /missing required flag/);
});

test('validateFlags requires --age-group when template category needs one', () => {
  // kids-game → age-group is required
  assert.throws(
    () =>
      newCli.validateFlags({
        slug: 'spell-bee',
        template: 'kids-game/spell-bee',
        model: 'qwen2.5:1.5b',
      }),
    /missing required flag.*age-group/
  );
});

test('validateFlags does NOT require --age-group for productivity templates', () => {
  // productivity → age-group is optional (and absent from APP_CONFIG)
  assert.doesNotThrow(() =>
    newCli.validateFlags({
      slug: 'summariser',
      template: 'productivity/summariser',
      model: 'qwen2.5:1.5b',
      host: 'http://localhost:11434',
    })
  );
});

test('validateFlags still validates --age-group if a productivity caller passes it', () => {
  // If the caller passes a bad value we reject it even for non-kids categories
  // — better to fail on a typo than silently ignore it.
  assert.throws(
    () =>
      newCli.validateFlags({
        slug: 'summariser',
        template: 'productivity/summariser',
        model: 'qwen2.5:1.5b',
        'age-group': '3-5',
      }),
    /age group must be/
  );
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

test('optsFromFlags sets opts.ageGroup for kids-game templates', () => {
  const opts = newCli.optsFromFlags({
    slug: 'spell-bee',
    template: 'kids-game/spell-bee',
    'age-group': '6-8',
    model: 'qwen2.5:1.5b',
  });
  assert.equal(opts.ageGroup, '6-8');
});

test('optsFromFlags omits opts.ageGroup for productivity templates', () => {
  // Summariser should never carry an ageGroup through to APP_CONFIG —
  // the field is kids-game-only.
  const opts = newCli.optsFromFlags({
    slug: 'summariser',
    template: 'productivity/summariser',
    model: 'qwen2.5:1.5b',
  });
  assert.equal('ageGroup' in opts, false);
  assert.equal(opts.category, 'productivity');
  assert.equal(opts.templateName, 'productivity/summariser');
});

test('optsFromFlags still omits ageGroup for productivity even if --age-group is passed', () => {
  // Belt-and-braces: if some caller legitimately passes --age-group to a
  // non-kids template we drop it rather than carry a meaningless field.
  const opts = newCli.optsFromFlags({
    slug: 'summariser',
    template: 'productivity/summariser',
    'age-group': '6-8',
    model: 'qwen2.5:1.5b',
  });
  assert.equal('ageGroup' in opts, false);
});

test('categoryFromTemplate extracts the leading segment', () => {
  assert.equal(newCli.categoryFromTemplate('kids-game/spell-bee'), 'kids-game');
  assert.equal(newCli.categoryFromTemplate('productivity/summariser'), 'productivity');
  assert.equal(newCli.categoryFromTemplate('no-slash'), null);
  assert.equal(newCli.categoryFromTemplate(null), null);
  assert.equal(newCli.categoryFromTemplate(undefined), null);
});

test('categoryRequiresAgeGroup only returns true for kids-game', () => {
  assert.equal(newCli.categoryRequiresAgeGroup('kids-game'), true);
  assert.equal(newCli.categoryRequiresAgeGroup('productivity'), false);
  assert.equal(newCli.categoryRequiresAgeGroup('creative'), false);
  assert.equal(newCli.categoryRequiresAgeGroup(null), false);
});

// -----------------------------------------------------------------------------
// --scaffolded-at flag (CI drift check)
// -----------------------------------------------------------------------------

test('validateScaffoldedAt accepts canonical ISO 8601', () => {
  assert.equal(newCli.validateScaffoldedAt('2026-01-01T00:00:00.000Z'), null);
  assert.equal(newCli.validateScaffoldedAt('2026-01-01T00:00:00Z'), null);
  assert.equal(newCli.validateScaffoldedAt('2026-01-01'), null);
});

test('validateScaffoldedAt rejects garbage', () => {
  assert.match(newCli.validateScaffoldedAt('not-a-date'), /ISO 8601/);
  assert.match(newCli.validateScaffoldedAt(''), /non-empty/);
  assert.match(newCli.validateScaffoldedAt(), /non-empty/);
});

test('validateFlags rejects a malformed --scaffolded-at', () => {
  assert.throws(
    () =>
      newCli.validateFlags({
        slug: 'ok',
        template: 'kids-game/spell-bee',
        'age-group': '6-8',
        model: 'qwen2.5:1.5b',
        'scaffolded-at': 'yesterday',
      }),
    /ISO 8601/
  );
});

test('optsFromFlags normalises --scaffolded-at to canonical ISO', () => {
  const opts = newCli.optsFromFlags({
    slug: 'spell-bee',
    template: 'kids-game/spell-bee',
    'age-group': '6-8',
    model: 'qwen2.5:1.5b',
    'scaffolded-at': '2026-01-01',
  });
  assert.equal(opts.scaffoldedAt, '2026-01-01T00:00:00.000Z');
});

test('optsFromFlags leaves scaffoldedAt undefined when no flag is passed', () => {
  const opts = newCli.optsFromFlags({
    slug: 'spell-bee',
    template: 'kids-game/spell-bee',
    'age-group': '6-8',
    model: 'qwen2.5:1.5b',
  });
  assert.equal(opts.scaffoldedAt, undefined);
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'olladroid-new-test-'));
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

test('main() scaffolds productivity/summariser without --age-group', async () => {
  await withTempDir(async (tmp) => {
    const outDir = path.join(tmp, 'summariser');
    const code = await muteStdout(() =>
      newCli.main([
        'node',
        'cli/new.js',
        '--non-interactive',
        '--slug',
        'summariser',
        '--template',
        'productivity/summariser',
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
    for (const name of ['icon.svg', 'index.html', 'manifest.json', 'sw.js']) {
      assert.ok(files.includes(name), 'expected scaffolded output to include ' + name);
    }

    // APP_CONFIG should NOT contain an ageGroup field.
    const indexHTML = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
    const configMatch = indexHTML.match(/<script[^>]*id="app-config"[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(configMatch, 'expected app-config block in index.html');
    const config = JSON.parse(configMatch[1]);
    assert.equal(config.category, 'productivity');
    assert.equal(config.template, 'productivity/summariser');
    assert.equal('ageGroup' in config, false, 'productivity templates should not carry ageGroup');

    // Sanity: the summariser body must include the paste textarea and
    // the three result cards that app.js writes into.
    assert.match(indexHTML, /id="paste-input"/);
    assert.match(indexHTML, /id="sm-tldr-text"/);
    assert.match(indexHTML, /id="sm-bullets-list"/);
    assert.match(indexHTML, /id="sm-keypoints-list"/);
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
