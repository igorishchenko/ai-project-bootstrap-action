---
description: Release the action — tag the version and repoint the moving major tag
argument-hint: "[patch|minor|major|X.Y.Z]"
---

Release `ai-project-bootstrap-action`. Requested: $ARGUMENTS

If empty, decide from `## [Unreleased]` in CHANGELOG.md and say which bump you
picked and why before doing anything.

**A breaking change to inputs, outputs or default behaviour is a new major and
a new moving tag (`v2`), never a change under `v1`** — everyone is pinned at
`@v1` and has no way to opt out of a surprise.

## 1. Preflight

```bash
git switch main && git pull
git status --short                     # clean
gh run list --branch main --limit 1    # green
```

Run `/verify`.

## 2. The release commit

```bash
git switch -c release/X.Y.Z
```

Two files: CHANGELOG.md (`## [Unreleased]` becomes `## [X.Y.Z] — YYYY-MM-DD`,
with a fresh empty Unreleased above it) and package.json's `version`. Then:

```bash
git commit -m "chore: release vX.Y.Z"
git push -u origin release/X.Y.Z && gh pr create --fill
```

Merge once CI is green.

## 3. Tag — both tags

```bash
git switch main && git pull
git tag vX.Y.Z && git push origin vX.Y.Z
git tag -f v1 && git push -f origin v1     # the tag consumers actually run
```

Repointing `v1` is the release. A `vX.Y.Z` tag alone ships nothing, because no
workflow anywhere references it.

Confirm both landed:

```bash
git ls-remote --tags origin | grep -E 'v1$|vX.Y.Z'
```

## 4. GitHub Release

```bash
gh release create vX.Y.Z --title vX.Y.Z --notes-file <changelog section>
```

Mark it latest. This is also what publishes an update to the Marketplace
listing, so the release notes are user-facing copy, not a commit log.

## 5. Smoke test what consumers get

Open (or re-run) a pull request in a repo that uses `@v1` and confirm the
comment renders and the outputs are set. The action runs on someone else's
runner against a CLI fetched from npm at run time — the only honest test is a
real run.

## 6. Report

Version, whether `v1` moved, and whether this release depends on a CLI release
that is not published yet.
