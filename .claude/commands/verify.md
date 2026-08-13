---
description: Run the action's tests plus the consistency checks the tests cannot cover
---

## 1. Tests

```bash
npm test
node --check scripts/run.mjs
node --check scripts/build-comment.mjs
```

No install step — the action has no dependencies, and that is the point. If
something you are adding needs one, stop and say so rather than installing it.

## 2. The contract the tests cannot see

- Every input in `action.yml` is mapped to an `APB_*` env var in the `runs:`
  block **and** read by `scripts/run.mjs`. An input nothing reads is dead.
- Every output declared in `action.yml` is actually set by `run.mjs`.
- The README's input, output and permission tables match `action.yml`.
- `examples/*.yml` still reference inputs that exist.

Report each as pass/fail with the specific mismatch — do not fix silently.

## 3. If the comment body changed

Print the rendered comment for each severity (`none`, `info`, `warning`,
`critical`) and read them as a person would. `build-comment.mjs` is pure, so
this is a call, not a workflow run.

## 4. If the change touches how the CLI is invoked

Say so explicitly in your report: it couples this repo to a CLI release, and
the README's compatibility note probably needs updating.
