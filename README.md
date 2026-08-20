# ai-project-bootstrap-action

Tells you when a repository's generated AI coding rules have gone stale.

A `.cursor/rules/nextjs.mdc` written against one release of a framework keeps
confidently telling an AI assistant the old defaults long after they changed.
Nothing in the repo complains, no test fails, and the assistant does the wrong
thing with complete confidence. This action is the thing that complains.

It wraps [`ai-project-bootstrap check`](https://github.com/igorishchenko/ai-project-bootstrap),
posts a single pull-request comment that updates in place, and — only if you
ask it to — fails the build.

> **Requires a CLI release that ships `check`.** The command is newer than
> `ai-project-bootstrap@1.2.0`; until a release including it is on npm, this
> action will report that `check` is not a known command.

## Usage

```yaml
name: AI rules

on: [pull_request]

permissions:
  contents: read
  pull-requests: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '20'
      - uses: igorishchenko/ai-project-bootstrap-action@v1
```

That is the whole setup. By default it reports and does nothing else — see
[`examples/`](examples) for the same workflow with a weekly schedule, and for
the refresh-PR workflow below.

`npx ai-project-bootstrap ci init` writes both workflow files for you.

## What the comment looks like

```markdown
### AI rules: 1 file behind

Files this project generated no longer match what the generator would write today.

**Behind** — untouched since generation, safe to refresh

- `.cursor/rules/nextjs.mdc`

​```bash
npx ai-project-bootstrap upgrade
​```

1 file you edited is preserved and will not be touched.
```

Three things it deliberately does not do:

- **It does not comment on a clean repo.** A bot that posts "nothing to report"
  on every green PR is a bot people mute. It only speaks when there is drift —
  though an existing comment *is* updated to the all-clear once you fix it, so
  the PR that resolved the drift still shows that it did.
- **It does not report your edits as a problem.** Files you changed by hand are
  named as preserved, because `upgrade` will not touch them. That is the
  guarantee the whole tool rests on, and a CI comment that framed it as a
  finding would teach you to ignore the rest.
- **It does not fail your build unless you ask.** `fail-on` defaults to `none`.

## Inputs

| Input               | Default          | Notes                                                       |
| ------------------- | ---------------- | ----------------------------------------------------------- |
| `working-directory` | `.`              | Where `ai-project.config.json` lives                        |
| `version`           | `latest`         | Which CLI release to check against — see below              |
| `fail-on`           | `none`           | `none`, `info`, `warning`, `critical`                       |
| `comment`           | `true`           | Post and keep updating one PR comment                       |
| `token`             | `${{ github.token }}` | Needs `pull-requests: write` to comment              |

**`version` defaults to `latest` on purpose.** Drift is measured against the
newest templates, so pinning it guarantees the check gradually stops noticing
anything — the opposite of what it is for. Pin only to work around a specific
regression.

**`fail-on` levels** mirror the CLI exactly, because the flag is passed
straight through and the CLI's own exit code decides the outcome:

| Level      | Fails on                                                       |
| ---------- | -------------------------------------------------------------- |
| `none`     | nothing — report only (default)                                |
| `info`     | a newer CLI version, new files, newly supported AI tools       |
| `warning`  | rules behind the templates, or orphaned files                  |
| `critical` | reserved; nothing emits it yet                                 |

Start on `none`. Move to `warning` once the repo is current and you want it to
stay that way.

## Outputs

| Output                 | Example                         |
| ---------------------- | ------------------------------- |
| `severity`             | `warning`                       |
| `ok`                   | `true` / `false`                |
| `behind`               | `6`                             |
| `orphaned`             | `1`                             |
| `edited`               | `2`                             |
| `advisories`           | `2`                             |
| `advisories-critical`  | `1`                             |
| `report`               | the full `check --json` payload |

```yaml
- uses: igorishchenko/ai-project-bootstrap-action@v1
  id: rules
- if: steps.rules.outputs.behind != '0'
  run: echo "::notice::${{ steps.rules.outputs.behind }} rule files are stale"
```

## Advisories

The comment also reports **known vendor changes affecting the technologies this
project selected** — a breaking release, a deprecation, a default that moved.
The CLI fetches them; this action only renders what it was given.

Nothing about severity is decided here. `check` already ranked the advisories
and already decided whether the job fails, so the action cannot disagree with
the command it wraps.

Three things are worth knowing:

- **A `critical` advisory can fail the job**, if `fail-on` is set that high.
  That means somebody else publishing a change can turn this red with no commit
  on your side. `fail-on` still defaults to `none`.
- **Without a subscription** the comment names how many advisories match and how
  severe they are, but not what they say. One quiet line points at
  `ai-project-bootstrap login`. It is deliberately not a pitch — this lands in
  your pull requests.
- **A CLI too old to report advisories changes nothing.** The comment renders
  exactly as it did before, and `advisories` reports `0`. The action floats on
  `version: latest`, but pinning an older one is safe.

## Weekly refresh pull requests

The reporting half tells you. The other half fixes it:
[`examples/ai-rules-refresh.yml`](examples/ai-rules-refresh.yml) runs `upgrade`
on a schedule and opens a pull request when anything changed — a small,
reviewable diff, and silence when there is nothing to do. Dependabot, for the
rules your assistant reads.

It uses a fixed branch (`ai-rules/refresh`), so a later run updates the open PR
rather than opening a second one, and it uses `gh` rather than a third-party
pull-request action — nothing in either workflow runs code from outside GitHub
and these two repositories.

One GitHub behaviour worth knowing: a pull request opened with the default
`GITHUB_TOKEN` does not trigger other workflows. If you need your test suite to
run on the refresh PR, supply a PAT instead.

## What it sends anywhere

Nothing. The check runs entirely on the runner, against files already in your
checkout, and the only network call is `npx` fetching the CLI from npm. There
is no account, no key, and no telemetry.

## Permissions

| Want                    | Needs                                              |
| ----------------------- | -------------------------------------------------- |
| The check and a summary | `contents: read`                                   |
| The PR comment          | `pull-requests: write`                             |
| Refresh PRs             | `contents: write` and `pull-requests: write`       |

A missing comment permission is a warning, never a failed job — the check still
ran, and whether the token could comment says nothing about whether the rules
drifted. Pull requests from forks get a read-only token by design, so the
comment is skipped there too.

## Development

```bash
npm test
```

No dependencies and no build step: the action is a composite that runs plain
Node scripts, so there is no bundled `dist/` to keep in sync with the source.
`scripts/build-comment.mjs` is pure and carries the tests, because the comment
body is the only part of this a human actually reads.

## Licence

MIT.
