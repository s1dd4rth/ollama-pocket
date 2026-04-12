# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `CONTRIBUTING.md` with PR-based development workflow, conventional commits, shell style guide, and GitButler virtual-branch notes.
- GitHub pull request and issue templates under `.github/`.
- GitHub Actions CI running shellcheck on `scripts/`, with a status badge in the README.
- `.gitignore` covering macOS, editor, Jekyll, and Claude Code (`.claude/`) artifacts.
- **Self-hosted fonts** in `pwa/fonts/` — Space Mono (regular + bold) and DM Sans variable, ~70 KB total as WOFF2. Removes the runtime dependency on `fonts.googleapis.com` and is what actually makes "offline" mean offline. OFL 1.1 license shipped alongside (`pwa/fonts/OFL.txt` + `LICENSE.md`).
- `requirements/plans/B-pwa-install-path.md` — full tactical plan for the PWA HTTP fix.
- `requirements/plans/scaffolding-system.md` — v1 plan for the app scaffolding system.
- `requirements/REQUIREMENTS.md` — source requirements for the scaffolding system.

### Changed
- Repository merge strategy is now **rebase-merge only** — squash and merge-commit are disabled at the repo level to keep GitButler virtual branches sane.
- Docs anonymized: generic phone model, example LAN IP, and example ADB device serial in `docs/index.md` and `docs/medium.md`.
- **`scripts/start-ollama.sh --chat`** now serves the PWA over `http://localhost:8000` via `python3 -m http.server`, instead of launching Chrome on `file:///sdcard/ollama-pocket/pwa/chat.html`. Service workers do not register on `file://` origins — the old path looked like a working PWA but could not cache offline, could not install to the home screen, and could not deliver any of the "works on airplane mode" story.
- `scripts/start-ollama.sh` launches the PWA via `am start -p com.android.chrome` so the user's default browser (Samsung Internet, Firefox, or whatever was last set) does not silently break the service worker path. Prints a manual-open hint if Chrome is absent.
- `scripts/start-ollama.sh` uses a `curl -sf` poll loop (2-second ceiling) to confirm the Python HTTP server is actually listening before launching Chrome, instead of sleeping 300 ms.
- `scripts/start-ollama.sh` LAN-IP detection now uses portable `ip -o addr show wlan0 | awk '{print $4}' | cut -d/ -f1` instead of `grep -P` (Perl-compatible regex is not guaranteed on BusyBox).
- `scripts/install-ollama.sh` now installs `python`, `iproute2`, and `curl` alongside `proot-distro`. `python` powers the local PWA HTTP server. `iproute2` provides the `ip` command used by LAN-IP detection, which was silently falling back to `"unknown"` in v0.1.0 on fresh Termux installs because `iproute2` is not in the default Termux package set. `curl` powers the PWA tarball fallback.
- `scripts/install-ollama.sh` now copies `pwa/` to `/sdcard/ollama-pocket/pwa/` as part of the install, either from the local repo checkout or (fallback) from a GitHub tarball over HTTPS. This is what actually puts the chat UI on disk where `start-ollama.sh --chat` expects to find it.
- `pwa/sw.js` cache bumped from `ollama-v2` to `ollama-v3`. Cached asset list now includes the three WOFF2 font files. Old caches are wiped on SW activation. Fetch handler now uses stale-while-revalidate instead of network-first for static assets.
- `pwa/chat.html` now loads fonts via `@font-face` pointing at the local WOFF2 files, not via a `<link>` to `fonts.googleapis.com/css2?...`. Zero network calls to `fonts.gstatic.com` at runtime.
- README Quick Start rewritten around a Termux-native flow (`pkg install git && git clone && bash scripts/install-ollama.sh`). The ADB debloat path is still documented as an optional prerequisite for users who want to free RAM before installing Ollama.

### Fixed
- Broken GitHub URL in `README.md` and `docs/*` (`s1dd4` → `s1dd4rth` typo).
- `scripts/install-ollama.sh` no longer appends duplicate `export PATH=...` lines to `/root/.bashrc` on re-run. Guarded with a `grep -q` idempotency check.
- `scripts/install-ollama.sh` no longer writes a hardcoded `~/start-ollama.sh` stub that shadowed the real `scripts/start-ollama.sh`. The stub only knew how to run `ollama serve` and confused every user who tried to follow the README's `--wifi --chat` instructions. There is now exactly one authoritative start script.
- **Latent v0.1.0 regression:** LAN IP detection in `start-ollama.sh` was silently failing on fresh Termux installs because the `ip` command lives in the `iproute2` package which is not part of the default Termux set. The script was printing `http://unknown:11434` as the WiFi URL. Fixed by adding `iproute2` to the installer and documenting it.

## [0.1.0] - 2026-04-12

### Added
- Initial release: run Ollama on Android via Termux + proot Debian.
- `scripts/install-ollama.sh`, `start-ollama.sh`, `setup-autostart.sh`, `debloat.sh`.
- PWA chat interface at `pwa/chat.html`.
- Jekyll-based documentation site under `docs/`.
