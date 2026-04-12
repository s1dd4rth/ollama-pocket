# Plan — Scaffolding System (v1: Platform + Spell Bee)

**Status:** draft
**Source requirements:** `requirements/REQUIREMENTS.md`
**Depends on:** Plan B (PWA install path) — scaffolded apps also need HTTP, not `file://`
**Parallel with:** A (debloat), D (one-liner), E (benchmark)

## Decisions locked (from this session)

1. **Scope:** v1 ships the platform **+ Spell Bee only**. Quiz Master, Story Builder, Summariser, Smart Notes all deferred to v2+.
2. **Model gating:** CLI auto-picks the best structured-output-capable model available on the device. If none are suitable, warn the user at scaffold time with a specific "install this model" hint. Warn again at runtime if the runtime model doesn't match the preference list.
3. **TTS:** dropped. No Web Speech API. Spell Bee hint is text-only.
4. **Language:** English only. No language selector in any template.
5. **`apps/`:** gitignored. `examples/spell-bee/index.html` is committed. CI re-scaffolds and `git diff --exit-code` against `examples/` to catch template drift.
6. **Sequencing:** dependency-ordered. B lands first (required). Scaffolding design work (this doc) happens in parallel with A/D/E. Scaffolding implementation starts once B is merged.

## Scope (what v1 ships)

**Shipped:**
- `sdk/pocket.js` — complete SDK with `OllamaClient`, `SessionManager`, `EventBus`, and `pickModel()` helper.
- `cli/new.js` + `cli/prompts.js` + `cli/scaffold.js` — Node 18+ built-ins only, zero npm deps.
- `cli/update.js` — re-inlines the current SDK into an already-scaffolded app. Fixes the "inlined SDK is stranded" problem.
- `templates/_base/index.html` + `templates/_base/style.css` — shared layout, CSS variables, mobile-first.
- `templates/kids-game/spell-bee.html` — the one reference template.
- `apps/.gitkeep` + `.gitignore` entry for `apps/*` (except `.gitkeep`).
- `examples/spell-bee/index.html` — committed, CI-drift-checked.
- `.github/workflows/ci.yml` — new `scaffold-drift` job.
- `README.md` — new "Building Apps" section.

**Deferred:**
- Quiz Master, Story Builder templates (kids game category).
- Summariser, Smart Notes templates (productivity category).
- Cross-app shared state or multi-app homescreen.
- Any framework, bundler, npm dependency, or package registry publish.

**Rationale for dropping Summariser from v1:** one template is enough to validate the platform. Spell Bee is the most structurally demanding (5-step JSON loop, age-appropriate content tuning, score persistence) — if the SDK and scaffolder can produce a working Spell Bee, they can produce anything. Shipping a second template just halves our testing attention.

## Repo layout delta

```
ollama-pocket/
├── scripts/              ← unchanged
├── pwa/                  ← will be modified by Plan B, unchanged by this plan
├── docs/                 ← unchanged
├── sdk/                  ← NEW
│   └── pocket.js
├── templates/            ← NEW
│   ├── _base/
│   │   ├── index.html
│   │   └── style.css
│   └── kids-game/
│       └── spell-bee.html
├── cli/                  ← NEW
│   ├── new.js
│   ├── prompts.js
│   ├── scaffold.js
│   ├── update.js
│   └── models.js         ← preference list + capability check
├── apps/                 ← NEW (gitignored except .gitkeep)
│   └── .gitkeep
├── examples/             ← NEW (committed, CI-drift-checked)
│   └── spell-bee/
│       └── index.html
└── .github/workflows/
    └── ci.yml            ← new scaffold-drift job appended
```

**Note:** the requirements doc said `pwa/` should "not be modified". Plan B modifies it. Once Scaffolding lands, the long-term direction is that `pwa/chat.html` gets replaced by a scaffolded "chat" template and `pwa/` becomes the launcher/homepage for installed apps. That migration is explicitly **not** in v1 scope — `pwa/` stays as-is after B lands.

## SDK: `sdk/pocket.js`

Single file, self-contained. **UMD-lite pattern** — works identically in three contexts with zero transformation:

- **Inlined** into a scaffolded `<script>` block (plain script, not `type="module"`)
- **`<script src="pocket.js">`** loaded from disk
- **`require('sdk/pocket.js')`** from Node `node --test` in CI

### Why not ES modules

An inline `<script type="module">` has its own module scope — classes declared at the top level are **not** attached to `window`, so a template's app-script in the same document cannot see `OllamaClient` without an `import`, and inline modules cannot be imported from anywhere. The previous draft of this plan hand-waved "CLI wraps the module body and re-exposes via `window.Pocket`" which would require a brittle source transformation in `scaffold.js` (strip `export` keywords, wrap in an IIFE, detect class/function declarations, re-bind). That transformation is load-bearing, fragile, and one SDK source change away from silently breaking every scaffolded app.

The cleanest fix: write `sdk/pocket.js` as a plain script with UMD-lite bootstrap at the bottom. **No transformation required** in the scaffolder — `cat sdk/pocket.js` straight into the output.

