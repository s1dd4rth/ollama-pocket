---
layout: default
title: "Building AI mini-apps with olladroid"
description: "A step-by-step guide to scaffolding, customizing, and deploying private AI apps that run entirely on your Android phone."
---

# Building AI mini-apps with olladroid

*A practical guide to scaffolding structured-JSON-powered apps that run on a phone you already own.*

---

## The chatbot trap

Most "run AI locally" projects end the same way: you get a chat interface, type a few prompts, and then... what? The novelty wears off. A local chatbot on a phone is cool for a demo but useless for daily life.

**The real opportunity is structured output.** A 1.5B parameter model can't write a novel, but it *can* reliably return `{"word": "elephant", "hint": "a large grey animal with a trunk", "difficulty": "easy"}` when you ask it to. That's not a chatbot — that's a reasoning engine with a schema contract. And a schema contract means you can build a real app around it.

olladroid exists to make that easy. You describe what you want the model to return (a JSON schema), the SDK's `structuredChat()` forces Ollama to comply via grammar-constrained generation, and your app renders the result. One HTML file, one schema, one model, one phone. No cloud.

---

## What you'll build

By the end of this guide you'll have:

1. **A running olladroid install** on your Android phone
2. **A scaffolded mini-app** (Spell Bee or Summariser) running as an installable PWA
3. **An understanding of how the SDK works** — `structuredChat`, schemas, `SessionManager`
4. **Enough knowledge to write your own template** (~200 lines of HTML + JS)

**Time required:** ~20 minutes (assuming olladroid is already installed).

---

## Prerequisites

You need olladroid installed and a model pulled. If you haven't done that yet, run these in Termux:

```bash
# Install everything (one command)
curl -fsSL https://s1dd4rth.github.io/olladroid/install.sh | bash

# Pull a model
proot-distro login debian -- ollama pull qwen2.5:1.5b

# Start the server
bash ~/olladroid/scripts/start-ollama.sh --wifi --chat
```

Verify `olladroid` is on your PATH:

```bash
olladroid --version
# olladroid v0.3.2
```

---

## Step 1: Scaffold your first app

The scaffolder walks you through every option interactively:

```bash
cd ~/olladroid
olladroid new
```

You'll be asked:

| Prompt | What to enter | Why |
|---|---|---|
| **App slug** | `my-speller` | URL-safe name, used as the directory |
| **App name** | `My Speller` | Human-facing name in the header |
| **Category** | `kids-game` | Determines which templates are available |
| **Template** | `spell-bee` | The game logic + UI you're scaffolding from |
| **Age group** | `6-8` | Tunes the system prompt for word difficulty |
| **Model** | `qwen2.5:1.5b` | Which Ollama model the app talks to |
| **Host** | `http://localhost:11434` | Where Ollama is listening |
| **Output** | `pwa/apps/my-speller` | Where the files land (default works) |

The scaffolder writes 7 files and registers the app in the launcher:

```
scaffolding my-speller → pwa/apps/my-speller
  reading templates/_base/index.html
  reading templates/_base/style.css
  reading templates/kids-game/spell-bee/
  reading sdk/olladroid.js
  composing index.html
  generating manifest.json, icon.svg, sw.js
  copied 3 font file(s) to fonts/
  ✓ registered in pwa/apps.json (2 apps)
done. wrote 7 files, index.html 87 KB
```

Reload the launcher tab in Chrome → your new tile appears. Tap it. You're playing.

---

## Step 2: What the scaffolder produced

```
pwa/apps/my-speller/
├── index.html      ← the entire app (SDK + CSS + config + template inlined)
├── manifest.json   ← PWA manifest for "Add to Home Screen"
├── icon.svg        ← auto-generated icon with your app's initials
├── sw.js           ← network-first service worker for offline support
└── fonts/          ← Space Mono + DM Sans woff2 files
```

**`index.html` is the only file that matters.** Everything is inlined:

