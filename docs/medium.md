# Run a Free, Private AI on Your Old Android Phone — No Root Required

*Turn a forgotten phone into a local AI server. No cloud, no API keys, no subscriptions.*

---

You probably have an old phone in a drawer. It has a multi-core ARM processor, 4–6GB of RAM, WiFi, a battery that acts as a built-in UPS, and it's doing nothing.

Meanwhile, every AI service wants your data, a subscription, or both.

What if you could run a real language model — privately, offline, for free — on that phone? No cloud. No API keys. No accounts. Your prompts never leave the device.

I did this on an **LG G8X ThinQ** (Snapdragon 855, 6GB RAM, circa 2019) and it works surprisingly well. This guide covers everything, step by step. No terminal experience required.

**What you'll end up with:**
- A local AI chat running entirely on your phone
- A clean chat app you can "install" to your home screen
- An API server any device on your WiFi can talk to
- All without rooting your phone

The full code is at: **github.com/s1dd4/ollama-pocket**

---

## What You'll Need

- **An Android phone** — arm64, 4GB+ RAM (6GB recommended). Most phones from 2018 onwards.
- **A PC** — Windows, Mac, or Linux. Just needs ADB.
- **A USB cable** — to connect your phone.
- **~30 minutes** — most of that is downloading.

---

## Step 1: Connect via ADB

ADB (Android Debug Bridge) lets your PC talk to your phone.

**Install ADB:**
- Windows: Download Platform Tools from developer.android.com, extract, add to PATH
- Mac: `brew install android-platform-tools`
- Linux: `sudo apt install adb`

**Enable USB Debugging:**
1. Settings → About Phone → tap "Build Number" 7 times
2. Settings → Developer Options → enable "USB Debugging"

**Verify:**
```
adb devices
```

You should see your device listed. If it says "unauthorized", check your phone for a popup and tap Allow.

---

## Step 2: Debloat Your Phone (Optional but Recommended)

Old phones come loaded with bloatware that eats RAM. My LG G8X had 4 Gameloft games, Facebook (with 3 background services), Instagram, Booking.com, and about 60 LG apps I never touched.

Removing them freed up roughly **500MB of RAM** — the difference between your AI model fitting in memory or not.

The technique uses `adb shell pm uninstall -k --user 0 <package>`, which removes apps for the current user only. It's **completely reversible** — you can restore any app with `adb shell cmd package install-existing <package>`. No root needed.

The repo includes a debloat script with a `--dry-run` flag to preview changes before committing. After debloating:

- **Before:** ~1.8GB available RAM
- **After:** ~2.8GB available RAM

---

## Step 3: Install Termux

Termux is a terminal emulator for Android with a real Linux package manager.

**Critical: Install from F-Droid, not the Play Store.** The Play Store version is outdated and broken.

Download from f-droid.org, or install via ADB:

```
curl -L -o termux.apk "https://f-droid.org/repo/com.termux_1000.apk"
adb install termux.apk
```

Grant storage access:
```
adb shell pm grant com.termux android.permission.READ_EXTERNAL_STORAGE
adb shell pm grant com.termux android.permission.WRITE_EXTERNAL_STORAGE
```

---

## Step 4: Install Ollama

Here's the architecture of what we're building:

```
Android Phone
  └── Termux (terminal emulator)
       └── proot-distro (fake root)
            └── Debian (glibc Linux)
                 └── Ollama (AI server)
                      └── qwen2.5:1.5b (the model)
```

**Why this layered approach?**

Ollama is compiled against **glibc** (GNU C Library — the standard for Linux servers). Android uses a different C library (Bionic). We tried Alpine Linux — it uses **musl**, also incompatible.

Debian uses glibc, and `proot-distro` lets us run a full Debian filesystem inside Termux without root. Problem solved.

Push the install script and run it in Termux:

```
# On your PC
adb push scripts/install-ollama.sh //sdcard/

# In Termux on your phone
bash /sdcard/install-ollama.sh
```

