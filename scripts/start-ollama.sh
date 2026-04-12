#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
# start-ollama.sh — One-command startup for Ollama server + chat UI
#
# Starts the Ollama server inside Debian proot, accessible on all interfaces
# so any device on your WiFi can use it.
#
# Usage:
#   bash start-ollama.sh                    # Start server (localhost only)
#   bash start-ollama.sh --wifi             # Start server on all interfaces
#   bash start-ollama.sh --wifi --chat      # Start server + open chat UI
# ============================================================================

set -euo pipefail

# -- Colors --
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

WIFI=false
OPEN_CHAT=false

for arg in "$@"; do
  case "$arg" in
    --wifi) WIFI=true ;;
    --chat) OPEN_CHAT=true ;;
    -h|--help)
      echo "Usage: $0 [--wifi] [--chat]"
      echo "  --wifi   Listen on all interfaces (WiFi access)"
      echo "  --chat   Open PWA chat UI in Chrome after starting"
      exit 0
      ;;
  esac
done

# -- Check proot-distro --
if ! command -v proot-distro &>/dev/null; then
  echo -e "${RED}Error: proot-distro not found. Run install-ollama.sh first.${NC}"
  exit 1
fi

# -- Get local IP --
LOCAL_IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || echo "unknown")

echo -e "${BOLD}"
echo "  ┌─────────────────────���────────────────┐"
echo "  │          OLLAMA SERVER                │"
echo "  └──────────────────────────────────────┘"
echo -e "${NC}"

if $WIFI; then
  OLLAMA_HOST="0.0.0.0"
  echo -e "  ${GREEN}Mode:${NC}  WiFi (all interfaces)"
  echo -e "  ${GREEN}Local:${NC} http://localhost:11434"
  echo -e "  ${GREEN}WiFi:${NC}  http://${LOCAL_IP}:11434"
else
  OLLAMA_HOST="127.0.0.1"
  echo -e "  ${GREEN}Mode:${NC}  Local only"
  echo -e "  ${GREEN}URL:${NC}   http://localhost:11434"
fi

echo ""
echo -e "  ${DIM}Press Ctrl+C to stop${NC}"
echo ""

# -- Open chat UI if requested --
if $OPEN_CHAT; then
  # Check if chat.html exists on sdcard
  if [ -f "/sdcard/ollama-pocket/pwa/chat.html" ]; then
    am start -a android.intent.action.VIEW \
      -d "file:///sdcard/ollama-pocket/pwa/chat.html" \
      -t "text/html" 2>/dev/null &
    echo -e "  ${CYAN}Opening chat UI...${NC}"
  else
    echo -e "  ${YELLOW}Chat UI not found at /sdcard/ollama-pocket/pwa/chat.html${NC}"
    echo -e "  ${DIM}Copy the pwa/ folder to /sdcard/ollama-pocket/pwa/${NC}"
  fi
  echo ""
fi

# -- Start Ollama --
proot-distro login debian -- bash -c "
  export PATH=\$PATH:/usr/local/bin
  export OLLAMA_HOST=${OLLAMA_HOST}
  ollama serve
"
