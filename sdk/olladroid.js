// =============================================================================
// sdk/olladroid.js — olladroid shared SDK
//
// UMD-lite module that runs identically in three contexts with ZERO source
// transformation:
//
//   1. Inlined into a scaffolded <script> block (non-module, plain script)
//   2. <script src="olladroid.js"> loaded from disk
//   3. require('./olladroid.js') in Node.js for unit tests and the CLI
//
// The wrapper at the bottom either assigns to `window.Olladroid` (browser) or
// to `module.exports` (Node). The inline-script path uses the `window.Olladroid`
// branch, so every scaffolded app accesses the SDK as `Olladroid.OllamaClient`,
// `Olladroid.SessionManager`, etc. — no ES-module scoping trap.
//
// Why not ES modules: an inline <script type="module"> has its own module
// scope, so `export class OllamaClient` would be unreachable from the
// template's app-script in the same document. The scaffolding-system plan
// dug into this at length — see requirements/plans/scaffolding-system.md.
//
// Target: bash 3.2-equivalent portability for JS — works on Node 18+ and
// any modern browser (Chrome 90+ per REQUIREMENTS.md).
// =============================================================================

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Olladroid = api;
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : typeof self !== 'undefined'
        ? self
        : this,
  function () {
    'use strict';

    // -------------------------------------------------------------------------
    // Version + constants
    // -------------------------------------------------------------------------

    var SDK_VERSION = '0.3.2';
    var MIN_OLLAMA_VERSION = '0.5.0';

    // Models verified to produce reliable JSON via Ollama's `format` parameter.
    // `gemma3:1b` and `smollm2:360m` are DELIBERATELY excluded from `structured`
    // because they hallucinate JSON under grammar constraints at that size.
    // See requirements/plans/scaffolding-system.md for the reasoning.
    var MODEL_PREFERENCES = {
      structured: [
        /^gemma4:(e2b|e4b)(-.*)?$/,
        /^qwen2\.5:(1\.5b|3b|7b|14b|32b|72b)(-.*)?$/,
        /^qwen2\.5-coder:/,
        /^llama3\.[123]:(1b|3b|8b)(-.*)?$/,
        /^phi3(\.5)?:/,
        /^gemma2:2b(-.*)?$/,
      ],
      // Free-form chat accepts anything. No filter.
      chat: [/./],
    };

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    function StructuredChatError(message, details) {
      var err = new Error(message);
      err.name = 'StructuredChatError';
      err.details = details || {};
      return err;
    }
    StructuredChatError.prototype = Object.create(Error.prototype);

    // -------------------------------------------------------------------------
    // Utility: pickModel — first matching regex in the preference list
    // -------------------------------------------------------------------------

    function pickModel(availableModels, capability) {
      if (!availableModels || availableModels.length === 0) return null;
      var key = capability || 'chat';
      var patterns = MODEL_PREFERENCES[key] || MODEL_PREFERENCES.chat;
      for (var i = 0; i < patterns.length; i++) {
        for (var j = 0; j < availableModels.length; j++) {
          if (patterns[i].test(availableModels[j])) {
            return availableModels[j];
          }
        }
      }
      return null;
    }

    // -------------------------------------------------------------------------
    // Utility: safeJSONForHTMLScript
    //
    // JSON.stringify does NOT escape `<`, `>`, or `&`, so a user-controlled
    // value containing `</script>` can break out of a
    // <script type="application/json"> block. This wrapper escapes those plus
    // U+2028/U+2029 (which are literal newlines in JavaScript but not in JSON,
    // and can break inline scripts in some browsers).
    // -------------------------------------------------------------------------

    function safeJSONForHTMLScript(value) {
      return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    }

    // -------------------------------------------------------------------------
    // Utility: compareSemver — returns -1, 0, +1 for a < b, a === b, a > b
    // Handles the "0.5.0" / "0.20.5" / "1.2.3-rc1" shape Ollama uses.
    // -------------------------------------------------------------------------

    function compareSemver(a, b) {
      var aParts = String(a).replace(/[^0-9.].*$/, '').split('.').map(Number);
      var bParts = String(b).replace(/[^0-9.].*$/, '').split('.').map(Number);
      var n = Math.max(aParts.length, bParts.length);
      for (var i = 0; i < n; i++) {
        var av = aParts[i] || 0;
        var bv = bParts[i] || 0;
        if (av < bv) return -1;
        if (av > bv) return 1;
      }
      return 0;
    }

    // -------------------------------------------------------------------------
    // OllamaClient — HTTP client for the Ollama API
    // -------------------------------------------------------------------------

    function OllamaClient(options) {
      options = options || {};
      this.host = options.host || this._detectHost();
      this.defaultModel = options.model || null;
      // Injectable for tests. Falls back to the runtime's global fetch,
      // but wraps it in a closure so the call site isn't `this._fetch(...)`
      // — WebIDL-backed browser implementations throw
      // "Illegal invocation" when fetch is invoked with a receiver other
      // than the global (Chrome, Safari). Node's global fetch doesn't care,
      // but the browser path is the one that actually ships to users.
      if (options.fetch) {
        var userFetch = options.fetch;
        this._fetch = function (url, init) { return userFetch(url, init); };
      } else if (typeof fetch !== 'undefined') {
        this._fetch = function (url, init) { return fetch(url, init); };
      } else {
        this._fetch = null;
      }
      // Memoised version check (populated on first structuredChat)
      this._versionCache = null;
      this._versionWarned = false;
    }

    OllamaClient.prototype._detectHost = function () {
      if (typeof window !== 'undefined' && window.OLLAMA_HOST) {
        return window.OLLAMA_HOST;
      }
      if (typeof window !== 'undefined' && window.location && window.location.hostname) {
        return window.location.protocol + '//' + window.location.hostname + ':11434';
      }
      return 'http://localhost:11434';
    };

    OllamaClient.prototype._request = function (path, init) {
      if (!this._fetch) {
        return Promise.reject(new Error('no fetch available — pass { fetch: ... } to OllamaClient'));
      }
      return this._fetch(this.host + path, init || {});
    };

    OllamaClient.prototype._post = function (path, body) {
      return this._request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    };

    OllamaClient.prototype.ping = function () {
      var self = this;
      return this._request('/api/tags').then(
        function (res) {
          if (!res.ok) return { ok: false, models: [], error: 'HTTP ' + res.status };
          return res.json().then(function (data) {
            var models = (data.models || []).map(function (m) {
              return m.name;
            });
            return { ok: true, models: models };
          });
        },
        function (err) {
          return { ok: false, models: [], error: err.message || String(err) };
        }
      );
    };

    OllamaClient.prototype.version = function () {
      if (this._versionCache) return Promise.resolve(this._versionCache);
      var self = this;
      return this._request('/api/version').then(function (res) {
        if (!res.ok) {
          self._versionCache = { version: 'unknown', compatible: false, minimum: MIN_OLLAMA_VERSION };
          return self._versionCache;
        }
        return res.json().then(function (data) {
          var v = data.version || 'unknown';
          var compatible = v !== 'unknown' && compareSemver(v, MIN_OLLAMA_VERSION) >= 0;
          self._versionCache = { version: v, compatible: compatible, minimum: MIN_OLLAMA_VERSION };
          return self._versionCache;
        });
      });
    };

    OllamaClient.prototype.models = function () {
      return this.ping().then(function (result) {
        if (!result.ok) throw new Error(result.error || 'ping failed');
        return result.models;
      });
    };

    OllamaClient.prototype.chat = function (messages, options) {
      options = options || {};
      var body = {
        model: options.model || this.defaultModel,
        messages: messages,
        stream: false,
      };
      if (options.options) body.options = options.options;
      return this._post('/api/chat', body).then(function (res) {
        if (!res.ok) throw new Error('chat failed: HTTP ' + res.status);
        return res.json().then(function (data) {
          return (data.message && data.message.content) || '';
        });
      });
    };

    // streamChat — parses Ollama's NDJSON chat stream, calls onChunk(text, full)
    // for each incremental response. onChunk can return `false` to abort early.
    // Returns the full concatenated content when the stream ends (or is aborted).
    OllamaClient.prototype.streamChat = function (messages, options, onChunk) {
      options = options || {};
      var body = {
        model: options.model || this.defaultModel,
        messages: messages,
        stream: true,
      };
      if (options.options) body.options = options.options;

      return this._post('/api/chat', body).then(function (res) {
        if (!res.ok) throw new Error('streamChat failed: HTTP ' + res.status);
        if (!res.body || !res.body.getReader) {
          // Fallback for environments without streaming (tests, old Node).
          return res.text().then(function (text) {
            return parseNDJSONBuffer(text, onChunk);
          });
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var full = '';
        var aborted = false;

        function pump() {
          return reader.read().then(function (chunk) {
            if (aborted) return full;
            if (chunk.done) {
              // Drain the last line.
              if (buffer.trim()) {
                var parsed = safeParseLine(buffer);
                if (parsed && parsed.message && parsed.message.content) {
                  full += parsed.message.content;
                  if (onChunk) onChunk(parsed.message.content, parsed);
                }
              }
              return full;
            }
            buffer += decoder.decode(chunk.value, { stream: true });
            var lines = buffer.split('\n');
            buffer = lines.pop(); // keep partial last line
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line) continue;
              var j = safeParseLine(line);
              if (!j) continue;
              if (j.message && typeof j.message.content === 'string') {
                full += j.message.content;
                if (onChunk) {
                  var result = onChunk(j.message.content, j);
                  if (result === false) {
                    aborted = true;
                    reader.cancel();
                    return full;
                  }
                }
              }
              if (j.done) {
                return full;
              }
            }
            return pump();
          });
        }
        return pump();
      });
    };

    // Helper shared between stream path and fallback path.
    function safeParseLine(line) {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }

    // Fallback NDJSON parser for environments without ReadableStream.
    function parseNDJSONBuffer(text, onChunk) {
      var full = '';
      var lines = text.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        var j = safeParseLine(line);
        if (!j) continue;
        if (j.message && typeof j.message.content === 'string') {
          full += j.message.content;
          if (onChunk) {
            var result = onChunk(j.message.content, j);
            if (result === false) return full;
          }
        }
      }
      return full;
    }

    // structuredChat — Ollama's `format` parameter forces JSON output matching
    // the provided schema. First attempt goes through cleanly. If parsing fails
    // (malformed JSON, missing required key), retry once with an explicit
    // system message reminding the model to return valid JSON. Second failure
    // throws StructuredChatError with the raw response attached.
    OllamaClient.prototype.structuredChat = function (messages, schema, options) {
      options = options || {};
      var self = this;

      // Check version lazily — warn once, don't block.
      var versionCheck = this.version().then(function (info) {
        if (!info.compatible && !self._versionWarned) {
          self._versionWarned = true;
          if (typeof console !== 'undefined' && console.warn) {
            console.warn(
              '[Olladroid] Ollama version ' + info.version +
              ' is older than the ' + MIN_OLLAMA_VERSION +
              ' minimum recommended for structured output. ' +
              'structuredChat() may return prose instead of JSON.'
            );
          }
        }
      });

      function tryOnce(extraMessages) {
        var body = {
          model: options.model || self.defaultModel,
          messages: (extraMessages || []).concat(messages),
          stream: false,
          format: schema,
        };
        if (options.options) body.options = options.options;
        return self._post('/api/chat', body).then(function (res) {
          if (!res.ok) {
            throw StructuredChatError('HTTP ' + res.status, { status: res.status });
          }
          return res.json().then(function (data) {
            var raw = (data.message && data.message.content) || '';
            if (!raw) {
              throw StructuredChatError('empty response from model', { raw: '', data: data });
            }
            var parsed;
            try {
              parsed = JSON.parse(raw);
            } catch (e) {
              throw StructuredChatError('JSON.parse failed: ' + e.message, { raw: raw });
            }
            // Shallow check: all schema.required keys must be present on the
            // parsed object. We do NOT check types — Ollama's grammar-constrained
            // output handles that, and deep validation would pull in ajv or
            // similar. Keep the SDK zero-dep.
            if (schema && schema.required && Array.isArray(schema.required)) {
              for (var k = 0; k < schema.required.length; k++) {
                var key = schema.required[k];
                if (!Object.prototype.hasOwnProperty.call(parsed, key)) {
                  throw StructuredChatError(
                    'missing required key "' + key + '"',
                    { raw: raw, parsed: parsed }
                  );
                }
              }
            }
            return parsed;
          });
        });
      }

      return versionCheck.then(function () {
        return tryOnce().catch(function (err) {
          if (!err || err.name !== 'StructuredChatError') throw err;
          // One retry with explicit nudge.
          var nudge = [
            {
              role: 'system',
              content:
                'Your previous response could not be parsed as valid JSON. ' +
                'Return ONLY valid JSON matching the requested schema. ' +
                'No prose. No markdown code fences. No commentary.',
            },
          ];
          return tryOnce(nudge);
        });
      });
    };

    // -------------------------------------------------------------------------
    // SessionManager — localStorage-backed history + arbitrary state
    // -------------------------------------------------------------------------

    function SessionManager(options) {
      options = options || {};
      this.key = options.key || 'default';
      this.maxTurns = options.maxTurns || 50;
      // Injectable for tests. Falls back to window.localStorage.
      this._storage = options.storage || (
        typeof localStorage !== 'undefined' ? localStorage : null
      );
      // In-memory fallback so SessionManager is still usable (just not persisted)
      // when localStorage is unavailable (incognito, Node, tests without stub).
      this._memory = {};
    }

    SessionManager.prototype._keyFor = function (suffix) {
      return 'olladroid:' + this.key + ':' + suffix;
    };

    SessionManager.prototype._read = function (suffix) {
      var k = this._keyFor(suffix);
      // Storage is authoritative when it works. If it throws or returns null
      // (nothing ever saved there), fall through to the in-memory backup.
      if (this._storage) {
        try {
          var raw = this._storage.getItem(k);
          if (raw !== null) return JSON.parse(raw);
        } catch (e) {
          // Read threw — fall through to memory
        }
      }
      return this._memory[k] !== undefined ? this._memory[k] : null;
    };

    SessionManager.prototype._write = function (suffix, value) {
      var k = this._keyFor(suffix);
      // Always write to memory as a backup. This makes the SDK robust to
      // storage that partially works — e.g. Safari private mode where
      // setItem throws QuotaExceededError, or a pathological storage where
      // getItem throws but setItem returns normally. The test suite exercises
      // both.
      this._memory[k] = value;
      if (this._storage) {
        try {
          this._storage.setItem(k, JSON.stringify(value));
        } catch (e) {
          // Already mirrored to memory; swallow.
        }
      }
    };

    SessionManager.prototype._delete = function (suffix) {
      var k = this._keyFor(suffix);
      if (this._storage) {
        try {
          this._storage.removeItem(k);
        } catch (e) {
          // ignore
        }
      }
      delete this._memory[k];
    };

    SessionManager.prototype.add = function (role, content) {
      var history = this._read('history') || [];
      history.push({ role: role, content: content });
      // Trim to maxTurns, dropping oldest first.
      if (history.length > this.maxTurns) {
        history = history.slice(history.length - this.maxTurns);
      }
      this._write('history', history);
    };

    SessionManager.prototype.get = function () {
      return this._read('history') || [];
    };

    SessionManager.prototype.clear = function () {
      this._delete('history');
      this._delete('state');
    };

    SessionManager.prototype.save = function (extraData) {
      this._write('state', extraData);
    };

    SessionManager.prototype.load = function () {
      return this._read('state');
    };

    // -------------------------------------------------------------------------
    // EventBus — tiny pub/sub, no deps
    // -------------------------------------------------------------------------

    function EventBus() {
      this._handlers = {};
    }

    EventBus.prototype.on = function (event, handler) {
      if (!this._handlers[event]) this._handlers[event] = [];
      this._handlers[event].push(handler);
    };

    EventBus.prototype.off = function (event, handler) {
      if (!this._handlers[event]) return;
      this._handlers[event] = this._handlers[event].filter(function (h) {
        return h !== handler;
      });
    };

    EventBus.prototype.once = function (event, handler) {
      var self = this;
      function wrapped(payload) {
        self.off(event, wrapped);
        handler(payload);
      }
      this.on(event, wrapped);
    };

    EventBus.prototype.emit = function (event, payload) {
      if (!this._handlers[event]) return;
      // Snapshot the handler list so once() unsubscribes don't affect the
      // current emit iteration.
      var handlers = this._handlers[event].slice();
      for (var i = 0; i < handlers.length; i++) {
        handlers[i](payload);
      }
    };

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    return {
      VERSION: SDK_VERSION,
      MIN_OLLAMA_VERSION: MIN_OLLAMA_VERSION,
      MODEL_PREFERENCES: MODEL_PREFERENCES,
      OllamaClient: OllamaClient,
      SessionManager: SessionManager,
      EventBus: EventBus,
      StructuredChatError: StructuredChatError,
      pickModel: pickModel,
      safeJSONForHTMLScript: safeJSONForHTMLScript,
      compareSemver: compareSemver,
    };
  }
);
