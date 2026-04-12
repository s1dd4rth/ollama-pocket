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