### File shape

```js
// sdk/pocket.js — runs in any JS context, zero transformation needed.
// Exposes the public API as `Pocket` on window (browser) or module.exports (node).
(function (root) {
  'use strict';

  class StructuredChatError extends Error {
    constructor(message, details) {
      super(message);
      this.name = 'StructuredChatError';
      this.details = details;
    }
  }

  class OllamaClient { /* see methods below */ }
  class SessionManager { /* see methods below */ }
  class EventBus { /* see methods below */ }

  const MODEL_PREFERENCES = {
    structured: [
      /^qwen2\.5:(1\.5b|3b|7b|14b|32b|72b)(-.*)?$/,
      /^qwen2\.5-coder:/,
      /^llama3\.[123]:(1b|3b|8b)(-.*)?$/,
      /^phi3(\.5)?:/,
      /^gemma2:2b(-.*)?$/,
    ],
    chat: [ /./ ],
  };

  function pickModel(availableModels, capability) {
    const patterns = MODEL_PREFERENCES[capability || 'chat'] || MODEL_PREFERENCES.chat;
    for (const pattern of patterns) {
      const match = availableModels.find(m => pattern.test(m));
      if (match) return match;
    }
    return null;
  }

  const api = {
    OllamaClient, SessionManager, EventBus,
    MODEL_PREFERENCES, pickModel, StructuredChatError,
    VERSION: '0.2.0',
    MIN_OLLAMA_VERSION: '0.5.0',
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Pocket = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
```

Template JS accesses everything via `window.Pocket.OllamaClient`. Node tests do `const Pocket = require('../pocket.js');`. Same source file. No build step.

### `OllamaClient`

```js
new OllamaClient({ host: 'http://localhost:11434' })
```

Auto-detection order:
1. Explicit `host` argument (takes precedence).
2. `window.OLLAMA_HOST` global.
3. `window.location.origin` if the page is served from `http://<host>:<port>` and `<port>` ≠ 11434 (assume API is on same host, port 11434).
4. Fallback: `http://localhost:11434`.

**Methods:**

```js
async client.ping()
  // GET /api/tags, returns { ok: boolean, models: string[], error?: string }

async client.version()
  // GET /api/version, returns { version: string, compatible: boolean, minimum: '0.5.0' }
  // Result is memoised for the lifetime of the client. Called automatically on
  // first use of structuredChat. If compatible === false, structuredChat emits
  // a one-time console warning and still attempts the call (some older Ollama
  // versions accept `format: <schema>` anyway, it's just unreliable).

async client.models()
  // returns array of installed model names, e.g. ['qwen2.5:1.5b', 'gemma3:1b']
  // throws on network failure

async client.chat(messages, options = {})
  // POST /api/chat with { model, messages, stream: false }
  // returns full response content as a string
  // options: { model, temperature, num_predict, ... }

async client.streamChat(messages, options = {}, onChunk)
  // POST /api/chat with stream: true
  // calls onChunk(token) for each token
  // returns full concatenated response
  // onChunk can return false to abort the stream early

async client.structuredChat(messages, schema, options = {})
  // POST /api/chat with format: schema (Ollama grammar-constrained JSON)
  // parses the response, validates against schema shape (shallow key check only)
  // on parse failure, retries ONCE with a more explicit "return valid JSON only" system message prepended
  // on second failure, throws StructuredChatError with { raw, attempt, schema }
  //
  // Grammar-constrained `format: <schema>` requires Ollama >= 0.5.0. On first
  // call, structuredChat invokes client.version() and emits a console.warn
  // exactly once if the running version is older. The call still proceeds —
  // older Ollama versions silently ignore `format` and return prose, which
  // the parse-retry-throw path handles cleanly.
```

**`structuredChat` contract:** returns a parsed object on success. On failure, the caller (the Spell Bee template) decides whether to retry the whole round or show an error UI. The SDK does not hide failures — one retry, then surface.

**Schema format:** accept Ollama's native JSON schema format (`{ type: "object", properties: { ... }, required: [...] }`). The SDK does not implement its own validator — we rely on Ollama's grammar-constrained sampling to produce valid output, and we only parse. Shallow key check after parse: verify all `required` keys are present as own properties. That's all.

### `SessionManager`

```js
new SessionManager({ key: 'spell-bee', maxTurns: 20 })
```

Backed by `localStorage` under `pocket:<key>:history` and `pocket:<key>:state`. Chat history is capped at `maxTurns` entries (oldest dropped first).

**Methods:**

```js
session.add(role, content)        // appends to history, auto-trims to maxTurns
session.get()                     // returns [{role, content}, ...]
session.clear()                   // wipes both history and state for this key
session.save(extraData)           // persists arbitrary game state (score, level, etc.)
session.load()                    // returns saved state or null
```

`save`/`load` serialize via `JSON.stringify`. `save` is **not** debounced — callers should debounce if they're saving on every keystroke. Spell Bee saves once per round completion, which is fine.

### `EventBus`

