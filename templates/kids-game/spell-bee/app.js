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
  //
  // A "session" is a bounded series of rounds (default 5). Score resets at
  // the start of every session so each session has a meaningful
  // score/accuracy summary. `bestSession` and the running `recentWords`
  // list are the only cross-session state we persist.
  // ---------------------------------------------------------------------------

  var ROUNDS_PER_SESSION =
    Number.isInteger(config.roundsPerSession) && config.roundsPerSession > 0
      ? config.roundsPerSession
      : 5;

  var state = 'idle';
  var sessionScore = 0;      // score inside the current session
  var sessionRound = 0;      // 0 before the first round, 1..N during play
  var bestSession = 0;       // persisted highest session score ever
  var recentWords = [];      // persisted last-50 words to bias away from repeats
  var currentWord = '';
  var currentHint = '';
  var currentDifficulty = 'medium';
  var consecutiveWordFailures = 0;

  // Restore cross-session state only (bestSession + recentWords). The
  // session score/round intentionally DOES NOT persist — a page reload
  // mid-session drops the current session and puts the user back at idle.
  var saved = session.load();
  if (saved && typeof saved === 'object') {
    if (typeof saved.bestSession === 'number') bestSession = saved.bestSession;
    if (Array.isArray(saved.recentWords)) recentWords = saved.recentWords.slice(-50);
  }

  function persist() {
    try {
      session.save({
        bestSession: bestSession,
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
  var roundLabelEl = $('round-label');
  var difficultyBadge = $('difficulty-badge');
  var hintTextEl = $('hint-text');
  var attemptInputEl = $('attempt-input');
  var feedbackCardEl = $('feedback-card');
  var feedbackStatusEl = $('feedback-status');
  var feedbackDeltaEl = $('feedback-delta');
  var feedbackTextEl = $('feedback-text');
  var feedbackAttemptValueEl = $('feedback-attempt-value');
  var feedbackWordValueEl = $('feedback-word-value');
  var modelWarningEl = $('model-warning');
  var modelWarningTextEl = $('model-warning-text');
  var offlineHostEl = $('offline-host');
  var summaryScoreEl = $('summary-score');
  var summaryAccuracyEl = $('summary-accuracy');
  var summaryBestEl = $('summary-best');
  var summaryNoteEl = $('summary-note');

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
      } else if (next === 'session_complete') {
        var newSessionBtn = $('btn-new-session');
        if (newSessionBtn) newSessionBtn.focus();
      }
    });
  }

  function updateScore() {
    if (scoreValueEl) scoreValueEl.textContent = String(sessionScore);
    if (roundLabelEl) {
      // "Round 0 / 5" before any play, "Round 3 / 5" mid-session,
      // "Round 5 / 5" at the final feedback.
      roundLabelEl.textContent = 'Round ' + sessionRound + ' / ' + ROUNDS_PER_SESSION;
    }
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

  // Kick off a brand-new session: reset score + round counter, then fetch
  // the first word. Called by the Start and New Session buttons.
  function startSession() {
    sessionScore = 0;
    sessionRound = 0;
    updateScore();
    startRound();
  }

  // Fetch and display a word, advancing sessionRound. If a word fetch fails
  // the consecutiveWordFailures counter does NOT bump the session round
  // forward — the user hasn't actually played a round yet.
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

        // Advance the session round only once we actually have a word to
        // show — a failed fetch shouldn't consume a round slot.
        sessionRound += 1;
        updateScore();

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

  // Called by the Next button after feedback: either kick off the next
  // round or finish the session if we've hit ROUNDS_PER_SESSION.
  function advanceAfterFeedback() {
    if (sessionRound >= ROUNDS_PER_SESSION) {
      finishSession();
    } else {
      startRound();
    }
  }

  function finishSession() {
    // Update the persisted best-ever-session score.
    if (sessionScore > bestSession) bestSession = sessionScore;
    persist();

    if (summaryScoreEl) summaryScoreEl.textContent = sessionScore + ' / ' + ROUNDS_PER_SESSION;
    if (summaryAccuracyEl) {
      var pct = ROUNDS_PER_SESSION > 0
        ? Math.round((sessionScore / ROUNDS_PER_SESSION) * 100)
        : 0;
      summaryAccuracyEl.textContent = pct + '%';
    }
    if (summaryBestEl) summaryBestEl.textContent = bestSession + ' / ' + ROUNDS_PER_SESSION;
    if (summaryNoteEl) {
      if (sessionScore === ROUNDS_PER_SESSION) {
        summaryNoteEl.textContent = 'Perfect session. Tap New session for another round.';
      } else if (sessionScore >= Math.ceil(ROUNDS_PER_SESSION * 0.6)) {
        summaryNoteEl.textContent = 'Nicely done. Tap New session to try for a better score.';
      } else {
        summaryNoteEl.textContent = 'Every session is practice. Tap New session to keep going.';
      }
    }
    setState('session_complete');
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
        applyJudgment(judgment, attempt);
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
        }, attempt);
      }
    );
  }

  function applyJudgment(result, attempt) {
    // Local authoritative check. A 1.5B-class model will sometimes
    // mislabel a letter-perfect answer — it's not the model's job to
    // decide spelling equality, it's ours. If the child typed exactly the
    // target word (case-insensitive), count it correct regardless of
    // what the model thinks. The model's `feedback` prose is still shown,
    // because it's usually kind even when the correct boolean is wrong.
    var localMatch = false;
    if (typeof attempt === 'string' && attempt.length > 0) {
      localMatch = attempt.trim().toLowerCase() === currentWord.trim().toLowerCase();
    }
    var correct = localMatch || !!result.correct;
    // Defensive: clamp delta to {0, 1} regardless of what score_delta the
    // model returned. The session score stays in lockstep with the on-
    // screen status text.
    var delta = correct ? 1 : 0;

    sessionScore += delta;
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
    // Character-level diff so kids can see exactly which letters were
    // wrong or missing. On correct rounds diffWord returns all `same`
    // tokens and renderDiffRow falls through to plain text — no visual
    // highlighting at all, just clean uppercase mono.
    var diff = diffWord(attempt || '', currentWord);
    renderDiffRow(feedbackAttemptValueEl, diff.attempt, attempt || '—');
    renderDiffRow(feedbackWordValueEl, diff.target, currentWord);

    setState('showing_feedback');
  }

  function normaliseDifficulty(value) {
    var v = (value || '').toString().toLowerCase();
    if (v === 'easy' || v === 'medium' || v === 'hard') return v;
    return 'medium';
  }

  // ---------------------------------------------------------------------------
  // Character-level diff between attempt and target, aligned via LCS.
  //
  // Returns two parallel arrays of tokens:
  //   { kind: 'same', char }    — letter present in both
  //   { kind: 'wrong', char }   — letter present in attempt but not in target
  //                                at this position (extra/substituted char)
  //   { kind: 'missing', char } — letter present in target but not in attempt
  //                                (child forgot this letter)
  //   { kind: 'ghost' }         — placeholder rendered on the OTHER side so
  //                                the two rows stay visually aligned when
  //                                one row has a wrong/missing gap
  //
  // The comparison is case-insensitive but the token `char` keeps the
  // original case so the rendered output still reads as typed. A
  // word-on-word compare is O(|a| * |b|) — fine for Spell Bee words that
  // top out at ~15 letters.
  // ---------------------------------------------------------------------------
  function diffWord(attempt, target) {
    var a = attempt || '';
    var b = target || '';
    var m = a.length;
    var n = b.length;

    // LCS dynamic programming table (lowercased comparison).
    var dp = [];
    for (var i = 0; i <= m; i++) {
      dp.push(new Array(n + 1).fill(0));
    }
    for (var i2 = 1; i2 <= m; i2++) {
      for (var j2 = 1; j2 <= n; j2++) {
        if (a.charAt(i2 - 1).toLowerCase() === b.charAt(j2 - 1).toLowerCase()) {
          dp[i2][j2] = dp[i2 - 1][j2 - 1] + 1;
        } else {
          dp[i2][j2] = Math.max(dp[i2 - 1][j2], dp[i2][j2 - 1]);
        }
      }
    }

    // Backtrack to produce aligned token arrays. Each step either
    // matches, deletes from a (wrong letter in attempt), or deletes
    // from b (missing letter from target). We push aligned ghost tokens
    // so the two output rows stay character-aligned.
    var aOut = [];
    var bOut = [];
    var i3 = m;
    var j3 = n;
    while (i3 > 0 && j3 > 0) {
      if (a.charAt(i3 - 1).toLowerCase() === b.charAt(j3 - 1).toLowerCase()) {
        aOut.unshift({ kind: 'same', char: a.charAt(i3 - 1) });
        bOut.unshift({ kind: 'same', char: b.charAt(j3 - 1) });
        i3--;
        j3--;
      } else if (dp[i3 - 1][j3] >= dp[i3][j3 - 1]) {
        // Letter in attempt has no partner in target — wrong letter.
        aOut.unshift({ kind: 'wrong', char: a.charAt(i3 - 1) });
        bOut.unshift({ kind: 'ghost' });
        i3--;
      } else {
        // Letter in target has no partner in attempt — missing letter.
        aOut.unshift({ kind: 'ghost' });
        bOut.unshift({ kind: 'missing', char: b.charAt(j3 - 1) });
        j3--;
      }
    }
    while (i3 > 0) {
      aOut.unshift({ kind: 'wrong', char: a.charAt(i3 - 1) });
      bOut.unshift({ kind: 'ghost' });
      i3--;
    }
    while (j3 > 0) {
      aOut.unshift({ kind: 'ghost' });
      bOut.unshift({ kind: 'missing', char: b.charAt(j3 - 1) });
      j3--;
    }

    return { attempt: aOut, target: bOut };
  }

  // Render a diff token row into a container element using individual
  // spans so each letter gets its own styling box. Plaintext fallback on
  // exact match keeps the DOM tiny for the overwhelming majority of rounds.
  function renderDiffRow(containerEl, tokens, fallbackPlain) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    if (fallbackPlain != null && tokens.every(function (t) { return t.kind === 'same'; })) {
      containerEl.textContent = fallbackPlain;
      return;
    }
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var span = document.createElement('span');
      if (tok.kind === 'same') {
        span.className = 'sb-char';
        span.textContent = tok.char;
      } else if (tok.kind === 'wrong') {
        span.className = 'sb-char sb-char--wrong';
        span.textContent = tok.char;
      } else if (tok.kind === 'missing') {
        span.className = 'sb-char sb-char--missing';
        span.textContent = tok.char;
      } else if (tok.kind === 'ghost') {
        span.className = 'sb-char sb-char--ghost';
        span.textContent = '·';
      }
      containerEl.appendChild(span);
    }
  }

  // ---------------------------------------------------------------------------
  // Wire up buttons + keyboard
  // ---------------------------------------------------------------------------

  function on(id, event, handler) {
    var el = $(id);
    if (el) el.addEventListener(event, handler);
  }

  on('btn-start', 'click', startSession);
  on('btn-submit', 'click', submitAttempt);
  on('btn-next', 'click', advanceAfterFeedback);
  on('btn-new-session', 'click', startSession);
  on('btn-retry-word', 'click', startRound);
  on('btn-retry-ping', 'click', checkConnection);

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
