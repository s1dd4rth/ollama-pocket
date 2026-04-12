# Plan B — Fix the PWA install path

**Status:** draft
**Depends on:** none (this is the prerequisite for everything else)
**Blocks:** D (one-liner install), Scaffolding platform (scaffolded apps need HTTP too)

## Problem

The "private local PWA installable to home screen" story is silently broken on the recommended install path.

Three concrete defects compound:

1. `scripts/start-ollama.sh:74-83` opens the PWA via `am start ... -d file:///sdcard/ollama-pocket/pwa/chat.html`. Service workers **do not register on `file://` origins**. So `sw.js` never runs, offline caching never happens, and "Add to Home Screen" produces a broken PWA with no offline capability.
2. Nothing in `scripts/install-ollama.sh` actually copies `pwa/` to `/sdcard/ollama-pocket/pwa/`. The README Quick Start tells users to run `start-ollama.sh --chat` but the target file doesn't exist unless they manually `adb push pwa/`.
3. `pwa/chat.html:14` pulls Space Mono and DM Sans from `fonts.googleapis.com`. `pwa/sw.js:2` only caches `chat.html, manifest.json, icon.svg` — fonts are never cached. First offline launch = FOUT forever, or fallback to system mono. The "fully offline" claim is false.

There is also a **layering trap**: `install-ollama.sh:99-108` writes a second `~/start-ollama.sh` — a hardcoded 8-line stub that just runs `ollama serve`. This shadows the richer `scripts/start-ollama.sh` and confuses anyone debugging why `--chat` doesn't work on their machine.

## Goals

- `pwa/chat.html` loads over `http://localhost:8000`, not `file://`, on the default install.
- Service worker registers, caches all assets including fonts, and the PWA works in airplane mode.
- "Add to Home Screen" produces a real installable PWA with offline support.
- `pwa/` is self-contained: no network calls on first load after install.
- `install-ollama.sh` and `start-ollama.sh` stop fighting each other — one authoritative script each.

## Non-goals

