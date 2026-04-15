# olladroid: App Scaffolding System

## Overview

Extend the existing `olladroid` repo with a CLI-based scaffolding system that lets anyone generate fully self-contained, offline-capable web apps powered by a local Ollama instance running on Android. Apps must require zero build tools, zero dependencies, and work directly from the Android filesystem or over WiFi.

---

## Goals

- A `cli/new.js` script that interactively scaffolds new apps into an `apps/` directory
- A shared `sdk/olladroid.js` that all apps import for Ollama communication, streaming, session management, and structured output
- Template categories for **Kids Games** and **Productivity Tools**
- All output is a single self-contained `index.html` per app (SDK inlined at scaffold time)
- Open source — each template must be readable, forkable, and easy to customise

---

## Repo Structure

Extend the existing repo to match this layout:

```
olladroid/
├── scripts/                  ← existing, do not modify
├── pwa/                      ← existing, do not modify
│
├── sdk/
│   └── olladroid.js             ← shared SDK (source, not inlined yet)
│
├── templates/
│   ├── _base/
│   │   ├── index.html        ← base HTML shell all apps use
│   │   └── style.css         ← mobile-first base styles
│   ├── kids-game/
│   │   ├── spell-bee.html    ← Spelling Bee game template
│   │   ├── quiz-master.html  ← Quiz game template
│   │   └── story-builder.html← Collaborative story template
│   └── productivity/
│       ├── summariser.html   ← Text summariser template
│       └── notes.html        ← Smart notes template
│
├── apps/                     ← scaffolded apps land here (gitignored or committed)
│   └── .gitkeep
│
└── cli/
    ├── new.js                ← main CLI entrypoint
    ├── prompts.js            ← interactive question flow
    └── scaffold.js           ← file generation and variable injection
```

---

## SDK: `sdk/olladroid.js`

A vanilla ES module (no bundler required). Must export the following:

### `OllamaClient`

```js
const client = new OllamaClient({ host: 'http://localhost:11434' })
// Auto-detect: tries localhost first, falls back to reading window.OLLAMA_HOST
```

Methods:
- `client.models()` → returns array of installed model names
- `client.chat(messages, options)` → single-turn, returns full response string
- `client.streamChat(messages, options, onChunk)` → streams tokens, calls `onChunk(token)` per chunk
- `client.structuredChat(messages, schema, options)` → forces JSON output matching `schema`, returns parsed object safely

### `SessionManager`

```js
const session = new SessionManager({ key: 'spell-bee', maxTurns: 20 })
```

Methods:
- `session.add(role, content)` → appends to history
- `session.get()` → returns full message array for Ollama
- `session.clear()` → resets localStorage key
- `session.save(extraData)` → persists arbitrary game state (score, level, etc.)
- `session.load()` → retrieves saved state

### `EventBus`

```js
const bus = new EventBus()
bus.on('score:update', handler)
bus.emit('score:update', { score: 5 })
```

Simple pub/sub. No dependencies.

---

## CLI: `cli/new.js`

### Usage

```bash
node cli/new.js
```

### Interactive Prompt Flow

```
? App name (slug, e.g. spell-bee): 
? Category: Kids Game / Productivity Tool
? Template:
    [Kids Game]     → Spelling Bee / Quiz Master / Story Builder
    [Productivity]  → Summariser / Smart Notes
? Default model: qwen2.5:1.5b / gemma3:1b / smollm2:360m / (enter custom)
? Ollama host: localhost (default) / enter IP
? [Kids Game only] Target age group: 4–6 / 6–8 / 8–12
? Output directory: apps/<app-name>/ (confirm)
```

### What the CLI Does

1. Reads the chosen template from `templates/`
2. Reads `sdk/olladroid.js` and inlines it into a `<script>` block in the output HTML
3. Injects all config values into a `<script type="application/json" id="app-config">` block at the top of the file
4. Writes a single `apps/<app-name>/index.html`
5. Prints a success message with the local access URL

### Config Block Format (injected into every app)

```html
<script type="application/json" id="app-config">
{
  "appName": "Spell Bee",
  "model": "qwen2.5:1.5b",
  "ollamaHost": "http://localhost:11434",
  "category": "kids-game",
  "template": "spell-bee",
  "ageGroup": "6-8",
  "systemPrompt": "...",
  "outputSchema": {}
}
</script>
```

App JS reads this block on init — no hardcoded config anywhere else in the file.

---

## Templates

### Shared Requirements (all templates)

- Mobile-first layout, large tap targets (min 48px)
- CSS variables from `_base/style.css` for colours and typography
- Reads config from `#app-config` on load
- Initialises `OllamaClient` and `SessionManager` from inlined SDK
- Shows a connection status indicator (green dot = Ollama reachable)
- Shows the active model name in the header
- Graceful error state if Ollama is unreachable

---

### Kids Game Templates

#### Spelling Bee (`spell-bee.html`)

