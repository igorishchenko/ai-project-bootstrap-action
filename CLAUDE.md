# ai-project-bootstrap-action

A composite GitHub Action that runs `ai-project-bootstrap check` and reports
rule drift on a pull request. Public, MIT. It wraps the CLI published from the
`ai-project-bootstrap` repo — it does not reimplement any of it.

## Two properties worth protecting

- **No dependencies and no build step.** It is a composite action running plain
  Node scripts, so there is no bundled `dist/` that can drift from the source,
  and nothing on a user's runner executes code from outside GitHub and these
  two repositories. Adding a dependency gives that up; do not, without saying
  out loud what it buys.
- **The threshold logic lives in the CLI.** `--fail-on` is passed straight
  through and the CLI's exit code decides whether the job fails. Never
  re-derive severity here — the action must not be able to disagree with the
  command it wraps.

## Shape

- `action.yml` — inputs, outputs, and the `APB_*` env mapping. A composite
  action does not get `INPUT_*` automatically, which is why the inputs are
  mapped by hand to underscore names.
- `scripts/run.mjs` — entry point: runs `check --json`, publishes the result as
  step outputs, a job summary and a sticky PR comment.
- `scripts/build-comment.mjs` — pure, and where the tests are, because the
  comment body is the only part of this a human reads.
- `examples/` — the two workflows `ai-project-bootstrap ci init` writes.

Changing an input or output means changing `action.yml`, `run.mjs` and the
README table together. A documented output that no step sets is worse than an
undocumented one.

## Checks

```bash
npm test        # node --test, no install needed
```

`/verify` also checks the things tests cannot: that inputs, outputs and the
README agree, and that the example workflows are still valid.

## Branches, commits, changelog

- Branch off `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Conventional Commits.
- Behaviour changes get an entry under `## [Unreleased]` in @CHANGELOG.md in
  the PR that makes them.
- A feature PR never bumps `version` in package.json.

## Releases — the moving `v1` tag is the release

Every consumer pins `@v1`, so `vX.Y.Z` is the record and **`v1` is what people
actually run**. A release that tags `v1.1.0` and forgets to repoint `v1` has
shipped nothing. Procedure: `/release`.

`v1` only ever moves to a commit on `main` with green CI. Breaking changes to
inputs, outputs or default behaviour mean `v2` and a **new** moving tag — never
a breaking change under an existing major, because there is no way for someone
pinned at `@v1` to opt out.

## Coupled to the CLI

This action is only as current as the CLI release it invokes, and `version`
defaults to `latest` deliberately: pinning guarantees drift stops being
noticed. When the CLI changes `check`'s JSON payload, its exit codes or its
`--fail-on` levels, this repo needs a matching release — and the README's
compatibility note needs updating rather than quietly going stale.
