#!/usr/bin/env bash
# ============================================================================
# debloat.sh — Vendor-aware, manifest-driven debloat for Android phones
#
# Reads plain-text package manifests from ../debloat/ and removes the listed
# packages via ADB. Auto-detects the phone's manufacturer and picks the
# matching vendor manifest; opt-in category manifests (social, games,
# google-apps) are loaded by default and can be toggled with --category /
# --no-categories / --skip-categories.
#
# All removals are reversible with `--restore` or
# `adb shell cmd package install-existing <package>`.
#
# Usage:
#   ./debloat.sh                          # dry-run is safer — see --dry-run
#   ./debloat.sh --dry-run                # preview without changes
#   ./debloat.sh --restore                # reinstall EVERY manifest-listed
#                                         # package that is currently uninstalled
#                                         # (v0.1.0 parity — this is NOT the
#                                         #  inverse of a single previous run;
#                                         #  for that, use --restore-from)
#   ./debloat.sh --restore-from r.json    # precise undo: reinstall ONLY the
#                                         # packages listed in a previous
#                                         # --save-report file
#   ./debloat.sh --vendor samsung         # override auto-detected manufacturer
#   ./debloat.sh --list                   # list available manifests and exit
#   ./debloat.sh --category games,lge     # load only these manifests
#   ./debloat.sh --no-categories          # vendor manifest only
#   ./debloat.sh --skip-categories google-apps  # drop google-apps from default
#   ./debloat.sh --save-report report.json      # write machine-readable result
# ============================================================================

set -euo pipefail

# -- Colors --
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# -- Resolve debloat/ directory relative to this script --
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEBLOAT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/debloat"
if [ ! -d "$DEBLOAT_DIR" ]; then
  err "debloat/ directory not found at $DEBLOAT_DIR. Run from a checkout of the ollama-pocket repo."
fi

# -- Default flags --
DRY_RUN=false
RESTORE=false
LIST_ONLY=false
OVERRIDE_VENDOR=""
SAVE_REPORT=""
RESTORE_FROM=""
# Default categories loaded alongside the detected vendor. Matches v0.1.0
# behaviour on LG (games + social + google-apps removed).
DEFAULT_CATEGORIES="social,games,google-apps"
INCLUDE_CATEGORIES="$DEFAULT_CATEGORIES"
SKIP_CATEGORIES=""

show_help() {
  sed -n '3,23p' "$0" | sed 's/^# \{0,1\}//'
}

# -- Parse flags --
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --restore) RESTORE=true ;;
    --list) LIST_ONLY=true ;;
    --vendor)
      [ $# -lt 2 ] && err "--vendor requires a value (e.g. --vendor samsung)"
      OVERRIDE_VENDOR="$2"; shift
      ;;
    --category)
      [ $# -lt 2 ] && err "--category requires a value (e.g. --category games,social)"
      INCLUDE_CATEGORIES="$2"; shift
      ;;
    --no-categories) INCLUDE_CATEGORIES="" ;;
    --skip-categories)
      [ $# -lt 2 ] && err "--skip-categories requires a value"
      SKIP_CATEGORIES="$2"; shift
      ;;
    --save-report)
      [ $# -lt 2 ] && err "--save-report requires a file path"
      SAVE_REPORT="$2"; shift
      ;;
    --restore-from)
      [ $# -lt 2 ] && err "--restore-from requires a report file path"
      RESTORE_FROM="$2"; shift
      RESTORE=true
      ;;
    -h|--help) show_help; exit 0 ;;
    *) err "unknown flag: $1 (try --help)" ;;
  esac
  shift
done

# -- --list: show available manifests and exit (no ADB needed) --
if $LIST_ONLY; then
  echo -e "${BOLD}Available debloat manifests in $DEBLOAT_DIR:${NC}"
  echo ""
  found_any=false
  for f in "$DEBLOAT_DIR"/*.txt; do
    [ ! -f "$f" ] && continue
    found_any=true
    name="$(basename "$f" .txt)"
    count=$(grep -cvE '^[[:space:]]*(#|$)' "$f" || true)
    verified=$(grep -m1 -E '^[[:space:]]*#[[:space:]]*Verified on' "$f" | sed 's/^[[:space:]]*#[[:space:]]*//' || true)
    printf "  ${CYAN}%-16s${NC} %3d packages" "$name" "$count"
    if [ -n "$verified" ]; then
      printf "  ${DIM}(%s)${NC}" "$verified"
    fi
    echo ""
  done
  $found_any || warn "No manifests found in $DEBLOAT_DIR."
  echo ""
  echo -e "${DIM}Use --category <name,...> to select, or --vendor <name> to override detection.${NC}"
  exit 0
