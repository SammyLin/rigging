// Generate the README skill tables from the manifest, so the skill list has a
// single source of truth (manifest.ts) instead of being hand-maintained in
// three places. The README tables are real Markdown tables (outside any code
// fence), so HTML-comment markers around them are safe and don't render.
//
// Usage: see scripts/gen-docs.ts (`pnpm gen:docs` to write, `--check` to verify).
// A drift guard lives in gen-docs.test.ts so `pnpm test` fails when a doc is
// out of sync with the manifest.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILLS, VENDORED_SKILLS } from './manifest.js';

export const SKILL_TABLE_START = '<!-- skills:table:start -->';
export const SKILL_TABLE_END = '<!-- skills:table:end -->';

type Lang = 'en' | 'zh';

interface SkillRow {
  name: string;
  path: string; // source path used for the link, e.g. skills/security.md
  summary: string;
  summaryZh: string;
}

// Flatten both skill kinds into uniform rows. Wrapped skills link to their
// single source file; vendored skills link to their directory.
function skillRows(): SkillRow[] {
  const wrapped = SKILLS.map((s) => ({
    name: s.name,
    path: `skills/${s.source}`,
    summary: s.summary,
    summaryZh: s.summaryZh,
  }));
  const vendored = VENDORED_SKILLS.map((s) => ({
    name: s.name,
    path: `skills/${s.dir}/`,
    summary: s.summary,
    summaryZh: s.summaryZh,
  }));
  return [...wrapped, ...vendored];
}

// Render the Markdown table (header + one row per skill) for the given language.
export function renderSkillTable(lang: Lang): string {
  const header =
    lang === 'zh'
      ? '| Skill | 來源 | 觸發場景 |\n|-------|------|---------|'
      : '| Skill | Source | Trigger |\n|-------|--------|---------|';
  const rows = skillRows().map((r) => {
    const trigger = lang === 'zh' ? r.summaryZh : r.summary;
    return `| \`${r.name}\` | [${r.path}](${r.path}) | ${trigger} |`;
  });
  return [header, ...rows].join('\n');
}

// Replace the content between the table markers. Throws if markers are missing
// so a malformed doc fails loudly rather than silently skipping the update.
function replaceTableRegion(content: string, table: string, file: string): string {
  const start = content.indexOf(SKILL_TABLE_START);
  const end = content.indexOf(SKILL_TABLE_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `${file}: missing skill-table markers (${SKILL_TABLE_START} / ${SKILL_TABLE_END}). ` +
        `Add them around the skill table so the generator can fill it.`,
    );
  }
  const before = content.slice(0, start + SKILL_TABLE_START.length);
  const after = content.slice(end);
  return `${before}\n${table}\n${after}`;
}

interface SyncResult {
  file: string;
  changed: boolean;
}

const DOCS: ReadonlyArray<{ file: string; lang: Lang }> = [
  { file: 'README.md', lang: 'en' },
  { file: 'README.zh-TW.md', lang: 'zh' },
];

// Regenerate (or, in check mode, verify) the skill table in each README.
// Returns one result per doc. In check mode, `changed: true` means the doc is
// stale and would be rewritten — the caller decides how to surface that.
export function syncDocs(opts: { repoRoot: string; check: boolean }): SyncResult[] {
  return DOCS.map(({ file, lang }) => {
    const path = join(opts.repoRoot, file);
    const current = readFileSync(path, 'utf8');
    const next = replaceTableRegion(current, renderSkillTable(lang), file);
    const changed = next !== current;
    if (changed && !opts.check) writeFileSync(path, next);
    return { file, changed };
  });
}
