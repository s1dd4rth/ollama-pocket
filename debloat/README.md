# debloat — vendor-aware Android bloatware manifests

This directory holds the package lists consumed by `scripts/debloat.sh`. Each
file is a plain-text list of Android package names, one per line, with `#`
comments and blank lines allowed.

```
debloat/
├── README.md           — this file
├── lge.txt             — LG Electronics (auto-detected on LG devices)
├── social.txt          — Facebook / Instagram / preloaded social apps
├── games.txt           — Gameloft preloads
└── google-apps.txt     — Google first-party apps
```

`debloat.sh` auto-detects your phone's manufacturer via
`adb shell getprop ro.product.manufacturer`, loads the matching vendor file
(e.g. `lge.txt` for LG), and also loads the opt-in category files
(`social.txt`, `games.txt`, `google-apps.txt`) by default.

## Adding a new vendor list

Every non-LG owner sees the same problem: v0.1.0's `debloat.sh` hardcoded LG
packages and did nothing useful on Samsung, Pixel, Xiaomi, or anything else.
**Fix it for your phone and ship the manifest as a PR.** The bar for a new
vendor file is low:

1. Connect your phone to a PC with ADB enabled.
2. List the installed OEM packages: `adb shell pm list packages | grep -Ei '<your-oem-prefix>'` — e.g.
   `grep samsung.` or `grep xiaomi.` or `grep pixel.`
3. For each package, decide: is it bloat you want gone, or a system component
   you need? When in doubt, **don't** include it — only list packages you've
   verified are safe to remove on your device.
4. Create `debloat/<vendor>.txt` with a verification header like the one at
   the top of `lge.txt`:

    ```
    # debloat/samsung.txt — Samsung bloatware
    #
    # Verified on: Samsung Galaxy S23 (SM-S911B), Android 14, One UI 6.1
    # Auto-loaded when `adb shell getprop ro.product.manufacturer` returns
    # "samsung".
    ```

    The verification header is **required** for the PR to be merged — it
    establishes that a real human removed these packages on a real device
    without breaking anything.

5. Run `./debloat.sh --dry-run` and confirm the new manifest is picked up
   on your phone (the script prints the detected vendor + loaded files).
6. Run `./debloat.sh --save-report /tmp/debloat-samsung.json` and attach the
   JSON report to the PR. This gives reviewers a machine-readable record of
   what would be removed on your device.
7. Open a PR using the `debloat_contribution` issue template (under
   `.github/ISSUE_TEMPLATE/`).

## Manifest format

- **One package per line.** Leading/trailing whitespace is stripped.
- `#` starts a comment. Inline comments (`com.foo  # reason`) also work — only
  the first whitespace-separated token is treated as the package name.
- Blank lines are ignored.
- A `# Verified on: <device>, <android version>` line near the top is
  required on vendor files (enforced during review, not by the script).

## Categories vs. vendors

**Vendor files** (`lge.txt`, `samsung.txt`, ...) are auto-selected from the
detected manufacturer. Exactly one vendor file loads per run.

**Category files** (`social.txt`, `games.txt`, `google-apps.txt`) are opt-in
bundles that are loaded by default but can be toggled with flags:

- `./debloat.sh` — vendor + all three categories (default, matches v0.1.0
  behaviour on LG)
- `./debloat.sh --category social,games` — vendor + only social and games
- `./debloat.sh --no-categories` — vendor only, no category bundles
- `./debloat.sh --vendor samsung --dry-run` — override auto-detection

## Safety

- Every removal is reversible:
  `adb shell cmd package install-existing <package>` or `./debloat.sh --restore`
- `pm uninstall -k --user 0` only removes the package for the current user;
  the APK stays cached in `/system`, so the restore path works without
  re-flashing.
- `--dry-run` prints what would be removed without touching anything. Always
  start there.

## Two restore modes — pick the right one

`debloat.sh` has two distinct ways to put packages back on your device. They
behave differently and it matters which one you use.

### `--restore` (broad restore)

Walks the **entire current manifest set** (vendor + categories) and reinstalls
every listed package that is currently uninstalled. This is the v0.1.0
behaviour and is useful when you want to undo *all* debloating ever done by
this script on this phone, or when you've lost track of what was removed and
just want to reset to "everything the manifest knows about, installed".

**Gotcha:** if your phone had packages uninstalled by a previous `debloat.sh`
session (or by any other tool), `--restore` will reinstall those too, not
just the ones removed in your most recent run. The end state is "fully
populated manifest", not "the state you were in before the last session".

### `--restore-from <report.json>` (precise restore)

Reinstalls **only** the packages listed in a previous `--save-report` JSON
file. This is the precise inverse of a single previous `debloat.sh` run —
the end state is exactly the state you were in before that run, no more and
no less.

Workflow:

```bash
# Before: snapshot + real remove with report
./scripts/debloat.sh --save-report ~/debloat-$(date +%F).json

# Later: precise undo using that same report
./scripts/debloat.sh --restore-from ~/debloat-$(date +%F).json
```

**Use `--restore-from` by default.** It does exactly what users expect from
an "undo" button. Reach for `--restore` only when you deliberately want the
broad-reset semantics.
