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