**Game loop:**
1. App sends system prompt to Ollama requesting a word appropriate for the configured age group
2. Ollama returns `{ "word": "elephant", "hint": "a large grey animal with a trunk", "difficulty": "medium" }` 
3. UI displays the hint (not the word), text-to-speech reads it aloud via Web Speech API
4. Child types their spelling attempt and submits
5. App sends attempt to Ollama for judgement: `{ "attempt": "elefant", "correct_word": "elephant" }`
6. Ollama returns `{ "correct": false, "feedback": "Almost! You missed the 'ph' — elephant uses 'ph' for the 'f' sound.", "score_delta": 0 }`
7. UI shows feedback with emoji reinforcement, updates score
8. "Next Word" button starts a new round

**State stored in SessionManager:**
- `score`, `totalAttempted`, `currentWord`, `difficulty`

**System prompt template (injected by CLI based on age group):**
```
You are SpellBot, a friendly spelling teacher for children aged {ageGroup}.
Always respond with valid JSON only — no prose, no markdown.
Choose words appropriate for the age group.
Be encouraging, never discouraging. Use simple, positive language.
```

---

#### Quiz Master (`quiz-master.html`)

**Game loop:**
1. Player selects a topic (Animals / Space / India / Nature — rendered as tap buttons)
2. Ollama generates: `{ "question": "...", "options": ["A","B","C","D"], "correct": "B", "explanation": "..." }`
3. UI renders 4 option buttons
4. On selection: reveal correct answer + explanation, update score
5. After 5 questions: show summary screen with score and a fun message from Ollama

**Difficulty:** increases automatically after 3 consecutive correct answers (prompt includes `difficulty: easy/medium/hard`)

---

#### Story Builder (`story-builder.html`)

**Game loop:**
1. Child picks a story starter (e.g. "A dragon who was afraid of fire…")
2. Child writes one sentence to continue the story
3. Ollama adds the next sentence, keeping it age-appropriate and coherent
4. Alternates until child taps "The End"
5. Full story displayed with a "Read Aloud" button (Web Speech API)
6. "Save Story" downloads as a `.txt` file

---

### Productivity Templates

#### Summariser (`summariser.html`)

**Flow:**
1. Large `<textarea>` for pasting text (articles, notes, emails)
2. Length selector: "3 bullets / 1 paragraph / Key points only"
3. Language selector: English / Tamil / Hindi (prompt-driven, not translation API)
4. Submit → streams summary back token by token into output area
5. Copy button on output

**System prompt:** instructs Ollama to summarise strictly from the provided text, no hallucination.

---

#### Smart Notes (`notes.html`)

**Flow:**
1. Write a note in a textarea
2. "Enhance" button → Ollama cleans up grammar, improves clarity, keeps meaning
3. "Extract Tasks" button → Ollama returns `{ "tasks": ["...", "..."] }` as a checklist
4. "Ask about this note" → inline chat panel that uses the note as context
5. All notes saved to `localStorage`, listed in a sidebar

---

## Base Layout (`templates/_base/`)

### `index.html` shell

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><!-- APP_NAME --></title>
  <link rel="stylesheet" href="style.css" />
  <!-- SDK inlined here by CLI -->
</head>
<body>
  <header>
    <span id="app-title"><!-- APP_NAME --></span>
    <span id="model-badge"></span>
    <span id="connection-status"></span>
  </header>
  <main id="app-root"></main>
  <script>
    /* App logic here */
  </script>
</body>
</html>
```

### `style.css` variables

```css
:root {
  --color-bg: #0f0f0f;
  --color-surface: #1a1a1a;
  --color-primary: #7c6af7;
  --color-accent: #f7c26a;
  --color-success: #4caf7d;
  --color-error: #f76a6a;
  --color-text: #f0f0f0;
  --color-muted: #888;
  --radius: 12px;
  --font-body: 'Segoe UI', system-ui, sans-serif;
  --font-size-base: 16px;
  --font-size-lg: 20px;
  --font-size-xl: 28px;
  --tap-target: 48px;
}
```

Dark mode default (phones often at low brightness). Light mode via `prefers-color-scheme` override.

---

## Non-Functional Requirements

| Requirement | Detail |
|---|---|
| Zero build step | All output runs directly in Chrome on Android, no npm run build |
| Zero external dependencies | No CDN calls, no external fonts — fully offline |
| Single file output | Each app is one `index.html`, SDK inlined |
| Node.js only for CLI | `cli/` uses only Node built-ins (`fs`, `path`, `readline`) — no npm install needed |
| Works on Android Chrome 90+ | No bleeding-edge APIs without fallback |
| PWA-ready | Each app gets a `<link rel="manifest">` pointing to the parent `pwa/manifest.json` |
| Accessible | ARIA labels on all interactive elements, keyboard navigable |

---

## Acceptance Criteria

- [ ] `node cli/new.js` runs without npm install on Node 18+
- [ ] Scaffolded `apps/spell-bee/index.html` opens in Chrome and plays a full game round without errors
- [ ] Scaffolded `apps/summariser/index.html` summarises a pasted paragraph end-to-end
- [ ] SDK `structuredChat()` retries once if JSON parsing fails before surfacing error
- [ ] All templates pass Chrome DevTools mobile emulation (375px width) without horizontal scroll
- [ ] `README.md` updated with a "Building Apps" section linking to this structure

---

## Out of Scope (for this iteration)

- React / any framework
- npm package / publishing to registry
- Multi-file apps
- Authentication
- Cloud sync
- iOS support (Android Termux focus only)