- `<style>` — the TE design tokens from `templates/_base/style.css` + the template's per-app CSS
- `<script type="application/json" id="app-config">` — your per-app config (model, host, slug, age group)
- `<script>` — the full `sdk/olladroid.js` (~20 KB) as a UMD-lite global (`window.Olladroid`)
- `<script>` — the template's `app.js` controller (the game logic / summarisation FSM)
- `<main id="app-root">` — the template's `body.html` DOM

No build step. No bundler. No `npm install`. Just HTML, CSS, and vanilla JS that every phone browser has understood for 15 years.

---

## Step 3: How the SDK works

Every scaffolded app accesses the SDK via `window.Olladroid`:

```javascript
// Create a client pointing at your local Ollama
var client = new Olladroid.OllamaClient({
  host: 'http://localhost:11434',
  model: 'qwen2.5:1.5b',
});

// Define what you want the model to return
var schema = {
  type: 'object',
  properties: {
    word: { type: 'string' },
    hint: { type: 'string' },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
  },
  required: ['word', 'hint', 'difficulty'],
};

// Ask the model — it MUST return valid JSON matching the schema
client.structuredChat([
  { role: 'system', content: 'You are a spelling teacher for kids aged 6-8.' },
  { role: 'user', content: 'Give me a word to spell.' },
], schema).then(function (result) {
  // result is ALREADY parsed JSON:
  // { word: "elephant", hint: "a large grey animal with a trunk", difficulty: "medium" }
  console.log(result.word);    // "elephant"
  console.log(result.hint);    // "a large grey animal..."
});
```

**Why this works with tiny models:** Ollama's `format` parameter forces the model to emit JSON that validates against your schema. The model can't hallucinate a random string — it *must* produce valid JSON with the fields you specified. A 1.5B model is perfectly capable of filling in structured fields. It's the freeform generation that breaks at small sizes.

### Other SDK tools

```javascript
// Session persistence (survives page reloads)
var session = new Olladroid.SessionManager({ key: 'my-app-state' });
session.save({ score: 42, round: 3 });
var state = session.load(); // { score: 42, round: 3 }

// Connectivity check
client.ping().then(function (result) {
  if (result.ok) {
    console.log('Models:', result.models); // ["qwen2.5:1.5b"]
  }
});

// Pick the best model for structured output from what's installed
var best = Olladroid.pickModel(result.models, 'structured');
// → "qwen2.5:1.5b" (skips gemma3:1b and smollm2:360m which hallucinate JSON)
```

---

## Step 4: The two reference templates

### Spell Bee (`kids-game/spell-bee`)

A local spelling game with a 5-state FSM:

```
idle → fetching_word → awaiting_attempt → judging → showing_feedback → idle
```

Two `structuredChat` calls per round:
1. **Fetch a word:** schema `{word, hint, difficulty}` — the model picks an age-appropriate word and writes a descriptive hint
2. **Judge the attempt:** schema `{correct, feedback, score_delta}` — the model decides if the child's spelling is correct and writes encouraging feedback

The template also implements:
- Bounded 5-round sessions with a score summary
- LCS-aligned character-level diff highlighting (wrong letters get orange backgrounds)
- Local spelling override (if the typed word matches case-insensitively, it's always correct regardless of the model's verdict)

### Summariser (`productivity/summariser`)

A paste-text-in, structured-summary-out tool:

```
idle → thinking → showing_summary (or error) → idle
```

