#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
# start-ollama.sh — One-command startup for Ollama server + chat UI
#
# Starts the Ollama server inside Debian proot. With --wifi, Ollama listens on
# all interfaces so any device on your LAN can hit the API. With --chat, a
# local Python HTTP server serves the PWA at http://localhost:8000 and Chrome
# is launched to open it — this is required for service workers to register
# (service workers do not run on file:// origins).
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
      echo "  --chat   Serve the PWA on :8000 and open Chrome"
      exit 0
      ;;
  esac
done

# -- Check proot-distro --
if ! command -v proot-distro &>/dev/null; then
  echo -e "${RED}Error: proot-distro not found. Run install-ollama.sh first.${NC}"
  exit 1
fi

# -- Get local IP (portable: ip -o + awk, no GNU grep -P required) --
LOCAL_IP=$(ip -4 -o addr show wlan0 2>/dev/null | awk '{print $4}' | cut -d/ -f1)
[ -z "$LOCAL_IP" ] && LOCAL_IP="unknown"

# -- Bind addresses: localhost by default, 0.0.0.0 with --wifi. The binding is
#    symmetric for Ollama (:11434) and the PWA server (:8000) so the mental
#    model matches what --wifi already means for the API. --
if $WIFI; then
  OLLAMA_HOST="0.0.0.0"
  BIND_ADDR="0.0.0.0"
else
  OLLAMA_HOST="127.0.0.1"
  BIND_ADDR="127.0.0.1"
fi

# -- PWA server state (used by --chat) --
PWA_DIR="/sdcard/olladroid/pwa"
PWA_PORT=8000
PYTHON_PID=""

# Clean up the background Python server on any exit path.
cleanup() {
  if [ -n "${PYTHON_PID:-}" ] && kill -0 "$PYTHON_PID" 2>/dev/null; then
    kill "$PYTHON_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Start the static PWA server and wait for the port to actually be listening
# before returning. A plain `sleep 0.3` race-conditions with Chrome on slow
# devices — if Chrome beats the bind, the first load fails and there is no
# service worker to recover from it. Poll with curl until the port responds.
start_pwa_server() {
  if [ ! -d "$PWA_DIR" ]; then
    echo -e "  ${YELLOW}PWA not found at $PWA_DIR${NC}"
    echo -e "  ${DIM}Re-run install-ollama.sh to provision the PWA.${NC}"
    return 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo -e "  ${YELLOW}python3 not found. Install with: pkg install python${NC}"
    return 1
  fi

  python3 -m http.server "$PWA_PORT" \
    --bind "$BIND_ADDR" \
    --directory "$PWA_DIR" >/dev/null 2>&1 &
  PYTHON_PID=$!

  local waited=0
  while [ "$waited" -lt 20 ]; do
    if ! kill -0 "$PYTHON_PID" 2>/dev/null; then
      echo -e "  ${YELLOW}PWA server died during startup (port $PWA_PORT in use?)${NC}"
      PYTHON_PID=""
      return 1
    fi
    if curl -sf "http://127.0.0.1:${PWA_PORT}/" -o /dev/null 2>/dev/null; then
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

echo -e "${BOLD}"
echo "  ┌──────────────────────────────────────┐"
echo "  │          OLLAMA SERVER                │"
echo "  └──────────────────────────────────────┘"
echo -e "${NC}"

if $WIFI; then
  echo -e "  ${GREEN}Mode:${NC}  WiFi (all interfaces)"
  echo -e "  ${GREEN}Local:${NC} http://localhost:11434"
  echo -e "  ${GREEN}WiFi:${NC}  http://${LOCAL_IP}:11434"
else
  echo -e "  ${GREEN}Mode:${NC}  Local only"
  echo -e "  ${GREEN}URL:${NC}   http://localhost:11434"
fi

# -- Start PWA server and open Chrome, if requested --
if $OPEN_CHAT; then
  if start_pwa_server; then
    echo -e "  ${GREEN}PWA:${NC}   http://${LOCAL_IP}:${PWA_PORT}/chat.html"
    # Force Chrome specifically via -p com.android.chrome. The user's default
    # browser might be Samsung Internet or Firefox, which either do not support
    # service workers on localhost or throw up a chooser sheet that blocks the
    # launch. If Chrome is not installed, am start returns non-zero and we
    # fall through to printing the URL for manual copy.
    if am start -a android.intent.action.VIEW \
         -d "http://localhost:${PWA_PORT}/chat.html" \
         -p com.android.chrome >/dev/null 2>&1; then
      echo -e "  ${CYAN}Opening chat UI in Chrome...${NC}"
    else
      echo -e "  ${YELLOW}Could not launch Chrome automatically.${NC}"
      echo -e "  ${DIM}Open this URL in Chrome manually:${NC}"
      echo -e "  ${CYAN}http://localhost:${PWA_PORT}/chat.html${NC}"
    fi
  fi
fi

echo ""
echo -e "  ${DIM}Press Ctrl+C to stop${NC}"
echo ""

# -- Start Ollama in the foreground. Ctrl+C bubbles up to trap cleanup(). --
proot-distro login debian -- bash -c "
  export PATH=\$PATH:/usr/local/bin
  export OLLAMA_HOST=${OLLAMA_HOST}
  ollama serve
"