The script updates Termux, installs proot-distro, downloads Debian (~150MB), and installs Ollama inside it. Takes about 5–10 minutes.

---

## Step 5: Choose Your Model

The model is the actual AI. Smaller = faster + less RAM, but less capable.

| Model | Download | RAM | Speed* | Best for |
|-------|----------|-----|--------|----------|
| qwen2.5:1.5b | ~1 GB | ~1.5 GB | ~3 tok/s | General chat, code, reasoning |
| gemma3:1b | ~0.8 GB | ~1 GB | ~4 tok/s | Simple chat, summaries |
| smollm2:360m | ~200 MB | ~400 MB | ~8 tok/s | Quick answers, very low RAM |

*Speed measured on Snapdragon 855.*

**Rule of thumb:** Available RAM ≥ 2× download size.

Pull your model:
```
proot-distro login debian -- ollama pull qwen2.5:1.5b
```

Test it:
```
proot-distro login debian -- ollama run qwen2.5:1.5b
```

Type something and hit enter. If you get a response, you're golden.

---

## Step 6: The Chat Interface

We built a lightweight PWA (Progressive Web App) that connects to your local Ollama. It streams responses, auto-detects your model, and uses zero extra RAM — it's just a single HTML file.

Copy it to your phone:
```
adb push pwa/chat.html //sdcard/ollama-pocket/pwa/
```

Open Chrome → navigate to `file:///sdcard/ollama-pocket/pwa/chat.html`.

Tap the three-dot menu → "Add to Home Screen" to install it as a standalone app. It'll open without browser chrome, like a native app.

---

## Step 7: One-Command Startup

```
# Start server (local only)
bash start-ollama.sh

# Start server (WiFi — any device can connect)
bash start-ollama.sh --wifi
```

With `--wifi`, any device on your network can use the API at `http://<phone-ip>:11434`.

### Use from your PC

```
curl http://192.168.1.8:11434/api/generate \
  -d '{"model":"qwen2.5:1.5b","prompt":"Explain quicksort"}'
```

This works with VS Code (Continue extension), Open WebUI, Chatbox, or anything that speaks the Ollama/OpenAI API.

---

## Troubleshooting

**"ollama: command not found"** — PATH issue. Use full path: `/usr/local/bin/ollama serve`. Or add it to PATH: `echo "export PATH=$PATH:/usr/local/bin" >> /root/.bashrc`

**glibc/musl errors** — You're running Ollama outside Debian. Make sure you're in the proot: `proot-distro login debian` first.

**Model too large / OOM** — Switch to a smaller model: `ollama pull smollm2:360m`

**ADB path mangling (Git Bash)** — Use double-slash: `adb push file //sdcard/`

**Termux crashes** — You installed from Play Store. Uninstall, reinstall from F-Droid.

**"Connection refused" in chat** — The Ollama server isn't running. Start it first.

**.tgz 404 error** — Ollama switched to `.tar.zst`. The official install script handles this — use `curl -fsSL https://ollama.com/install.sh | sh` inside Debian.

---

## What's Next

- **API server:** Any app on your network can send requests. Use with VS Code, Obsidian, your own scripts.
- **Port forwarding:** Expose to the internet with Cloudflare Tunnel or ngrok. Your own free AI endpoint.
- **More models:** Browse ollama.com/library. Delete unused ones with `ollama rm`.
- **Build on it:** The API is OpenAI-compatible. Build a Telegram bot, document summarizer, or coding assistant.

---

## Conclusion

An old phone gathering dust is now running a real AI model, privately, with no recurring costs. The entire stack is open source. Your data never leaves the device.

It won't replace GPT-4. A 1.5B parameter model has its limits. But for quick questions, drafting text, brainstorming, summarizing, and simple code? It's genuinely useful. And it's *yours*.

**Full repo: github.com/s1dd4/ollama-pocket**

---

*Built with an LG G8X ThinQ, Termux, proot-distro, Ollama, and stubbornness.*
