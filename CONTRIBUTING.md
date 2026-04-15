# Contributing to olladroid

Thanks for helping make it easier to run private AI on old phones.

## Development workflow

1. Branch from `main` using one of these prefixes:
   - `feat/<short-description>` — new features
   - `fix/<short-description>` — bug fixes
   - `docs/<short-description>` — documentation only
   - `chore/<short-description>` — tooling, refactors, dev setup
2. Make focused commits — one logical change per commit.
3. Open a pull request against `main` and fill in the template.
4. Wait for CI (shellcheck) to pass and for review.
5. Squash-merge once approved.

Direct pushes to `main` are not allowed. Every change goes through a PR.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add automatic model download on first run
fix: handle missing adb binary gracefully
docs: clarify debloat rollback steps
chore: bump shellcheck severity to warning
```

This keeps history readable and lets us automate `CHANGELOG.md` later.

## Testing

- **Shell scripts**: run `shellcheck scripts/*.sh` before pushing. CI will fail on errors.
- **SDK**: `node --test sdk/test/*.test.js` — zero deps, runs on Node 18+.
- **CLI**: `node --test cli/test/*.test.js` — same.
- **CLI wrapper**: `node --test bin/test/*.test.js` — spawns `bin/olladroid` as a child process to verify dispatch routing + `--version` / `--help` / unknown-subcommand exit codes.
- **Scaffold drift**: if you touched `sdk/olladroid.js`, `templates/`, or `cli/scaffold.js`, run the one-liner below to regenerate `examples/spell-bee/` and commit the result (see [Scaffold drift check](#scaffold-drift-check)).
- **PWA**: open `pwa/chat.html` in a browser and verify it still loads and can talk to an Ollama instance.
- **Docs**: if you have Jekyll installed, run `bundle exec jekyll serve` from the repo root and check `docs/`.

## Shell script style

- `#!/usr/bin/env bash`
- `set -euo pipefail` at the top
- Double-quote all variable expansions: `"$var"`, not `$var`
- Scripts should be idempotent — safe to re-run
- Explain non-obvious commands with a short comment
- **Target bash 3.2+.** macOS ships bash 3.2 as `/bin/bash` and many
  contributors will run scripts from there before testing in Termux. Avoid
  associative arrays (`declare -A`) and the `[@]` expansion of empty arrays
  under `set -u` — use `awk '!seen[$0]++'` for de-dupe and the
  `"${ARRAY[@]+"${ARRAY[@]}"}"` idiom for possibly-empty expansion.

## Contributing a benchmark for your phone

`scripts/bench.sh` runs a fixed prompt set against your local Ollama and
writes a markdown report to `benchmarks/<device-slug>.md`. Contributing
your phone's numbers is **one command + one PR**:

```bash
# In Termux, with the Ollama server running
bash ~/olladroid/scripts/bench.sh --runs 3
```

See [`benchmarks/README.md`](benchmarks/README.md) for the full workflow
and what's measured. The fixed prompt set at `benchmarks/prompts.json`
means every contributed benchmark is comparable to every other. Don't
modify the prompts — changing them invalidates all prior benchmarks.

Quality bar:
- Phone plugged in to power (not on battery) at the start of the run
- Phone cool (not thermally throttling from prior activity)
- `--runs 3` or more for a stable warm median
- No background apps fighting for CPU (airplane mode is fine)
- The `<!-- Verified on: ... -->` header at the top of the generated file
  left intact

Open the PR with the `benchmark_contribution` issue template (under
`.github/ISSUE_TEMPLATE/`).

## Contributing a debloat list for your phone

`scripts/debloat.sh` is vendor-aware and reads plain-text package manifests
from `debloat/`. v0.2.0 ships `lge.txt` (verified on an LG V60) plus opt-in
category lists (`social`, `games`, `google-apps`). Every non-LG owner can help
by contributing a manifest for their OEM — it's usually a one-file PR.

See [`debloat/README.md`](debloat/README.md) for the full workflow. The short
version:

1. Connect your phone via ADB, run `./scripts/debloat.sh --list` to see what's
   already available.
2. List your OEM's packages: `adb shell pm list packages | grep -i <oem>`.
3. Create `debloat/<vendor>.txt` with a `# Verified on: <device>, Android <N>`
   header and one package per line.
4. Dry-run it: `./scripts/debloat.sh --dry-run --vendor <vendor>` to confirm
   the manifest is picked up.
5. Attach the JSON report from `--save-report` to your PR so reviewers can see
   what would be removed on your device.
6. Open a PR with the `debloat_contribution` issue template (under
   `.github/ISSUE_TEMPLATE/`).

Quality bar: don't include packages you haven't actually removed on a real
device without something breaking. The `# Verified on:` header is required.

## Adding a template

A template is a pair of files under `templates/<category>/<name>/`:

```
templates/
├── _base/
│   ├── index.html    # shared shell: head, header, main, script/footer
│   └── style.css     # shared design tokens + layout (TE palette)
└── kids-game/
    └── spell-bee/
        ├── body.html # per-template HTML, inlined inside <main id="app-root">
        └── app.js    # per-template controller, inlined inside <script>
```

The scaffolder (`cli/scaffold.js`) reads `_base/index.html` and substitutes
HTML-comment markers with values from the template + the inlined SDK + the
per-app config:

| Marker | Source | Notes |
|--------|--------|-------|
| `<!-- APP_NAME -->` | prompt answer / `--app-name` | HTML-escaped at substitution time |
| `<!-- STYLE_INLINE -->` | `templates/_base/style.css` | `</style>` sequences escaped to `<\/style>` |
| `<!-- SDK_INLINE -->` | `sdk/olladroid.js` | `</script>` sequences escaped to `<\/script>` |
| `<!-- APP_CONFIG -->` | generated JSON blob | `<`, `>`, `&`, U+2028, U+2029 escaped via `safeJSONForHTMLScript` |
| `<!-- APP_BODY -->` | `templates/<cat>/<name>/body.html` | Trusted verbatim |
| `<!-- APP_SCRIPT -->` | `templates/<cat>/<name>/app.js` | `</script>` sequences escaped |

**What your template inherits for free** from `_base/style.css`:

- TE design tokens: `--olladroid-black`, `--olladroid-white`, `--olladroid-gray-1..7`, `--olladroid-orange`, spacing + type scale, `--olladroid-tap-min: 48px`.
- Element defaults: `button` (invert-on-active, `data-variant="accent|secondary|ghost|danger"`), form inputs with bottom-border focus, `:focus-visible` orange outline.
- Shared layout: sticky `.olladroid-header` with `#app-logo`, `#app-title`, `#connection-status[data-state="ok|warn|err"]`, the `.olladroid-info-bar` strip, and `main#app-root` with max-width + safe-area padding.
- Utilities: `.olladroid-stack` (`--tight` / `--loose`), `.olladroid-card` / `.olladroid-card--double`, `.olladroid-banner[data-tone="warn|err|ok"]`, `.olladroid-sr-only`.
- `[hidden] { display: none !important; }` so the `hidden` attribute always wins over `display: inline-flex` / `display: flex`.
- `prefers-reduced-motion` neutralises transitions and animations.

**Rules for `body.html` + `app.js`:**

1. Everything your template needs lives on `window.Olladroid` — `OllamaClient`, `SessionManager`, `EventBus`, `pickModel`, `MODEL_PREFERENCES`, `StructuredChatError`. Don't import. The SDK is inlined as a plain script, not a module.
2. Read your per-app config via `JSON.parse(document.getElementById('app-config').textContent)` — the `APP_CONFIG` marker writes it as `<script type="application/json" id="app-config">`.
3. Populate `#app-title`, `#app-logo`, `#model-badge`, `#host-badge`, and `#connection-status` yourself. Spell Bee's `app.js` is the reference.
4. Per-template CSS goes inside an inline `<style>` block at the top of `body.html`. Keep it under ~200 lines — if it grows beyond that, promote to a dedicated marker in a follow-up PR.
5. Do not write literal `</script>` or `</style>` anywhere in the template or the SDK source. The scaffolder's `escapeInlineScript()` handles the common cases but the safest move is to avoid the sequence entirely.

**Testing your template locally:**

```bash
# 1. Rescaffold into a throwaway slug under pwa/apps/
olladroid new --non-interactive \
  --slug my-template-test \
  --template <category>/<name> \
  --age-group 6-8 \
  --model qwen2.5:1.5b \
  --skip-detection

# 2. Start the server + launcher, which picks up the new tile from
#    pwa/apps.json automatically:
bash scripts/start-ollama.sh --chat
# Open http://localhost:8000/ and tap the tile for `my-template-test`.
```

`olladroid new` and `node cli/new.js` are equivalent — the bin wrapper is a
thin Node dispatcher over the same modules. CI still invokes `node cli/new.js`
directly in its drift job so contributors without the CLI on PATH get the
same behaviour.

CI runs `node --test sdk/test/*.test.js cli/test/*.test.js bin/test/*.test.js`
and the scaffold-drift job on every PR. If your template changes drift the
reference output, the drift check will fail — see the next section for the
fix.

## Scaffold drift check

Every template under `templates/<category>/<name>/` has a committed, byte-identical
scaffolded reference under `examples/<slug>/`. On every PR, CI rescaffolds each one
from scratch and runs `git diff --exit-code -- examples/`. If you edit `sdk/olladroid.js`,
`cli/scaffold.js`, `templates/_base/`, or any `templates/<category>/<name>/` and don't
update the matching `examples/<slug>/`, the job fails loudly with a pointer to the
regenerate commands.

Two references are currently committed:

- [`examples/spell-bee/`](examples/spell-bee/) — from `templates/kids-game/spell-bee/`
- [`examples/summariser/`](examples/summariser/) — from `templates/productivity/summariser/`

**Regenerate locally:**

```bash
# Spell Bee
rm -rf examples/spell-bee
node cli/new.js --non-interactive \
  --slug spell-bee \
  --template kids-game/spell-bee \
  --age-group 6-8 \
  --model qwen2.5:1.5b \
  --host http://localhost:11434 \
  --output examples/spell-bee \
  --skip-detection \
  --scaffolded-at 2026-01-01T00:00:00.000Z

# Summariser
rm -rf examples/summariser
node cli/new.js --non-interactive \
  --slug summariser \
  --template productivity/summariser \
  --model qwen2.5:1.5b \
  --host http://localhost:11434 \
  --output examples/summariser \
  --skip-detection \
  --scaffolded-at 2026-01-01T00:00:00.000Z

git add examples/
```

Note that `productivity/summariser` has no `--age-group` flag — that option is
kids-game-only, and productivity / creative templates omit the field entirely
from `APP_CONFIG`.

**Why the pinned `--scaffolded-at` matters:** without it, `APP_CONFIG.scaffoldedAt` defaults to `new Date().toISOString()` and every rescaffold produces a byte-different `index.html`, breaking `git diff --exit-code` as a drift detector. The pinned `2026-01-01T00:00:00.000Z` is the one the CI job uses, so your local regeneration must use the same value.

**Why `examples/*/fonts/` is gitignored:** the scaffolder copies `pwa/fonts/*.woff2` verbatim into each scaffolded app. Those bytes are already policed by `pwa/fonts/` being committed directly — there's no reason to duplicate-track them under `examples/`.

## Changelog

Add a bullet under `## [Unreleased]` in `CHANGELOG.md` for any user-facing change. Tooling-only changes can skip this.

## Questions

Open a GitHub issue with the `feature request` template if you want to discuss before writing code.

## GitButler notes (optional)

This repo is compatible with [GitButler](https://docs.gitbutler.com/cli-overview) if you want to work on multiple virtual branches in parallel. GitButler is entirely optional — plain `git` works fine.

### Merge strategy: rebase merge only

This repo is configured to **rebase merge only** — squash and merge-commit strategies are disabled in repository settings. This is deliberate: GitButler tracks virtual branches by commit SHA, and squash merging rewrites hashes on merge, which tangles GitButler's internal state and forces a workspace reset after every PR.

Because branch protection already requires the PR head to be up-to-date with `main`, every rebase merge is a true fast-forward — commit hashes are preserved across the merge, and `but pull` can cleanly integrate the now-upstream commits.

### If `but pull` still tangles

Rare, but if `but status` starts throwing errors like "Id needs to be at least 2 characters long", or `but branch list` shows ghost or duplicate entries that survive `but teardown`, reset GitButler's workspace cache:

```bash
but teardown
git checkout main
git pull --ff-only
git branch -D $(git branch | grep -E 'gitbutler/|<stale-branches>')
rm -rf .git/gitbutler          # GitButler's workspace cache, not git refs
but setup
```

Safe: `.git/gitbutler/` only holds GitButler's own state files (`virtual_branches.toml`, `but.sqlite`) — no commits, no refs, no user work. The git history itself is untouched.

### Exiting GitButler

To leave GitButler entirely, run `but teardown` or just `git checkout` any regular branch. The repo returns to plain git with no residue in the git history itself.
