import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildOpencodeRiggingSection,
  buildRiggingSection,
  deployClaude,
  deployKiro,
  deployOpencode,
  uninstallClaude,
  uninstallKiro,
  uninstallOpencode,
} from './deploy.js';
import type { Language } from './detect.js';
import {
  AGENT_FILES,
  COMMAND_FILES,
  CORE_FILES,
  HOOK_FILES,
  LANG_MANIFEST,
  SKILLS,
  VENDORED_SKILLS,
} from './manifest.js';

function createFakeSource(root: string): void {
  mkdirSync(join(root, 'rules'), { recursive: true });
  mkdirSync(join(root, 'skills'), { recursive: true });
  mkdirSync(join(root, 'agents'), { recursive: true });
  mkdirSync(join(root, 'commands'), { recursive: true });
  mkdirSync(join(root, 'hooks'), { recursive: true });

  for (const file of CORE_FILES) {
    writeFileSync(join(root, 'rules', file), `# ${file}\nbody\n`);
  }
  for (const lang of LANG_MANIFEST) {
    writeFileSync(join(root, 'rules', lang.file), `# ${lang.file}\nbody\n`);
  }
  for (const skill of SKILLS) {
    writeFileSync(join(root, 'skills', skill.source), `# ${skill.source}\nbody\n`);
  }
  for (const skill of VENDORED_SKILLS) {
    // Directory-based skills ship their own SKILL.md plus bundled files.
    mkdirSync(join(root, 'skills', skill.dir, 'references'), { recursive: true });
    writeFileSync(
      join(root, 'skills', skill.dir, 'SKILL.md'),
      `---\nname: ${skill.name}\ndescription: "vendored"\nmanaged-by: rigging\n---\nbody\n`,
    );
    writeFileSync(
      join(root, 'skills', skill.dir, 'references', 'checklist.md'),
      `# checklist\nbody\n`,
    );
  }
  for (const f of AGENT_FILES) {
    // Agents need real frontmatter — makeKiroAgent reads name/description from it.
    writeFileSync(
      join(root, f),
      `---\nname: code-reviewer\ndescription: A test agent\n---\nYou are a test agent.\n`,
    );
  }
  for (const f of [...COMMAND_FILES, ...HOOK_FILES]) {
    writeFileSync(join(root, f), `# ${f}\nbody\n`);
  }
  writeFileSync(join(root, 'settings.json'), '{"v":1}');
}

