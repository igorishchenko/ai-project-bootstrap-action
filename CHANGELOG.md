# Changelog

All notable changes to this action are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

Consumers pin the moving `v1` tag, so a breaking change to inputs, outputs or
default behaviour means a new major and a new moving tag — not a note here.

Entries are added in the pull request that makes the change, not at release
time.

## [Unreleased]

Nothing yet.

## [1.0.0] — 2026-08-13

### Added

- Reports AI rule drift on pull requests: runs `ai-project-bootstrap check`,
  publishes step outputs, a job summary and a sticky PR comment, and lets the
  CLI's own `--fail-on` exit code decide whether the job fails.
- `examples/ai-rules-check.yml` and `examples/ai-rules-refresh.yml` — the
  reporting workflow and the scheduled refresh-PR workflow that
  `ai-project-bootstrap ci init` writes.