- Redesigning the chat UI (that's C, folded into Scaffolding later).
- Adding tests for the PWA (that's F, deferred).
- Serving the PWA over WAN or HTTPS (local LAN only).
- Replacing `python3` with a custom HTTP server.

## Architecture

Runtime flow after this plan lands:

```
┌──────────────────────────────────────────────────────────────┐
│  Termux session                                              │
│                                                              │
│  $ bash start-ollama.sh --wifi --chat                        │
│        │                                                     │
│        ├─► trap EXIT: kill $PYTHON_PID                       │
│        │                                                     │
│        ├─► python3 -m http.server 8000 \                     │
│        │     --bind $BIND_ADDR \                             │
│        │     --directory /sdcard/ollama-pocket/pwa           │
│        │   (background, PID=$PYTHON_PID)                     │
│        │                                                     │
│        ├─► am start ... -d http://localhost:8000/chat.html   │
│        │   (Chrome opens, SW registers, assets cached)       │
│        │                                                     │
│        └─► proot-distro login debian -- ollama serve         │
│            (foreground — Ctrl+C triggers trap, kills python) │
│                                                              │
│  BIND_ADDR = 127.0.0.1  (no --wifi)                          │
│             = 0.0.0.0    (--wifi: LAN can reach PWA+Ollama)  │
└──────────────────────────────────────────────────────────────┘
```

Symmetric binding is deliberate: `--wifi` already exposes Ollama at `0.0.0.0:11434`, so exposing the PWA at `0.0.0.0:8000` matches the mental model. A laptop on the same LAN can hit `http://<phone-ip>:8000/chat.html` and use the phone as a full self-contained AI device.

## Implementation

### Step 1: Self-host fonts

Download Latin-subset WOFF2 files from Google Fonts and commit them to `pwa/fonts/`.

```
pwa/fonts/
├── space-mono-regular.woff2    (~15 KB)
├── space-mono-bold.woff2       (~15 KB)
├── dm-sans-variable.woff2      (~45 KB, variable font covers 400/500/600)
└── OFL.txt                     (SIL Open Font License, both fonts)
```

Total: ~75 KB added to the repo. Both Space Mono and DM Sans are OFL — self-hosting is permitted, license file required.

Remove `pwa/chat.html:13-14`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
```

Replace with `@font-face` block inside the existing `<style>`:

```css
@font-face {
  font-family: 'Space Mono';
  src: url('./fonts/space-mono-regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Space Mono';
  src: url('./fonts/space-mono-bold.woff2') format('woff2');
  font-weight: 700;
  font-display: swap;
}
@font-face {
  font-family: 'DM Sans';
  src: url('./fonts/dm-sans-variable.woff2') format('woff2-variations');
  font-weight: 400 600;
  font-display: swap;
}
```

Verify in Chrome DevTools → Network → no requests to `fonts.googleapis.com` or `fonts.gstatic.com`.

### Step 2: Update service worker to cache fonts

`pwa/sw.js`:

```js
const CACHE = 'ollama-v3';
const ASSETS = [
  './',
  './chat.html',
  './manifest.json',
  './icon.svg',
  './fonts/space-mono-regular.woff2',
  './fonts/space-mono-bold.woff2',
  './fonts/dm-sans-variable.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache Ollama API traffic — always hit the live server.
  if (url.pathname.startsWith('/api/') || url.port === '11434') return;
  // Stale-while-revalidate for static PWA assets.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
```

Cache name bumped to `ollama-v3` so existing v2 caches are evicted on activate.

### Step 3: Fix `scripts/install-ollama.sh`

Three changes:

**3a.** Install `python` and `iproute2` as part of the Termux package setup. Add after the `pkg update` step:

```bash
info "Installing python and iproute2 (for local PWA server + IP detection)..."
pkg install -y python iproute2 >/dev/null
ok "python + iproute2 installed"
```

Python on Termux is ~15 MB installed. `iproute2` is ~2 MB. Acceptable.

**Why `iproute2`:** `scripts/start-ollama.sh:48` already uses `ip -4 addr show wlan0` to detect the LAN IP, but `ip` is **not** in the default Termux package set — it lives in `iproute2`. The v0.1.0 script silently falls back to `LOCAL_IP="unknown"` on a fresh Termux install. This is a latent v0.1.0 regression being fixed as part of B.

**3b.** Add a `copy_pwa_files` function that provisions `/sdcard/ollama-pocket/pwa/`:

```bash
copy_pwa_files() {
  local target="/sdcard/ollama-pocket/pwa"
  local repo_root
  repo_root="$(cd "$(dirname "$0")/.." && pwd)"

  info "Copying PWA files to $target..."
  mkdir -p "$target"

  if [ -d "$repo_root/pwa" ]; then
    cp -r "$repo_root/pwa/." "$target/"
    ok "PWA copied from local repo ($repo_root/pwa)"
    return 0
  fi

  # Fallback: script was run standalone, fetch from GitHub.
  info "No local pwa/ directory found — fetching from GitHub..."
  local tmp
  tmp="$(mktemp -d)"
  if curl -fsSL https://github.com/s1dd4rth/ollama-pocket/archive/refs/heads/main.tar.gz \
      | tar xz -C "$tmp"; then
    cp -r "$tmp/ollama-pocket-main/pwa/." "$target/"
    rm -rf "$tmp"
    ok "PWA downloaded and installed"
  else
    rm -rf "$tmp"
    warn "Could not fetch PWA — chat UI will not be available until you copy pwa/ manually"
    return 1
  fi
}

copy_pwa_files || true
```

`cp -r pwa/. target/` copies contents, not the `pwa` directory itself, so re-runs overwrite cleanly without nesting.

**3c.** **Delete** the `~/start-ollama.sh` stub currently written at `install-ollama.sh:99-108`. Replace the post-install message with:

```bash
echo "  To start the Ollama server + chat UI:"
echo "    bash $(cd "$(dirname "$0")" && pwd)/start-ollama.sh --wifi --chat"
echo ""
echo "  Or add aliases:"
echo "    bash $(cd "$(dirname "$0")" && pwd)/setup-autostart.sh"
```

One authoritative start script. The README and aliases already point at `scripts/start-ollama.sh`.

**3d.** Fix idempotency bug at `install-ollama.sh:89` — the `echo "export PATH=..." >> /root/.bashrc` appends on every re-run. Replace with:

```bash
grep -q "/usr/local/bin" /root/.bashrc 2>/dev/null || \
  echo "export PATH=\$PATH:/usr/local/bin" >> /root/.bashrc
```

### Step 4: Rewrite `scripts/start-ollama.sh` `--chat` path

Replace lines 72-84 (current `--chat` block) with:

```bash
PWA_DIR="/sdcard/ollama-pocket/pwa"
PWA_PORT=8000
PYTHON_PID=""

start_pwa_server() {
  if [ ! -d "$PWA_DIR" ]; then
    echo -e "  ${YELLOW}PWA not found at $PWA_DIR${NC}"
    echo -e "  ${DIM}Re-run install-ollama.sh to provision the PWA.${NC}"
    return 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo -e "  ${YELLOW}python3 not found — install with: pkg install python${NC}"
    return 1
  fi
  python3 -m http.server "$PWA_PORT" \
    --bind "$BIND_ADDR" \
    --directory "$PWA_DIR" >/dev/null 2>&1 &
  PYTHON_PID=$!

  # Poll the port instead of relying on a sleep. Chrome must not beat the bind.
  local waited=0
  while [ "$waited" -lt 20 ]; do
    if ! kill -0 "$PYTHON_PID" 2>/dev/null; then
      echo -e "  ${YELLOW}PWA server died during startup (port $PWA_PORT in use?)${NC}"
      PYTHON_PID=""
      return 1
    fi
    if curl -sf "http://127.0.0.1:${PWA_PORT}/" -o /dev/null 2>/dev/null; then
      echo -e "  ${GREEN}PWA:${NC}   http://${LOCAL_IP}:${PWA_PORT}/chat.html"
      return 0
    fi
    sleep 0.1
    waited=$((waited + 1))
  done

  echo -e "  ${YELLOW}PWA server did not respond on port $PWA_PORT within 2s${NC}"
  kill "$PYTHON_PID" 2>/dev/null || true
  PYTHON_PID=""
  return 1
}

cleanup() {
  if [ -n "$PYTHON_PID" ] && kill -0 "$PYTHON_PID" 2>/dev/null; then
    kill "$PYTHON_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# --- bind address: localhost by default, 0.0.0.0 with --wifi ---
if $WIFI; then
  OLLAMA_HOST="0.0.0.0"
  BIND_ADDR="0.0.0.0"
else
  OLLAMA_HOST="127.0.0.1"
  BIND_ADDR="127.0.0.1"
fi

# --- start PWA server first, then Ollama in foreground ---
if $OPEN_CHAT; then
  if start_pwa_server; then
    # Force Chrome specifically. A non-Chrome default browser (Samsung Internet,
    # Firefox) either does not support service workers on localhost or shows a
    # chooser sheet that blocks the launch. If Chrome is not installed, am start
    # prints a warning and the user opens the URL manually.
    if am start -a android.intent.action.VIEW \
         -d "http://localhost:${PWA_PORT}/chat.html" \
         -p com.android.chrome 2>/dev/null; then
      echo -e "  ${CYAN}Opening chat UI in Chrome: http://localhost:${PWA_PORT}/chat.html${NC}"
    else
      echo -e "  ${YELLOW}Could not launch Chrome automatically.${NC}"
      echo -e "  ${DIM}Open this URL in Chrome manually:${NC}"
      echo -e "  ${CYAN}http://localhost:${PWA_PORT}/chat.html${NC}"
    fi
  fi
fi
```

The existing `ollama serve` call at the bottom of the script stays in the foreground. When the user Ctrl+C's, the `trap` fires, kills the Python server, then Ollama exits naturally.

### Step 5: Also fix the IP extraction

`start-ollama.sh:48` uses `grep -P` (Perl regex). Termux ships GNU grep so this works today, but it's one pkg swap away from breaking. Replace with a portable form:

```bash
LOCAL_IP=$(ip -4 -o addr show wlan0 2>/dev/null | awk '{print $4}' | cut -d/ -f1)
[ -z "$LOCAL_IP" ] && LOCAL_IP="unknown"
```

`ip -o` + `awk` is POSIX, works on BusyBox.

### Step 6: README update

Update `README.md` Quick Start to match the new flow. No more "adb push scripts/install-ollama.sh //sdcard/" step required to get the chat UI — `install-ollama.sh` now provisions everything. Keep the ADB instructions for the debloat step only.

Add a "Troubleshooting" row:

| `PWA server failed to start on port 8000` | Another process is using port 8000. Kill it or edit `PWA_PORT` in `start-ollama.sh`. |

## Test plan

Manual, on the target device. No automated tests in this PR.

**Clean install path (primary):**
1. Fresh Termux (or `rm -rf ~/ollama-pocket /sdcard/ollama-pocket` on existing).
2. `git clone https://github.com/s1dd4rth/ollama-pocket && cd ollama-pocket`.
3. `bash scripts/install-ollama.sh`.
   - ✓ Python installed without prompting.
   - ✓ `/sdcard/ollama-pocket/pwa/chat.html` exists after install.
   - ✓ `~/start-ollama.sh` does **not** exist (the stub is gone).
   - ✓ Re-running the installer does not duplicate lines in `/root/.bashrc`.
4. `bash scripts/start-ollama.sh --wifi --chat`.
   - ✓ Console prints `PWA: http://<ip>:8000/chat.html`.
   - ✓ Chrome opens to `http://localhost:8000/chat.html`.
   - ✓ DevTools → Application → Service Workers: `sw.js` status "activated and running".
   - ✓ DevTools → Network: zero requests to `fonts.googleapis.com` or `fonts.gstatic.com`.
   - ✓ DevTools → Application → Cache Storage → `ollama-v3`: contains chat.html, manifest.json, icon.svg, all three font files.
5. Send a chat message. Ctrl+C the Termux session.
   - ✓ Trap fires, Python process exits, `ps` shows no orphan `python3 -m http.server`.
6. Re-open Chrome in airplane mode, visit `http://localhost:8000/chat.html`.
   - ✓ Page loads from cache. Fonts render correctly (no system fallback).
   - ✓ Chat shows "Offline" status (Ollama is unreachable), no JS errors in console.

**PWA install path:**
7. `--chat` running, Chrome → overflow menu → **"Install app"** or **"Add to Home Screen"** (manual path, not the auto-prompt).
   - The auto-install prompt has an engagement heuristic (multiple visits / 30s+ SW lifetime) and will *not* fire on first visit. That's expected — use the manual menu item.
   - ✓ Manifest picked up, "OLLAMA_LOCAL" added to home screen with correct icon.
   - ✓ Launching from home screen opens in standalone mode (no Chrome chrome).
8. Close all Chrome tabs, relaunch from home screen, airplane mode on.
   - ✓ PWA still loads, fonts still render.

**LAN path:**
9. Start with `--wifi --chat`, from a laptop on the same WiFi visit `http://<phone-ip>:8000/chat.html`.
   - ✓ PWA loads on the laptop. Chat works against the phone's Ollama.

**Regression:**
10. `shellcheck --severity=error scripts/*.sh` — still passes.
11. `bash scripts/start-ollama.sh` (no flags) — still works, PWA server is NOT started (`--chat` gates it).
12. `bash scripts/start-ollama.sh --wifi` — Ollama listens on `0.0.0.0`, no PWA server started.

**Port collision:**
13. Manually `python3 -m http.server 8000 &` in another Termux session, then run `start-ollama.sh --chat`.
    - ✓ Script prints "PWA server failed to start on port 8000", continues to start Ollama anyway (non-fatal).

## Failure modes

Every new codepath, one realistic failure:

| Codepath | Failure | Detected? | Handled? | User-visible |
|----------|---------|-----------|----------|--------------|
| `copy_pwa_files` local `cp` | repo layout changed, `pwa/` moved | yes — `if [ -d ... ]` check | falls back to curl | "PWA downloaded from GitHub" |
| `copy_pwa_files` curl fallback | offline during install | yes — curl exit code | prints warning, install continues | "chat UI not available" warning |
| `copy_pwa_files` curl tarball | **supply-chain: poisoned CDN or DNS** | no — TLS verifies the endpoint but not the content | none — tarball is trusted blindly | **silent compromise risk** — flag, see below |
| `start_pwa_server` python missing | user skipped install step | yes — `command -v` check | prints install hint | yellow warning, Ollama still starts |
| `start_pwa_server` port bind race | Chrome fires before port listens | yes — `curl -sf` poll loop with 2s timeout | fails cleanly, kills orphan python | "PWA server did not respond on port 8000 within 2s" |
| `start_pwa_server` port in use | another python server | yes — `kill -0` + `curl` polls | prints warning, kills stale python, continues | yellow warning, Ollama still starts |
| `am start` → Chrome missing | user removed Chrome or runs a fork | yes — exit code check | prints URL, user opens manually | "Could not launch Chrome automatically. Open this URL: …" |
| `cleanup` trap | SIGKILL bypasses trap | **no** — SIGKILL is unhandleable | orphan process on `kill -9` | acceptable: documented limitation |
| Font cache on first load | network blip during SW install | no | SW install fails, SW never activates | **silent failure** — flag |

**Supply-chain note on `copy_pwa_files` curl fallback:** the fallback downloads `https://github.com/s1dd4rth/ollama-pocket/archive/refs/heads/main.tar.gz`. TLS guarantees the endpoint; it does not guarantee the tarball contents haven't been tampered with by a compromised GitHub CDN, a hijacked account, or a DNS poisoning attack on the install machine. This is a second instance of the `curl | sh` pattern (the first is `ollama.com/install.sh` at `install-ollama.sh:81`). Both are currently unverifiable. **Mitigation for v0.2.0:** prefer the *release tag* path over `main` — `https://github.com/s1dd4rth/ollama-pocket/archive/refs/tags/v0.2.0.tar.gz`. Release tags are immutable in git; a compromised tag would change the commit SHA and be externally observable. Pin to the latest release tag in the script, not `main`. Document a warning in README that both install scripts trust their upstreams and recommend inspecting them before running (`curl … > install.sh && less install.sh && bash install.sh`).

The last row is the one risk worth calling out: if the user is on a flaky network when they first open the PWA, `caches.open(CACHE).then(c => c.addAll(ASSETS))` rejects the entire install if any asset fails to fetch. The SW never activates. Next load re-tries from scratch. Mitigation: `addAll` already does this atomically — either all-or-nothing — which is the correct behavior. Not actually a bug. Leave as-is.

## NOT in scope

- HTTPS for the PWA server — localhost is exempt from most SW restrictions; not worth the self-signed cert rabbit hole.
- Choosing a different port if 8000 is taken — detect-and-warn is enough for now; user can edit the script.
- A launcher UI to stop/start the server without Ctrl+C — Termux session management is the UI.
- Refactoring `chat.html` for the model switcher — that's C, folded into Scaffolding.
- Automated tests for the PWA — that's F, deferred.
- Self-hosting icon.svg (already local).
- Caching model weights (that's Ollama's concern).

## What already exists

- `pwa/sw.js` — basic SW, just needs the cache list bumped.
- `pwa/manifest.json` — already valid, survives unchanged.
- `pwa/chat.html` — font `<link>` swap + `@font-face` addition, no other changes.
- `scripts/start-ollama.sh` `--chat` flag — exists, but points at the wrong URL scheme. Rewriting the block, not the whole script.
- `scripts/install-ollama.sh` `ok/info/warn/err` helper functions — reused for the new `copy_pwa_files` function.

## Acceptance criteria

- [ ] Fresh install produces a working PWA at `http://localhost:8000/chat.html` with zero manual `adb push` steps for PWA files.
- [ ] Service worker registers successfully on first load.
- [ ] Airplane-mode reload of the chat URL loads from cache, fonts render correctly.
- [ ] "Add to Home Screen" produces a functional standalone PWA that launches offline.
- [ ] Ctrl+C in Termux kills both the Python server and Ollama, leaves no orphan processes.
- [ ] `shellcheck --severity=error scripts/*.sh` passes.
- [ ] Zero network requests to `fonts.googleapis.com` or `fonts.gstatic.com` in DevTools Network tab during normal use.
- [ ] README Quick Start updated to reflect the simpler flow.

## Parallelization

Single-track plan, single PR, single author. No lanes.

## Rollout

One PR: `feat: serve PWA over http and self-host fonts for real offline support`. Conventional commit, rebase-merge per repo policy. No migration required — existing installs just re-run `install-ollama.sh`.

CHANGELOG entry under `[Unreleased]`:

```
### Fixed
- PWA chat UI now served over `http://localhost:8000` instead of `file://`,
  enabling service worker registration and real offline support.
- Self-hosted Space Mono and DM Sans fonts (~75 KB) in `pwa/fonts/`; no more
  requests to `fonts.googleapis.com`.
- `install-ollama.sh` now copies `pwa/` to `/sdcard/ollama-pocket/pwa/` and
  installs `python` for the local PWA server. No more manual `adb push`.
- `install-ollama.sh` no longer appends duplicate PATH entries on re-run.
- Removed the hardcoded `~/start-ollama.sh` stub that shadowed the real script.
```