Tiny pub/sub, ~30 lines, no dependencies.

```js
const bus = new EventBus()
bus.on('score:update', handler)   // handler(payload)
bus.off('score:update', handler)
bus.emit('score:update', { score: 5 })
bus.once('game:end', handler)
```

Used internally by templates to decouple UI components. Not strictly required for Spell Bee but included because it's trivial and clean.

### `pickModel` + preference list

```js
export const MODEL_PREFERENCES = {
  structured: [
    // Models verified to produce reliable JSON via Ollama's format parameter.
    /^qwen2\.5:(1\.5b|3b|7b|14b|32b|72b)$/,
    /^qwen2\.5-coder:/,
    /^llama3\.[123]:(1b|3b|8b)$/,
    /^phi3(\.5)?:/,
    /^gemma2:2b$/,
  ],
  chat: [
    // Models usable for free-form chat (any reasonable small model).
    /./,
  ],
};

export function pickModel(availableModels, capability = 'chat') {
  const patterns = MODEL_PREFERENCES[capability] || MODEL_PREFERENCES.chat;
  for (const pattern of patterns) {
    const match = availableModels.find(m => pattern.test(m));
    if (match) return match;
  }
  return null;
}
```

**Notable exclusions from `structured`:** `gemma3:1b` and `smollm2:360m`. These models are in the README's recommended list for chat but produce unreliable JSON at that size. If a user has only these installed and scaffolds Spell Bee, they get a warning, not a hard block.

**Why regex patterns, not a flat list:** Ollama tags change. `qwen2.5:1.5b-instruct-q4_K_M` should match `qwen2.5:1.5b`. Regex over the whole list handles this without manual curation.

## Model compatibility at scaffold time

```
User runs: node cli/new.js
  │
  ├─ Prompts for template (spell-bee)
  ├─ Prompts for default model
  │
  ├─ Tries ollama list (via $OLLAMA_HOST env or localhost:11434)
  │   │
  │   ├─ Success: cross-references installed models against MODEL_PREFERENCES.structured
  │   │   │
  │   │   ├─ Match found: sets default = matched model, prints ✓
  │   │   └─ No match:    warns "your installed models (X, Y, Z) are not
  │   │                    reliable for structured output. Spell Bee may
  │   │                    fail mid-round. Install qwen2.5:1.5b with:
  │   │                        ollama pull qwen2.5:1.5b
  │   │                    Scaffold anyway? (y/N)"
  │   │
  │   └─ Failure: skips runtime check, falls through to user-declared default
  │
  └─ User-declared default (fallback when Ollama isn't running)
      │
      ├─ Matches a structured pattern: ✓
      └─ Doesn't match: warns same as above
```

**Runtime re-check:** when the scaffolded app boots, it also calls `client.models()` and compares the selected model against `MODEL_PREFERENCES.structured`. If the model has changed or the selected one isn't installed, it shows a yellow warning banner in the header: "Model X is not ideal for this game. Install qwen2.5:1.5b for best results." The game still boots — warning, not block.

## CLI: `cli/new.js` + friends

Node 18+. `readline/promises`, `fs/promises`, `path`, `os`, `crypto` — no other imports.

### Flow

```
$ node cli/new.js

  ┌─────────────────────────────────────┐
  │  ollama-pocket — new app scaffolder │
  └─────────────────────────────────────┘

  ? App slug (letters, digits, dashes): spell-bee-alpha
  ? Category: (1) kids-game  (2) productivity [1]
  ? Template:  (1) spell-bee [1]
  ? Age group: (1) 4-6  (2) 6-8  (3) 8-12 [2]
  ? Default model:
      detected: qwen2.5:1.5b ✓ (structured output supported)
      override? [Enter to accept]
  ? Ollama host [http://localhost:11434]:
  ? Output directory: apps/spell-bee-alpha [Enter to accept]

  Scaffolding...
    ✓ read templates/_base/index.html
    ✓ read templates/_base/style.css
    ✓ read templates/kids-game/spell-bee.html
    ✓ inlined sdk/pocket.js (12.4 KB)
    ✓ injected app-config block
    ✓ generated manifest.json (per-app, name="Spell Bee")
    ✓ wrote apps/spell-bee-alpha/index.html (47.1 KB)
    ✓ wrote apps/spell-bee-alpha/manifest.json
    ✓ wrote apps/spell-bee-alpha/icon.svg

  Done.
    Serve locally:
      python3 -m http.server 8000 --directory apps/spell-bee-alpha
    Open: http://localhost:8000/
```

### What each CLI file owns

**`cli/new.js`** — entry point. Orchestrates: loads template index, calls prompts, calls scaffold. Nothing else.

**`cli/prompts.js`** — `readline/promises`-based questions. Each prompt is an async function returning a validated value. Simple regex validation (slug: `/^[a-z0-9-]+$/`, URL: basic), re-prompts on invalid input. No arrow-key selection — uses numbered menus ("1/2/3"). Acceptably rough for v1; we have an escape hatch documented in CONTRIBUTING for v2 if users complain.

