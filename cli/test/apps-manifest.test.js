// =============================================================================
// cli/test/apps-manifest.test.js — unit tests for cli/apps-manifest.js
// =============================================================================

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const manifest = require('../apps-manifest.js');

// -----------------------------------------------------------------------------
// defaultManifest + canonicaliseEntry + sortApps
// -----------------------------------------------------------------------------

test('defaultManifest has version 1 and the chat builtin', () => {
  const m = manifest.defaultManifest('2026-01-01T00:00:00.000Z');
  assert.equal(m.version, 1);
  assert.equal(m.updatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(m.apps.length, 1);
  assert.equal(m.apps[0].slug, 'chat');
  assert.equal(m.apps[0].builtin, true);
});

test('sortApps places chat builtin first, then other builtins alpha, then user alpha', () => {
  const input = [
    { slug: 'spell-bee', name: 'Spell Bee', builtin: false, href: './apps/spell-bee/' },
    { slug: 'chat', name: 'Chat', builtin: true, href: './chat.html' },
    { slug: 'alpha', name: 'Alpha', builtin: false, href: './apps/alpha/' },
    { slug: 'zeta-builtin', name: 'Zeta Builtin', builtin: true, href: './zeta.html' },
  ];
  const out = manifest.sortApps(input);
  assert.deepEqual(out.map((a) => a.slug), ['chat', 'zeta-builtin', 'alpha', 'spell-bee']);
});

// -----------------------------------------------------------------------------
// upsertEntry
// -----------------------------------------------------------------------------

test('upsertEntry appends a new app and sorts it', () => {
  const base = manifest.defaultManifest('2026-01-01T00:00:00.000Z');
  const next = manifest.upsertEntry(base, {
    slug: 'spell-bee',
    name: 'Spell Bee',
    href: './apps/spell-bee/',
    icon: './apps/spell-bee/icon.svg',
    category: 'kids-game',
  });
  assert.equal(next.apps.length, 2);
  assert.equal(next.apps[0].slug, 'chat');
  assert.equal(next.apps[1].slug, 'spell-bee');
  assert.equal(next.apps[1].builtin, false);
});

test('upsertEntry replaces an existing app with the same slug', () => {
  const base = manifest.defaultManifest('2026-01-01T00:00:00.000Z');
  let next = manifest.upsertEntry(base, {
    slug: 'spell-bee',
    name: 'Spell Bee v1',
    href: './apps/spell-bee/',
    category: 'kids-game',
  });
  next = manifest.upsertEntry(next, {
    slug: 'spell-bee',
    name: 'Spell Bee v2',
    href: './apps/spell-bee/',
    category: 'kids-game',
  });
  assert.equal(next.apps.length, 2);
  assert.equal(next.apps[1].name, 'Spell Bee v2');
});

test('upsertEntry rejects entries missing required fields', () => {
  const base = manifest.defaultManifest('2026-01-01T00:00:00.000Z');
  assert.throws(() => manifest.upsertEntry(base, { slug: 'foo' }), /name must be/);
  assert.throws(() => manifest.upsertEntry(base, { slug: '', name: 'X', href: './x/' }), /slug must be/);
  assert.throws(() => manifest.upsertEntry(base, { slug: 'ok', name: 'X' }), /href must be/);
});

test('canonicaliseEntry enforces stable key order (drift guard)', () => {
  // Shuffled input — canonical output must always have the same key order.
  const next = manifest.upsertEntry(
    { version: 1, updatedAt: '2026-01-01T00:00:00.000Z', apps: [] },
    {
      category: 'productivity',
      name: 'Summariser',
      description: 'Paste text',
      slug: 'summariser',
      icon: './apps/summariser/icon.svg',
      builtin: false,
      href: './apps/summariser/',
    }
  );
  assert.deepEqual(Object.keys(next.apps[0]), [
    'slug',
    'name',
    'description',
    'href',
    'icon',
    'category',
    'builtin',
  ]);
});

// -----------------------------------------------------------------------------
// removeEntry
// -----------------------------------------------------------------------------

test('removeEntry deletes by slug and is a no-op if the slug is absent', () => {
  let next = manifest.upsertEntry(manifest.defaultManifest('2026-01-01T00:00:00.000Z'), {
    slug: 'spell-bee',
    name: 'Spell Bee',
    href: './apps/spell-bee/',
    category: 'kids-game',
  });
  assert.equal(next.apps.length, 2);
  next = manifest.removeEntry(next, 'spell-bee');
  assert.equal(next.apps.length, 1);
  next = manifest.removeEntry(next, 'nothing');
  assert.equal(next.apps.length, 1);
});

// -----------------------------------------------------------------------------
// entryFromOpts / inferDescription
// -----------------------------------------------------------------------------

test('entryFromOpts builds a valid entry with icon derived from href', () => {
  const entry = manifest.entryFromOpts(
    {
      slug: 'summariser',
      appName: 'Summariser',
      category: 'productivity',
      templateName: 'productivity/summariser',
    },
    './apps/summariser/'
  );
  assert.equal(entry.slug, 'summariser');
  assert.equal(entry.name, 'Summariser');
  assert.equal(entry.href, './apps/summariser/');
  assert.equal(entry.icon, './apps/summariser/icon.svg');
  assert.equal(entry.category, 'productivity');
  assert.equal(entry.builtin, false);
});

test('inferDescription uses a sensible default per template', () => {
  assert.match(
    manifest.inferDescription({ templateName: 'kids-game/spell-bee', appName: 'Spell Bee' }),
    /spelling/i
  );
  assert.match(
    manifest.inferDescription({ templateName: 'productivity/summariser', appName: 'Summariser' }),
    /TL;DR|bullets/i
  );
});

// -----------------------------------------------------------------------------
// readManifest / writeManifest on disk
// -----------------------------------------------------------------------------

async function withRepo(fn) {
  // Create a fake repo root with an empty pwa/ dir. readManifest tolerates
  // missing apps.json; writeManifest creates it.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-manifest-test-'));
  await fs.mkdir(path.join(dir, 'pwa'), { recursive: true });
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('readManifest returns default set when apps.json is missing', async () => {
  await withRepo(async (repoRoot) => {
    const m = await manifest.readManifest(repoRoot);
    assert.equal(m.version, 1);
    assert.equal(m.apps.length, 1);
    assert.equal(m.apps[0].slug, 'chat');
  });
});

test('writeManifest round-trips JSON and produces a terminating newline', async () => {
  await withRepo(async (repoRoot) => {
    const base = manifest.defaultManifest('2026-01-01T00:00:00.000Z');
    const next = manifest.upsertEntry(base, {
      slug: 'summariser',
      name: 'Summariser',
      href: './apps/summariser/',
      icon: './apps/summariser/icon.svg',
      category: 'productivity',
      description: 'Paste text, get TL;DR + bullets + key points',
    });
    const written = await manifest.writeManifest(repoRoot, next, {
      updatedAt: '2026-04-15T00:00:00.000Z',
    });
    assert.equal(written.updatedAt, '2026-04-15T00:00:00.000Z');
    const raw = await fs.readFile(path.join(repoRoot, 'pwa', 'apps.json'), 'utf8');
    assert.ok(raw.endsWith('\n'), 'apps.json must end with a newline');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.apps.length, 2);
    assert.equal(parsed.apps[1].slug, 'summariser');
    // Round-trip: readManifest should give us the same shape back.
    const readBack = await manifest.readManifest(repoRoot);
    assert.equal(readBack.apps.length, 2);
    assert.equal(readBack.apps[1].name, 'Summariser');
  });
});

test('writeManifest stamps a fresh updatedAt when none is pinned', async () => {
  await withRepo(async (repoRoot) => {
    const m = manifest.defaultManifest('2026-01-01T00:00:00.000Z');
    const out = await manifest.writeManifest(repoRoot, m);
    assert.match(out.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // Must NOT be the pinned input timestamp.
    assert.notEqual(out.updatedAt, '2026-01-01T00:00:00.000Z');
  });
});

// -----------------------------------------------------------------------------
// registerScaffoldedApp — gated on output dir being under pwa/apps/
// -----------------------------------------------------------------------------

test('registerScaffoldedApp writes a new entry when outputDir is under pwa/apps/', async () => {
  await withRepo(async (repoRoot) => {
    const outputDir = path.join(repoRoot, 'pwa', 'apps', 'summariser');
    const opts = {
      slug: 'summariser',
      appName: 'Summariser',
      category: 'productivity',
      templateName: 'productivity/summariser',
    };
    const result = await manifest.registerScaffoldedApp(repoRoot, outputDir, opts, {
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    assert.ok(result, 'registerScaffoldedApp should return the written manifest');
    assert.equal(result.apps.length, 2);
    assert.equal(result.apps[1].slug, 'summariser');
    assert.equal(result.apps[1].href, './apps/summariser/');
    assert.equal(result.apps[1].icon, './apps/summariser/icon.svg');
  });
});

test('registerScaffoldedApp skips outputs outside pwa/apps/', async () => {
  await withRepo(async (repoRoot) => {
    // examples/ — drift check path
    const examplesDir = path.join(repoRoot, 'examples', 'spell-bee');
    const opts = {
      slug: 'spell-bee',
      appName: 'Spell Bee',
      category: 'kids-game',
      templateName: 'kids-game/spell-bee',
    };
    const a = await manifest.registerScaffoldedApp(repoRoot, examplesDir, opts);
    assert.equal(a, null);

    // Absolute /tmp path — test fixture
    const tmpDir = path.join(os.tmpdir(), 'should-not-register');
    const b = await manifest.registerScaffoldedApp(repoRoot, tmpDir, opts);
    assert.equal(b, null);
  });
});

test('registerScaffoldedApp survives a fresh repo (no pwa/apps.json yet)', async () => {
  await withRepo(async (repoRoot) => {
    // Remove the pwa dir so readManifest falls through to defaultManifest.
    // (withRepo creates pwa/ but no apps.json yet — that's already the case.)
    const outputDir = path.join(repoRoot, 'pwa', 'apps', 'foo');
    const result = await manifest.registerScaffoldedApp(
      repoRoot,
      outputDir,
      { slug: 'foo', appName: 'Foo', category: 'creative', templateName: 'creative/foo' },
      { updatedAt: '2026-01-01T00:00:00.000Z' }
    );
    assert.ok(result);
    assert.equal(result.apps.length, 2); // chat (default) + foo
  });
});
