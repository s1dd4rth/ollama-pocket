# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Vendor-aware debloat** (closes #8): `scripts/debloat.sh` now auto-detects the phone's manufacturer via `adb shell getprop ro.product.manufacturer` and loads the matching manifest from the new `debloat/` directory. v0.1.0 hardcoded ~60 LG-specific packages into the script itself, which meant running it on a Samsung / Pixel / Xiaomi device was a silent no-op for 80% of the list. Package lists are now plain-text manifests (one per line, `#` comments allowed) split by vendor (`debloat/lge.txt`) and by opt-in category (`debloat/social.txt`, `debloat/games.txt`, `debloat/google-apps.txt`). The default behaviour on an LG phone is unchanged; non-LG phones no longer see a wall of "Not found" for LG-specific packages.
- `debloat/README.md` — contribution workflow for adding a new vendor list. Every non-LG owner can fix the gap for their phone with a one-file PR. Bar: a `# Verified on: <device>, Android <N>` header is required.
- New flags on `debloat.sh`: `--list` (show available manifests without touching the device), `--vendor <name>` (override auto-detection), `--category <a,b>` (subset the opt-in bundles), `--no-categories` (vendor only), `--skip-categories <name>` (drop a specific category from the default set), `--save-report <path>` (machine-readable JSON report of what was removed / skipped / failed, device info, and the list of loaded manifests — useful for audit logs and for reviewer-friendly vendor list contributions).
- `.github/ISSUE_TEMPLATE/debloat_contribution.md` — structured template for submitting a new vendor manifest, including a verification checklist.
- `CONTRIBUTING.md` section documenting the debloat contribution workflow and the bash 3.2 portability rule for shell scripts (macOS `/bin/bash` is still bash 3.2, so scripts must avoid associative arrays and handle empty array expansion under `set -u`).
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
- **Termux mirror roulette:** `install-ollama.sh` now pins `$PREFIX/etc/apt/sources.list` to `deb https://packages-cf.termux.dev/apt/termux-main/ stable main` *before* running its first `pkg update`. Termux's default behaviour is to pick a random mirror, and any given mirror can be broken on any given day. Real-hardware validation of v0.2.0 hit `mirror.textcord.xyz` returning a malformed clearsigned `InRelease` file, killing the install before step 2. Pinning to the official Cloudflare-backed mirror makes the install deterministic.
- **`proot-distro` Debian detection on 4.x:** the v0.1.0 detection used `proot-distro list | grep "debian.*installed"`, which never matches on proot-distro 4.x because the output format changed — plain `list` now returns the *catalog of supported distros*, not the installed ones. The installer always fell through to `proot-distro install debian`, which then errored with "already installed" and killed the script via `set -e`. Fix uses three detection paths in order: `proot-distro list --installed`, check for `$PREFIX/var/lib/proot-distro/installed-rootfs/debian/`, and finally catch the "already installed" error from the install command itself. Belt and suspenders.
- **PWA home screen icon was cropped to a circle:** the v0.1.0 `pwa/manifest.json` declared `icon.svg` with `purpose: "any maskable"`, but `icon.svg` is designed edge-to-edge — its white border and orange accent live outside the center 80% safe circle that Android's adaptive icon spec requires for maskable icons. LG's circular mask sliced off the border and the accent, leaving only "OL" letters in a plain black circle. Fix ships two icon variants: `icon.svg` (unchanged) declared with `purpose: "any"` for non-maskable contexts, and new `icon-maskable.svg` with a safe-zone layout declared with `purpose: "maskable"`. Service worker cache bumped to `ollama-v4` so existing installs re-cache the new asset list.

## [0.1.0] - 2026-04-12

### Added
- Initial release: run Ollama on Android via Termux + proot Debian.
- `scripts/install-ollama.sh`, `start-ollama.sh`, `setup-autostart.sh`, `debloat.sh`.
- PWA chat interface at `pwa/chat.html`.
- Jekyll-based documentation site under `docs/`.
