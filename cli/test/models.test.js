// =============================================================================
// cli/test/models.test.js — unit tests for cli/models.js
//
// Validates that the CLI thin-wraps sdk/olladroid.js (single source of truth
// for MODEL_PREFERENCES and pickModel) and that detectInstalledModels
// never throws — it only returns { ok, models, error } so the CLI can
// fall through on failure without a try/catch.
// =============================================================================

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const models = require('../models.js');
const Olladroid = require('../../sdk/olladroid.js');

// -----------------------------------------------------------------------------
// re-exports
// -----------------------------------------------------------------------------

test('MODEL_PREFERENCES is the exact object exported by sdk/olladroid.js', () => {
  assert.equal(models.MODEL_PREFERENCES, Olladroid.MODEL_PREFERENCES);
});

test('pickModel is the exact function exported by sdk/olladroid.js', () => {
  assert.equal(models.pickModel, Olladroid.pickModel);
});

test('SDK_VERSION matches sdk/olladroid.js VERSION', () => {
  assert.equal(models.SDK_VERSION, Olladroid.VERSION);
});

// -----------------------------------------------------------------------------
// detectInstalledModels — we stub fetch on globalThis
// -----------------------------------------------------------------------------

function withFetchStub(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
  });
}

test('detectInstalledModels parses /api/tags on success', async () => {
  await withFetchStub(
    async (url) => {
      assert.equal(url, 'http://localhost:11434/api/tags');
      return {
        ok: true,
        async json() {
          return {
            models: [
              { name: 'qwen2.5:1.5b' },
              { name: 'gemma3:1b' },
              { name: 'smollm2:360m' },
            ],
          };
        },
      };
    },
    async () => {
      const res = await models.detectInstalledModels('http://localhost:11434');
      assert.equal(res.ok, true);
      assert.deepEqual(res.models, ['qwen2.5:1.5b', 'gemma3:1b', 'smollm2:360m']);
    }
  );
});

test('detectInstalledModels strips trailing slashes from the host', async () => {
  await withFetchStub(
    async (url) => {
      assert.equal(url, 'http://host:11434/api/tags');
      return { ok: true, async json() { return { models: [] }; } };
    },
    async () => {
      await models.detectInstalledModels('http://host:11434///');
    }
  );
});

test('detectInstalledModels returns ok:false on non-2xx without throwing', async () => {
  await withFetchStub(
    async () => ({ ok: false, status: 500, async json() { return {}; } }),
    async () => {
      const res = await models.detectInstalledModels('http://localhost:11434');
      assert.equal(res.ok, false);
      assert.match(res.error, /HTTP 500/);
    }
  );
});

test('detectInstalledModels returns ok:false on fetch error without throwing', async () => {
  await withFetchStub(
    async () => {
      throw new Error('ECONNREFUSED');
    },
    async () => {
      const res = await models.detectInstalledModels('http://localhost:11434');
      assert.equal(res.ok, false);
      assert.match(res.error, /ECONNREFUSED/);
    }
  );
});

test('detectInstalledModels handles missing/invalid models field', async () => {
  await withFetchStub(
    async () => ({ ok: true, async json() { return { foo: 'bar' }; } }),
    async () => {
      const res = await models.detectInstalledModels('http://localhost:11434');
      assert.equal(res.ok, true);
      assert.deepEqual(res.models, []);
    }
  );
});

// -----------------------------------------------------------------------------
// End-to-end smoke: the CLI's picker matches the SDK's picker
// -----------------------------------------------------------------------------

test('pickModel picks qwen2.5:1.5b over gemma3:1b for structured', () => {
  const picked = models.pickModel(['gemma3:1b', 'qwen2.5:1.5b'], 'structured');
  assert.equal(picked, 'qwen2.5:1.5b');
});

test('pickModel returns null for all-bad structured list', () => {
  assert.equal(models.pickModel(['gemma3:1b', 'smollm2:360m'], 'structured'), null);
});