**`cli/scaffold.js`** — file generation. Reads the base template, reads the specific template, reads `sdk/pocket.js`, substitutes `<!-- SDK_INLINE -->` / `<!-- APP_CONFIG -->` / `<!-- APP_NAME -->` / `<!-- STYLE_INLINE -->` markers, writes the output. Idempotent: if the output directory already exists, prompts before overwriting.

**`cli/update.js`** — re-inlines SDK into an existing scaffolded app, preserving the app-config block. Usage: `node cli/update.js apps/spell-bee-alpha`. Reads the existing `index.html`, extracts the `<script type="application/json" id="app-config">` block verbatim, regenerates everything else from the current templates, writes back. This is the escape hatch for SDK bug fixes propagating to already-scaffolded apps.

**`cli/models.js`** — helper module imported by `new.js`. Exports `detectInstalledModels(host)` (calls `/api/tags`) and re-exports `MODEL_PREFERENCES` + `pickModel` from `sdk/pocket.js` so the CLI uses the exact same preference list as the runtime.

### Template substitution

Templates use HTML comments as markers. Example `templates/_base/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><!-- APP_NAME --></title>
  <link rel="manifest" href="manifest.json" />
  <link rel="icon" href="icon.svg" type="image/svg+xml" />
  <style><!-- STYLE_INLINE --></style>
  <script type="application/json" id="app-config"><!-- APP_CONFIG --></script>
  <script><!-- SDK_INLINE --></script>
</head>
<body>
  <header>
    <span id="app-title"><!-- APP_NAME --></span>
    <span id="model-badge"></span>
    <span id="connection-status"></span>
  </header>
  <main id="app-root"><!-- APP_BODY --></main>
  <script><!-- APP_SCRIPT --></script>
  <script>
    // Register a per-app service worker if one is shipped alongside.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  </script>
</body>
</html>
```

**Note the non-module `<script>` tags** for both `SDK_INLINE` and `APP_SCRIPT`. Everything the template's app-script needs is on `window.Pocket` — no `import` needed, no module scope trap.

**Per-template files** provide `APP_BODY` (the template's HTML) and `APP_SCRIPT` (the template's JS, which references `window.Pocket.OllamaClient` etc.). `SDK_INLINE`, `STYLE_INLINE`, `APP_CONFIG`, `APP_NAME` are injected by `scaffold.js`.

**Security — `</script>` injection in `APP_CONFIG`:** a naive `JSON.stringify` does **not** escape `<`, `>`, or `&`. A config value like `systemPrompt: "write </script><script>alert(1)</script>"` would break out of the `<script type="application/json">` block because the HTML parser recognises the literal `</script>` tag regardless of the script element's `type` attribute. **Mitigation:** `scaffold.js` runs a post-stringify pass:

```js
function safeJSONForHTMLScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')   // LINE SEPARATOR
    .replace(/\u2029/g, '\\u2029');  // PARAGRAPH SEPARATOR
}
```

Applied to `APP_CONFIG` and nowhere else. All other substitutions (`SDK_INLINE`, `STYLE_INLINE`, `APP_BODY`, `APP_SCRIPT`) come from files committed to the repo and are trusted. `APP_NAME` is also validated at the prompt step (`/^[a-zA-Z0-9 \-]+$/`), so no HTML-unsafe characters can reach the output.

**SDK inlining:** literal file read + string substitute. `fs.readFile('sdk/pocket.js') → insert at <!-- SDK_INLINE -->`. No source transformation. The UMD-lite pattern means the inlined SDK runs as a regular script, self-registers `window.Pocket`, and is immediately usable by the app-script that follows.

### Per-app manifest

Each scaffolded app gets its own `manifest.json`, not a shared one. The CLI generates:

