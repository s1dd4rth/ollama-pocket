---
layout: default
title: "Run a Free, Private AI on Your Old Android Phone — No Root Required"
description: "Step-by-step guide to running Ollama on Android with Termux, proot-distro Debian, and a lightweight PWA chat interface."
---

# Run a Free, Private AI on Your Old Android Phone — No Root Required

*A step-by-step guide to turning an old phone into a local AI server with Ollama.*

---

## Why?

You probably have an old phone in a drawer. It has a multi-core ARM processor, 4-6GB of RAM, WiFi, a battery that acts as a built-in UPS, and it's doing nothing.

Meanwhile, every AI service wants your data, a subscription, or both.

What if you could run a real language model — privately, offline, for free — on that phone? No cloud. No API keys. No accounts. Your prompts never leave the device.

That's what this guide does. I did it on a **Snapdragon 855 phone from ~2019** (6GB RAM) and it works surprisingly well. Any similar-era Android phone should work too.

**What you'll end up with:**
- A local AI chat running entirely on your phone
- A clean PWA interface you can "install" to your home screen
- An API server any device on your WiFi can talk to
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

## Step 6: The PWA Chat Interface

Chatting in the terminal works, but it's not great on a phone touchscreen. We built a lightweight PWA (Progressive Web App) chat interface that:

- Connects to your local Ollama server
- Streams responses in real-time
- Auto-detects which model is loaded
- Can be "installed" to your home screen as a standalone app
- Uses zero extra RAM (it's just an HTML file)

<!-- screenshot placeholder: ![Chat UI screenshot](assets/images/chat-ui.png) -->

### Copy the PWA to your phone

```bash
# On your PC
adb shell mkdir -p //sdcard/olladroid/pwa
adb push pwa/chat.html //sdcard/olladroid/pwa/
adb push pwa/manifest.json //sdcard/olladroid/pwa/
adb push pwa/sw.js //sdcard/olladroid/pwa/
adb push pwa/icon.svg //sdcard/olladroid/pwa/
```

### Open it

1. Make sure the Ollama server is running (next step)
2. Open Chrome on your phone
3. Navigate to `file:///sdcard/olladroid/pwa/chat.html`
4. Start chatting

### Add to home screen

In Chrome, tap the **three dots menu → Add to Home Screen**. The chat app will appear on your home screen and open in standalone mode (no browser chrome), looking and feeling like a native app.

---

## Step 7: One-Command Startup

Every time you want to use your AI, you just need to start the Ollama server. We made a script for that.

### Basic startup (localhost only)

```bash
# In Termux
bash /sdcard/start-ollama.sh
```

The server starts on `http://localhost:11434`. Only apps on the phone can reach it.

### WiFi startup (access from any device)

```bash
bash /sdcard/start-ollama.sh --wifi
```

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
bash /sdcard/setup-autostart.sh
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

An old phone that was gathering dust is now running a real AI model, privately, with no recurring costs. The entire stack is open source. Your data never leaves the device.

It won't replace GPT-4 — a 1.5B parameter model is what it is. But for quick questions, drafting text, brainstorming, summarizing, and simple code tasks? It's genuinely useful. And it's *yours*.

The repo has everything you need to replicate this: **[github.com/s1dd4rth/olladroid](https://github.com/s1dd4rth/olladroid)**

---

*Built on a 2019-era Android phone with Termux, proot-distro, Ollama, and stubbornness.*
