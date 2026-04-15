#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
# setup-autostart.sh — Set up aliases and optional Termux boot config
#
# Creates convenient aliases so you can type:
#   ollama-start        — Start the Ollama server
#   ollama-start-wifi   — Start with WiFi access
#   ollama-chat         — Start server + open chat UI
#   ollama-run          — Run a model in the terminal
#
# Usage:
#   bash setup-autostart.sh
# ============================================================================

set -euo pipefail

# -- Colors --
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}"
echo "  ┌──────────────────────────────────────┐"
echo "  │       SETTING UP ALIASES              │"
echo "  └──────────────────────────────────────┘"
echo -e "${NC}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHELL_RC="$HOME/.bashrc"

# Use .zshrc if zsh is the default shell
if [ -n "${ZSH_VERSION:-}" ] || [ "$(basename "$SHELL")" = "zsh" ]; then
  SHELL_RC="$HOME/.zshrc"
fi

# -- Add aliases (idempotent) --
MARKER="# olladroid aliases"

if grep -q "$MARKER" "$SHELL_RC" 2>/dev/null; then
  echo -e "${YELLOW}Aliases already configured in $SHELL_RC${NC}"
else
  cat >> "$SHELL_RC" << EOF

$MARKER
alias ollama-start='bash ${SCRIPT_DIR}/start-ollama.sh'
alias ollama-start-wifi='bash ${SCRIPT_DIR}/start-ollama.sh --wifi'
alias ollama-chat='bash ${SCRIPT_DIR}/start-ollama.sh --wifi --chat'
alias ollama-run='proot-distro login debian -- bash -c "export PATH=\\\$PATH:/usr/local/bin && ollama run \$1"'
EOF
  echo -e "${GREEN}Aliases added to $SHELL_RC${NC}"
fi

echo ""
echo -e "  Available commands (after restarting shell or running ${CYAN}source $SHELL_RC${NC}):"
echo ""
echo -e "    ${CYAN}ollama-start${NC}        Start server (localhost)"
echo -e "    ${CYAN}ollama-start-wifi${NC}   Start server (WiFi access)"
echo -e "    ${CYAN}ollama-chat${NC}         Start server + open chat UI"
echo -e "    ${CYAN}ollama-run${NC}          Run a model interactively"
echo ""

# -- Optional: Termux:Boot auto-start --
echo -e "${BOLD}Optional: Auto-start on boot${NC}"
echo ""

BOOT_DIR="$HOME/.termux/boot"
if [ -d "$BOOT_DIR" ]; then
  echo -e "${YELLOW}Termux:Boot directory already exists${NC}"
else
  echo -e "To auto-start Ollama when Termux opens:"
  echo -e "  1. Install ${CYAN}Termux:Boot${NC} from F-Droid"
  echo -e "  2. Run: ${CYAN}mkdir -p ~/.termux/boot${NC}"
  echo -e "  3. Then run this script again"
  echo ""
fi

if [ -d "$BOOT_DIR" ]; then
  BOOT_SCRIPT="$BOOT_DIR/start-ollama.sh"
  if [ -f "$BOOT_SCRIPT" ]; then
    echo -e "${YELLOW}Boot script already exists at $BOOT_SCRIPT${NC}"
  else
    cat > "$BOOT_SCRIPT" << EOF
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
bash ${SCRIPT_DIR}/start-ollama.sh --wifi
EOF
    chmod +x "$BOOT_SCRIPT"
    echo -e "${GREEN}Boot script created at $BOOT_SCRIPT${NC}"
    echo -e "  Ollama will auto-start when Termux launches."
  fi
fi

echo ""
echo -e "${GREEN}Setup complete.${NC}"
echo -e "Run ${CYAN}source $SHELL_RC${NC} to activate aliases now."
