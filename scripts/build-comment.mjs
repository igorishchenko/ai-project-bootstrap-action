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
const MAX_ADVISORIES = 5;

/**
 * Advisories from a `check --json` payload, normalised.
 *
 * **A CLI too old to emit the field renders exactly as it did before.** The
 * action floats on `latest`, but a repository pinning an older `version:` must
 * not get a broken comment because the action moved on without it — so a
 * missing field and an explicit `null` both mean "not asked", and only an
 * actual array means there is something to say.
 *
 * `null` and `[]` are deliberately different upstream: "we did not look" versus
 * "we looked and found none". Neither produces a section here, but only the
 * first is the old-CLI case.
 */
function advisoriesOf(report) {
  const raw = report.advisories;
  if (!raw || !Array.isArray(raw.items)) return null;
  return { entitled: raw.entitled === true, items: raw.items };
}

/**
 * Newly-supported AI tools this project never opted into.
 *
 * The CLI ranks a non-empty list `info`, which means `fail-on: info` fails the
 * job over it — and until this was read here, that job failed with no comment
 * at all, because every other signal was clean. A red build whose report says
 * nothing is the worst thing this action can do.
 *
 * Tolerated the same way advisories are: a CLI too old to emit the field is
 * indistinguishable from one that emitted an empty list, and neither produces
 * a section.
 */
function newAiToolsOf(report) {
  return Array.isArray(report.newAiTools) ? report.newAiTools : [];
}

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
  const advisories = advisoriesOf(report);
  const advisoryCount = advisories ? advisories.items.length : 0;

  const toolCount = newAiToolsOf(report).length;

  if (behind === 0 && orphaned === 0 && missing === 0 && added === 0) {
    // Files current, vendor not. Saying only "current" above a list of vendor
    // changes would read as the report contradicting itself.
    const extras = [];
    if (advisoryCount > 0) extras.push(plural(advisoryCount, 'advisory', 'advisories'));
    if (toolCount > 0) extras.push(`${plural(toolCount, 'AI tool')} not wired up`);
    return extras.length > 0
      ? `AI rules are current · ${extras.join(', ')}`
      : 'AI rules are current';
  }
  const parts = [];
  if (behind > 0) parts.push(`${plural(behind, 'file')} behind`);
  if (orphaned > 0) parts.push(`${plural(orphaned, 'orphaned file')}`);
  if (missing > 0) parts.push(`${plural(missing, 'file')} missing`);
  if (added > 0) parts.push(`${plural(added, 'new file')}`);
  if (advisoryCount > 0) parts.push(plural(advisoryCount, 'advisory', 'advisories'));
  if (toolCount > 0) parts.push(`${plural(toolCount, 'AI tool')} not wired up`);
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
  const advisories = advisoriesOf(report);
  const hasAdvisories = advisories !== null && advisories.items.length > 0;
  /*
   * Advisories count as something to say. A repository whose files are all
   * current but whose vendor just shipped a breaking change is not "clean" in
   * any sense the reader cares about, and staying silent about it would be the
   * one failure this feature exists to prevent.
   */
  const filesClean = behind === 0 && orphaned === 0 && missing === 0 && added === 0;
  const clean = filesClean && !hasAdvisories;

  /*
   * Newly-supported tools do not, on their own, earn a comment.
   *
   * The list never changes until somebody edits `aiTools`, so treating it like
   * drift would put the same comment on every pull request this repository
   * ever opens — for a project that deliberately does not want Copilot rules,
   * forever. Advisories are different: they arrive, and they go away.
   *
   * What it must never do is fail a job silently. `fail-on: info` ranks this
   * `info` and turns the build red, so when the CLI says the run did not pass,
   * the comment is posted and the section below says why. `ok` is undefined on
   * a CLI too old to report it, which is treated as passing — an old CLI keeps
   * exactly the behaviour it had.
   */
  const failed = report.ok === false;

  if (clean && !failed && !options.editingExisting) return null;

  const lines = [COMMENT_MARKER, `### ${headline(report)}`, ''];

  /*
   * Which opening line, decided by the *files* alone.
   *
   * `clean` is false when an advisory applies, which is what makes the comment
   * get posted at all — but the drift sentence below is about files, and a
   * file-clean repository with an advisory used to get it anyway: a comment
   * headed "AI rules are current" whose next line said they no longer match.
   * The reader believes one of the two, and the wrong one is right there in
   * bold.
   */
  if (filesClean) {
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

  lines.push(...advisorySection(report));
  lines.push(...newAiToolsSection(report));

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

/**
 * Advisories, rendered.
 *
 * Nothing about severity is decided here. The CLI already ranked these and
 * already decided whether the job fails; an action that recomputed either could
 * disagree with the command it wraps, and then two things would be telling the
 * same reader different stories about the same repository.
 *
 * The unentitled case is one line and no pitch. This lands in somebody's pull
 * request, where an advertisement is worse than useless — it is a reason to
 * turn the whole action off.
 */
function advisorySection(report) {
  const advisories = advisoriesOf(report);
  if (!advisories || advisories.items.length === 0) return [];

  const lines = [
    `**Advisories** — ${plural(advisories.items.length, 'known vendor change')} affecting this stack`,
    '',
  ];

  for (const advisory of advisories.items.slice(0, MAX_ADVISORIES)) {
    // Severity as a plain word, in the same vocabulary as everything else the
    // product prints. No emoji and no colour: a report that shouts gets muted.
    const label = `\`${advisory.severity}\``;
    if (advisories.entitled && advisory.summary) {
      const text = advisory.url ? `[${advisory.summary}](${advisory.url})` : advisory.summary;
      lines.push(`- ${label} ${text}`);
    } else {
      lines.push(`- ${label} \`${advisory.id}\``);
    }
  }
  if (advisories.items.length > MAX_ADVISORIES) {
    lines.push(`- …and ${advisories.items.length - MAX_ADVISORIES} more`);
  }
  lines.push('');

  if (!advisories.entitled) {
    lines.push(
      `_Details are part of a subscription — run \`ai-project-bootstrap login\` to see what each one says._`,
      '',
    );
  }

  return lines;
}

/**
 * The one finding whose fix is not `upgrade`.
 *
 * `aiTools` is an answer in `ai-project.config.json`, not a file on disk, so
 * refreshing changes nothing until the list itself is edited. Printing the
 * usual upgrade command here would send a reader round a loop that cannot
 * terminate — the CLI's own reporter says the same two things in the same
 * order, deliberately.
 */
function newAiToolsSection(report) {
  const tools = newAiToolsOf(report);
  if (tools.length === 0) return [];

  return [
    `**Not wired up** — ${plural(tools.length, 'AI tool')} this version can write rules for, that this project never opted into`,
    '',
    tools.map((tool) => `\`${tool}\``).join(' · '),
    '',
    `_Add them to \`aiTools\` in \`ai-project.config.json\`, then run \`upgrade\`. Nothing is written for a tool nobody asked for._`,
    '',
  ];
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

  const advisories = advisoriesOf(report);
  if (advisories) rows.push(['Advisories', advisories.items.length]);
  const tools = newAiToolsOf(report);
  if (tools.length > 0) rows.push(['AI tools not wired up', tools.length]);

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
