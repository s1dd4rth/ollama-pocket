// Spell Bee app script — placeholder.
// Reads the scaffolded app-config and wires a single "ping Ollama" button
// so we can verify end-to-end: the SDK is inlined, window.Pocket is live,
// and /api/tags is reachable from the served page. The real game loop
// lands in scaffolding PR 4.

(function () {
  'use strict';

  var config = {};
  try {
    var blob = document.getElementById('app-config');
    if (blob) config = JSON.parse(blob.textContent || '{}');
  } catch (err) {
    console.error('spell-bee: failed to parse app-config', err);
  }

  var titleEl = document.getElementById('app-title');
  if (titleEl && config.appName) titleEl.textContent = config.appName;

  var modelBadge = document.getElementById('model-badge');
  if (modelBadge && config.defaultModel) modelBadge.textContent = config.defaultModel;

  var statusEl = document.getElementById('status');
  var outputEl = document.getElementById('output');
  var pingBtn = document.getElementById('ping');

  if (!window.Pocket || !window.Pocket.OllamaClient) {
    if (statusEl) statusEl.textContent = 'SDK not loaded.';
    return;
  }

  var client = new window.Pocket.OllamaClient({ host: config.host });

  async function ping() {
    if (statusEl) statusEl.textContent = 'Pinging ' + (config.host || 'ollama') + '…';
    if (outputEl) outputEl.textContent = '';
    try {
      var result = await client.ping();
      if (statusEl) statusEl.textContent = result.ok ? 'Connected.' : 'Offline: ' + (result.error || 'unknown');
      if (outputEl) outputEl.textContent = JSON.stringify(result, null, 2);
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Error.';
      if (outputEl) outputEl.textContent = (err && err.message) || String(err);
    }
  }

  if (pingBtn) pingBtn.addEventListener('click', ping);
  ping();
})();