describe('deployClaude', () => {
  let source: string;
  let target: string;

  beforeEach(() => {
    source = mkdtempSync(join(tmpdir(), 'rigging-deploy-src-'));
    target = mkdtempSync(join(tmpdir(), 'rigging-deploy-tgt-'));
    createFakeSource(source);
  });

  afterEach(() => {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });

  function deploy(detectedLanguages: Language[] = []): void {
    deployClaude({
      sourceRoot: source,
      targetRoot: target,
      detectedLanguages,
      log: () => {},
    });
  }

  it('writes all core rules to .claude/rules/', () => {
    deploy();
    for (const file of CORE_FILES) {
      expect(existsSync(join(target, '.claude/rules', file))).toBe(true);
    }
  });

  it('writes only detected language rules', () => {
    deploy(['node']);
    expect(existsSync(join(target, '.claude/rules/lang-node.md'))).toBe(true);
    expect(existsSync(join(target, '.claude/rules/lang-python.md'))).toBe(false);
    expect(existsSync(join(target, '.claude/rules/lang-go.md'))).toBe(false);
    expect(existsSync(join(target, '.claude/rules/lang-frontend.md'))).toBe(false);
  });

  it('falls back to all language rules when none are detected', () => {
    deploy([]);
    for (const lang of LANG_MANIFEST) {
      expect(existsSync(join(target, '.claude/rules', lang.file))).toBe(true);
    }
  });

  it('wraps each skill source with frontmatter and writes SKILL.md', () => {
    deploy();
    for (const skill of SKILLS) {
      const skillPath = join(target, '.claude/skills', skill.name, 'SKILL.md');
      expect(existsSync(skillPath)).toBe(true);
      const content = readFileSync(skillPath, 'utf8');
      expect(content).toContain(`name: ${skill.name}`);
      expect(content).toContain(`description: "${skill.description}"`);
      expect(content).toContain('managed-by: rigging');
      expect(content).toContain(`# ${skill.source}`);
    }
  });

  it('copies vendored skill directories verbatim, including bundled references', () => {
    deploy();
    for (const skill of VENDORED_SKILLS) {
      const skillDir = join(target, '.claude/skills', skill.name);
      expect(existsSync(join(skillDir, 'SKILL.md'))).toBe(true);
      expect(existsSync(join(skillDir, 'references/checklist.md'))).toBe(true);
      // Copied as-is, NOT re-wrapped: frontmatter is the source's own.
      const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
      expect(content).toContain(`name: ${skill.name}`);
      expect(content).toContain('managed-by: rigging');
    }
  });

  it('copies agent and command files verbatim', () => {
    deploy();
    for (const f of [...AGENT_FILES, ...COMMAND_FILES]) {
      expect(existsSync(join(target, '.claude', f))).toBe(true);
    }
  });

  it('copies hook files', () => {
    deploy();
    for (const f of HOOK_FILES) {
      expect(existsSync(join(target, '.claude', f))).toBe(true);
    }
  });

  it.skipIf(process.platform === 'win32')('sets executable bit on hooks', () => {
    deploy();
    for (const f of HOOK_FILES) {
      const mode = statSync(join(target, '.claude', f)).mode;
      expect(mode & 0o100).toBe(0o100);
    }
  });

  it('copies settings.json on a fresh install', () => {
    deploy();
    expect(existsSync(join(target, '.claude/settings.json'))).toBe(true);
    expect(readFileSync(join(target, '.claude/settings.json'), 'utf8')).toBe('{"v":1}');
  });

  it('writes a sidecar when settings.json already exists and differs', () => {
    mkdirSync(join(target, '.claude'), { recursive: true });
    writeFileSync(join(target, '.claude/settings.json'), '{"user":"custom"}');
    deploy();
    expect(readFileSync(join(target, '.claude/settings.json'), 'utf8')).toBe('{"user":"custom"}');
    expect(existsSync(join(target, '.claude/settings.rigging.json'))).toBe(true);
    expect(readFileSync(join(target, '.claude/settings.rigging.json'), 'utf8')).toBe('{"v":1}');
  });

  it('skips the sidecar when settings.json is already up to date', () => {
    mkdirSync(join(target, '.claude'), { recursive: true });
    writeFileSync(join(target, '.claude/settings.json'), '{"v":1}');
    deploy();
    expect(existsSync(join(target, '.claude/settings.rigging.json'))).toBe(false);
  });
});

describe('deployKiro', () => {
  let source: string;
  let target: string;

  beforeEach(() => {
    source = mkdtempSync(join(tmpdir(), 'rigging-kiro-src-'));
    target = mkdtempSync(join(tmpdir(), 'rigging-kiro-tgt-'));
    createFakeSource(source);
  });

  afterEach(() => {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });

  function deployK(detectedLanguages: Language[] = []): void {
    deployKiro({
      sourceRoot: source,
      targetRoot: target,
      detectedLanguages,
      log: () => {},
      installedAt: '2026-04-30',
      source: 'https://example.test/rigging',
    });
  }

  it('writes core rules with inclusion: always', () => {
    deployK();
    for (const file of CORE_FILES) {
      const path = join(target, '.kiro/steering', file);
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, 'utf8');
      expect(content).toContain('inclusion: always');
      expect(content).toContain('managed-by: rigging');
    }
  });

  it('writes detected lang rules with their fileMatch pattern', () => {
    deployK(['node']);
    const file = join(target, '.kiro/steering/lang-node.md');
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, 'utf8');
    expect(content).toContain('inclusion: fileMatch');
    expect(content).toContain('fileMatchPattern:');
    expect(content).toContain('package.json');
    expect(existsSync(join(target, '.kiro/steering/lang-go.md'))).toBe(false);
    expect(existsSync(join(target, '.kiro/steering/lang-python.md'))).toBe(false);
  });

  it('falls back to all languages when none are detected', () => {
    deployK([]);
    for (const lang of LANG_MANIFEST) {
      expect(existsSync(join(target, '.kiro/steering', lang.file))).toBe(true);
    }
  });

  it('writes skills to .kiro/skills/<name>/SKILL.md (official Kiro path)', () => {
    deployK();
    for (const skill of SKILLS) {
      const path = join(target, '.kiro/skills', skill.name, 'SKILL.md');
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, 'utf8');
      expect(content).toContain(`name: ${skill.name}`);
      expect(content).toContain(`description: "${skill.description}"`);
      // Should NOT use the old on-demand steering format.
      expect(content).not.toContain('inclusion: manual');
    }
    // Old path must be empty.
    expect(existsSync(join(target, '.kiro/steering/on-demand'))).toBe(false);
  });

  it('copies vendored skill directories to .kiro/skills/ verbatim', () => {
    deployK();
    for (const skill of VENDORED_SKILLS) {
      const skillDir = join(target, '.kiro/skills', skill.name);
      expect(existsSync(join(skillDir, 'SKILL.md'))).toBe(true);
      expect(existsSync(join(skillDir, 'references/checklist.md'))).toBe(true);
    }
  });

  it('writes the code-reviewer agent as Kiro JSON', () => {
    deployK();
    const path = join(target, '.kiro/agents/code-reviewer.json');
    expect(existsSync(path)).toBe(true);
    const json = JSON.parse(readFileSync(path, 'utf8'));
    expect(json.name).toBe('code-reviewer');
    expect(json.tools).toContain('read');
  });

  it('writes a standards.md entry file with source and installedAt baked in', () => {
    deployK();
    const content = readFileSync(join(target, '.kiro/steering/standards.md'), 'utf8');
    expect(content).toContain('inclusion: always');
    expect(content).toContain('managed-by: rigging');
    expect(content).toContain('# source: https://example.test/rigging');
    expect(content).toContain('# installed: 2026-04-30');
  });

  it('does not write any Claude-only artifacts', () => {
    deployK();
    expect(existsSync(join(target, '.claude'))).toBe(false);
  });
});

