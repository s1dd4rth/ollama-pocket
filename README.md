# ollama-pocket

[![CI](https://github.com/s1dd4rth/ollama-pocket/actions/workflows/ci.yml/badge.svg)](https://github.com/s1dd4rth/ollama-pocket/actions/workflows/ci.yml)

Run a free, private AI on your old Android phone — no root required.

Turn any old Android phone into a local AI server using [Ollama](https://ollama.com), [Termux](https://termux.dev), and a lightweight PWA chat interface. Everything runs on-device. No cloud, no API keys, no subscriptions.

[**Read the full guide →**](https://s1dd4.github.io/ollama-pocket)

## Quick Start

**On your PC** (with phone connected via USB):

```bash
# 1. Free up RAM by removing bloatware (reversible)
./scripts/debloat.sh

# 2. Copy install script to phone, run it in Termux
adb push scripts/install-ollama.sh //sdcard/
# Then in Termux: bash /sdcard/install-ollama.sh

# 3. Start the server
# In Termux: bash /sdcard/start-ollama.sh --wifi --chat
```

That's it. You now have a private AI running on your phone, accessible from any device on your WiFi.

## How It Works

```
┌─────────────────────────────────────────────────┐
│  Android Phone                                  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Termux (terminal emulator)               │  │
│  │                                           │  │
│  │  ┌───────────────────────────────────┐    │  │
│  │  │  proot-distro (Debian)            │    │  │
│  │  │                                   │    │  │
│  │  │  ┌───────────────────────────┐    │    │  │
│  │  │  │  Ollama                   │    │    │  │
│  │  │  │  ├─ qwen2.5:1.5b         │    │    │  │
│  │  │  │  └─ API on :11434        │    │    │  │
│  │  │  └───────────────────────────┘    │    │  │
│  │  └───────────────────────────────────┘    │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  PWA Chat UI ←──── localhost:11434              │
│  (Chrome)                                       │
└─────────────────────────────────────────────────┘
         ↕ WiFi
  Any device on your network can
  hit http://<phone-ip>:11434
```

**Why Debian inside Termux?** Ollama is compiled against glibc. Android (and Alpine Linux) use different C libraries. Debian provides glibc, so Ollama runs natively. No root needed — `proot-distro` fakes root access in userspace.

## What's Included

| File | What it does |
|------|-------------|
| `scripts/debloat.sh` | Remove bloatware via ADB to free RAM. Reversible, with `--dry-run` mode |
| `scripts/install-ollama.sh` | Full install: Termux → proot Debian → Ollama. Run once |
| `scripts/start-ollama.sh` | Start server with `--wifi` and `--chat` flags |
| `scripts/setup-autostart.sh` | Add shell aliases + optional boot-on-start |
| `pwa/chat.html` | Standalone chat UI — zero overhead, auto-detects model |
| `pwa/manifest.json` | PWA manifest for "Add to Home Screen" |
| `pwa/sw.js` | Service worker for offline caching |

## Model Recommendations

Tested on an LG G8X ThinQ (Snapdragon 855, 6GB RAM, ~2.8GB available after debloat):

| Model | Download | RAM Used | Speed | Best For |
|-------|----------|----------|-------|----------|
| `qwen2.5:1.5b` | ~1 GB | ~1.5 GB | ~3 tok/s | General chat, reasoning, code |
| `gemma3:1b` | ~0.8 GB | ~1 GB | ~4 tok/s | Simple chat, summaries |
| `smollm2:360m` | ~200 MB | ~400 MB | ~8 tok/s | Quick answers, low RAM devices |

> **Rule of thumb:** You need ~2x the model download size in available RAM. A 6GB phone with 2.8GB free can run anything up to ~1.5B parameters comfortably.

## Requirements

- Android phone (arm64, 4GB+ RAM recommended)
- PC with [ADB](https://developer.android.com/tools/adb) installed (for debloat + initial setup)
- USB cable
- [Termux](https://f-droid.org/en/packages/com.termux/) from F-Droid (**not** Play Store — that version is outdated)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ollama: command not found` | PATH issue. Use full path: `/usr/local/bin/ollama serve` |
| Model download fails / OOM | Your model is too big. Try `smollm2:360m` |
| `GLIBC not found` / musl error | You're running Ollama outside Debian. Use `proot-distro login debian` first |
| ADB path mangling on Git Bash | Use double-slash: `adb push file //sdcard/` |
| Connection refused in chat UI | Ollama server isn't running. Start it first with `start-ollama.sh` |
| Termux from Play Store crashes | Uninstall, reinstall from [F-Droid](https://f-droid.org/en/packages/com.termux/) |

## Use It As an API Server

Once running with `--wifi`, any device on your network can use the Ollama API:

```bash
# From any PC/phone on the same WiFi
curl http://<phone-ip>:11434/api/generate \
  -d '{"model":"qwen2.5:1.5b","prompt":"Hello!"}'

# Works with any OpenAI-compatible client
# API Base: http://<phone-ip>:11434/v1
# Model:    qwen2.5:1.5b
```

Compatible with Open WebUI, Continue (VS Code), Chatbox, and anything that speaks the Ollama or OpenAI API.

## Contributing

PRs welcome. Especially interested in:

- Testing on other phones/SoCs (MediaTek, Exynos, Tensor)
- Debloat lists for Samsung, Xiaomi, Pixel
- Performance benchmarks on different devices
- Better PWA features (chat export, model switching, system prompts)

## License

MIT
