# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `CONTRIBUTING.md` describing the PR-based development workflow.
- GitHub pull request and issue templates under `.github/`.
- GitHub Actions CI running shellcheck on `scripts/`.
- `.gitignore` for macOS, editor, and Jekyll build artifacts.

## [0.1.0] - 2026-04-12

### Added
- Initial release: run Ollama on Android via Termux + proot Debian.
- `scripts/install-ollama.sh`, `start-ollama.sh`, `setup-autostart.sh`, `debloat.sh`.
- PWA chat interface at `pwa/chat.html`.
- Jekyll-based documentation site under `docs/`.