fi

# -- Check ADB --
command -v adb >/dev/null 2>&1 || err "adb not found. Install Android SDK Platform Tools."
adb get-state >/dev/null 2>&1 || err "No device connected. Enable USB debugging and connect your phone."

# -- Detect vendor from ro.product.manufacturer --
MANUFACTURER_RAW=$(adb shell getprop ro.product.manufacturer 2>/dev/null | tr -d '\r')
MANUFACTURER=$(echo "$MANUFACTURER_RAW" | tr '[:upper:]' '[:lower:]' | xargs)
MODEL_RAW=$(adb shell getprop ro.product.model 2>/dev/null | tr -d '\r' | xargs)
ANDROID_VERSION=$(adb shell getprop ro.build.version.release 2>/dev/null | tr -d '\r' | xargs)

if [ -n "$OVERRIDE_VENDOR" ]; then
  VENDOR="$OVERRIDE_VENDOR"
else
  # Map common ro.product.manufacturer values to manifest file basenames.
  case "$MANUFACTURER" in
    lge|lg)            VENDOR="lge" ;;
    samsung)           VENDOR="samsung" ;;
    xiaomi|redmi|poco) VENDOR="xiaomi" ;;
    google)            VENDOR="pixel" ;;
    motorola|moto)     VENDOR="motorola" ;;
    oneplus)           VENDOR="oneplus" ;;
    oppo)              VENDOR="oppo" ;;
    realme)            VENDOR="realme" ;;
    *)                 VENDOR="$MANUFACTURER" ;;
  esac
fi

# -- Resolve which files to load (only when not in --restore-from mode) --
FILES_TO_LOAD=()
FILE_LABELS=()
VENDOR_LOADED=false

if [ -z "$RESTORE_FROM" ]; then
  add_file() {
    local label="$1"
    local path="$2"
    if [ -f "$path" ]; then
      FILES_TO_LOAD+=("$path")
      FILE_LABELS+=("$label")
      return 0
    fi
    return 1
  }

  if add_file "vendor:$VENDOR" "$DEBLOAT_DIR/$VENDOR.txt"; then
    VENDOR_LOADED=true
  fi

  # Filter out skipped categories.
  SKIP_RE=""
  if [ -n "$SKIP_CATEGORIES" ]; then
    SKIP_RE="${SKIP_CATEGORIES//,/|}"
  fi

  IFS=',' read -r -a _CATS <<< "$INCLUDE_CATEGORIES"
  for cat in "${_CATS[@]}"; do
    cat="$(echo "$cat" | xargs)"
    [ -z "$cat" ] && continue
    if [ -n "$SKIP_RE" ] && echo "$cat" | grep -qE "^($SKIP_RE)$"; then
      continue
    fi
    if ! add_file "category:$cat" "$DEBLOAT_DIR/$cat.txt"; then
      warn "Category '$cat' has no manifest at $DEBLOAT_DIR/$cat.txt, skipping."
    fi
  done
fi

# -- Banner --
echo -e "${BOLD}"
echo "  ┌──────────────────────────────────────┐"
if $DRY_RUN; then
  echo "  │   DEBLOAT — DRY RUN (no changes)     │"
elif $RESTORE; then
  echo "  │   DEBLOAT — RESTORE MODE             │"
else
  echo "  │   DEBLOAT — REMOVING PACKAGES        │"
fi
echo "  └──────────────────────────────────────┘"
echo -e "${NC}"

info "Device:       $MODEL_RAW ($MANUFACTURER_RAW), Android $ANDROID_VERSION"
if [ -n "$OVERRIDE_VENDOR" ]; then
  info "Vendor:       $VENDOR ${DIM}(override)${NC}"
else
  info "Vendor:       $VENDOR ${DIM}(auto-detected from ro.product.manufacturer)${NC}"
fi
if [ -z "$RESTORE_FROM" ]; then
  if ! $VENDOR_LOADED; then
    warn "No vendor manifest at $DEBLOAT_DIR/$VENDOR.txt."
    warn "See debloat/README.md to contribute a list for this device."
  fi
  if [ "${#FILES_TO_LOAD[@]}" -eq 0 ]; then
    err "No manifests to load. Nothing to do."
  fi
  info "Manifests:"
  for label in "${FILE_LABELS[@]}"; do
    echo -e "  ${CYAN}→${NC} $label"
  done
