#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
# install-ollama.sh — Install Ollama on Android via Termux + proot-distro
#
# This script:
#   1. Updates Termux packages
#   2. Installs proot-distro
#   3. Installs Debian (not Alpine — Ollama needs glibc)
#   4. Installs Ollama inside Debian
#   5. Sets up PATH and convenience aliases
#
# Run this INSIDE Termux on your Android phone:
#   bash install-ollama.sh
#
# Why Debian and not Alpine?
#   Ollama is compiled against glibc (GNU C Library). Alpine uses musl libc,
#   which is incompatible. Debian uses glibc, so Ollama runs natively.
# ============================================================================

set -euo pipefail

# -- Colors --
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo -e "${BOLD}"
echo "  ┌──────────────────────────────────────┐"
echo "  │   OLLAMA INSTALLER FOR ANDROID        │"
echo "  │   Termux → Debian → Ollama            │"
echo "  └──────────────────────────────────────┘"
echo -e "${NC}"

# -- Step 1: Check we're in Termux --
if [ ! -d "/data/data/com.termux" ]; then
  err "This script must be run inside Termux on Android."
fi
ok "Running in Termux"

# -- Step 1a: Self-bootstrap for the `curl | bash` install path --
# When the user runs `curl -fsSL .../install.sh | bash`, there is no local
# checkout of the repo for the rest of the script to read pwa/ from (and no
# scripts/start-ollama.sh to point the user at in the post-install message).
#
# Detect that case by checking whether $BASH_SOURCE (or $0) points at a real
# file that has a sibling pwa/ directory. If it doesn't, we're running from
# a pipe — pin the mirror, install git, clone the repo to ~/olladroid,
# and re-exec this script from the clone. The second invocation finds the
# pwa/ directory, skips this bootstrap block, and proceeds normally.
_INSTALL_SELF="${BASH_SOURCE[0]:-$0}"
if [ ! -f "$_INSTALL_SELF" ] || [ ! -d "$(dirname "$_INSTALL_SELF")/../pwa" ]; then
  info "No local checkout detected (curl | bash path). Bootstrapping..."
  info "This takes about 30-60 seconds on a fresh Termux. Progress below."

  # The mirror pin and `pkg install git` both need a working Termux APT
  # source, so pin the mirror FIRST. The full install will pin it again
  # after the re-exec; that's idempotent.
  TERMUX_PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
  echo 'deb https://packages-cf.termux.dev/apt/termux-main/ stable main' \
    > "$TERMUX_PREFIX/etc/apt/sources.list"
  # Show progress during pkg operations. The earlier draft silenced these
  # with >/dev/null which left the user staring at a blank terminal for ~45s
  # wondering if the install had hung. Real-device testing caught this.
  pkg update -y
  pkg install -y git

  REPO_DIR="$HOME/olladroid"
  if [ -d "$REPO_DIR/.git" ]; then
    info "Updating existing clone at $REPO_DIR"
    (cd "$REPO_DIR" && git fetch origin main && git reset --hard origin/main)
  else
    info "Cloning https://github.com/s1dd4rth/olladroid to $REPO_DIR"
    git clone --depth 1 https://github.com/s1dd4rth/olladroid "$REPO_DIR"
  fi

  ok "Bootstrap complete. Re-executing from $REPO_DIR/scripts/install-ollama.sh"
  echo ""
  exec bash "$REPO_DIR/scripts/install-ollama.sh" "$@"
fi

# -- Step 1b: Pin Termux to a known-good mirror BEFORE any pkg command --
# Termux picks a random mirror on first `pkg update`, and any given mirror can
# be broken on any given day — v0.2.0 validation hit a `mirror.textcord.xyz`
# that was returning a malformed clearsigned InRelease file, killing the
# install before step 2 could even begin. Pin to the official Cloudflare
# mirror (`packages-cf.termux.dev`), which is the most reliable global Termux
# mirror and is maintained by the Termux team. Idempotent — re-running the
# installer just rewrites the same line.
TERMUX_PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
info "Pinning Termux APT mirror to packages-cf.termux.dev..."
echo 'deb https://packages-cf.termux.dev/apt/termux-main/ stable main' \
  > "$TERMUX_PREFIX/etc/apt/sources.list"
ok "Mirror pinned"

# -- Step 2: Update Termux packages --
info "Updating Termux packages..."
pkg update -y && pkg upgrade -y
ok "Termux packages updated"

# -- Step 3: Install required Termux packages --
# proot-distro: runs Debian on Android (needed for glibc-linked Ollama)
# python:       runs a local static server for the PWA chat UI (--chat flag)
# iproute2:     provides the `ip` command used by start-ollama.sh for IP detection
# curl:         used by the PWA copy fallback to fetch the repo tarball from GitHub
info "Installing proot-distro, python, iproute2, curl..."
pkg install -y proot-distro python iproute2 curl
ok "Termux packages installed"

# -- Step 4: Install Debian --
# Detecting whether Debian is already installed is fiddly because proot-distro
# has changed its output format across versions. The plain `proot-distro list`
# command returns the *catalog of supported distros* on 4.x, not installed
# ones. Older versions annotated installed distros inline. We try several
# detection paths and, if all fail, fall back to running the install and
# treating the "already installed" error as success.
debian_already_installed() {
  # Path 1: newer proot-distro has a --installed flag that lists only installed
  # distros, one per line, possibly with ANSI colour codes. Match the alias.
  if proot-distro list --installed 2>/dev/null | grep -qiw debian; then
    return 0
  fi
  # Path 2: the installed rootfs lives at a well-known location under $PREFIX.
  # The exact directory name has been debian in every proot-distro version so
  # far; if upstream renames it to debian-trixie one day, add that here.
  if [ -d "$PREFIX/var/lib/proot-distro/installed-rootfs/debian" ]; then
    return 0
  fi
  return 1
}