describe('buildRiggingSection', () => {
  it('wraps content in rigging markers', () => {
    const section = buildRiggingSection([], '2026-04-30', 'https://example.test');
    expect(section.startsWith('<!-- rigging:start -->')).toBe(true);
    expect(section.endsWith('<!-- rigging:end -->')).toBe(true);
  });

  it('lists detected language rules only', () => {
    const section = buildRiggingSection(['node', 'go'], '2026-04-30', 'x');
    expect(section).toContain('@.claude/rules/lang-node.md');
    expect(section).toContain('@.claude/rules/lang-go.md');
    expect(section).not.toContain('@.claude/rules/lang-python.md');
    expect(section).not.toContain('@.claude/rules/lang-frontend.md');
  });

  it('falls back to all language rules when none detected', () => {
    const section = buildRiggingSection([], '2026-04-30', 'x');
    expect(section).toContain('@.claude/rules/lang-node.md');
    expect(section).toContain('@.claude/rules/lang-python.md');
    expect(section).toContain('@.claude/rules/lang-go.md');
    expect(section).toContain('@.claude/rules/lang-frontend.md');
  });

  it('embeds all skills with their descriptions', () => {
    const section = buildRiggingSection([], '2026-04-30', 'x');
    for (const skill of [...SKILLS, ...VENDORED_SKILLS]) {
      expect(section).toContain(`**${skill.name}**`);
      expect(section).toContain(skill.description);
    }
  });

  it('embeds source URL and install date', () => {
    const section = buildRiggingSection([], '2026-04-30', 'https://example.test/abc');
    expect(section).toContain('# source: https://example.test/abc');
    expect(section).toContain('# installed: 2026-04-30');
  });
});

