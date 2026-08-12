/**
 * Turns a `ai-project-bootstrap check --json` report into the PR comment.
 *
 * Pure on purpose: this is the only part of the action a human actually
 * reads, and it is the part most likely to be wrong in a way tests can catch.
 * Everything that touches the network or the runner lives in `run.mjs`.
 *
 * Tone is deliberately flat. A drift report that shouts gets muted, and a
 * muted report is worth nothing — so: no severity emoji, no "action required",
 * no red. State what is stale and what the command to fix it is.
 */

/**
 * Hidden marker that makes the comment sticky. Finding it is how `run.mjs`
 * decides between editing the existing comment and posting a new one, so a
 * push does not leave a trail of near-identical comments down the PR.
 */
export const COMMENT_MARKER = '<!-- ai-project-bootstrap-check -->';

const MAX_LISTED = 10;

/** `1 file` / `3 files`, because "1 files" in a bot comment looks broken. */
function plural(n, singular, pluralForm = `${singular}s`) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

function fileList(files) {
  const shown = files.slice(0, MAX_LISTED).map((f) => `- \`${f}\``);
  if (files.length > MAX_LISTED) shown.push(`- …and ${files.length - MAX_LISTED} more`);
  return shown.join('\n');
}

/**
 * The headline.
 *
 * Leads with whichever bucket is worst, and names it in the terms the rest of
 * the product uses (behind / orphaned) rather than inventing CI vocabulary.
 */
export function headline(report) {
  const { behind, orphaned, missing, added } = report.counts;

  if (behind === 0 && orphaned === 0 && missing === 0 && added === 0) {
    return 'AI rules are current';
  }
  const parts = [];
  if (behind > 0) parts.push(`${plural(behind, 'file')} behind`);
  if (orphaned > 0) parts.push(`${plural(orphaned, 'orphaned file')}`);
  if (missing > 0) parts.push(`${plural(missing, 'file')} missing`);
  if (added > 0) parts.push(`${plural(added, 'new file')}`);
  return `AI rules: ${parts.join(', ')}`;
}

/**
 * The whole comment body, marker included.
 *
 * `null` means "post nothing": a repo that is fully current should not have a
 * bot commenting on every PR to say so. An existing comment is edited to the
 * all-clear instead (see `run.mjs`), so the transition from stale to current
 * is still visible on the PR that fixed it.
 */
export function buildComment(report, options = {}) {
  const { behind, orphaned, missing, added, edited } = report.counts;
  const clean = behind === 0 && orphaned === 0 && missing === 0 && added === 0;

  if (clean && !options.editingExisting) return null;

  const lines = [COMMENT_MARKER, `### ${headline(report)}`, ''];

  if (clean) {
    // The trailing blank matters: without it Markdown folds this into the
    // same paragraph as the `<sub>` note below.
    lines.push(`Every generated file matches the templates in ${version(report)}.`, '');
  } else {
    lines.push(
      'Files this project generated no longer match what the generator would write today.',
      '',
    );

    if (behind > 0) {
      lines.push('**Behind** — untouched since generation, safe to refresh', '');
      lines.push(fileList(report.behind), '');
    }
    if (missing > 0) {
      lines.push('**Missing** — generated once, no longer on disk', '');
      lines.push(fileList(report.missing), '');
    }
    if (added > 0) {
      lines.push('**New** — this version writes these; the version that generated it did not', '');
      lines.push(fileList(report.added), '');
    }
    if (orphaned > 0) {
      lines.push('**Orphaned** — still on disk, no longer part of this stack', '');
      lines.push(fileList(report.orphaned), '');
      // Named separately because `upgrade` does not remove these, and the fix
      // line below would otherwise promise something it does not do.
      lines.push(
        '_`upgrade` will not remove orphaned files — delete them, or use `add <id> --replace`._',
        '',
      );
    }

    const fixable = behind + missing + added;
    if (fixable > 0) {
      lines.push('```bash', 'npx ai-project-bootstrap upgrade', '```', '');
    }
  }

  /*
   * Edited files are stated as a guarantee, not a warning. Someone scanning a
   * bot comment must never come away thinking their own edits are a problem
   * the tool wants them to undo — that is the fastest way to lose their trust
   * in the rest of the report.
   */
  if (edited > 0) {
    lines.push(
      `<sub>${plural(edited, 'file')} you edited ${edited === 1 ? 'is' : 'are'} preserved and will not be touched.</sub>`,
      '',
    );
  }

  lines.push(`<sub>${version(report)} · ai-project-bootstrap</sub>`);

  return lines.join('\n');
}

function version(report) {
  const { recorded, installed } = report.generatorVersion;
  if (!recorded) return `checked against v${installed}`;
  if (recorded === installed) return `v${installed}`;
  return `generated with v${recorded}, checked against v${installed}`;
}

/**
 * The job summary — shown on every run, including pushes to a branch with no
 * PR, where a comment has nowhere to go.
 */
export function buildSummary(report) {
  const rows = [
    ['Current', report.counts.current],
    ['Behind', report.counts.behind],
    ['Missing', report.counts.missing],
    ['New', report.counts.added],
    ['Orphaned', report.counts.orphaned],
    ['Edited (preserved)', report.counts.edited],
  ];

  return [
    `## ${headline(report)}`,
    '',
    `Project \`${report.project}\` · ${version(report)}`,
    '',
    '| | Files |',
    '| --- | ---: |',
    ...rows.map(([label, n]) => `| ${label} | ${n} |`),
    '',
  ].join('\n');
}