info "Installing Debian via proot-distro..."
if debian_already_installed; then
  ok "Debian already installed"
else
  # Install — but capture output so we can distinguish a real failure from
  # the "already installed" error that slips through when both detection
  # paths above miss a version we don't know about.
  if debian_install_output="$(proot-distro install debian 2>&1)"; then
    ok "Debian installed"
  elif echo "$debian_install_output" | grep -qi "already installed"; then
    ok "Debian already installed (detected after install attempt)"
  else
    echo "$debian_install_output" >&2
    err "Debian installation failed"
  fi
fi

# -- Step 5: Install Ollama inside Debian --
info "Installing Ollama inside Debian..."
proot-distro login debian -- bash -c '
  set -e

  echo "Updating Debian packages..."
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates >/dev/null 2>&1

  echo "Downloading and installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh

  # Verify installation
  if command -v ollama &>/dev/null; then
    echo "Ollama installed successfully: $(ollama --version)"
  elif [ -f /usr/local/bin/ollama ]; then
    echo "Ollama installed at /usr/local/bin/ollama"
    # Ensure it is in PATH (idempotent — only append if not already present).
    if ! grep -q "/usr/local/bin" /root/.bashrc 2>/dev/null; then
      echo "export PATH=\$PATH:/usr/local/bin" >> /root/.bashrc
    fi
  else
    echo "ERROR: Ollama installation failed"
    exit 1
  fi
'
ok "Ollama installed inside Debian"

# -- Step 6: Copy PWA files to /sdcard so the chat UI can be served --
# The PWA needs to be served over http:// (not file://) for service workers to
# register. start-ollama.sh --chat spins up `python3 -m http.server` pointed at
# this directory. Primary source: the local repo checkout. Fallback: fetch the
# repo tarball from GitHub over HTTPS.
copy_pwa_files() {
  local target="/sdcard/olladroid/pwa"
  local repo_root
  repo_root="$(cd "$(dirname "$0")/.." && pwd)"

  info "Copying PWA files to $target..."
  mkdir -p "$target"

  if [ -d "$repo_root/pwa" ]; then
    cp -r "$repo_root/pwa/." "$target/"
    ok "PWA copied from local repo ($repo_root/pwa)"
    return 0
  fi

  # Fallback: script was run standalone (curl | bash path, or adb push of just
  # this one file). Fetch the repo tarball from GitHub. TLS verifies the
  # endpoint; the tarball itself is trusted. Document this in failure modes.
  info "No local pwa/ directory found, fetching from GitHub..."
  local tmp
  tmp="$(mktemp -d)"
  if curl -fsSL https://github.com/s1dd4rth/olladroid/archive/refs/heads/main.tar.gz \
        | tar xz -C "$tmp" 2>/dev/null; then
    cp -r "$tmp/olladroid-main/pwa/." "$target/"
    rm -rf "$tmp"
    ok "PWA downloaded and installed"
    return 0
  fi

  rm -rf "$tmp"
  warn "Could not fetch PWA. Chat UI will not be available until you copy pwa/ manually."
  return 1
}

copy_pwa_files || true

# -- Add bin/olladroid to PATH (idempotent) --
# The scaffolder CLI invocation is now `olladroid new <slug>` instead of
# `node cli/new.js --slug <slug> ...`. The wrapper lives at
# $REPO_ROOT/bin/olladroid, so add that directory to PATH in ~/.bashrc if
# it isn't already there. Idempotent: the marker string means re-running
# install-ollama.sh won't stack duplicate exports.
add_olladroid_to_path() {
  local repo_root
  repo_root="$(cd "$(dirname "$0")/.." && pwd)"
  local bin_dir="$repo_root/bin"
  local bashrc="$HOME/.bashrc"
  local marker="# olladroid: bin PATH"

  if [ ! -d "$bin_dir" ]; then
    info "bin/ not found at $bin_dir — skipping PATH setup"
    return 0
  fi
  touch "$bashrc"
  if grep -Fq "$marker" "$bashrc" 2>/dev/null; then
    info "bin/olladroid already on PATH via ~/.bashrc"
    return 0
  fi
  {
    echo ""
    echo "$marker"
    echo "export PATH=\"$bin_dir:\$PATH\""
  } >> "$bashrc"
  ok "Added $bin_dir to PATH in ~/.bashrc"
  info "Run \`source ~/.bashrc\` (or open a new Termux session) to pick it up"
}

add_olladroid_to_path || true

# -- Done --
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo -e "${BOLD}======================================${NC}"
echo -e "${GREEN}  INSTALLATION COMPLETE${NC}"
echo -e "${BOLD}======================================${NC}"
echo ""
echo "  To start the Ollama server + chat UI:"
echo "    bash ${SCRIPTS_DIR}/start-ollama.sh --wifi --chat"
echo ""
echo "  Or just the server (no UI):"
echo "    bash ${SCRIPTS_DIR}/start-ollama.sh --wifi"
echo ""
echo "  To install shell aliases (ollama-start, ollama-chat, ...):"
echo "    bash ${SCRIPTS_DIR}/setup-autostart.sh"
echo ""
echo "  Pull a model:"
echo "    proot-distro login debian -- ollama pull qwen2.5:1.5b"
echo ""
echo -e "  ${YELLOW}Recommended models for phones:${NC}"
echo "    qwen2.5:1.5b  — Best quality for 4-6GB RAM"
echo "    gemma3:1b      — Google, good for simple tasks"
echo "    smollm2:360m   — Ultra-light, basic tasks"
echo ""
