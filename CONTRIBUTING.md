# Contributing to ollama-pocket

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
- **PWA**: open `pwa/chat.html` in a browser and verify it still loads and can talk to an Ollama instance.
- **Docs**: if you have Jekyll installed, run `bundle exec jekyll serve` from the repo root and check `docs/`.

## Shell script style

- `#!/usr/bin/env bash`
- `set -euo pipefail` at the top
- Double-quote all variable expansions: `"$var"`, not `$var`
- Scripts should be idempotent — safe to re-run
- Explain non-obvious commands with a short comment

## Changelog

Add a bullet under `## [Unreleased]` in `CHANGELOG.md` for any user-facing change. Tooling-only changes can skip this.

## Questions

Open a GitHub issue with the `feature request` template if you want to discuss before writing code.

## GitButler notes (optional)

This repo is compatible with [GitButler](https://docs.gitbutler.com/cli-overview) if you want to work on multiple virtual branches in parallel. GitButler is entirely optional — plain `git` works fine.

### Recovering after a squash merge

When a PR is **squash-merged** on GitHub the merge commit hash differs from the virtual branch tip, and `but pull` fails with:

> Chosen resolutions do not match quantity of applied virtual branches.

Try these fixes in order — escalate only when the previous step doesn't clear the error.

**1. Unapply the merged branch, then pull** (works for a single merged branch):

```bash
but unapply <merged-branch>
git fetch origin
but pull
```

**2. Drop to plain git and rebase** (use when step 1 fails, typically with multiple virtual branches in flight):

```bash
git checkout <your-feature-branch>   # auto-exits the GitButler workspace
git rebase origin/main
git push --force-with-lease
# later, back in GitButler mode:
but setup
```

**3. Nuclear reset of GitButler state** (only when `but status` shows ghost or duplicate branches that survive `but teardown` + `but setup`):

```bash
but teardown
git checkout main
git branch -D $(git branch | grep -E 'gitbutler/|<stale-branches>')
rm -rf .git/gitbutler          # GitButler's workspace cache, not git refs
but setup
```

This is safe: `.git/gitbutler/` holds GitButler's own workspace state (`virtual_branches.toml`, `but.sqlite`) — no commits, no refs, no user work.

### Exiting GitButler

To leave GitButler entirely, run `but teardown` or just `git checkout` any regular branch. The repo returns to plain git with no residue in the git history itself.