```json
{
  "name": "Spell Bee (spell-bee-alpha)",
  "short_name": "SpellBee",
  "description": "Spelling practice for kids, powered by local AI",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#0f0f0f",
  "theme_color": "#0f0f0f",
  "orientation": "portrait",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

**This is a correction to the requirements doc**, which said apps should point at the parent `pwa/manifest.json`. That would make every scaffolded app install as "OLLAMA_LOCAL" on the home screen with the wrong `start_url`. Each app needs its own.

## Spell Bee template

### Game loop (no TTS)

```
┌────────────────────────────────────────────────────────────┐
│  STATE: idle                                               │
│    ↓ tap "Start"                                           │
│                                                            │
│  STATE: fetching_word                                      │
│    ↓ client.structuredChat(prompt, wordSchema)             │
│    ↓ receives { word, hint, difficulty }                   │
│                                                            │
│  STATE: awaiting_attempt                                   │
│    ├─ shows hint as large text (no audio)                  │
│    ├─ shows difficulty badge                               │
│    ├─ text input with child's attempt                      │
│    └─ submit button                                        │
│    ↓ child submits                                         │
│                                                            │
│  STATE: judging                                            │
│    ↓ client.structuredChat(judgmentPrompt, judgmentSchema) │
│    ↓ receives { correct, feedback, score_delta }           │
│                                                            │
│  STATE: showing_feedback                                   │
│    ├─ feedback text with emoji                             │
│    ├─ updates score + saves to SessionManager              │
│    └─ "Next word" button                                   │
│    ↓                                                       │
│  STATE: idle                                               │
└────────────────────────────────────────────────────────────┘
```

### System prompt (injected by CLI based on age group)

```
You are SpellBot, a friendly spelling teacher for children aged {ageGroup}.
Choose words appropriate for this age group. Always respond with valid JSON
only. No prose, no markdown, no code fences. Be encouraging. Never use
discouraging language. Keep hints descriptive: a child who cannot hear the
word must be able to guess it from your description alone. Example good hint
for "elephant": "a very large grey animal with a long trunk that lives in
Africa and India". Example bad hint: "it starts with E".
```

The "no audio" constraint bumps hint quality requirements up. The prompt explicitly tells the model to write audio-independent hints.

### Schemas

**Word request schema:**

```json
{
  "type": "object",
  "properties": {
    "word":       { "type": "string" },
    "hint":       { "type": "string" },
    "difficulty": { "type": "string", "enum": ["easy", "medium", "hard"] }
  },
  "required": ["word", "hint", "difficulty"]
}
```

**Judgment schema:**

```json
{
  "type": "object",
  "properties": {
    "correct":     { "type": "boolean" },
    "feedback":    { "type": "string" },
    "score_delta": { "type": "integer" }
  },
  "required": ["correct", "feedback", "score_delta"]
}
```

### Failure handling

| Failure | UX |
|---------|----|
| `structuredChat` fails both tries on word fetch | "Having trouble getting a word. Tap Retry." — button re-runs the fetch. |
| `structuredChat` fails both tries on judgment | Fall back to local string compare: `attempt.toLowerCase() === word.toLowerCase()`. Show a generic feedback message ("Nice try! The word was X."). Game continues. |
| Ollama unreachable on boot | Red header banner, "Offline" state, Start button disabled, retry button. |
| Model changed since scaffold, no longer in `structured` list | Yellow header banner, game still plays, warns user to switch models for reliable behavior. |
| `localStorage` unavailable (incognito) | Session features silently no-op, game still plays round-by-round. |

The judgment fallback is deliberate: a child shouldn't experience a game-breaking error because the 1.5B model hiccuped on one JSON parse. Local string compare is a good-enough last resort for a spelling game.

## `examples/` + CI drift check

**Why:** the inlined SDK goes stale the moment `sdk/pocket.js` changes. `examples/spell-bee/` is a committed canary — CI regenerates it from the current templates and fails if the result differs from what's checked in. Forces every SDK edit to be accompanied by a re-scaffold.

**What gets committed to `examples/spell-bee/`:** the **full scaffold output** — `index.html`, `manifest.json`, `icon.svg`, and `sw.js`. Not just `index.html`. The scaffolder writes all four; the drift check must compare all four. Committing only `index.html` would miss drift in the per-app manifest, icon, or service worker.

**How:**

```yaml
# .github/workflows/ci.yml — new jobs
  sdk-tests:
    name: SDK unit tests
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - name: Run SDK tests
        run: node --test sdk/test/

  scaffold-drift:
    name: Scaffold drift check
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - name: Re-scaffold reference example
        run: |
          rm -rf examples/spell-bee
          node cli/new.js \
            --non-interactive \
            --slug spell-bee \
            --template kids-game/spell-bee \
            --age-group 6-8 \
            --model qwen2.5:1.5b \
            --host http://localhost:11434 \
            --output examples/spell-bee \
            --skip-detection
      - name: Check for drift
        run: git diff --exit-code examples/
