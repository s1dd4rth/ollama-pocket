// templates/productivity/summariser/app.js
// Summariser v1 — the controller for a paste-text → structured summary app.
//
// FSM: idle → thinking → (showing_summary | error) → idle
//
// One structuredChat call per summarise:
//   schema: { tldr: string, bullets: string[], key_points: string[] }
//
// Unlike Spell Bee there is no session, no score, no round persistence.
// The only persisted bit of state is the last successful summary under
// SessionManager key "summariser-<slug>", so a reload restores the
// showing_summary panel instead of dropping back to an empty textarea.
// That trades a tiny amount of privacy (last summary sits in
// localStorage) for the common-case ergonomics of closing and reopening
// the PWA without losing what you just produced.
//
// Input is capped at 2000 chars (maxlength on the textarea + a JS
// guard) to stay inside qwen2.5:1.5b's effective mobile context budget.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config + SDK lookup
  // ---------------------------------------------------------------------------

  var config = {};
  try {
    var configEl = document.getElementById('app-config');
    if (configEl) config = JSON.parse(configEl.textContent || '{}');
  } catch (err) {
    console.error('[summariser] app-config JSON parse failed:', err);
  }

  var titleEl = document.getElementById('app-title');
  if (titleEl && config.appName) titleEl.textContent = formatTitleMono(config.appName);
  var logoEl = document.getElementById('app-logo');
  if (logoEl && config.appName) logoEl.textContent = buildLogoGlyph(config.appName);
  var modelBadgeEl = document.getElementById('model-badge');
  if (modelBadgeEl && config.defaultModel) modelBadgeEl.textContent = config.defaultModel;
  var hostBadgeEl = document.getElementById('host-badge');
  if (hostBadgeEl) hostBadgeEl.textContent = formatHostLabel(config.host);
  var titleRootEl = document.getElementById('sm-title');
  if (titleRootEl && config.appName) titleRootEl.textContent = formatTitleMono(config.appName);
  var connectionStatusEl = document.getElementById('connection-status');

  function buildLogoGlyph(name) {
    var cleaned = (name || '').replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
    var parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return '::';
  }

  function formatHostLabel(host) {
    if (!host) return 'local';
    return host.replace(/^https?:\/\//, '').replace(/:11434$/, '') || 'local';
  }

  function formatTitleMono(name) {
    return (name || '').toUpperCase().replace(/\s+/g, '_');
  }

  if (!window.Pocket || !window.Pocket.OllamaClient) {
    console.error('[summariser] window.Pocket is not loaded — is sdk/pocket.js inlined correctly?');
    var root = document.querySelector('.summariser');
    if (root) {
      root.innerHTML =
        '<div class="pocket-banner" data-tone="err">' +
        'SDK failed to load. Refresh the page.' +
        '</div>';
    }
    return;
  }

  var Pocket = window.Pocket;

  // ---------------------------------------------------------------------------
  // SDK instances
  // ---------------------------------------------------------------------------

  var client = new Pocket.OllamaClient({
    host: config.host,
    model: config.defaultModel,
  });

  var session = new Pocket.SessionManager({
    key: 'summariser-' + (config.appSlug || 'default'),
    maxTurns: 1,
  });

  // ---------------------------------------------------------------------------
  // JSON schema — Ollama grammar-constrained output
  // ---------------------------------------------------------------------------

  var SUMMARY_SCHEMA = {
    type: 'object',
    properties: {
      tldr: { type: 'string' },
      bullets: {
        type: 'array',
        items: { type: 'string' },
      },
      key_points: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['tldr', 'bullets', 'key_points'],
  };

  var SYSTEM_PROMPT = [
    'You are a precise summarisation assistant.',
    'Always respond with valid JSON only. No prose, no markdown, no code fences.',
    'Never add information that was not present in the source text.',
    'TLDR: one sentence, at most 200 characters, capturing the single most important takeaway.',
    'Bullets: 3 to 5 short sentences, each at most 120 characters, covering the main facts.',
    'Key points: 3 to 5 short phrases naming the distinct topics, names, numbers, or decisions worth remembering.',
    'Prefer the language of the source text.',
  ].join('\n');

  // ---------------------------------------------------------------------------
  // State + element refs
  // ---------------------------------------------------------------------------

  var MAX_CHARS = 2000;
  var WARN_CHARS = 1800;

  var state = 'idle';

  function $(id) {
    return document.getElementById(id);
  }

  var panels = document.querySelectorAll('.sm-panel');
  var stateBadgeEl = $('sm-state-badge');
  var pasteInputEl = $('paste-input');
  var counterEl = $('sm-counter');
  var counterValueEl = $('sm-counter-value');
  var btnSummariseEl = $('btn-summarise');
  var btnNewSummaryEl = $('btn-new-summary');
  var btnCopyEl = $('btn-copy');
  var btnRetryEl = $('btn-retry');
  var tldrTextEl = $('sm-tldr-text');
  var bulletsListEl = $('sm-bullets-list');
  var keypointsListEl = $('sm-keypoints-list');
  var metaCharsEl = $('sm-meta-chars');
  var metaBulletsEl = $('sm-meta-bullets');
  var metaKeypointsEl = $('sm-meta-keypoints');
  var errorMessageEl = $('sm-error-message');

  // Cache the last text so Retry re-runs against the same input without
  // forcing the user to re-paste.
  var lastInput = '';

  // ---------------------------------------------------------------------------
  // FSM transitions
  // ---------------------------------------------------------------------------

  function setState(next) {
    state = next;
    for (var i = 0; i < panels.length; i++) {
      panels[i].hidden = panels[i].dataset.state !== next;
    }
    if (stateBadgeEl) {
      stateBadgeEl.dataset.state = next;
      stateBadgeEl.textContent = badgeLabel(next);
    }
    // Focus the most useful control in each state.
    Promise.resolve().then(function () {
      if (next === 'idle' && pasteInputEl) {
        pasteInputEl.focus();
      } else if (next === 'showing_summary' && btnNewSummaryEl) {
        btnNewSummaryEl.focus();
      } else if (next === 'error' && btnRetryEl) {
        btnRetryEl.focus();
      }
    });
  }

  function badgeLabel(s) {
    if (s === 'idle') return 'READY';
    if (s === 'thinking') return 'THINKING';
    if (s === 'showing_summary') return 'DONE';
    if (s === 'error') return 'ERROR';
    return s.toUpperCase();
  }

  // ---------------------------------------------------------------------------
  // Counter + button enabled state
  // ---------------------------------------------------------------------------

  function updateCounter() {
    if (!pasteInputEl) return;
    var raw = pasteInputEl.value || '';
    // Clamp to MAX_CHARS in case a paste blew past the maxlength attr
    // (some mobile IMEs allow it; better to cut than send garbage).
    if (raw.length > MAX_CHARS) {
      raw = raw.slice(0, MAX_CHARS);
      pasteInputEl.value = raw;
    }
    var n = raw.length;
    if (counterValueEl) counterValueEl.textContent = String(n);
    if (counterEl) {
      if (n >= MAX_CHARS) counterEl.dataset.tone = 'err';
      else if (n >= WARN_CHARS) counterEl.dataset.tone = 'warn';
      else counterEl.dataset.tone = 'ok';
    }
    if (btnSummariseEl) {
      btnSummariseEl.disabled = n === 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Summarise flow — one structuredChat call, then render
  // ---------------------------------------------------------------------------

  function runSummarise() {
    if (!pasteInputEl) return;
    var text = (pasteInputEl.value || '').trim();
    if (!text) return;
    lastInput = text;
    setState('thinking');

    var messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'Summarise the following text.\n\n---\n' + text + '\n---\nReturn valid JSON matching the schema.' },
    ];

    client.structuredChat(messages, SUMMARY_SCHEMA).then(
      function (response) {
        if (!response || typeof response.tldr !== 'string' || !response.tldr.trim()) {
          throw new Error('empty tldr in response');
        }
        var summary = normaliseSummary(response);
        renderSummary(summary, text);
        persist(summary, text);
        setState('showing_summary');
      },
      function (err) {
        console.warn('[summariser] structuredChat failed:', err);
        showError(err);
      }
    );
  }

  function normaliseSummary(raw) {
    return {
      tldr: String(raw.tldr || '').trim().slice(0, 400),
      bullets: Array.isArray(raw.bullets)
        ? raw.bullets.map(function (b) { return String(b || '').trim(); }).filter(Boolean).slice(0, 8)
        : [],
      key_points: Array.isArray(raw.key_points)
        ? raw.key_points.map(function (k) { return String(k || '').trim(); }).filter(Boolean).slice(0, 8)
        : [],
    };
  }

  function renderSummary(summary, sourceText) {
    if (tldrTextEl) tldrTextEl.textContent = summary.tldr || '—';
    if (metaCharsEl) metaCharsEl.textContent = (sourceText.length + ' CHARS IN');
    renderList(bulletsListEl, summary.bullets, 'No bullets returned.');
    if (metaBulletsEl) metaBulletsEl.textContent = summary.bullets.length + ' ITEMS';
    renderList(keypointsListEl, summary.key_points, 'No key points returned.');
    if (metaKeypointsEl) metaKeypointsEl.textContent = summary.key_points.length + ' ITEMS';
  }

  function renderList(listEl, items, emptyLabel) {
    if (!listEl) return;
    // Clear previous children without innerHTML= to avoid any chance of
    // content from a hostile model sneaking through as markup.
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    if (!items || items.length === 0) {
      var li = document.createElement('li');
      li.textContent = emptyLabel;
      listEl.appendChild(li);
      return;
    }
    for (var i = 0; i < items.length; i++) {
      var item = document.createElement('li');
      item.textContent = items[i];
      listEl.appendChild(item);
    }
  }

  function showError(err) {
    if (errorMessageEl) {
      var msg;
      if (err && err.name === 'StructuredChatError') {
        msg = 'The model returned output that did not match the expected shape. Try a shorter input or run: ollama pull qwen2.5:1.5b';
      } else if (err && /fetch|network|failed to fetch/i.test(err.message || '')) {
        msg = 'Could not reach the Ollama host at ' + (config.host || 'localhost') + '. Is the server running?';
      } else {
        msg = (err && err.message) ? err.message : 'Unknown error while summarising.';
      }
      errorMessageEl.textContent = msg;
    }
    setState('error');
  }

  // ---------------------------------------------------------------------------
  // Persistence — restore the last successful summary on load
  // ---------------------------------------------------------------------------

  function persist(summary, sourceText) {
    try {
      session.save({ summary: summary, sourceText: sourceText, savedAt: Date.now() });
    } catch (err) {
      console.warn('[summariser] session.save failed (non-fatal):', err);
    }
  }

  function restore() {
    var saved = null;
    try {
      saved = session.load();
    } catch (err) {
      console.warn('[summariser] session.load failed:', err);
      return;
    }
    if (!saved || typeof saved !== 'object' || !saved.summary) return;
    lastInput = String(saved.sourceText || '');
    if (pasteInputEl) pasteInputEl.value = lastInput;
    updateCounter();
    renderSummary(saved.summary, lastInput);
    setState('showing_summary');
  }

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------

  if (pasteInputEl) {
    pasteInputEl.addEventListener('input', updateCounter);
    pasteInputEl.addEventListener('keydown', function (e) {
      // Ctrl/Cmd+Enter submits — standard textarea shortcut convention.
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runSummarise();
      }
    });
  }

  if (btnSummariseEl) btnSummariseEl.addEventListener('click', runSummarise);
  if (btnRetryEl) btnRetryEl.addEventListener('click', runSummarise);
  if (btnNewSummaryEl) {
    btnNewSummaryEl.addEventListener('click', function () {
      if (pasteInputEl) {
        pasteInputEl.value = '';
        updateCounter();
      }
      lastInput = '';
      setState('idle');
    });
  }

  if (btnCopyEl) {
    btnCopyEl.addEventListener('click', function () {
      var text = tldrTextEl ? tldrTextEl.textContent || '' : '';
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            flashButton(btnCopyEl, 'Copied!');
          },
          function () {
            flashButton(btnCopyEl, 'Copy failed');
          }
        );
      } else {
        flashButton(btnCopyEl, 'No clipboard');
      }
    });
  }

  function flashButton(btn, label) {
    var original = btn.textContent;
    btn.textContent = label;
    btn.disabled = true;
    setTimeout(function () {
      btn.textContent = original;
      btn.disabled = false;
    }, 1200);
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  updateCounter();
  restore();
  if (state === 'idle' && connectionStatusEl) {
    // Best-effort connectivity check. ping() always resolves — either with
    // { ok: true, models: [...] } or { ok: false, error: ... }. Never
    // rejects. Doesn't block the UI; if the host is actually unreachable
    // we'll surface the error on the first Summarise click anyway.
    client.ping().then(function (result) {
      if (result && result.ok) {
        connectionStatusEl.dataset.state = 'ok';
        connectionStatusEl.textContent = 'connected';
      } else {
        connectionStatusEl.dataset.state = 'err';
        connectionStatusEl.textContent = 'offline';
      }
    });
  }
})();
