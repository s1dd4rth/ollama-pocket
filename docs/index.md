---
layout: default
title: "olladroid — the AI app framework that fits in one phone"
description: "Scaffold personalised AI mini-apps that run entirely on an Android phone you already own. No cloud, no account, no data leaving the device. Step-by-step install guide for Termux + proot-distro Debian + Ollama + a PWA launcher."
---

<p align="center">
  <img src="../pwa/logo.svg" alt="olladroid — llama in a pill-shaped wordmark" width="320" />
</p>

# olladroid

**The AI app framework that fits in one phone — offline, private, yours.**

olladroid is a framework for building personalised AI mini-apps that run entirely on a phone you already own. Scaffold an app in one command, inline a tiny SDK, talk to a local LLM via structured JSON. No cloud, no account, no data leaving the device. Your phone becomes a private AI runtime that you program.

It also ships a one-line installer that turns any old Android phone into a local AI server using [Ollama](https://ollama.com), [Termux](https://termux.dev), and a built-in PWA launcher — the original v0.1.0 use case is unchanged and still one command away.

---

## Quick install (one command)

Run this **in Termux on your phone** (install Termux from [F-Droid](https://f-droid.org/en/packages/com.termux/) first — **not** the Play Store, that version is outdated):

```bash
curl -fsSL https://s1dd4rth.github.io/olladroid/install.sh | bash
```

That's it. The installer pins a known-good Termux mirror, clones the repo to `~/olladroid`, installs Debian inside `proot-distro`, installs Ollama, copies the PWA to `/sdcard/olladroid/pwa/`, and adds the `olladroid` CLI wrapper to your PATH. When it finishes, it prints the exact commands to start the server and the launcher.

Then:

```bash
# Pull a model (pick one that fits your RAM — see the table below)
proot-distro login debian -- ollama pull qwen2.5:1.5b

# Start the server + PWA launcher. Chrome opens at http://localhost:8000/
bash ~/olladroid/scripts/start-ollama.sh --wifi --chat
```

The launcher tile grid lists the v0.1.0 chat UI plus every mini-app you've scaffolded. Tap a tile and you're in the app.

Want to build your own app? `olladroid new` walks you through it — see [Step 8](#step-8-build-your-own-ai-mini-apps-v03) below.

The rest of this page is the long-form **step-by-step tutorial** for anyone who wants to understand what the one-liner is actually doing, or who's hit a snag somewhere in the chain and needs to run the steps manually. If the one-liner worked, you can skip straight to Step 6 (the PWA launcher) or Step 8 (scaffolding your own app).

---

## Why?

You probably have an old phone in a drawer. It has a multi-core ARM processor, 4-6 GB of RAM, WiFi, a battery that acts as a built-in UPS, and it's doing nothing.

Meanwhile, every AI service wants your data, a subscription, or both.

What if you could run a real language model — privately, offline, for free — on that phone? No cloud. No API keys. No accounts. Your prompts never leave the device. And what if, on top of that, you could **scaffold personalised AI mini-apps** that do exactly what you want — a local spelling game for your kid, a summariser for meeting notes, anything — without shipping your data to someone else's cloud?

That's what this guide does. I did it on an **LG G8 ThinQ (Snapdragon 855, 5.5 GB RAM)** and it works surprisingly well. Any similar-era Android phone should work too.

**What you'll end up with:**
- A **local AI chat** running entirely on your phone (the v0.1.0 story)
- A **PWA launcher** at `http://localhost:8000/` with a tile grid of your apps
- Two **reference templates** — Spell Bee (kids-game) and Summariser (productivity) — ready to install
- An **API server** any device on your WiFi can talk to (`--wifi` flag)
- A **scaffolder CLI** (`olladroid new`) that turns a template + a slug into a self-contained PWA mini-app with the SDK inlined and registers it in the launcher
- All of this without rooting your phone

---

## What You'll Need

- **An Android phone** — arm64, 4GB+ RAM (6GB recommended). Most phones from 2018+ work.
- **A PC** — Windows, Mac, or Linux. Just needs ADB.
- **A USB cable** — to connect your phone to the PC.
- **~30 minutes** — most of that is downloading.

---

## Step 1: Connect via ADB

ADB (Android Debug Bridge) lets your PC talk to your phone over USB. We'll use it to remove bloatware and push scripts.

### Install ADB

**Windows:** Download [Platform Tools](https://developer.android.com/tools/releases/platform-tools), extract anywhere, add to PATH.

**Mac:** `brew install android-platform-tools`

**Linux:** `sudo apt install adb`

### Enable USB Debugging on your phone

1. Go to **Settings → About Phone**
2. Tap **Build Number** 7 times (this enables Developer Options)
3. Go to **Settings → Developer Options**
4. Turn on **USB Debugging**

### Verify the connection

Plug in your phone via USB. On your PC:

```bash
adb devices
```

You should see your device listed. If it says "unauthorized", check your phone — there should be a popup asking to allow USB debugging. Tap **Allow**.

```
List of devices attached
ABCD1234EFGH5678    device
```

> **Git Bash on Windows:** ADB paths get mangled. Use double-slash for sdcard paths: `adb push file //sdcard/` instead of `adb push file /sdcard/`.

---

## Step 2: Debloat Your Phone

This is optional but recommended. Old phones come loaded with bloatware that eats RAM. On my test phone, there were **4 Gameloft games**, Facebook (with 3 background services), Instagram, Booking.com, and about 60 vendor apps I never used.

Removing them freed up roughly **500MB of RAM** — that's the difference between your AI model fitting in memory or not.

### What the script does

The debloat script removes packages for the **current user only** using `adb shell pm uninstall -k --user 0`. This is completely **reversible** — you can restore any app later with:

```bash
adb shell cmd package install-existing <package-name>
```

The phone's system partition is untouched. No root required.

### Preview first (dry run)

```bash
./scripts/debloat.sh --dry-run
```

This shows exactly what would be removed, organized by category (Games, Social, LG Bloatware, Google Apps, Other), without actually removing anything. Review the list and edit the script if you want to keep specific apps.

### Run the debloat

```bash
./scripts/debloat.sh
```

Sample output:

```
======================================
  DEBLOAT — REMOVING BLOATWARE
======================================

[Games]
  Removed: com.gameloft.android.GN.GLOFTGGHM
  Removed: com.gameloft.android.ANMP.GlsoftAsphal
  ...

[Social]
  Removed: com.facebook.katana
  Removed: com.facebook.services
  Removed: com.instagram.android
  ...

[LG_Bloatware]
  Removed: com.lge.smartworld
  Removed: com.lge.qmemoplus
  ...

======================================
  Removed: 87
  Skipped: 12
======================================
```

### What we kept

Phone, Contacts, Settings, Camera, Keyboard, Chrome, Play Store, Play Services, Messages, Bluetooth, NFC, Fingerprint, Clock. Everything essential still works.

### After debloat

On my 6GB test phone:
- **Before:** ~1.8GB available RAM
- **After:** ~2.8GB available RAM

That 2.8GB is enough to run a 1.5B parameter model comfortably.

---

## Step 3: Install Termux

[Termux](https://termux.dev) is a terminal emulator for Android. It gives you a real Linux shell with a package manager.

**Important:** Install from **F-Droid**, not the Play Store. The Play Store version is outdated and broken.

### Option A: Install via F-Droid app

1. Install [F-Droid](https://f-droid.org)
2. Search for "Termux"
3. Install it

### Option B: Install via ADB (what I did)

```bash
# Download the APK
curl -L -o termux.apk "https://f-droid.org/repo/com.termux_1000.apk"

# Install it
adb install termux.apk

# Launch it
adb shell am start -n com.termux/.HomeActivity
```

### Grant storage permissions

Termux needs storage access to read scripts from `/sdcard`:

```bash
adb shell pm grant com.termux android.permission.READ_EXTERNAL_STORAGE
adb shell pm grant com.termux android.permission.WRITE_EXTERNAL_STORAGE
```

Or inside Termux, run: `termux-setup-storage`

---

## Step 4: Install Ollama

This is the core step. Here's the architecture of what we're building:

```
┌─────────────────────────────────────┐
│  Android                            │
│  ┌───────────────────────────────┐  │
│  │  Termux                       │  │
│  │  ┌───────────────────────┐    │  │
│  │  │  proot-distro         │    │  │
│  │  │  ┌─────────────────┐  │    │  │
│  │  │  │  Debian (glibc)  │  │    │  │
│  │  │  │  └─ Ollama       │  │    │  │
│  │  │  └─────────────────┘  │    │  │
│  │  └───────────────────────┘    │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Why this layered approach?

Ollama is compiled against **glibc** (the GNU C Library — the standard for desktop/server Linux). Android doesn't use glibc. It uses its own C library called Bionic.

We tried installing Ollama directly in Termux — it doesn't work. We tried Alpine Linux (lightweight, fast) — it uses **musl** instead of glibc, which is also incompatible.

**Debian** uses glibc. So we run Debian inside Termux using `proot-distro`, which emulates a root filesystem in userspace. No actual root required.

### Run the install script

Push the script to your phone and run it in Termux:

```bash
# On your PC
adb push scripts/install-ollama.sh //sdcard/

# On your phone (in Termux)
bash /sdcard/install-ollama.sh
```

**What the script does:**
1. Updates Termux packages
2. Installs `proot-distro`
3. Installs Debian (~150MB download)
4. Installs Ollama inside Debian via the official install script
5. Creates a convenience start script

This takes 5-10 minutes depending on your internet connection.

### Verify it worked

```bash
proot-distro login debian -- ollama --version
```

You should see something like `ollama version is 0.20.5`.

---

## Step 5: Choose Your Model

The model is the actual AI brain. Smaller models = less RAM, faster responses, but less capable. Here's what works on a phone:

| Model | Download | RAM Needed | Speed* | Good for |
|-------|----------|-----------|--------|----------|
| `qwen2.5:1.5b` | ~1 GB | ~1.5 GB | ~3 tok/s | Best all-rounder. Chat, code, reasoning |
| `gemma3:1b` | ~0.8 GB | ~1 GB | ~4 tok/s | Google model. Good for summaries, simple chat |
| `smollm2:360m` | ~200 MB | ~400 MB | ~8 tok/s | Ultra-light. Quick answers, low RAM |

*\*Speed on Snapdragon 855. Newer SoCs will be faster.*

> **Rule of thumb:** Available RAM should be at least **2x the download size**. A 6GB phone with 2.8GB free can run up to ~1.5B parameters. A 4GB phone should stick to smollm2:360m.

### Pull your model

```bash
# In Termux
proot-distro login debian -- ollama pull qwen2.5:1.5b
```

This downloads the model. It's a one-time download — the model is cached locally.

### Test it

```bash
proot-distro login debian -- ollama run qwen2.5:1.5b
```

Type a message and hit enter. If you get a response, everything works. Press `Ctrl+D` to exit.

---

## Step 6: The PWA Launcher

Chatting in the terminal works, but it's not great on a phone touchscreen. olladroid ships a **PWA launcher** that:

- Lists every app on a tile grid — the v0.1.0 chat UI plus every mini-app you scaffold via `olladroid new`
- Runs in Chrome on `http://localhost:8000/` so service workers register correctly (that's why `file://` can't work — service workers don't run on file origins)
- Auto-pings your Ollama server and shows `N MODELS` or `OFFLINE` in the header
- Uses the olladroid llama wordmark and TE-style design language
- Can be "installed" to your home screen as a standalone WebAPK

The installer copies `pwa/` to `/sdcard/olladroid/pwa/` and `scripts/start-ollama.sh --chat` serves it on port 8000 via a tiny Python `http.server` that Termux runs. No manual `adb push` needed — the one-liner handles it.

### Start the server + launcher

```bash
# In Termux
bash ~/olladroid/scripts/start-ollama.sh --wifi --chat
```

Chrome opens at `http://localhost:8000/` and you see the launcher:

- **OLLADROID** header on the left with the llama wordmark
- **N MODELS** / `OFFLINE` connection badge on the right
- **YOUR APPS** section with one tile per installed app
- **Chat** tile for the v0.1.0 chat UI
- One tile per scaffolded mini-app (Spell Bee, Summariser, or whatever you've built)

Tap any tile. The page navigates to the app and you're in. Back button returns to the launcher.

### Two flags worth knowing

- `--chat-direct` — skip the launcher, open `chat.html` straight up (the v0.1.0 experience)
- `--wifi` — bind Ollama + the PWA server on all interfaces so any device on your LAN can reach them

### Add to home screen (real WebAPK install)

In Chrome, tap the **three dots menu → Add to home screen** while looking at the launcher. Chrome installs it as a real WebAPK — the launcher gets its own icon in the app drawer, runs in a standalone Android task (no browser chrome), and survives phone restarts. Same trick works for any scaffolded mini-app, so a Spell Bee install lands straight on your kid's home screen.

---

## Step 7: One-Command Startup

Every time you want to use your AI, you just need to start the Ollama server. We made a script for that.

### Basic startup (localhost only)

```bash
# In Termux
bash ~/olladroid/scripts/start-ollama.sh
```

The server starts on `http://localhost:11434`. Only apps on the phone can reach it.

### WiFi startup (access from any device)

```bash
bash ~/olladroid/scripts/start-ollama.sh --wifi --chat
```

`--wifi` binds Ollama + the PWA server on all interfaces. `--chat` also spins up the PWA server on `http://localhost:8000/` and opens the launcher in Chrome.

Now any device on your WiFi network can use the AI:

```
  ┌──────────────────────────────────────┐
  │          OLLAMA SERVER                │
  └──────────────────────────────────────┘

  Mode:  WiFi (all interfaces)
  Local: http://localhost:11434
  WiFi:  http://192.168.1.100:11434

  Press Ctrl+C to stop
```

### Set up aliases (optional)

```bash
bash ~/olladroid/scripts/setup-autostart.sh
```

After that, just type `ollama-start-wifi` in Termux to start the server.

### Use it from your PC

```bash
# One-shot question
curl http://192.168.1.100:11434/api/generate \
  -d '{"model":"qwen2.5:1.5b","prompt":"Explain quicksort in 3 sentences"}'

# Or use as an OpenAI-compatible API
# Base URL: http://192.168.1.100:11434/v1
# Model: qwen2.5:1.5b
```

This works with VS Code extensions (Continue), Open WebUI, Chatbox, or any app that supports the Ollama/OpenAI API.

---

## Step 8: Build your own AI mini-apps (v0.3+)

The chat UI is useful, but the whole point of olladroid is that you can **build your own**. A local spelling game for your kid. A summariser for meeting notes. A quiz app. A translator. Anything you can describe with a JSON schema and a system prompt.

The scaffolder CLI is called `olladroid`. The one-liner install added it to your PATH via `~/.bashrc`. Run `source ~/.bashrc` once (or open a fresh Termux session) and you're ready:

```bash
olladroid --version
# olladroid v0.3.0
```

### Scaffold an app (interactive)

```bash
cd ~/olladroid
olladroid new
```

You'll be walked through:
- **Slug** — a short name like `spelling-game` (used for the URL and the on-disk directory)
- **App name** — human-facing name, e.g. `Spelling Game`
- **Category** — `kids-game` or `productivity`
- **Template** — Spell Bee or Summariser (more land in later releases)
- **Age group** — kids-game only, `4-6` / `6-8` / `8-12`
- **Model** — defaults to `qwen2.5:1.5b`; the scaffolder checks which models you have installed and picks a compatible one
- **Ollama host** — defaults to `http://localhost:11434`
- **Output directory** — defaults to `pwa/apps/<slug>/` so the launcher picks it up automatically

When the scaffolder finishes, your new app is a single HTML file at `~/olladroid/pwa/apps/<slug>/index.html` with the ~20 KB SDK inlined as a plain `<script>`, template-specific CSS inlined as `<style>`, and per-app config inlined as a `<script type="application/json" id="app-config">` block. Plus `manifest.json`, `icon.svg`, `sw.js`, and a `fonts/` copy. **No build step, no framework, no `npm install`.** Just HTML, CSS, and vanilla JS — the same thing every phone browser has understood for 15 years.

The scaffolder also registers your new app in `pwa/apps.json`, so the launcher picks up a new tile the next time you open `http://localhost:8000/`.

### Scaffold non-interactively (scripts / CI)

```bash
olladroid new --non-interactive \
  --slug my-summariser \
  --template productivity/summariser \
  --model qwen2.5:1.5b
```

All flags are documented in `olladroid new --help`.

### Update an already-scaffolded app

When the SDK gets a bug fix (or a template's `body.html` or `app.js` changes), re-inline the new version into an existing app without losing its embedded `app-config`:

```bash
olladroid update pwa/apps/my-summariser
```

Idempotent. Preserves your slug, model, host, and template choices from the original scaffold.

### What ships today

- **`kids-game/spell-bee`** — a local spelling game for kids aged 4-12. 5-state FSM, two `structuredChat` calls per round, bounded 5-round sessions, character-level diff highlighting for incorrect attempts. Real template, not a hello-world.
- **`productivity/summariser`** — paste text (up to 2000 chars), get back a structured `{tldr, bullets, key_points}` JSON summary rendered as three TE-style cards. One `structuredChat` call per summarise. Copy-TLDR button. Restores the last summary from `localStorage` on reload.

### What's next

More templates land in later releases. Writing your own is ~200 lines of HTML + JS and is documented in [CONTRIBUTING.md#adding-a-template](https://github.com/s1dd4rth/olladroid/blob/main/CONTRIBUTING.md#adding-a-template).

---

## Troubleshooting

Here's every issue we hit and how we fixed it.

### "ollama: command not found"

The Ollama binary installs to `/usr/local/bin/ollama`, but that's not always in PATH inside proot. Fix:

```bash
# Use full path
proot-distro login debian -- /usr/local/bin/ollama serve

# Or add to PATH permanently
proot-distro login debian -- bash -c 'echo "export PATH=\$PATH:/usr/local/bin" >> /root/.bashrc'
```

### glibc / musl errors

```
Error: /lib/ld-musl-aarch64.so.1: cannot load ...
```

You're running Ollama on Alpine or directly in Termux. Ollama needs glibc, which only Debian (or Ubuntu) provides. Make sure you're inside the Debian proot:

```bash
proot-distro login debian
ollama serve
```

### Model download is too large / OOM kill

If Ollama gets killed mid-response or the model won't load, your phone doesn't have enough free RAM. Switch to a smaller model:

```bash
ollama pull smollm2:360m    # Only needs ~400MB RAM
```

### ADB path mangling (Git Bash on Windows)

Git Bash on Windows rewrites `/sdcard/` to `C:/Program Files/Git/sdcard/`. Use double-slash:

```bash
# Wrong (Git Bash will mangle this)
adb push file /sdcard/

# Correct
adb push file //sdcard/
```

### Termux crashes / won't open

The Play Store version of Termux is unmaintained and broken on newer Android. Uninstall it and reinstall from F-Droid:

```bash
adb uninstall com.termux
adb install termux.apk  # Downloaded from F-Droid
```

### "Connection refused" in the chat UI

The Ollama server isn't running, or it's running on a different port. Make sure you've started it:

```bash
bash start-ollama.sh --wifi
```

Then open the chat UI. It connects to `localhost:11434` by default.

### The install script downloads .tgz but gets a 404

Ollama recently switched their release format from `.tgz` to `.tar.zst`. The official install script (`curl -fsSL https://ollama.com/install.sh | sh`) handles this automatically. If you're downloading manually, check the [releases page](https://github.com/ollama/ollama/releases) for the current format.

---

## What's Next

Now that you have a working AI on your phone, here are some things you can do with it:

**Use it as an API server.** Any app on your network can send requests to `http://<phone-ip>:11434`. Use it with VS Code, Obsidian, or your own scripts.

**Port forwarding.** With a tool like [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) or [ngrok](https://ngrok.com), you can expose your phone's API to the internet. Your own personal AI endpoint, for free.

**Try different models.** Ollama has a [model library](https://ollama.com/library) with hundreds of models. Experiment — you can always delete models you don't use with `ollama rm <model>`.

**Build on it.** The Ollama API is OpenAI-compatible. Any tool or library that works with the OpenAI API will work here. Build a Telegram bot, a document summarizer, or a local coding assistant.

---

## Conclusion

An old phone that was gathering dust is now **a private AI runtime that you program**. Real models, really offline, really yours. No cloud, no account, no data leaving the device. The entire stack is open source.

`qwen2.5:1.5b` won't replace GPT-4 — a 1.5B parameter model is what it is. But for quick questions, drafting text, brainstorming, summarizing, and simple code tasks, it's genuinely useful. Layer a structured-JSON schema on top of it with `olladroid new` and suddenly the same tiny model is powering a proper mini-app with its own UI, its own state, and its own opinions about what "correct" looks like.

The olladroid scaffolding system ships two reference templates today — Spell Bee (a kids' spelling game) and Summariser (paste-text-in, structured summary out). More land in later releases. Writing your own is [~200 lines of HTML and JS](https://github.com/s1dd4rth/olladroid/blob/main/CONTRIBUTING.md#adding-a-template).

**Get the code:** [github.com/s1dd4rth/olladroid](https://github.com/s1dd4rth/olladroid)
**One-line install (inside Termux):** `curl -fsSL https://s1dd4rth.github.io/olladroid/install.sh | bash`

---

*Built and validated end-to-end on an LG G8 ThinQ (Snapdragon 855, 5.5 GB RAM, Android 12) against real `qwen2.5:1.5b` through Ollama 0.20.5 — launcher renders, Summariser returns valid structured JSON, Spell Bee's 5-state FSM transitions cleanly, every byte reproducible via the scaffold-drift CI job. Tests: 185 passing.*
