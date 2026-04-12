# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `CONTRIBUTING.md` with PR-based development workflow, conventional commits, shell style guide, and GitButler virtual-branch notes.
- GitHub pull request and issue templates under `.github/`.
- GitHub Actions CI running shellcheck on `scripts/`, with a status badge in the README.
- `.gitignore` covering macOS, editor, Jekyll, and Claude Code (`.claude/`) artifacts.

### Changed
- Repository merge strategy is now **rebase-merge only** — squash and merge-commit are disabled at the repo level to keep GitButler virtual branches sane.
- Docs anonymized: generic phone model, example LAN IP, and example ADB device serial in `docs/index.md` and `docs/medium.md`.

### Fixed
- Broken GitHub URL in `README.md` and `docs/*` (`s1dd4` → `s1dd4rth` typo).

## [0.1.0] - 2026-04-12

### Added
- Initial release: run Ollama on Android via Termux + proot Debian.
- `scripts/install-ollama.sh`, `start-ollama.sh`, `setup-autostart.sh`, `debloat.sh`.
- PWA chat interface at `pwa/chat.html`.
- Jekyll-based documentation site under `docs/`.
