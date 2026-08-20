# Changelog

All notable changes to this action are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

Consumers pin the moving `v1` tag, so a breaking change to inputs, outputs or
default behaviour means a new major and a new moving tag — not a note here.

Entries are added in the pull request that makes the change, not at release
time.

## [Unreleased]

Nothing yet. Entries are added in the pull request that makes the change, not
at release time.

## [1.1.0] — 2026-08-20

### Fixed

- **`fail-on: info` could fail a job with no comment explaining why.** The CLI
  ranks newly-supported AI tools `info`, so a repository whose files were
  entirely current still went red — and the action never read `newAiTools`, so
  every signal it *did* read was clean and it posted nothing. A red build whose
  report says nothing is the worst thing this action can do. It now says which
  tools, and that the fix is editing `aiTools` in `ai-project.config.json`
  rather than running `upgrade`, which on its own changes nothing.
  Deliberately **not** treated as drift: the list never changes until somebody
  edits that answer, so commenting whenever it is non-empty would put the same
  note on every pull request forever, for a project that has decided it does
  not want those tools. It earns a comment when the job fails, and rides along
  in one that exists for another reason. A CLI too old to report `ok` is
  treated as passing, so nothing changes for a pinned older version.
- **A file-clean repository with an advisory was told its files had drifted.**
  An advisory is what gets a comment posted on an otherwise-current repository
  — that part was deliberate — but the opening line underneath was the drift
  sentence, directly below a headline reading "AI rules are current". The
  reader believes one of the two, and the wrong one was in bold. The opening
  line is now chosen by the file counts alone. Caught by running the action's
  comment builder against a real `check --json` payload from the CLI 1.4.0,
  which is also the release that made the advisory path reachable in practice.

### Added

- **`report-to` and `org-token`** — post the drift report to a fleet dashboard
  after the comment is rendered. **Off unless set**: this is the only thing the
  action sends anywhere, and a CI step that quietly started talking to a service
  nobody configured would be a surprise of the worst kind.
- **Reporting can never fail the job.** An unreachable service, a wrong token,
  a non-200 or a timeout is a `::warning::` and nothing more — the same rule the
  missing-comment-permission case already follows, and for the same reason:
  whether the rules have drifted is what this job answers, and a dashboard being
  down says nothing about that. The POST is bounded at 10s so a hanging service
  cannot turn a green job into a slow one.
- **The token is an organisation token, not a licence key.** A licence key is a
  person's credential; a machine should not hold one.

- **Advisories in the comment.** Known vendor changes affecting the technologies
  a project selected — a breaking release, a deprecation, a moved default — now
  render alongside drift, closing the caveat this action shipped with. Nothing
  about severity is computed here: `check` ranked them and `check` decided
  whether the job fails, so the action cannot disagree with the command it
  wraps.
- **`advisories` and `advisories-critical` outputs**, so a workflow can branch
  on them without parsing the payload.
- A file-clean repository whose vendor just shipped a breaking change **now gets
  a comment**. It is not "clean" in any sense the reader cares about, and
  staying silent about it is the one failure this feature exists to prevent.

### Compatibility

- **A CLI too old to report advisories renders exactly as before**, and the new
  outputs report `0`. The action floats on `version: latest`, but pinning an
  older one stays safe — a missing field and an explicit `null` both mean "not
  asked". Every pre-existing test in `test/build-comment.test.mjs` uses a
  payload with no advisory field at all, so they collectively hold that line.
- No new inputs, no changed outputs, no dependencies, still no build step.

### Notes

- Without a subscription the comment names how many advisories match and how
  severe they are, but not what they say, and points at
  `ai-project-bootstrap login` in **one** line. This lands in somebody's pull
  request, where an advertisement is a reason to turn the action off.

## [1.0.0] — 2026-08-13

### Added

- Reports AI rule drift on pull requests: runs `ai-project-bootstrap check`,
  publishes step outputs, a job summary and a sticky PR comment, and lets the
  CLI's own `--fail-on` exit code decide whether the job fails.
- `examples/ai-rules-check.yml` and `examples/ai-rules-refresh.yml` — the
  reporting workflow and the scheduled refresh-PR workflow that
  `ai-project-bootstrap ci init` writes.