describe('deployClaude — AGENTS.md / CLAUDE.md fan-out', () => {
  let source: string;
  let target: string;

  beforeEach(() => {
    source = mkdtempSync(join(tmpdir(), 'rigging-entry-src-'));
    target = mkdtempSync(join(tmpdir(), 'rigging-entry-tgt-'));
    createFakeSource(source);
  });

  afterEach(() => {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });

  function deploy(detectedLanguages: Language[] = []): void {
    deployClaude({
      sourceRoot: source,
      targetRoot: target,
      detectedLanguages,
      log: () => {},
      installedAt: '2026-04-30',
      source: 'https://example.test/rigging',
    });
  }

  it('creates AGENTS.md with the rigging section', () => {
    deploy(['node']);
    const agentsPath = join(target, 'AGENTS.md');
    expect(existsSync(agentsPath)).toBe(true);
    const content = readFileSync(agentsPath, 'utf8');
    expect(content).toContain('<!-- rigging:start -->');
    expect(content).toContain('<!-- rigging:end -->');
    expect(content).toContain('# installed: 2026-04-30');
  });

  it('replaces only the marked section in an existing AGENTS.md, preserving user content', () => {
    writeFileSync(
      join(target, 'AGENTS.md'),
      '# My Project\n\nUser stuff above.\n\n<!-- rigging:start -->\nold section\n<!-- rigging:end -->\n\nUser stuff below.\n',
    );
    deploy(['node']);
    const content = readFileSync(join(target, 'AGENTS.md'), 'utf8');
    expect(content).toContain('# My Project');
    expect(content).toContain('User stuff above.');
    expect(content).toContain('User stuff below.');
    expect(content).not.toContain('old section');
    expect(content).toContain('# installed: 2026-04-30');
  });

  it('prepends the section when AGENTS.md exists without markers', () => {
    writeFileSync(join(target, 'AGENTS.md'), '# Plain user file\n\ncontent\n');
    deploy(['node']);
    const content = readFileSync(join(target, 'AGENTS.md'), 'utf8');
    expect(content.indexOf('<!-- rigging:start -->')).toBeLessThan(
      content.indexOf('# Plain user file'),
    );
    expect(content).toContain('# Plain user file');
  });

  it.skipIf(process.platform === 'win32')(
    'symlinks CLAUDE.md to AGENTS.md when neither exists',
    () => {
      deploy(['node']);
      const claudePath = join(target, 'CLAUDE.md');
      const stat = lstatSync(claudePath);
      expect(stat.isSymbolicLink()).toBe(true);
      expect(readlinkSync(claudePath)).toBe('AGENTS.md');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'is idempotent when CLAUDE.md is already a symlink to AGENTS.md',
    () => {
      deploy(['node']);
      const before = lstatSync(join(target, 'CLAUDE.md')).mtimeMs;
      deploy(['node']);
      // Still a symlink
      expect(lstatSync(join(target, 'CLAUDE.md')).isSymbolicLink()).toBe(true);
      // Compare via readlink target — mtime may differ on some platforms
      expect(readlinkSync(join(target, 'CLAUDE.md'))).toBe('AGENTS.md');
      void before;
    },
  );

  it('dual-writes CLAUDE.md when it already exists as a regular file', () => {
    writeFileSync(join(target, 'CLAUDE.md'), '# User CLAUDE.md\n\nuser content\n');
    deploy(['node']);
    const stat = lstatSync(join(target, 'CLAUDE.md'));
    expect(stat.isSymbolicLink()).toBe(false);
    const content = readFileSync(join(target, 'CLAUDE.md'), 'utf8');
    expect(content).toContain('user content');
    expect(content).toContain('<!-- rigging:start -->');
    expect(content).toContain('# installed: 2026-04-30');
  });
});

describe('uninstallClaude', () => {
  let source: string;
  let target: string;

  beforeEach(() => {
    source = mkdtempSync(join(tmpdir(), 'rigging-uc-src-'));
    target = mkdtempSync(join(tmpdir(), 'rigging-uc-tgt-'));
    createFakeSource(source);
  });

  afterEach(() => {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });

  function install(): void {
    deployClaude({
      sourceRoot: source,
      targetRoot: target,
      detectedLanguages: [],
      log: () => {},
      installedAt: '2026-04-30',
      source: 'https://example.test',
    });
  }

  function uninstall(): void {
    uninstallClaude({ targetRoot: target, log: () => {} });
  }

  it('removes every file deployClaude installed under .claude/', () => {
    install();
    uninstall();
    for (const file of CORE_FILES) {
      expect(existsSync(join(target, '.claude/rules', file))).toBe(false);
    }
    for (const lang of LANG_MANIFEST) {
      expect(existsSync(join(target, '.claude/rules', lang.file))).toBe(false);
    }
    for (const skill of SKILLS) {
      expect(existsSync(join(target, '.claude/skills', skill.name, 'SKILL.md'))).toBe(false);
    }
    for (const skill of VENDORED_SKILLS) {
      expect(existsSync(join(target, '.claude/skills', skill.name))).toBe(false);
    }
    for (const f of [...AGENT_FILES, ...COMMAND_FILES, ...HOOK_FILES]) {
      expect(existsSync(join(target, '.claude', f))).toBe(false);
    }
  });

  it('preserves user-created skills, agents, and rules', () => {
    install();
    mkdirSync(join(target, '.claude/skills/my-skill'), { recursive: true });
    writeFileSync(join(target, '.claude/skills/my-skill/SKILL.md'), 'user skill\n');
    writeFileSync(join(target, '.claude/rules/my-rule.md'), 'user rule\n');
    writeFileSync(join(target, '.claude/agents/my-agent.md'), 'user agent\n');
    uninstall();
    expect(existsSync(join(target, '.claude/skills/my-skill/SKILL.md'))).toBe(true);
    expect(existsSync(join(target, '.claude/rules/my-rule.md'))).toBe(true);
    expect(existsSync(join(target, '.claude/agents/my-agent.md'))).toBe(true);
  });

  it('preserves user-edited settings.json, removes only the sidecar', () => {
    install();
    // Simulate sidecar branch: user had pre-existing settings.json.
    writeFileSync(join(target, '.claude/settings.rigging.json'), '{"v":1}');
    writeFileSync(join(target, '.claude/settings.json'), '{"user":"custom"}');
    uninstall();
    expect(existsSync(join(target, '.claude/settings.json'))).toBe(true);
    expect(readFileSync(join(target, '.claude/settings.json'), 'utf8')).toBe('{"user":"custom"}');
    expect(existsSync(join(target, '.claude/settings.rigging.json'))).toBe(false);
  });

  it('removes the rigging section from AGENTS.md, preserving user content', () => {
    install();
    // Add user content above and below the marker section.
    const content = readFileSync(join(target, 'AGENTS.md'), 'utf8');
    writeFileSync(join(target, 'AGENTS.md'), `# My Project\n\n${content}\n\n# Footer\n`);
    uninstall();
    const after = readFileSync(join(target, 'AGENTS.md'), 'utf8');
    expect(after).toContain('# My Project');
    expect(after).toContain('# Footer');
    expect(after).not.toContain('<!-- rigging:start -->');
    expect(after).not.toContain('# installed: 2026-04-30');
  });

  it('deletes AGENTS.md when nothing remains after section removal', () => {
    install();
    uninstall();
    expect(existsSync(join(target, 'AGENTS.md'))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')(
    'unlinks CLAUDE.md when it is a symlink to AGENTS.md',
    () => {
      install();
      // After install, CLAUDE.md is a symlink (no user content)
      expect(lstatSync(join(target, 'CLAUDE.md')).isSymbolicLink()).toBe(true);
      uninstall();
      expect(existsSync(join(target, 'CLAUDE.md'))).toBe(false);
    },
  );

  it('removes empty subdirectories under .claude/ but leaves .claude/ itself', () => {
    install();
    // Add a settings.json to ensure .claude/ stays around.
    uninstall();
    expect(existsSync(join(target, '.claude/rules'))).toBe(false);
    expect(existsSync(join(target, '.claude/skills'))).toBe(false);
    expect(existsSync(join(target, '.claude/agents'))).toBe(false);
    expect(existsSync(join(target, '.claude/hooks'))).toBe(false);
    // .claude/ is preserved (settings.json may live there)
    expect(existsSync(join(target, '.claude'))).toBe(true);
  });
});

describe('uninstallKiro', () => {
  let source: string;
  let target: string;

  beforeEach(() => {
    source = mkdtempSync(join(tmpdir(), 'rigging-uk-src-'));
    target = mkdtempSync(join(tmpdir(), 'rigging-uk-tgt-'));
    createFakeSource(source);
    deployKiro({
      sourceRoot: source,
      targetRoot: target,
      detectedLanguages: [],
      log: () => {},
      installedAt: '2026-04-30',
      source: 'https://example.test',
    });
  });

  afterEach(() => {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });

  function uninstall(): void {
    uninstallKiro({ targetRoot: target, log: () => {} });
  }

  it('removes core and lang steering files', () => {
    uninstall();
    for (const file of CORE_FILES) {
      expect(existsSync(join(target, '.kiro/steering', file))).toBe(false);
    }
    for (const lang of LANG_MANIFEST) {
      expect(existsSync(join(target, '.kiro/steering', lang.file))).toBe(false);
    }
  });

  it('removes the standards.md entry file', () => {
    uninstall();
    expect(existsSync(join(target, '.kiro/steering/standards.md'))).toBe(false);
  });

  it('removes skills folders under .kiro/skills/', () => {
    uninstall();
    for (const skill of SKILLS) {
      expect(existsSync(join(target, '.kiro/skills', skill.name, 'SKILL.md'))).toBe(false);
      expect(existsSync(join(target, '.kiro/skills', skill.name))).toBe(false);
    }
    for (const skill of VENDORED_SKILLS) {
      expect(existsSync(join(target, '.kiro/skills', skill.name))).toBe(false);
    }
  });

  it('removes the code-reviewer agent JSON', () => {
    uninstall();
    expect(existsSync(join(target, '.kiro/agents/code-reviewer.json'))).toBe(false);
  });

  it('preserves user-created skills', () => {
    mkdirSync(join(target, '.kiro/skills/user-skill'), { recursive: true });
    writeFileSync(join(target, '.kiro/skills/user-skill/SKILL.md'), 'user skill\n');
    uninstall();
    expect(existsSync(join(target, '.kiro/skills/user-skill/SKILL.md'))).toBe(true);
  });
});

describe('deployOpencode', () => {
  let source: string;
  let target: string;

  beforeEach(() => {
    source = mkdtempSync(join(tmpdir(), 'rigging-oc-src-'));
    target = mkdtempSync(join(tmpdir(), 'rigging-oc-tgt-'));
    createFakeSource(source);
  });

  afterEach(() => {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });

  function deployO(detectedLanguages: Language[] = []): void {
    deployOpencode({
      sourceRoot: source,
      targetRoot: target,
      detectedLanguages,
      log: () => {},
      installedAt: '2026-04-30',
      source: 'https://example.test/rigging',
    });
  }

  it('writes core rules to .opencode/rules/ with frontmatter stripped', () => {
    // Inject paths: frontmatter into a fake rule to confirm it gets stripped.
    writeFileSync(
      join(source, 'rules', CORE_FILES[0]),
      '---\npaths:\n  - "**/*.md"\n---\n# core\nbody\n',
    );
    deployO();
    for (const file of CORE_FILES) {
      const path = join(target, '.opencode/rules', file);
      expect(existsSync(path)).toBe(true);
    }
    const content = readFileSync(join(target, '.opencode/rules', CORE_FILES[0]), 'utf8');
    expect(content).not.toContain('paths:');
    expect(content).toContain('# core');
  });

  it('writes detected lang rules with frontmatter stripped (no path gating)', () => {
    writeFileSync(
      join(source, 'rules/lang-node.md'),
      '---\npaths:\n  - "**/*.ts"\n---\n# node\nbody\n',
    );
    deployO(['node']);
    const path = join(target, '.opencode/rules/lang-node.md');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).not.toContain('paths:');
    expect(content).not.toContain('"**/*.ts"');
    expect(content).toContain('# node');
    // Other langs not installed
    expect(existsSync(join(target, '.opencode/rules/lang-go.md'))).toBe(false);
  });

  it('falls back to all language rules when none are detected', () => {
    deployO([]);
    for (const lang of LANG_MANIFEST) {
      expect(existsSync(join(target, '.opencode/rules', lang.file))).toBe(true);
    }
  });

  it('writes skills to .opencode/skills/<name>/SKILL.md', () => {
    deployO();
    for (const skill of SKILLS) {
      const path = join(target, '.opencode/skills', skill.name, 'SKILL.md');
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, 'utf8');
      expect(content).toContain(`name: ${skill.name}`);
      expect(content).toContain(`description: "${skill.description}"`);
    }
  });

  it('copies vendored skill directories verbatim', () => {
    deployO();
    for (const skill of VENDORED_SKILLS) {
      const skillDir = join(target, '.opencode/skills', skill.name);
      expect(existsSync(join(skillDir, 'SKILL.md'))).toBe(true);
      expect(existsSync(join(skillDir, 'references/checklist.md'))).toBe(true);
    }
  });

  it('writes agents to .opencode/agents/ with mode: subagent and no tools: field', () => {
    deployO();
    const path = join(target, '.opencode/agents/code-reviewer.md');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('mode: subagent');
    expect(content).toContain('description: A test agent');
    expect(content).toContain('managed-by: rigging');
    expect(content).not.toContain('tools:');
  });

  it('writes commands to .opencode/commands/ with Claude-specific frontmatter dropped', () => {
    // Replace the fake command body with one carrying Claude-only frontmatter.
    writeFileSync(
      join(source, 'commands/commit.md'),
      '---\ndescription: Commit\nargument-hint: [ctx]\nallowed-tools: Bash(git:*)\n---\nbody\n',
    );
    deployO();
    const path = join(target, '.opencode/commands/commit.md');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('description: Commit');
    expect(content).not.toContain('argument-hint:');
    expect(content).not.toContain('allowed-tools:');
    expect(content).toContain('body');
  });

  it('writes opencode.json on a fresh install', () => {
    deployO();
    const path = join(target, 'opencode.json');
    expect(existsSync(path)).toBe(true);
    const cfg = JSON.parse(readFileSync(path, 'utf8'));
    expect(cfg.$schema).toBe('https://opencode.ai/config.json');
    expect(cfg.instructions).toEqual(['.opencode/rules/*.md']);
  });

  it('writes a sidecar when opencode.json already exists and differs', () => {
    writeFileSync(join(target, 'opencode.json'), '{"user":"custom"}');
    deployO();
    expect(readFileSync(join(target, 'opencode.json'), 'utf8')).toBe('{"user":"custom"}');
    expect(existsSync(join(target, 'opencode.rigging.json'))).toBe(true);
    const sidecar = JSON.parse(readFileSync(join(target, 'opencode.rigging.json'), 'utf8'));
    expect(sidecar.instructions).toEqual(['.opencode/rules/*.md']);
  });

  it('writes AGENTS.md with the opencode-specific marker section', () => {
    deployO(['node']);
    const agentsPath = join(target, 'AGENTS.md');
    expect(existsSync(agentsPath)).toBe(true);
    const content = readFileSync(agentsPath, 'utf8');
    expect(content).toContain('<!-- rigging:opencode:start -->');
    expect(content).toContain('<!-- rigging:opencode:end -->');
    expect(content).toContain('# installed: 2026-04-30');
    expect(content).toContain('.opencode/rules/lang-node.md');
  });

  it('does not write any Claude-only or Kiro-only artifacts', () => {
    deployO();
    expect(existsSync(join(target, '.claude'))).toBe(false);
    expect(existsSync(join(target, '.kiro'))).toBe(false);
    expect(existsSync(join(target, 'CLAUDE.md'))).toBe(false);
  });

  it('does not install hooks (opencode has no event-hook system)', () => {
    deployO();
    expect(existsSync(join(target, '.opencode/hooks'))).toBe(false);
  });
});

describe('buildOpencodeRiggingSection', () => {
  it('wraps content in opencode-specific markers', () => {
    const section = buildOpencodeRiggingSection([], '2026-04-30', 'x');
    expect(section.startsWith('<!-- rigging:opencode:start -->')).toBe(true);
    expect(section.endsWith('<!-- rigging:opencode:end -->')).toBe(true);
  });

  it('references .opencode/rules/ paths (not .claude/rules/)', () => {
    const section = buildOpencodeRiggingSection(['node'], '2026-04-30', 'x');
    expect(section).toContain('.opencode/rules/lang-node.md');
    expect(section).not.toContain('.claude/rules/');
  });

  it('lists every skill with its description', () => {
    const section = buildOpencodeRiggingSection([], '2026-04-30', 'x');
    for (const skill of [...SKILLS, ...VENDORED_SKILLS]) {
      expect(section).toContain(`**${skill.name}**`);
      expect(section).toContain(skill.description);
    }
  });
});

describe('deploy claude + opencode coexistence in AGENTS.md', () => {
  let source: string;
  let target: string;

  beforeEach(() => {
    source = mkdtempSync(join(tmpdir(), 'rigging-coexist-src-'));
    target = mkdtempSync(join(tmpdir(), 'rigging-coexist-tgt-'));
    createFakeSource(source);
  });

  afterEach(() => {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });

  function deployBoth(): void {
    const opts = {
      sourceRoot: source,
      targetRoot: target,
      detectedLanguages: ['node'] as Language[],
      log: () => {},
      installedAt: '2026-04-30',
      source: 'https://example.test/rigging',
    };
    deployClaude(opts);
    deployOpencode(opts);
  }

  it('keeps both Claude and opencode marker sections side by side in AGENTS.md', () => {
    deployBoth();
    const content = readFileSync(join(target, 'AGENTS.md'), 'utf8');
    expect(content).toContain('<!-- rigging:start -->');
    expect(content).toContain('<!-- rigging:end -->');
    expect(content).toContain('<!-- rigging:opencode:start -->');
    expect(content).toContain('<!-- rigging:opencode:end -->');
    // Claude section references .claude/, opencode section references .opencode/.
    expect(content).toContain('@.claude/rules/lang-node.md');
    expect(content).toContain('.opencode/rules/lang-node.md');
  });

  it('uninstalling opencode leaves the Claude section intact', () => {
    deployBoth();
    uninstallOpencode({ targetRoot: target, log: () => {} });
    const content = readFileSync(join(target, 'AGENTS.md'), 'utf8');
    expect(content).toContain('<!-- rigging:start -->');
    expect(content).toContain('<!-- rigging:end -->');
    expect(content).not.toContain('<!-- rigging:opencode:start -->');
    expect(content).not.toContain('<!-- rigging:opencode:end -->');
    expect(existsSync(join(target, '.opencode'))).toBe(false);
    // Claude artifacts still present
    expect(existsSync(join(target, '.claude/rules', CORE_FILES[0]))).toBe(true);
  });

  it('uninstalling Claude leaves the opencode section intact', () => {
    deployBoth();
    uninstallClaude({ targetRoot: target, log: () => {} });
    const content = readFileSync(join(target, 'AGENTS.md'), 'utf8');
    expect(content).not.toContain('<!-- rigging:start -->');
    expect(content).not.toContain('<!-- rigging:end -->');
    expect(content).toContain('<!-- rigging:opencode:start -->');
    expect(content).toContain('<!-- rigging:opencode:end -->');
    expect(existsSync(join(target, '.opencode/rules', CORE_FILES[0]))).toBe(true);
  });
});

describe('uninstallOpencode', () => {
  let source: string;
  let target: string;

  beforeEach(() => {
    source = mkdtempSync(join(tmpdir(), 'rigging-uoc-src-'));
    target = mkdtempSync(join(tmpdir(), 'rigging-uoc-tgt-'));
    createFakeSource(source);
    deployOpencode({
      sourceRoot: source,
      targetRoot: target,
      detectedLanguages: [],
      log: () => {},
      installedAt: '2026-04-30',
      source: 'https://example.test',
    });
  });

  afterEach(() => {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });

  function uninstall(): void {
    uninstallOpencode({ targetRoot: target, log: () => {} });
  }

  it('removes every file deployOpencode installed under .opencode/', () => {
    uninstall();
    for (const file of CORE_FILES) {
      expect(existsSync(join(target, '.opencode/rules', file))).toBe(false);
    }
    for (const lang of LANG_MANIFEST) {
      expect(existsSync(join(target, '.opencode/rules', lang.file))).toBe(false);
    }
    for (const skill of SKILLS) {
      expect(existsSync(join(target, '.opencode/skills', skill.name, 'SKILL.md'))).toBe(false);
    }
    for (const skill of VENDORED_SKILLS) {
      expect(existsSync(join(target, '.opencode/skills', skill.name))).toBe(false);
    }
    for (const f of AGENT_FILES) {
      expect(existsSync(join(target, '.opencode/agents', f.split('/').pop()!))).toBe(false);
    }
    for (const f of COMMAND_FILES) {
      expect(existsSync(join(target, '.opencode/commands', f.split('/').pop()!))).toBe(false);
    }
    // Whole .opencode/ tree should be gone (no user content was added).
    expect(existsSync(join(target, '.opencode'))).toBe(false);
  });

  it('removes opencode.json when it was installed fresh by us', () => {
    uninstall();
    expect(existsSync(join(target, 'opencode.json'))).toBe(false);
  });

  it('preserves a user-edited opencode.json', () => {
    // Replace our pristine opencode.json with user-modified content.
    writeFileSync(join(target, 'opencode.json'), '{"user":"custom"}');
    uninstall();
    expect(existsSync(join(target, 'opencode.json'))).toBe(true);
    expect(readFileSync(join(target, 'opencode.json'), 'utf8')).toBe('{"user":"custom"}');
  });

  it('removes the sidecar opencode.rigging.json if present', () => {
    writeFileSync(join(target, 'opencode.rigging.json'), '{"v":1}');
    uninstall();
    expect(existsSync(join(target, 'opencode.rigging.json'))).toBe(false);
  });

  it('strips the opencode section from AGENTS.md but preserves user content', () => {
    // Add user content above and below the marker section.
    const content = readFileSync(join(target, 'AGENTS.md'), 'utf8');
    writeFileSync(join(target, 'AGENTS.md'), `# My Project\n\n${content}\n\n# Footer\n`);
    uninstall();
    const after = readFileSync(join(target, 'AGENTS.md'), 'utf8');
    expect(after).toContain('# My Project');
    expect(after).toContain('# Footer');
    expect(after).not.toContain('<!-- rigging:opencode:start -->');
  });

  it('preserves user-created skills under .opencode/skills/', () => {
    mkdirSync(join(target, '.opencode/skills/user-skill'), { recursive: true });
    writeFileSync(join(target, '.opencode/skills/user-skill/SKILL.md'), 'user skill\n');
    uninstall();
    expect(existsSync(join(target, '.opencode/skills/user-skill/SKILL.md'))).toBe(true);
  });
});
