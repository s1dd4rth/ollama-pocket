// templates/kids-game/spell-bee/app.js
// Spell Bee v1 — the real game controller (scaffolding PR 4).
//
// Wires the 5-state FSM to window.Pocket.OllamaClient + SessionManager.
// Two structuredChat calls per round:
//   1. fetch a word (schema: { word, hint, difficulty })
//   2. judge the child's attempt (schema: { correct, feedback, score_delta })
//
// Failure handling mirrors the plan:
//   - Word fetch throws → switch to word_error panel + retry button.
//     3 consecutive word-fetch failures → surface the "try qwen2.5:1.5b" hint
//     via the .pocket-banner in the header area.
//   - Judgment throws → fall back to local string compare (lowercased exact
//     match), so the round never hard-stalls on a bad JSON response.
//   - Ping on boot fails → offline panel with retry button.
//
// Persistence: SessionManager stores score, round count, and recent-word
// history (last 50) under key "spell-bee-<slug>". localStorage unavailable
// (incognito) transparently no-ops via the SDK's in-memory fallback.

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
    console.error('[spell-bee] app-config JSON parse failed:', err);
  }

  // Populate the shared header + info-bar from config. Done early so even
  // if the SDK fails to load, the chrome still renders correctly.
  var titleEl = document.getElementById('app-title');
  if (titleEl && config.appName) titleEl.textContent = formatTitleMono(config.appName);
  var logoEl = document.getElementById('app-logo');
  if (logoEl && config.appName) logoEl.textContent = buildLogoGlyph(config.appName);
  var modelBadgeEl = document.getElementById('model-badge');
  if (modelBadgeEl && config.defaultModel) modelBadgeEl.textContent = config.defaultModel;
  var hostBadgeEl = document.getElementById('host-badge');
  if (hostBadgeEl) hostBadgeEl.textContent = formatHostLabel(config.host);
  var ageSubtitleEl = document.getElementById('age-subtitle');
  if (ageSubtitleEl) ageSubtitleEl.textContent = 'AGE ' + (config.ageGroup || '—');
  var connectionStatusEl = document.getElementById('connection-status');

  function buildLogoGlyph(name) {
    // Two-letter app mark. "Spell Bee" → "SB", "spell-bee" → "SB".
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
    // TE chrome convention: uppercase with underscores for spaces.
    return (name || '').toUpperCase().replace(/\s+/g, '_');
  }

  if (!window.Pocket || !window.Pocket.OllamaClient) {
    console.error('[spell-bee] window.Pocket is not loaded — is sdk/pocket.js inlined correctly?');
    var stage = document.querySelector('.spell-bee__stage');
    if (stage) {
      stage.innerHTML =
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
    key: 'spell-bee-' + (config.appSlug || 'default'),
    maxTurns: 100,
  });

  // ---------------------------------------------------------------------------
  // JSON Schemas (Ollama grammar-constrained format)
  // ---------------------------------------------------------------------------

  var WORD_SCHEMA = {
    type: 'object',
    properties: {
      word: { type: 'string' },
      hint: { type: 'string' },
      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
    },
    required: ['word', 'hint', 'difficulty'],
  };

  var JUDGMENT_SCHEMA = {
    type: 'object',
    properties: {
      correct: { type: 'boolean' },
      feedback: { type: 'string' },
      score_delta: { type: 'integer' },
    },
    required: ['correct', 'feedback', 'score_delta'],
  };

  // ---------------------------------------------------------------------------
  // System prompt — age-group aware, bakes in the "audio-independent hint"
  // constraint from the plan.
  // ---------------------------------------------------------------------------

  function buildSystemPrompt(ageGroup) {
    return [
      'You are SpellBot, a friendly spelling teacher for children aged ' + ageGroup + '.',
      'Choose spelling words appropriate for this age group.',
      'Always respond with valid JSON only. No prose, no markdown, no code fences.',
      'Be encouraging. Never use discouraging language.',
      'Keep hints descriptive: a child who cannot hear the word must be able to guess',
      'it from your description alone. Describe what the word means, what it looks like,',
      'or where it is found — never say which letter it starts with or how many letters it has.',
      'Example good hint for "elephant": "a very large grey animal with a long trunk that lives in Africa and India".',
      'Example bad hint: "it starts with E and has 8 letters".',
    ].join('\n');
  }

  var systemPrompt = buildSystemPrompt(config.ageGroup || '6-8');

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  var state = 'idle';
  var score = 0;
  var round = 0;
  var recentWords = [];
  var currentWord = '';
  var currentHint = '';
  var currentDifficulty = 'medium';
  var consecutiveWordFailures = 0;

  // Restore persisted state
  var saved = session.load();
  if (saved && typeof saved === 'object') {
    if (typeof saved.score === 'number') score = saved.score;
    if (typeof saved.round === 'number') round = saved.round;
    if (Array.isArray(saved.recentWords)) recentWords = saved.recentWords.slice(-50);
  }

  function persist() {
    try {
      session.save({
        score: score,
        round: round,
        recentWords: recentWords.slice(-50),
      });
    } catch (err) {
      console.warn('[spell-bee] session.save failed (non-fatal):', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Element refs
  // ---------------------------------------------------------------------------

  function $(id) {
    return document.getElementById(id);
  }

  var panels = document.querySelectorAll('.spell-bee__panel');
  var scoreValueEl = $('score-value');
  var resetBtn = $('btn-reset');
  var difficultyBadge = $('difficulty-badge');
  var hintTextEl = $('hint-text');
  var attemptInputEl = $('attempt-input');
  var feedbackCardEl = $('feedback-card');
  var feedbackStatusEl = $('feedback-status');
  var feedbackDeltaEl = $('feedback-delta');
  var feedbackTextEl = $('feedback-text');
  var feedbackWordLineEl = $('feedback-word-line');
  var modelWarningEl = $('model-warning');
  var modelWarningTextEl = $('model-warning-text');
  var offlineHostEl = $('offline-host');

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------

  function setState(next) {
    state = next;
    for (var i = 0; i < panels.length; i++) {
      panels[i].hidden = panels[i].dataset.state !== next;
    }
    // Move keyboard focus to the primary control in the new panel so mobile
    // users don't have to tap twice. Done in a microtask so the hidden toggle
    // has settled first.
    Promise.resolve().then(function () {
      if (next === 'awaiting_attempt' && attemptInputEl) {
        attemptInputEl.focus();
        attemptInputEl.select();
      } else if (next === 'showing_feedback') {
        var nextBtn = $('btn-next');
        if (nextBtn) nextBtn.focus();
      } else if (next === 'idle') {
        var startBtn = $('btn-start');
        if (startBtn) startBtn.focus();
      }
    });
  }

  function updateScore() {
    if (scoreValueEl) scoreValueEl.textContent = String(score);
    if (resetBtn) resetBtn.hidden = score <= 0;
  }

  function setConnectionIndicator(kind, label) {
    if (!connectionStatusEl) return;
    if (kind) {
      connectionStatusEl.dataset.state = kind;
    } else {
      delete connectionStatusEl.dataset.state;
    }
    connectionStatusEl.textContent = label || '';
  }

  function showModelWarning(text) {
    if (!modelWarningEl) return;
    if (modelWarningTextEl) modelWarningTextEl.textContent = text;
    modelWarningEl.hidden = false;
  }

  function hideModelWarning() {
    if (modelWarningEl) modelWarningEl.hidden = true;
  }

  // ---------------------------------------------------------------------------
  // Game logic
  // ---------------------------------------------------------------------------

  function checkConnection() {
    setConnectionIndicator('warn', 'Connecting…');
    setState('fetching_word'); // visually: a spinner while we ping
    client.ping().then(function (result) {
      if (!result || !result.ok) {
        setConnectionIndicator('err', 'Offline');
        if (offlineHostEl) offlineHostEl.textContent = config.host || 'localhost:11434';
        setState('offline');
        return;
      }

      // Decide whether any installed model is reliable for structured output.
      // We don't block the game — a yellow warning banner is enough.
      var structured = Pocket.pickModel(result.models || [], 'structured');
      if (!structured) {
        setConnectionIndicator('warn', 'Model');
        showModelWarning(
          'Your installed models may not produce reliable JSON. ' +
            'For smoother Spell Bee rounds run: ollama pull qwen2.5:1.5b'
        );
      } else {
        setConnectionIndicator('ok', 'Connected');
        hideModelWarning();
      }

      setState('idle');
    }).catch(function (err) {
      console.error('[spell-bee] ping threw:', err);
      setConnectionIndicator('err', 'Offline');
      setState('offline');
    });
  }

  function startRound() {
    setState('fetching_word');
    hideModelWarning(); // dismiss stale warnings from the previous round

    var avoidList = recentWords.slice(-10).join(', ');
    var userMessage =
      'Give me the next word for the child to spell. Return valid JSON matching the schema.' +
      (avoidList
        ? ' Avoid repeating any of these recent words if reasonable: ' + avoidList + '.'
        : '');

    var messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    client.structuredChat(messages, WORD_SCHEMA).then(
      function (response) {
        if (!response || typeof response.word !== 'string' || !response.word.trim()) {
          throw new Error('empty word in response');
        }
        currentWord = response.word.trim();
        currentHint = (response.hint || '').toString().trim();
        currentDifficulty = normaliseDifficulty(response.difficulty);

        recentWords.push(currentWord);
        if (recentWords.length > 50) recentWords = recentWords.slice(-50);
        consecutiveWordFailures = 0;

        if (hintTextEl) hintTextEl.textContent = currentHint || 'Spell this word.';
        if (difficultyBadge) {
          difficultyBadge.textContent = currentDifficulty;
          difficultyBadge.dataset.level = currentDifficulty;
        }
        if (attemptInputEl) attemptInputEl.value = '';

        setState('awaiting_attempt');
      },
      function (err) {
        console.warn('[spell-bee] word fetch failed:', err);
        consecutiveWordFailures += 1;
        if (consecutiveWordFailures >= 3) {
          showModelWarning(
            'This model is struggling with Spell Bee. For a smoother experience run: ollama pull qwen2.5:1.5b'
          );
        }
        setState('word_error');
      }
    );
  }

  function submitAttempt() {
    var attempt = attemptInputEl ? (attemptInputEl.value || '').trim() : '';
    if (!attempt) {
      if (attemptInputEl) attemptInputEl.focus();
      return;
    }

    setState('judging');

    var userMessage =
      'Target word: "' + currentWord + '".\n' +
      'Hint you gave: "' + currentHint + '".\n' +
      'The child typed: "' + attempt + '".\n' +
      'Judge the attempt fairly and kindly. Return JSON matching the schema:\n' +
      '- correct: true only if the letters match the target word exactly, ignoring case.\n' +
      '- feedback: one short encouraging sentence. If wrong, be kind and brief.\n' +
      '- score_delta: 1 if correct, 0 if not.';

    var messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    client.structuredChat(messages, JUDGMENT_SCHEMA).then(
      function (judgment) {
        applyJudgment(judgment);
      },
      function (err) {
        console.warn('[spell-bee] judgment failed, falling back to local compare:', err);
        var correct = attempt.toLowerCase() === currentWord.toLowerCase();
        applyJudgment({
          correct: correct,
          feedback: correct
            ? 'Nice work! That is how you spell it.'
            : 'Good try! Keep practising.',
          score_delta: correct ? 1 : 0,
        });
      }
    );
  }

  function applyJudgment(result) {
    var correct = !!result.correct;
    // Defensive: coerce to integer, clamp to {-1, 0, 1, 2} range so a
    // misbehaving model can't inflate the score arbitrarily.
    var delta = parseInt(result.score_delta, 10);
    if (!isFinite(delta)) delta = correct ? 1 : 0;
    if (delta < -1) delta = -1;
    if (delta > 2) delta = 2;

    score += delta;
    if (score < 0) score = 0;
    round += 1;
    updateScore();
    persist();

    if (feedbackCardEl) feedbackCardEl.dataset.result = correct ? 'correct' : 'wrong';
    if (feedbackStatusEl) feedbackStatusEl.textContent = correct ? 'Correct' : 'Not quite';
    if (feedbackDeltaEl) {
      var sign = delta > 0 ? '+' : '';
      feedbackDeltaEl.textContent = sign + delta + ' PTS';
    }
    if (feedbackTextEl) {
      feedbackTextEl.textContent =
        result.feedback || (correct ? 'Nice work.' : 'Good try — keep going.');
    }
    if (feedbackWordLineEl) {
      feedbackWordLineEl.innerHTML = correct
        ? 'Word&nbsp;&nbsp;<b></b>'
        : 'Word was&nbsp;&nbsp;<b></b>';
      var bold = feedbackWordLineEl.querySelector('b');
      if (bold) bold.textContent = currentWord;
    }

    setState('showing_feedback');
  }

  function resetScore() {
    score = 0;
    round = 0;
    recentWords = [];
    try {
      session.clear();
    } catch (err) {
      console.warn('[spell-bee] session.clear failed (non-fatal):', err);
    }
    updateScore();
  }

  function normaliseDifficulty(value) {
    var v = (value || '').toString().toLowerCase();
    if (v === 'easy' || v === 'medium' || v === 'hard') return v;
    return 'medium';
  }

  // ---------------------------------------------------------------------------
  // Wire up buttons + keyboard
  // ---------------------------------------------------------------------------

  function on(id, event, handler) {
    var el = $(id);
    if (el) el.addEventListener(event, handler);
  }

  on('btn-start', 'click', startRound);
  on('btn-submit', 'click', submitAttempt);
  on('btn-next', 'click', startRound);
  on('btn-retry-word', 'click', startRound);
  on('btn-retry-ping', 'click', checkConnection);
  on('btn-reset', 'click', resetScore);

  if (attemptInputEl) {
    attemptInputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitAttempt();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  updateScore();
  checkConnection();
})();
