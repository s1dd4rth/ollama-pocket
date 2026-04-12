#!/usr/bin/env bash
# ============================================================================
# debloat.sh — Safe, reversible debloat for Android phones via ADB
#
# Removes bloatware to free RAM for Ollama. All removals are reversible
# with: adb shell cmd package install-existing <package>
#
# Usage:
#   ./debloat.sh              # Remove bloatware
#   ./debloat.sh --dry-run    # Preview what would be removed
#   ./debloat.sh --restore    # Restore all removed packages
# ============================================================================

set -euo pipefail

# -- Colors --
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

DRY_RUN=false
RESTORE=false
REMOVED=0
SKIPPED=0
FAILED=0

# -- Parse args --
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --restore) RESTORE=true ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--restore]"
      echo "  --dry-run   Preview removals without executing"
      echo "  --restore   Restore previously removed packages"
      exit 0
      ;;
  esac
done

# -- Check ADB --
if ! command -v adb &>/dev/null; then
  echo -e "${RED}Error: adb not found. Install Android SDK Platform Tools.${NC}"
  exit 1
fi

if ! adb get-state &>/dev/null; then
  echo -e "${RED}Error: No device connected. Enable USB debugging and connect your phone.${NC}"
  exit 1
fi

echo -e "${BOLD}======================================${NC}"
if $DRY_RUN; then
  echo -e "${YELLOW}  DEBLOAT — DRY RUN (no changes)${NC}"
elif $RESTORE; then
  echo -e "${GREEN}  DEBLOAT — RESTORE MODE${NC}"
else
  echo -e "${CYAN}  DEBLOAT — REMOVING BLOATWARE${NC}"
fi
echo -e "${BOLD}======================================${NC}"
echo ""

# -- Package lists by category --

declare -A CATEGORIES

CATEGORIES[Games]="
com.gameloft.android.GN.GLOFTGGHM
com.gameloft.android.ANMP.GlsoftAsphal
com.gameloft.android.ANMP.GloftR4HM
com.gameloft.android.ANMP.GloftSGHM
"

CATEGORIES[Social]="
com.facebook.katana
com.facebook.orca
com.facebook.system
com.facebook.appmanager
com.facebook.services
com.instagram.android
com.booking
"

CATEGORIES[LG_Bloatware]="
com.lge.smartworld
com.lge.lgworld
com.lge.qmemoplus
com.lge.bnr
com.lge.email
com.lge.emailcommon
com.lge.gamepad
com.lge.ime
com.lge.sizechangable.weather
com.lge.theme.highcontrast
com.lge.theme.white
com.lge.themesettings
com.lge.qhelp
com.lge.wfds.service.v2
com.lge.smartdoctor
com.lge.camera.front.overlay
com.lge.dualscreen.dualplay
com.lge.dualscreen.guide
com.lge.update
com.lge.updatecenter
com.lge.appbox.client
com.lge.appbox.bridge
com.lge.sso
com.lge.pushservice
com.lge.euicc
com.lge.ia
com.lge.ia.task
com.lge.aiwallpaper
com.lge.clock
com.lge.ava
com.lge.avphoto
com.lge.avnavi
com.lge.avskin
com.lge.hifi.player
com.lge.music
com.lge.musiclink
com.lge.hificam
com.lge.provider.signboard
com.lge.launcher3
com.lge.launcher.theme
com.lge.sticker.provider
"

CATEGORIES[Google_Apps]="
com.google.android.apps.docs
com.google.android.apps.docs.editors.docs
com.google.android.apps.docs.editors.sheets
com.google.android.apps.docs.editors.slides
com.google.android.gm
com.google.android.youtube
com.google.android.apps.youtube.music
com.google.android.apps.photos
com.google.android.apps.maps
com.google.android.calendar
com.google.android.keep
com.google.android.googlequicksearchbox
com.google.android.apps.googleassistant
com.google.android.apps.wellbeing
com.google.android.apps.nbu.files
com.google.android.apps.tachyon
com.google.android.videos
com.google.android.apps.podcasts
"

CATEGORIES[Other]="
com.naver.whale
com.lge.arzone
com.lge.arsticker
com.lge.arsupport
com.lge.remotesupport
"

# -- Process each category --
for category in "Games" "Social" "LG_Bloatware" "Google_Apps" "Other"; do
  packages="${CATEGORIES[$category]}"
  echo -e "${BLUE}[$category]${NC}"

  for pkg in $packages; do
    pkg=$(echo "$pkg" | tr -d '[:space:]')
    [ -z "$pkg" ] && continue

    if $RESTORE; then
      if $DRY_RUN; then
        echo -e "  ${DIM}Would restore:${NC} $pkg"
      else
        if adb shell cmd package install-existing "$pkg" &>/dev/null; then
          echo -e "  ${GREEN}Restored:${NC} $pkg"
          ((REMOVED++))
        else
          echo -e "  ${DIM}Not found:${NC} $pkg"
          ((SKIPPED++))
        fi
      fi
    else
      # Check if package exists
      if adb shell pm list packages 2>/dev/null | grep -q "$pkg"; then
        if $DRY_RUN; then
          echo -e "  ${YELLOW}Would remove:${NC} $pkg"
          ((REMOVED++))
        else
          if adb shell pm uninstall -k --user 0 "$pkg" &>/dev/null; then
            echo -e "  ${GREEN}Removed:${NC} $pkg"
            ((REMOVED++))
          else
            echo -e "  ${RED}Failed:${NC} $pkg"
            ((FAILED++))
          fi
        fi
      else
        echo -e "  ${DIM}Not found:${NC} $pkg"
        ((SKIPPED++))
      fi
    fi
  done
  echo ""
done

# -- Summary --
echo -e "${BOLD}======================================${NC}"
if $DRY_RUN; then
  echo -e "  ${YELLOW}DRY RUN COMPLETE${NC}"
  echo -e "  Would process: ${REMOVED} packages"
  echo -e "  Not found:     ${SKIPPED} packages"
else
  ACTION=$($RESTORE && echo "Restored" || echo "Removed")
  echo -e "  ${GREEN}$ACTION: ${REMOVED}${NC}"
  echo -e "  Skipped: ${SKIPPED}"
  [ $FAILED -gt 0 ] && echo -e "  ${RED}Failed: ${FAILED}${NC}"
fi
echo -e "${BOLD}======================================${NC}"
echo ""
echo -e "${DIM}To restore any package:${NC}"
echo -e "  adb shell cmd package install-existing <package>"
