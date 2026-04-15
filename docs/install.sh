#!/usr/bin/env bash
# docs/install.sh — bootstrap redirector served at:
#   https://s1dd4rth.github.io/olladroid/install.sh
#
# Fetches the real install-ollama.sh from the main branch and runs it.
# Exists so users can paste ONE pretty URL into Termux instead of a raw
# GitHub link. The real script handles its own self-bootstrap (clone
# repo, re-exec from local copy).
#
# Usage (inside Termux):
#   curl -fsSL https://s1dd4rth.github.io/olladroid/install.sh | bash

set -euo pipefail

REAL_URL="https://raw.githubusercontent.com/s1dd4rth/olladroid/main/scripts/install-ollama.sh"

echo "[bootstrap] fetching $REAL_URL"
exec bash <(curl -fsSL "$REAL_URL")
