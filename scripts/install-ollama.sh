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
info "Installing Debian via proot-distro..."
if proot-distro list 2>/dev/null | grep -q "debian.*installed"; then
  ok "Debian already installed"
else
  proot-distro install debian
  ok "Debian installed"
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

  # Fallback: script was run standalone (curl | bash path, or adb push of just
  # this one file). Fetch the repo tarball from GitHub. TLS verifies the
  # endpoint; the tarball itself is trusted. Document this in failure modes.
  info "No local pwa/ directory found, fetching from GitHub..."
  local tmp
  tmp="$(mktemp -d)"
  if curl -fsSL https://github.com/s1dd4rth/ollama-pocket/archive/refs/heads/main.tar.gz \
        | tar xz -C "$tmp" 2>/dev/null; then
    cp -r "$tmp/ollama-pocket-main/pwa/." "$target/"
    rm -rf "$tmp"
    ok "PWA downloaded and installed"
    return 0
  fi

  rm -rf "$tmp"
  warn "Could not fetch PWA. Chat UI will not be available until you copy pwa/ manually."
  return 1
}

copy_pwa_files || true

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
