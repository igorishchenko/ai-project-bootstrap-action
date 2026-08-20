#!/usr/bin/env node
/**
 * The action's entry point.
 *
 * Runs `ai-project-bootstrap check --json`, publishes the result three ways —
 * step outputs, a job summary, and a sticky PR comment — and lets the CLI's
 * own exit code decide whether the job fails.
 *
 * That last part matters: `--fail-on` is passed straight through rather than
 * re-implemented here, so the threshold logic lives in exactly one place and
 * the action cannot disagree with the command it wraps.
 */
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildComment, buildSummary, COMMENT_MARKER } from './build-comment.mjs';

/** Exit code the CLI uses for "this is not a generated project". */
const NOT_A_PROJECT = 2;

/** Reads one of the `APB_*` env vars action.yml maps each input to. */
const input = (name, fallback = '') => process.env[`APB_${name}`] || fallback;
const isTrue = (value) => value === 'true' || value === '1';

function fail(message, hint) {
  process.stdout.write(`::error::${message}\n`);
  if (hint) process.stdout.write(`${hint}\n`);
  process.exit(1);
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  // Heredoc form, because the report is multi-line JSON and the `name=value`
  // form silently truncates at the first newline.
  const delimiter = `ghadelim_${Math.random().toString(36).slice(2)}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function runCheck({ version, workingDirectory, failOn }) {
  const spec = version === 'latest' ? 'ai-project-bootstrap' : `ai-project-bootstrap@${version}`;
  const args = ['--yes', spec, 'check', '--json', '--fail-on', failOn];

  const result = spawnSync('npx', args, {
    cwd: workingDirectory,
    encoding: 'utf8',
    // stdout is the JSON contract; stderr is diagnostics and npx noise, and is
    // forwarded to the log rather than parsed.
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, NO_COLOR: '1' },
  });

  if (result.error) {
    fail(`Could not run ai-project-bootstrap: ${result.error.message}`);
  }
  if (result.status === NOT_A_PROJECT) {
    fail(
      `No ai-project.config.json in "${workingDirectory}" — this action only runs against a project ai-project-bootstrap generated.`,
      'Set `working-directory` if the project is in a subfolder, or remove this workflow.',
    );
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    fail(
      'ai-project-bootstrap check did not return JSON.',
      `Exit code ${result.status}. Output:\n${result.stdout.slice(0, 800)}`,
    );
  }

  if (report.schema !== 1) {
    /*
     * Refuse rather than guess. A newer CLI could rename a field this action
     * reads, and a comment built from a half-understood payload is worse than
     * no comment — it would state counts that are quietly wrong.
     */
    fail(
      `This action understands check schema 1, but got ${report.schema}.`,
      'Pin `version:` to a CLI release this action supports, or update the action.',
    );
  }

  return { report, failed: result.status === 1 };
}

// ── The sticky comment ──────────────────────────────────────────────────────
//
// `gh` is preinstalled on GitHub-hosted runners, which keeps this action a
// plain composite with no bundled node_modules to keep current.

function gh(args, options = {}) {
  const result = spawnSync('gh', args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`gh ${args[0]} ${args[1] ?? ''} failed: ${detail}`);
  }
  return result.stdout;
}

/** The existing comment's id, if this action has commented on the PR before. */
function findExistingComment(repo, prNumber) {
  const raw = gh([
    'api',
    '--paginate',
    `repos/${repo}/issues/${prNumber}/comments`,
    '--jq',
    // Matching on the marker rather than on the author: the token may be
    // github-actions[bot] or a PAT belonging to a human, and the marker is
    // true either way.
    `[.[] | select(.body | contains("${COMMENT_MARKER}")) | .id] | first // empty`,
  ]);
  const id = raw.trim();
  return id ? Number(id) : undefined;
}

function postComment({ repo, prNumber, report }) {
  const existingId = findExistingComment(repo, prNumber);

  // A clean repo gets no new comment, but an existing one is updated to say so
  // — otherwise the PR that fixes the drift still shows the stale warning.
  const body = buildComment(report, { editingExisting: existingId !== undefined });
  if (body === null) return 'skipped (nothing to report)';

  if (existingId === undefined) {
    gh(['api', `repos/${repo}/issues/${prNumber}/comments`, '-f', `body=${body}`], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return 'created';
  }

  gh(
    [
      'api',
      '--method',
      'PATCH',
      `repos/${repo}/issues/comments/${existingId}`,
      '-f',
      `body=${body}`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  return `updated (#${existingId})`;
}

function prNumberFromEvent() {
  const ref = process.env.GITHUB_REF ?? '';
  // refs/pull/123/merge — the only PR identifier available to a composite
  // action without reading and parsing the whole event payload.
  const match = ref.match(/^refs\/pull\/(\d+)\//);
  return match ? Number(match[1]) : undefined;
}

function main() {
  const workingDirectory = input('WORKING_DIRECTORY', '.');
  const failOn = input('FAIL_ON', 'none');
  const version = input('VERSION', 'latest');
  const wantsComment = isTrue(input('COMMENT', 'true'));

  const { report, failed } = runCheck({ version, workingDirectory, failOn });

  setOutput('severity', report.severity);
  setOutput('ok', String(report.ok));
  setOutput('behind', String(report.counts.behind));
  setOutput('orphaned', String(report.counts.orphaned));
  setOutput('edited', String(report.counts.edited));
  /*
   * Counted here rather than in the comment builder so a workflow can branch on
   * advisories without parsing the payload. `0` for a CLI too old to emit the
   * field — the same value a current CLI gives when nothing matched, which is
   * the right answer for a workflow step either way.
   */
  const advisoryItems = Array.isArray(report.advisories?.items) ? report.advisories.items : [];
  setOutput('advisories', String(advisoryItems.length));
  setOutput(
    'advisories-critical',
    String(advisoryItems.filter((a) => a.severity === 'critical').length),
  );
  setOutput('report', JSON.stringify(report));

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, buildSummary(report));
  }

  const prNumber = prNumberFromEvent();
  if (wantsComment && prNumber !== undefined) {
    try {
      const outcome = postComment({
        repo: process.env.GITHUB_REPOSITORY,
        prNumber,
        report,
      });
      process.stdout.write(`Comment ${outcome}.\n`);
    } catch (error) {
      /*
       * A comment that cannot be posted must not fail the job. The usual cause
       * is a workflow without `pull-requests: write`, or a PR from a fork,
       * where the token is read-only by design — neither says anything about
       * whether the rules have drifted, which is what the job is for.
       */
      process.stdout.write(
        `::warning::Could not post the PR comment: ${error.message}\nThe check itself ran; add \`permissions: pull-requests: write\` to comment on PRs.\n`,
      );
    }
  } else if (wantsComment) {
    process.stdout.write('Not a pull request — reporting to the job summary only.\n');
  }

  process.stdout.write(`${buildSummary(report)}\n`);

  // The CLI already applied --fail-on; mirroring its exit code keeps one
  // definition of "does this fail the build".
  process.exit(failed ? 1 : 0);
}

main();