else
  info "Restore source:"
  echo -e "  ${CYAN}→${NC} ${RESTORE_FROM}"
fi
echo ""

# -- Read packages from manifests --
# Parse: strip leading whitespace, skip `#` comments and blank lines, keep
# only the first whitespace-separated token so inline `com.foo  # note`
# comments work.
parse_manifest() {
  local f="$1"
  awk '
    /^[[:space:]]*(#|$)/ { next }
    { print $1 }
  ' "$f"
}

# Pull the "removed" array out of a --save-report JSON file.
# The JSON is written by this script itself with a known, single-line array
# shape — portable shell grep+sed is enough, no python dependency required.
extract_removed_from_report() {
  local report="$1"
  # Match the details.removed line which looks like:
  #   "removed": ["com.foo","com.bar","com.baz"],
  # The summary.removed line is an integer and has no `[`, so we only match
  # the array form.
  grep '"removed":[[:space:]]*\[' "$report" \
    | sed -e 's/.*\[//' -e 's/\].*//' -e 's/"//g' -e 's/,[[:space:]]*/\n/g' \
    | awk 'NF > 0'
}

ALL_PACKAGES=()
if [ -n "$RESTORE_FROM" ]; then
  # Precise-undo path: load only the packages that were removed by a previous
  # --save-report run. Ignore the manifests entirely for this session.
  [ ! -f "$RESTORE_FROM" ] && err "Report file not found: $RESTORE_FROM"
  info "Loading restore list from $RESTORE_FROM"
  while IFS= read -r pkg; do
    [ -z "$pkg" ] && continue
    ALL_PACKAGES+=("$pkg")
  done < <(extract_removed_from_report "$RESTORE_FROM")
  if [ "${#ALL_PACKAGES[@]}" -eq 0 ]; then
    err "No 'removed' entries found in $RESTORE_FROM (is it a --save-report file?)"
  fi
  # Reset labels for the report so the provenance is obvious
  FILE_LABELS=("restore-from:$(basename "$RESTORE_FROM")")
else
  # Normal path: load from manifests
  for f in "${FILES_TO_LOAD[@]}"; do
    while IFS= read -r pkg; do
      [ -z "$pkg" ] && continue
      ALL_PACKAGES+=("$pkg")
    done < <(parse_manifest "$f")
  done
fi

# De-dupe while preserving order. `awk '!seen[$0]++'` is the classic
# portable one-liner for this and works on any awk, including BusyBox.
# Avoids bash associative arrays so the script runs on bash 3.2 (macOS
# /bin/bash) as well as modern bash on Termux.
UNIQUE_PACKAGES=()
while IFS= read -r p; do
  [ -n "$p" ] && UNIQUE_PACKAGES+=("$p")
done < <(printf '%s\n' "${ALL_PACKAGES[@]}" | awk '!seen[$0]++')

info "Total unique packages: ${#UNIQUE_PACKAGES[@]}"
echo ""

# -- Build the installed-packages set once (one ADB call, not one per pkg) --
INSTALLED_TXT="$(adb shell pm list packages 2>/dev/null | tr -d '\r' | sed 's/^package://')"

pkg_is_installed() {
  echo "$INSTALLED_TXT" | grep -qxF "$1"
}

# -- Process each package --
REMOVED_LIST=()
SKIPPED_LIST=()
FAILED_LIST=()

for pkg in "${UNIQUE_PACKAGES[@]}"; do
  if $RESTORE; then
    # Try to restore, whether or not it's currently installed (installed ones
    # become a no-op in install-existing).
    if $DRY_RUN; then
      echo -e "  ${DIM}Would restore:${NC} $pkg"
      REMOVED_LIST+=("$pkg")
    else
      if adb shell cmd package install-existing "$pkg" 2>/dev/null | grep -q 'installed for user'; then
        echo -e "  ${GREEN}Restored:${NC} $pkg"
        REMOVED_LIST+=("$pkg")
      else
        echo -e "  ${DIM}Not found / already present:${NC} $pkg"
        SKIPPED_LIST+=("$pkg")
      fi
    fi
    continue
  fi

  # Removal path.
  if ! pkg_is_installed "$pkg"; then
    echo -e "  ${DIM}Not installed:${NC} $pkg"
    SKIPPED_LIST+=("$pkg")
    continue
  fi

  if $DRY_RUN; then
    echo -e "  ${YELLOW}Would remove:${NC} $pkg"
    REMOVED_LIST+=("$pkg")
  else
    if adb shell pm uninstall -k --user 0 "$pkg" 2>/dev/null | grep -q Success; then
      echo -e "  ${GREEN}Removed:${NC} $pkg"
      REMOVED_LIST+=("$pkg")
    else
      echo -e "  ${RED}Failed:${NC} $pkg"
      FAILED_LIST+=("$pkg")
    fi
  fi
done

echo ""

# -- Summary --
REMOVED_COUNT=${#REMOVED_LIST[@]}
SKIPPED_COUNT=${#SKIPPED_LIST[@]}
FAILED_COUNT=${#FAILED_LIST[@]}

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if $DRY_RUN; then
  echo -e "  ${YELLOW}DRY RUN COMPLETE${NC}"
  echo -e "  Would process: ${REMOVED_COUNT}"
  echo -e "  Not installed: ${SKIPPED_COUNT}"
elif $RESTORE; then
  echo -e "  ${GREEN}Restored:${NC} ${REMOVED_COUNT}"
  echo -e "  Skipped:  ${SKIPPED_COUNT}"
else
  echo -e "  ${GREEN}Removed:${NC} ${REMOVED_COUNT}"
  echo -e "  Skipped (not installed): ${SKIPPED_COUNT}"
  [ "$FAILED_COUNT" -gt 0 ] && echo -e "  ${RED}Failed:${NC} ${FAILED_COUNT}"
fi
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${DIM}To restore any package:${NC}"
echo -e "  adb shell cmd package install-existing <package>"
echo -e "${DIM}Or to restore everything this script removed:${NC}"
echo -e "  $(basename "$0") --restore"

# -- Write JSON report if requested --
if [ -n "$SAVE_REPORT" ]; then
  mode="remove"
  $DRY_RUN && mode="dry-run"
  $RESTORE && mode="restore"
  $DRY_RUN && $RESTORE && mode="dry-run-restore"

  # Package names are [a-z0-9._], so no JSON escaping needed. Other string
  # fields may contain spaces but no special chars in practice — still safe.
  json_array() {
    local first=true
    printf '['
    for item in "$@"; do
      if $first; then first=false; else printf ','; fi
      printf '"%s"' "$item"
    done
    printf ']'
  }

  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  {
    printf '{\n'
    printf '  "timestamp": "%s",\n' "$timestamp"
    printf '  "mode": "%s",\n' "$mode"
    printf '  "device": {\n'
    printf '    "manufacturer": "%s",\n' "$MANUFACTURER_RAW"
    printf '    "model": "%s",\n' "$MODEL_RAW"
    printf '    "android_version": "%s"\n' "$ANDROID_VERSION"
    printf '  },\n'
    printf '  "vendor": "%s",\n' "$VENDOR"
    printf '  "vendor_manifest_loaded": %s,\n' "$($VENDOR_LOADED && echo true || echo false)"
    printf '  "manifests": '
    json_array "${FILE_LABELS[@]+"${FILE_LABELS[@]}"}"
    printf ',\n'
    printf '  "summary": {\n'
    printf '    "total": %d,\n' "${#UNIQUE_PACKAGES[@]}"
    printf '    "removed": %d,\n' "$REMOVED_COUNT"
    printf '    "skipped": %d,\n' "$SKIPPED_COUNT"
    printf '    "failed": %d\n' "$FAILED_COUNT"
    printf '  },\n'
    printf '  "details": {\n'
    printf '    "removed": '
    json_array "${REMOVED_LIST[@]+"${REMOVED_LIST[@]}"}"
    printf ',\n'
    printf '    "skipped": '
    json_array "${SKIPPED_LIST[@]+"${SKIPPED_LIST[@]}"}"
    printf ',\n'
    printf '    "failed": '
    json_array "${FAILED_LIST[@]+"${FAILED_LIST[@]}"}"
    printf '\n'
    printf '  }\n'
    printf '}\n'
  } > "$SAVE_REPORT"
  echo ""
  ok "Report written to $SAVE_REPORT"
fi

# Exit non-zero if any removals failed (not a dry-run, not a restore).
if ! $DRY_RUN && ! $RESTORE && [ "$FAILED_COUNT" -gt 0 ]; then
  exit 2
fi