```

**Node 18 matrix entry is intentional.** The plan specifies Node 18+ as the minimum; CI runs on both 18 and 20 so any accidental use of a Node 20+ only API (or readline API shape drift) fails loudly before release. The `--skip-detection` flag tells the CLI not to try calling `/api/tags` (no Ollama in CI) — it trusts the `--model` argument.

The CLI gains a `--non-interactive` mode with all flags on the command line. Zero prompts, deterministic output. If any SDK or template change causes `examples/spell-bee/index.html` to differ from the committed version, CI fails and the contributor must re-run the scaffold and commit the result.

**`.gitignore` addition:**

```
# scaffolded apps — generated output, not source
apps/*
!apps/.gitkeep
```

## Test plan

### SDK unit tests (Node)

New directory: `sdk/test/`. Uses `node --test` (Node 18+ built-in, no deps).

```
sdk/test/
├── client.test.js       — OllamaClient against a stubbed fetch
├── session.test.js      — SessionManager against a stubbed localStorage
├── bus.test.js          — EventBus on/off/emit/once
└── pickmodel.test.js    — pickModel over fixtures
```

**`client.test.js` coverage:**
- ★★★ `ping()` success, network failure, 500 response
- ★★★ `models()` parses `/api/tags` response, empty list, missing `models` key
- ★★★ `chat()` non-streaming, happy path + network failure
- ★★★ `streamChat()` emits chunks in order, handles mid-stream abort via `onChunk → false`, handles malformed JSON lines in the stream
- ★★★ `structuredChat()` happy path, first-attempt parse failure → retries, second-attempt failure → throws `StructuredChatError`
- ★★★ host auto-detection: explicit, `window.OLLAMA_HOST`, `window.location.origin`, fallback

**`session.test.js` coverage:**
- ★★★ `add`/`get` round-trip, `maxTurns` trimming drops oldest first
- ★★★ `save`/`load` with arbitrary object
- ★★★ `clear` wipes both history and state
- ★★ localStorage unavailable → silent no-op (stubbed via `delete globalThis.localStorage`)

**`bus.test.js` coverage:**
- ★★★ `on`/`emit` basic
- ★★★ `off` removes the handler, subsequent `emit` doesn't call it
- ★★★ `once` called exactly once
- ★★ multiple handlers for the same event, emit order preserved

**`pickmodel.test.js` coverage:**
- ★★★ `qwen2.5:1.5b` picked over `gemma3:1b` for `structured`
- ★★★ `qwen2.5:1.5b-instruct-q4_K_M` matches the `qwen2.5:1.5b` pattern
- ★★★ all-bad list for `structured` returns null
- ★★★ empty list returns null
- ★★ `chat` capability accepts anything

**CI job:** `node --test sdk/test/` in a new `sdk-tests` job in `.github/workflows/ci.yml`.

### CLI integration test

```
cli/test/
└── scaffold.test.js     — runs new.js --non-interactive, asserts the output matches examples/
```

Covers: CLI runs without Ollama reachable (with `--skip-detection` flag for test envs), produces deterministic output, `update.js` regenerates an existing app without losing the config block.

### Spell Bee template test

No automated test for the template's UX in v1 — that requires a browser harness (Playwright), which is F's scope. Manual test matrix:

1. Scaffold `apps/spell-bee-test` against a real `qwen2.5:1.5b`, play 5 rounds, verify score persists across reload.
2. Scaffold against `gemma3:1b`, verify the yellow warning banner shows.
3. Disconnect Ollama mid-game, verify the error state and retry button work.
4. Clear `localStorage`, reload, verify fresh start.
5. Enter a deliberately wrong spelling, verify the model's judgment feedback is kind and encouraging (sanity check on system prompt).
6. Enter the correct spelling, verify `score_delta > 0` and score updates.
7. Force a `structuredChat` failure (disconnect network mid-request), verify the fallback string-compare judgment path triggers.

### Drift CI test

- Merge a test PR that edits `sdk/pocket.js` without re-scaffolding `examples/`. CI should fail with a clear `git diff` output.
- Re-run `node cli/new.js --non-interactive ...` locally, commit, CI passes.

## Failure modes

| Codepath | Failure | Detected? | Handled? | User-visible |
|----------|---------|-----------|----------|--------------|
| CLI template read | template file missing / renamed | yes — ENOENT | clean error message with suggested fix | "Template kids-game/spell-bee not found in templates/" |
| CLI SDK inline | `sdk/pocket.js` missing | yes — ENOENT | error + exit 1 | "sdk/pocket.js not found — repo is broken" |
| CLI model detect | Ollama not running at scaffold time | yes — fetch error | skips detection, falls back to user-declared model | "Could not reach Ollama — using your declared default. Will re-check at runtime." |
| CLI output conflict | `apps/<slug>/` already exists | yes — `fs.stat` | prompts user to overwrite | "apps/spell-bee-alpha exists. Overwrite? (y/N)" |
| Runtime `pickModel` returns null | user has only `smollm2:360m` installed | yes — runtime check on boot | yellow banner, game still plays but likely fails structured output | "Your installed models may not work for this game — try qwen2.5:1.5b" |
| Runtime `structuredChat` fails | 1.5B model returns malformed JSON | yes — retry once, then throw | for word: retry button; for judgment: local fallback | "Having trouble — tap Retry" / fallback judgment |
| Runtime `localStorage` unavailable | incognito mode | yes — try/catch on first access | SessionManager silently no-ops | score resets per-round |
| Scaffold drift CI | contributor edits SDK without re-scaffolding | yes — `git diff --exit-code` | CI fails on PR | red check, contributor re-runs scaffold |
| CLI config injection via `systemPrompt` / `appName` | contains literal `</script>` | yes — `safeJSONForHTMLScript` post-stringify pass | `<`/`>`/`&` escaped to `\u003c`/`\u003e`/`\u0026` | safe |
| CLI `appName` raw substitution into `<title>`/`<header>` | contains HTML metacharacters | yes — prompt validator regex `/^[a-zA-Z0-9 \-]+$/` | re-prompts on invalid input | safe |
| Ollama version too old for `format: <schema>` | user has Ollama < 0.5.0 | yes — `client.version()` memoised check | one-time console.warn, call still proceeds, parse-retry-throw handles the prose response | "Structured output requires Ollama ≥ 0.5.0" warning in console |

**One critical gap I'm flagging:** if `structuredChat` second-attempt failure happens **during word fetch** (not judgment), the fallback is "retry button" — there's no local fallback for generating a word. A child on a bad model could hit retry forever. Mitigation: after 3 consecutive word-fetch failures, show a "This model seems to be struggling with Spell Bee. Install qwen2.5:1.5b for a smoother experience" banner with an explicit `ollama pull` command. Not a silent failure.

## NOT in scope

- Quiz Master, Story Builder, Summariser, Smart Notes templates — deferred to v2+.
- Text-to-speech of any kind — dropped.
- Language selector (Tamil, Hindi, etc.) — dropped.
- Chat export as a shared SDK feature — can live inside any specific template that wants it.
- Cross-app homescreen or launcher.
- Multi-file apps (each scaffolded app is one `index.html` + `manifest.json` + `icon.svg`).
- Authentication, cloud sync, iOS support — all out of scope per requirements doc.
- Arrow-key selection in CLI — stick with numbered menus. Documented escape hatch in CONTRIBUTING for a v2 revisit.
- Playwright or browser-level template tests — that's F.
- Publishing the CLI to npm — zero deps, shipped in-repo, not a standalone package.

## What already exists

- `pwa/manifest.json` — referenced as a *corrected example* in this plan (per-app manifests replace the broken "point everything at parent" approach).
- `pwa/chat.html` streaming logic — source of truth for how to consume Ollama's streaming response format. The SDK's `streamChat` port follows the same structure. **This is the one piece of existing code we directly reuse** (as reference, not as a dependency).
- `scripts/start-ollama.sh` after Plan B lands — teaches us how to serve static HTML over HTTP on Termux. Scaffolded apps reuse the exact same `python3 -m http.server` pattern for local serving. Documented in the CLI's "next steps" output after scaffold.
- `README.md` structure — "Building Apps" section added alongside existing "What's Included" / "Model Recommendations" sections, not replacing them.

## Acceptance criteria

- [ ] `node cli/new.js` runs on Node 18+ without any `npm install`.
- [ ] `node cli/new.js --non-interactive --slug test --template kids-game/spell-bee --age-group 6-8 --model qwen2.5:1.5b --host http://localhost:11434 --output apps/test` produces a working `apps/test/index.html` in < 2 seconds.
- [ ] Scaffolded `apps/spell-bee-test/index.html` opens in Chrome (served via `python3 -m http.server`) and plays a full round end-to-end against a live `qwen2.5:1.5b`.
- [ ] Scaffolded app registers its service worker (reusing `pwa/sw.js` pattern — actually, templates ship their own SW; see note below).
- [ ] `client.structuredChat()` retries exactly once on parse failure before surfacing error.
- [ ] `pickModel(['gemma3:1b', 'smollm2:360m'], 'structured')` returns `null`.
- [ ] `pickModel(['qwen2.5:1.5b-instruct-q4_K_M'], 'structured')` returns `'qwen2.5:1.5b-instruct-q4_K_M'`.
- [ ] Running the CLI twice with the same slug prompts before overwriting.
- [ ] `node cli/update.js apps/test` regenerates the SDK inline without losing `app-config`.
- [ ] Chrome DevTools mobile emulation at 375px width shows no horizontal scroll on spell-bee.
- [ ] Tap targets meet the 48px minimum.
- [ ] ARIA labels on all interactive elements (start, submit, next word, retry).
- [ ] `node --test sdk/test/` passes in CI.
- [ ] `scaffold-drift` CI job passes against committed `examples/spell-bee/`.
- [ ] `shellcheck --severity=error scripts/*.sh` still passes (unchanged from B).
- [ ] `README.md` has a "Building Apps" section linking to `cli/new.js` and `templates/`.
- [ ] `CONTRIBUTING.md` has a section documenting the `examples/` drift check and how to add a new template.

**Note on scaffolded SW:** each scaffolded app needs its own service worker to be installable as a PWA. This is a per-app concern. The `_base` template includes an inline SW registration script and the scaffolder writes a small `sw.js` stub alongside `index.html`. Adds ~30 lines to the scaffolder output. Without this, "Add to Home Screen" won't work on scaffolded apps — breaking the PWA promise. **This is a missing requirement in the original doc** and is now captured here.

## Parallelization

Two lanes once the SDK API is agreed:

```
Lane A (SDK): sdk/pocket.js + sdk/test/ + CI sdk-tests job
Lane B (CLI): cli/*.js + examples/ + CI scaffold-drift job
     └─ depends on Lane A SDK API being frozen (interface lock, not implementation)

Lane C (Template): templates/_base/ + templates/kids-game/spell-bee.html
     └─ depends on SDK API frozen + _base layout agreed
     └─ depends on CLI to actually scaffold a testable output

Execution order:
  Week 2: Lane A in parallel with Lane B's CLI skeleton
  Week 3: Lane C builds against the now-complete SDK and CLI
          Lane B finishes scaffold-drift CI
```

Lane A and Lane B can be two separate PRs. Lane C is a third PR that depends on both. Each PR is independently reviewable and mergeable. Lane B's skeleton can land with a placeholder template (just `_base` shell) before Lane C's real Spell Bee template arrives.

## Implementation sequence (dependency-ordered, matches B-first policy)

```
PR 1: Plan B — fix PWA install path                  [prerequisite]
        ↓
PR 2: SDK + SDK tests                                [Lane A]
PR 3: Plan A — vendor-agnostic debloat               [independent, any time after B]
PR 4: Plan D — one-liner install                     [independent, any time after B]
        ↓
PR 5: CLI skeleton + non-interactive mode            [Lane B, depends on SDK API]
PR 6: _base template + CLI integration               [Lane B, depends on PR 5]
        ↓
PR 7: Spell Bee template + examples/ commit          [Lane C, depends on PR 6]
PR 8: scaffold-drift CI job                          [Lane C tail, depends on PR 7]
        ↓
PR 9: README "Building Apps" section                 [docs, any time after PR 8]
PR 10: Plan E — benchmark harness                    [independent, any time]
```

Minimum viable v1 = PR 1-2-5-6-7-8-9. That's **seven PRs** on the critical path. A/D/E are three more that can interleave. Total: 10 PRs, ~3 weeks at a sensible cadence.

## Open risks to watch

1. **Ollama grammar-constrained JSON mode maturity:** the `format: <schema>` parameter shipped in Ollama v0.5+ but has known quirks with small models. If `qwen2.5:1.5b` produces unusable output despite the schema, we fall back to `format: "json"` (simple JSON mode) and parse. Need to benchmark this on a real device during PR 2.

2. **Node 18 readline:** `readline/promises` shipped in Node 18 but the API evolved in 20 and 21. Pin to Node 18 behavior (`rl.question` returns a promise). Test in CI with `node-version: '18'` matrix, not just `'20'`.

3. **The SDK becomes a dependency magnet:** it's tempting to add helpers for every template we might build. Resist. v1 SDK ships what Spell Bee actually needs and nothing else. A second template in v2 is a forcing function for honest reuse — if `pocket.js` can serve both without modification, the SDK is done; if it can't, we learn what was missing.

4. **Template authoring ergonomics:** writing a new template means editing a file with HTML markers and knowing which variables are available. Documentation is the only defense. `CONTRIBUTING.md` gets a "Creating a template" section with the full marker list and a worked example.

5. **Kids game content safety:** even a small local model can occasionally produce inappropriate content. The system prompt tells the model to be kid-appropriate, but there's no safety filter. For v1, we accept this risk and document it: "Spell Bee is powered by a local LLM. Output is not filtered. Adult supervision recommended for young children." Real content-safety filtering is a v2+ consideration.

## Positioning — keep the platform quiet until v0.3.0

The project's current identity is a 4-script install kit that turns an old phone into an AI server. v0.2.0 adds a scaffolding system but only ships **one** reference template (Spell Bee). Announcing "ollama-pocket is now an app platform!" on the strength of a single kids game reads as half-finished.

**Rule for v0.2.0:** the README's top-level story does **not** change.

- The opening line ("Run a free, private AI on your old Android phone") stays.
- "Quick Start" and "How It Works" sections are unchanged (modulo B's one-liner install fix).
- A new **"Building Apps"** section is added below "Model Recommendations" (i.e., as a subsection, not above the fold). It links to `cli/new.js` and `examples/spell-bee/`, explains the one-template limitation honestly, and invites template contributions.
- The release announcement (GitHub Releases notes, CHANGELOG) mentions the scaffolding system factually but doesn't lead with it.

**v0.3.0** is when the top-level story gets rewritten. v0.3.0 ships at least two additional templates (Summariser + one more kids game). At that point the platform has a real surface area and the headline "local AI apps you can scaffold in seconds" is earned.

This is the "land infrastructure quietly, announce loudly later" pattern. The opposite failure — loud announcement, thin substance — damages trust permanently and is much harder to recover from than waiting a release cycle.

## Rollout

Ten PRs, spread over three weeks, rebase-merge per repo policy. Changelog gets a single `## [0.2.0] - <date>` section when PR 9 lands, rolling up all the B/A/D/E/Scaffolding work into one minor version bump. CHANGELOG entry draft (to be filled in at the end):

```
## [0.2.0] - 2026-04-??

### Added
- Scaffolding system: `cli/new.js` generates self-contained AI apps from
  templates. Zero build tools, zero dependencies. First template:
  Spelling Bee for kids aged 4-12.
- `sdk/pocket.js`: shared SDK for Ollama communication, session management,
  and structured output with retries.
- Plan B: PWA now served over HTTP with real offline support.
- Plan A: vendor-agnostic debloat with manifests per manufacturer.
- Plan D: one-liner Termux install.
- Plan E: benchmark harness for phone-to-phone perf comparison.

### Changed
- `pwa/chat.html` remains the built-in chat UI; scaffolded apps live in
  `apps/` (gitignored) with reference examples in `examples/`.
```
