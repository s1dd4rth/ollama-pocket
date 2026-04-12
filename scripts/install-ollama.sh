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

# -- Step 3: Install proot-distro --
info "Installing proot-distro..."
if command -v proot-distro &>/dev/null; then
  ok "proot-distro already installed"
else
  pkg install -y proot-distro
  ok "proot-distro installed"
fi

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
    # Ensure it is in PATH
    echo "export PATH=\$PATH:/usr/local/bin" >> /root/.bashrc
  else
    echo "ERROR: Ollama installation failed"
    exit 1
  fi
'
ok "Ollama installed inside Debian"

# -- Step 6: Create convenience script --
info "Creating start script..."
cat > "$HOME/start-ollama.sh" << 'SCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
# Start Ollama server inside Debian proot
echo "Starting Ollama server..."
echo "Access the API at: http://localhost:11434"
echo "Press Ctrl+C to stop."
echo ""
proot-distro login debian -- bash -c 'export PATH=$PATH:/usr/local/bin && ollama serve'
SCRIPT
chmod +x "$HOME/start-ollama.sh"
ok "Start script created at ~/start-ollama.sh"

# -- Done --
echo ""
echo -e "${BOLD}======================================${NC}"
echo -e "${GREEN}  INSTALLATION COMPLETE${NC}"
echo -e "${BOLD}======================================${NC}"
echo ""
echo "  To start the Ollama server:"
echo "    bash ~/start-ollama.sh"
echo ""
echo "  Then in a new Termux session, pull a model:"
echo "    proot-distro login debian -- ollama pull qwen2.5:1.5b"
echo ""
echo "  Or chat directly:"
echo "    proot-distro login debian -- ollama run qwen2.5:1.5b"
echo ""
echo -e "  ${YELLOW}Recommended models for phones:${NC}"
echo "    qwen2.5:1.5b  — Best quality for 4-6GB RAM"
echo "    gemma3:1b      — Google, good for simple tasks"
echo "    smollm2:360m   — Ultra-light, basic tasks"
echo ""