One `structuredChat` call:
- Schema: `{tldr: string, bullets: string[], key_points: string[]}`
- Input capped at 2000 characters (fits in qwen2.5:1.5b's mobile context budget)
- Persists the last summary to `SessionManager` so reopening the PWA restores the result

---

## Step 5: Writing your own template

A template is two files under `templates/<category>/<name>/`:

```
templates/
├── _base/
│   ├── index.html    ← shared shell (you don't edit this)
│   └── style.css     ← shared TE design tokens (you don't edit this)
└── my-category/
    └── my-template/
        ├── body.html ← your HTML, inlined inside <main id="app-root">
        └── app.js    ← your controller, inlined inside <script>
```

### Rules

1. **Everything your template needs lives on `window.Olladroid`** — `OllamaClient`, `SessionManager`, `EventBus`, `pickModel`. Don't import. The SDK is inlined as a plain script.
2. **Read your config from `app-config`:**
   ```javascript
   var config = JSON.parse(document.getElementById('app-config').textContent);
   // config.defaultModel, config.host, config.appSlug, etc.
   ```
3. **Populate the shared header elements** — `#app-title`, `#app-logo`, `#model-badge`, `#host-badge`, `#connection-status`. See Spell Bee's `app.js` for the pattern.
4. **Per-template CSS goes in a `<style>` block** at the top of `body.html`.
5. **Don't write literal `</script>` or `</style>`** anywhere — the scaffolder's escape pass handles the common cases but avoiding the sequence entirely is safest.

### Minimal template example

**`templates/creative/haiku/body.html`:**
```html
<style>
  .haiku { display: flex; flex-direction: column; gap: var(--olladroid-space-4); }
  .haiku__output { font-family: var(--olladroid-sans); font-size: var(--olladroid-font-size-lg); line-height: 1.8; white-space: pre-line; color: var(--olladroid-white); }
</style>

<section class="haiku">
  <button id="btn-generate" type="button" data-variant="accent">Generate haiku</button>
  <div class="haiku__output" id="haiku-output"></div>
</section>
```

**`templates/creative/haiku/app.js`:**
```javascript
(function () {
  'use strict';
  var config = JSON.parse(document.getElementById('app-config').textContent);
  var client = new Olladroid.OllamaClient({ host: config.host, model: config.defaultModel });

  var SCHEMA = {
    type: 'object',
    properties: {
      line1: { type: 'string' },
      line2: { type: 'string' },
      line3: { type: 'string' },
    },
    required: ['line1', 'line2', 'line3'],
  };

  document.getElementById('btn-generate').addEventListener('click', function () {
    var output = document.getElementById('haiku-output');
    output.textContent = 'Thinking...';
    client.structuredChat([
      { role: 'system', content: 'You are a haiku poet. Write one haiku. Return JSON only.' },
      { role: 'user', content: 'Write a haiku about technology and nature.' },
    ], SCHEMA).then(function (r) {
      output.textContent = r.line1 + '\n' + r.line2 + '\n' + r.line3;
    }, function (err) {
      output.textContent = 'Error: ' + err.message;
    });
  });
})();
```

That's ~30 lines. Scaffold it with:
```bash
olladroid new --non-interactive \
  --slug haiku --template creative/haiku \
  --model qwen2.5:1.5b
```

---

## Step 6: Install as a real app

Once your app is scaffolded and the launcher shows it:

1. Open the app in Chrome via the launcher tile
2. Tap the **three-dot menu → Add to home screen** (or "Install app")
3. Chrome installs it as a **real WebAPK** — its own icon in the app drawer, standalone window, works offline

Your kid taps the Spell Bee icon and lands straight in the game. No browser chrome, no URL bar, no distractions.

---

## Step 7: Share it

A scaffolded app is one directory:

```
pwa/apps/my-speller/
├── index.html
├── manifest.json
├── icon.svg
├── sw.js
└── fonts/
```

To give it to a friend:
1. Zip the directory
2. They unzip it anywhere
3. They run `python3 -m http.server 8000 --directory my-speller/`
4. They open `http://localhost:8000/` in Chrome
5. They install it as a PWA

The app talks to *their* local Ollama (they need it running). Your data was never involved.

---

## What's next

- **Write a template** for something YOU need — a flashcard app, a local translator, a recipe generator, a journaling prompter
- **Run the benchmarks** on your phone: `bash scripts/bench.sh --runs 3` and [submit a PR](https://github.com/s1dd4rth/olladroid/blob/main/benchmarks/README.md)
- **Star the repo** if this was useful: [github.com/s1dd4rth/olladroid](https://github.com/s1dd4rth/olladroid)

The model is yours. The app is yours. The data is yours. The phone was in your drawer anyway.

---

*Built with [olladroid](https://github.com/s1dd4rth/olladroid) v0.3.2. Validated on an LG G8 ThinQ (SD855) and OnePlus 9R (SD870). 185 tests passing.*
