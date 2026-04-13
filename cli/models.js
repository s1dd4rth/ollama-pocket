// =============================================================================
// cli/models.js — model detection + preference re-export
//
// Thin wrapper around sdk/pocket.js so the CLI uses the exact same model
// preference list and picker as the runtime (scaffolded apps). The only
// CLI-specific piece is detectInstalledModels(), which hits /api/tags so
// new.js can pre-select a good default.
// =============================================================================

'use strict';

const path = require('path');

// Re-export the SDK's preference list and picker. Single source of truth.
const Pocket = require(path.join(__dirname, '..', 'sdk', 'pocket.js'));

const MODEL_PREFERENCES = Pocket.MODEL_PREFERENCES;
const pickModel = Pocket.pickModel;
const SDK_VERSION = Pocket.VERSION;

// -----------------------------------------------------------------------------
// detectInstalledModels(host) → { ok, models, error }
//
// Calls GET <host>/api/tags and returns the list of installed model names.
// Never throws — returns { ok: false, error } on any failure so the CLI can
// fall through to user-declared defaults without a try/catch.
// -----------------------------------------------------------------------------

async function detectInstalledModels(host) {
  const url = host.replace(/\/+$/, '') + '/api/tags';
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      return { ok: false, models: [], error: 'HTTP ' + res.status };
    }
    const data = await res.json();
    const models = Array.isArray(data && data.models)
      ? data.models.map((m) => m && m.name).filter(Boolean)
      : [];
    return { ok: true, models: models };
  } catch (err) {
    return { ok: false, models: [], error: (err && err.message) || String(err) };
  }
}

module.exports = {
  MODEL_PREFERENCES: MODEL_PREFERENCES,
  pickModel: pickModel,
  detectInstalledModels: detectInstalledModels,
  SDK_VERSION: SDK_VERSION,
};
