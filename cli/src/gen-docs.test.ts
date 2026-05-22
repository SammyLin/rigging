import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { renderSkillTable, syncDocs } from './gen-docs.js';
import { SKILLS, VENDORED_SKILLS } from './manifest.js';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('renderSkillTable', () => {
  it('lists every skill (wrapped + vendored) with its name and source link', () => {
    const table = renderSkillTable('en');
    for (const s of SKILLS) {
      expect(table).toContain(`\`${s.name}\``);
      expect(table).toContain(`skills/${s.source}`);
      expect(table).toContain(s.summary);
    }
    for (const s of VENDORED_SKILLS) {
      expect(table).toContain(`\`${s.name}\``);
      expect(table).toContain(`skills/${s.dir}/`);
      expect(table).toContain(s.summary);
    }
  });

  it('uses the zh-TW header and triggers for the zh table', () => {
    const table = renderSkillTable('zh');
    expect(table).toContain('| Skill | 來源 | 觸發場景 |');
    expect(table).toContain(SKILLS[0].summaryZh);
  });
});

// Drift guard: the committed READMEs must match the manifest. If this fails,
// run `pnpm gen:docs`. This is the mechanical enforcement that replaces manual
// cross-file syncing when a skill is added or changed.
describe('README skill tables stay in sync with the manifest', () => {
  it('has no pending changes in check mode', () => {
    const results = syncDocs({ repoRoot, check: true });
    const stale = results.filter((r) => r.changed).map((r) => r.file);
    expect(stale, `run \`pnpm gen:docs\` to regenerate: ${stale.join(', ')}`).toEqual([]);
  });
});
