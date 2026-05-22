import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { makeSkill } from './claude-format.js';
import type { Language } from './detect.js';
import { makeKiroAgent, makeKiroSteering } from './kiro-convert.js';
import {
  AGENT_FILES,
  COMMAND_FILES,
  CORE_FILES,
  HOOK_FILES,
  LANG_MANIFEST,
  SKILLS,
  VENDORED_SKILLS,
} from './manifest.js';

const DEFAULT_SOURCE = 'https://github.com/SammyLin/rigging';
const MARKER_START = '<!-- rigging:start -->';
const MARKER_END = '<!-- rigging:end -->';

export interface DeployOptions {
  // Where the rigging source files live (rules/, skills/, etc.).
  sourceRoot: string;
  // Where `.claude/` will be created (typically the user's project root).
  targetRoot: string;
  // Subset of languages to install. Empty array = install all (matches setup.sh fallback).
  detectedLanguages: Language[];
  // Pluggable for testing; defaults to console.log.
  log?: (message: string) => void;
  // Used in generated entry files (Kiro standards.md, future CLAUDE.md).
  // Override for deterministic tests.
  installedAt?: string; // YYYY-MM-DD; default = today
  source?: string; // canonical rigging URL; default = DEFAULT_SOURCE
}

export function deployClaude(options: DeployOptions): void {
  const {
    sourceRoot,
    targetRoot,
    detectedLanguages,
    log = console.log,
    installedAt = todayIso(),
    source = DEFAULT_SOURCE,
  } = options;
  const claudeDir = join(targetRoot, '.claude');

  log('Layer 1 — Core rules:');
  for (const file of CORE_FILES) {
    copyTo(join(sourceRoot, 'rules', file), join(claudeDir, 'rules', file));
    log(`  ✓ ${file}`);
  }

  log('Layer 2 — Language rules:');
  const langs =
    detectedLanguages.length > 0
      ? LANG_MANIFEST.filter((m) => detectedLanguages.includes(m.language))
      : LANG_MANIFEST;
  if (detectedLanguages.length === 0) {
    log('  (no languages detected — installing all)');
  }
  for (const lang of langs) {
    copyTo(join(sourceRoot, 'rules', lang.file), join(claudeDir, 'rules', lang.file));
    log(`  ✓ ${lang.file} (${lang.label})`);
  }

  log('Layer 3 — Skills:');
  for (const skill of SKILLS) {
    const source = readFileSync(join(sourceRoot, 'skills', skill.source), 'utf8');
    const wrapped = makeSkill(skill.name, skill.description, source);
    writeTo(join(claudeDir, 'skills', skill.name, 'SKILL.md'), wrapped);
    log(`  ✓ ${skill.name}/`);
  }
  for (const skill of VENDORED_SKILLS) {
    copyDir(join(sourceRoot, 'skills', skill.dir), join(claudeDir, 'skills', skill.name));
    log(`  ✓ ${skill.name}/ (vendored)`);
  }

  log('Layer 4 — Agents + Commands:');
  for (const f of [...AGENT_FILES, ...COMMAND_FILES]) {
    copyTo(join(sourceRoot, f), join(claudeDir, f));
    log(`  ✓ ${basename(f)}`);
  }

  log('Layer 5 — Hooks + Settings:');
  for (const f of HOOK_FILES) {
    const dest = join(claudeDir, f);
    copyTo(join(sourceRoot, f), dest);
    chmodSync(dest, 0o755);
    log(`  ✓ ${basename(f)} (chmod +x)`);
  }
  installSettings(sourceRoot, claudeDir, log);

  log('Entry files (AGENTS.md / CLAUDE.md):');
  const section = buildRiggingSection(detectedLanguages, installedAt, source);
  const agentsAction = mergeRiggingSection(join(targetRoot, 'AGENTS.md'), section);
  log(`  ✓ AGENTS.md (${agentsAction})`);
  syncClaudeMd(join(targetRoot, 'CLAUDE.md'), section, log);
}

// Build the rigging section that goes inside AGENTS.md / CLAUDE.md, wrapped
// with marker comments so future runs can replace just the section while
// preserving any user-authored content above or below.
export function buildRiggingSection(
  detectedLanguages: Language[],
  installedAt: string,
  source: string,
): string {
  const langs =
    detectedLanguages.length > 0
      ? LANG_MANIFEST.filter((m) => detectedLanguages.includes(m.language))
      : LANG_MANIFEST;
  const coreLines = CORE_FILES.map((f) => `- @.claude/rules/${f}`).join('\n');
  const langLines = langs.map((l) => `- @.claude/rules/${l.file}`).join('\n');
  const skillLines = [...SKILLS, ...VENDORED_SKILLS]
    .map((s) => `- **${s.name}**: ${s.description}`)
    .join('\n');

  return `${MARKER_START}
# rigging standards
# source: ${source}
# installed: ${installedAt}

## Core Philosophy

One feature at a time. Verify before moving on. No overengineering.

## Task Flow (5 steps)

1. **Research** — read related source files (use built-in Explore subagent for breadth)
2. **Plan** — for >3 files, produce a PRP (see prp-template.md) before implementing
3. **Implement** — one feature at a time, TDD; \`auto-format\` hook runs on every edit
4. **Verify** — run \`/review\` to invoke \`code-reviewer\` subagent against core rules
5. **Commit** — run \`/commit\` to lint + test + produce a conventional commit message

## Rules (path-scoped auto-loaded)

Core rules (always in context):
${coreLines}

Language rules (load only when matching files are in context):
${langLines}

## Skills (agent-invoked on demand)

Skills live in \`.claude/skills/\`. Claude loads one only when its description matches the task.

${skillLines}

## Subagent + Commands

- Subagent **code-reviewer** — structured review against core rules (no edits)
- Command **/review** — invokes code-reviewer on current diff
- Command **/commit** — lint + test + conventional commit message

## Hooks (automatic)

- **PostToolUse** (Edit/Write/MultiEdit) → \`.claude/hooks/auto-format.sh\` (gofmt / ruff / prettier)
- **PreToolUse** (Bash) → \`.claude/hooks/secret-guard.sh\` (blocks \`.env\`, \`rm -rf\`, \`curl|sh\`)
${MARKER_END}`;
}

type MergeAction = 'created' | 'replaced' | 'prepended';

// Merge the rigging section into a file. Three cases:
//   - file missing            → write the section as-is
//   - file has both markers   → replace what's between, preserve everything else
//   - file lacks markers      → prepend the section so it's at the top
function mergeRiggingSection(filePath: string, section: string): MergeAction {
  let existing: string | null = null;
  try {
    existing = readFileSync(filePath, 'utf8');
  } catch {
    existing = null;
  }
  if (existing === null) {
    writeFileSync(filePath, section + '\n');
    return 'created';
  }
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + MARKER_END.length);
    writeFileSync(filePath, before + section + after);
    return 'replaced';
  }
  writeFileSync(filePath, section + '\n\n' + existing);
  return 'prepended';
}

// Keep CLAUDE.md in sync with AGENTS.md. Symlink when possible so they can
// never drift; otherwise dual-write the section into both files.
function syncClaudeMd(claudePath: string, section: string, log: (msg: string) => void): void {
  if (isSymlinkPointingTo(claudePath, 'AGENTS.md')) {
    log('  ✓ CLAUDE.md → AGENTS.md (symlink already in place)');
    return;
  }
  if (!pathExists(claudePath) && process.platform !== 'win32') {
    try {
      symlinkSync('AGENTS.md', claudePath);
      log('  ✓ CLAUDE.md → AGENTS.md (symlink)');
      return;
    } catch {
      // fall through to dual-write
    }
  }
  const action = mergeRiggingSection(claudePath, section);
  log(`  ✓ CLAUDE.md (${action})`);
}

function isSymlinkPointingTo(linkPath: string, expected: string): boolean {
  try {
    const stat = lstatSync(linkPath);
    if (!stat.isSymbolicLink()) return false;
    return readlinkSync(linkPath) === expected;
  } catch {
    return false;
  }
}

function pathExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

// settings.json install policy:
//   no existing file       → copy
//   identical to source    → no-op
//   exists and differs     → write sidecar at .claude/settings.rigging.json,
//                            leave the user's file untouched
function installSettings(sourceRoot: string, claudeDir: string, log: (msg: string) => void): void {
  const src = join(sourceRoot, 'settings.json');
  if (!existsSync(src)) return;
  const dest = join(claudeDir, 'settings.json');
  if (!existsSync(dest)) {
    copyTo(src, dest);
    log('  ✓ settings.json');
    return;
  }
  if (filesEqual(src, dest)) {
    log('  ✓ settings.json (already up to date)');
    return;
  }
  const sidecar = join(claudeDir, 'settings.rigging.json');
  copyTo(src, sidecar);
  log(`  ! settings.json differs — team version installed at ${sidecar}`);
}

export function deployKiro(options: DeployOptions): void {
  const {
    sourceRoot,
    targetRoot,
    detectedLanguages,
    log = console.log,
    installedAt = todayIso(),
    source = DEFAULT_SOURCE,
  } = options;
  const steeringDir = join(targetRoot, '.kiro/steering');
  const agentsDir = join(targetRoot, '.kiro/agents');

  log('Layer 1 — Core rules (always loaded):');
  for (const file of CORE_FILES) {
    const src = readFileSync(join(sourceRoot, 'rules', file), 'utf8');
    writeTo(join(steeringDir, file), makeKiroSteering(src));
    log(`  ✓ ${file}`);
  }

  log('Layer 2 — Language rules (inclusion: fileMatch):');
  const langs =
    detectedLanguages.length > 0
      ? LANG_MANIFEST.filter((m) => detectedLanguages.includes(m.language))
      : LANG_MANIFEST;
  if (detectedLanguages.length === 0) {
    log('  (no languages detected — installing all)');
  }
  for (const lang of langs) {
    const src = readFileSync(join(sourceRoot, 'rules', lang.file), 'utf8');
    writeTo(join(steeringDir, lang.file), makeKiroSteering(src, lang.kiroPattern));
    log(`  ✓ ${lang.file} → ${lang.kiroPattern.join(', ')}`);
  }

  log('Layer 3 — Skills (.kiro/skills/<name>/SKILL.md):');
  for (const skill of SKILLS) {
    const src = readFileSync(join(sourceRoot, 'skills', skill.source), 'utf8');
    const wrapped = makeSkill(skill.name, skill.description, src);
    writeTo(join(targetRoot, '.kiro/skills', skill.name, 'SKILL.md'), wrapped);
    log(`  ✓ ${skill.name}/`);
  }
  for (const skill of VENDORED_SKILLS) {
    copyDir(join(sourceRoot, 'skills', skill.dir), join(targetRoot, '.kiro/skills', skill.name));
    log(`  ✓ ${skill.name}/ (vendored)`);
  }

  log('Layer 4 — Agents (code-reviewer as JSON):');
  for (const f of AGENT_FILES) {
    const src = readFileSync(join(sourceRoot, f), 'utf8');
    const jsonName = basename(f, '.md') + '.json';
    writeTo(join(agentsDir, jsonName), makeKiroAgent(src));
    log(`  ✓ ${jsonName}`);
  }

  writeTo(join(steeringDir, 'standards.md'), buildKiroEntry(source, installedAt));
  log('  ✓ standards.md (entry file)');
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildKiroEntry(source: string, installedAt: string): string {
  return `---
inclusion: always
managed-by: rigging
---
# rigging standards
# source: ${source}
# installed: ${installedAt}

## Core Philosophy

One feature at a time. Verify before moving on. No overengineering.

## Task Flow

1. Research → read related source files
2. Plan → list files to change, confirm if >3 files
3. Implement → one feature at a time, TDD
4. Verify → invoke code-reviewer agent: \`kiro-cli chat --agent code-reviewer\`
5. Commit → conventional message, after lint + test pass

## Not installed for Kiro CLI

The following Claude Code features have no direct Kiro CLI equivalent and are skipped:

- Slash commands (\`/commit\`, \`/review\`) — Kiro CLI doesn't support user-defined slash commands
- Hooks — Kiro CLI's hook model differs (agentSpawn, userPromptSubmit, preToolUse). Configure in Kiro settings if needed.
- settings.json — Kiro CLI permissions live in Kiro's own config, not in project files

The rules and subagent above cover the core value. For hooks, see docs/hooks-cookbook.md upstream.
`;
}

export interface UninstallOptions {
  targetRoot: string;
  log?: (message: string) => void;
}

export function uninstallClaude(options: UninstallOptions): void {
  const { targetRoot, log = console.log } = options;
  const claudeDir = join(targetRoot, '.claude');

  log('Removing rigging-managed Claude files:');
  for (const file of CORE_FILES) {
    if (removeIfExists(join(claudeDir, 'rules', file))) log(`  ✗ rules/${file}`);
  }
  for (const lang of LANG_MANIFEST) {
    if (removeIfExists(join(claudeDir, 'rules', lang.file))) log(`  ✗ rules/${lang.file}`);
  }
  for (const skill of SKILLS) {
    const skillDir = join(claudeDir, 'skills', skill.name);
    if (removeIfExists(join(skillDir, 'SKILL.md'))) log(`  ✗ skills/${skill.name}/SKILL.md`);
    tryRmdir(skillDir);
  }
  for (const skill of VENDORED_SKILLS) {
    if (removeDir(join(claudeDir, 'skills', skill.name))) log(`  ✗ skills/${skill.name}/`);
  }
  for (const f of [...AGENT_FILES, ...COMMAND_FILES, ...HOOK_FILES]) {
    if (removeIfExists(join(claudeDir, f))) log(`  ✗ ${f}`);
  }
  // Sidecar is always ours; main settings.json may be user-customized so we
  // leave it alone — user can delete manually if they want.
  if (removeIfExists(join(claudeDir, 'settings.rigging.json'))) {
    log('  ✗ settings.rigging.json');
  }
  for (const sub of ['rules', 'skills', 'agents', 'commands', 'hooks']) {
    tryRmdir(join(claudeDir, sub));
  }
  // Leave .claude/ itself — settings.json may still live there.

  log('Entry files:');
  const claudeAction = unsyncClaudeMd(join(targetRoot, 'CLAUDE.md'));
  if (claudeAction !== 'absent') log(`  ✗ CLAUDE.md (${claudeAction})`);
  const agentsAction = removeRiggingSection(join(targetRoot, 'AGENTS.md'));
  if (agentsAction !== 'absent' && agentsAction !== 'no-section') {
    log(`  ✗ AGENTS.md (${agentsAction})`);
  }
}

export function uninstallKiro(options: UninstallOptions): void {
  const { targetRoot, log = console.log } = options;
  const steeringDir = join(targetRoot, '.kiro/steering');
  const agentsDir = join(targetRoot, '.kiro/agents');
  const skillsDir = join(targetRoot, '.kiro/skills');

  log('Removing rigging-managed Kiro files:');
  for (const file of CORE_FILES) {
    if (removeIfExists(join(steeringDir, file))) log(`  ✗ steering/${file}`);
  }
  for (const lang of LANG_MANIFEST) {
    if (removeIfExists(join(steeringDir, lang.file))) log(`  ✗ steering/${lang.file}`);
  }
  if (removeIfExists(join(steeringDir, 'standards.md'))) log('  ✗ steering/standards.md');
  for (const skill of SKILLS) {
    const dir = join(skillsDir, skill.name);
    if (removeIfExists(join(dir, 'SKILL.md'))) log(`  ✗ skills/${skill.name}/SKILL.md`);
    tryRmdir(dir);
  }
  for (const skill of VENDORED_SKILLS) {
    if (removeDir(join(skillsDir, skill.name))) log(`  ✗ skills/${skill.name}/`);
  }
  for (const f of AGENT_FILES) {
    const jsonName = basename(f, '.md') + '.json';
    if (removeIfExists(join(agentsDir, jsonName))) log(`  ✗ agents/${jsonName}`);
  }
  for (const sub of ['steering', 'skills', 'agents']) {
    tryRmdir(join(targetRoot, '.kiro', sub));
  }
  tryRmdir(join(targetRoot, '.kiro'));
}

// Try to delete a file. Returns true if removed, false if it didn't exist
// (or could not be removed for any reason — uninstall is best-effort).
function removeIfExists(filePath: string): boolean {
  try {
    unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

// Remove a directory if it's empty. Silent on any failure (non-empty,
// missing, permission denied, etc.) — uninstall is best-effort.
function tryRmdir(dirPath: string): void {
  try {
    rmdirSync(dirPath);
  } catch {
    // ignore
  }
}

type RemoveAction = 'absent' | 'no-section' | 'section-removed' | 'file-deleted';

// Remove the rigging section from a marker-wrapped file. If after removal
// the file is just whitespace, delete it entirely (it had no user content).
function removeRiggingSection(filePath: string): RemoveAction {
  if (!pathExists(filePath)) return 'absent';
  const existing = readFileSync(filePath, 'utf8');
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return 'no-section';
  const before = existing.slice(0, startIdx);
  const after = existing.slice(endIdx + MARKER_END.length);
  const remaining = before + after;
  if (remaining.trim().length === 0) {
    unlinkSync(filePath);
    return 'file-deleted';
  }
  writeFileSync(filePath, remaining);
  return 'section-removed';
}

// Reverse of syncClaudeMd: drop our symlink, or strip our section if it's
// a regular file (preserving any user content).
function unsyncClaudeMd(claudePath: string): RemoveAction | 'symlink-removed' {
  if (isSymlinkPointingTo(claudePath, 'AGENTS.md')) {
    unlinkSync(claudePath);
    return 'symlink-removed';
  }
  return removeRiggingSection(claudePath);
}

function copyTo(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

// Recursively copy a vendored skill directory (SKILL.md + references/, etc.)
// verbatim into the target. Used for directory-based skills that ship their
// own SKILL.md and bundled files, rather than the single-file wrapped skills.
function copyDir(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

// Recursively remove a directory. Returns true if it existed, false otherwise.
// Best-effort: any failure (missing, permission) is treated as "not removed".
function removeDir(dirPath: string): boolean {
  if (!pathExists(dirPath)) return false;
  try {
    rmSync(dirPath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function writeTo(dest: string, contents: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, contents);
}

function filesEqual(a: string, b: string): boolean {
  return readFileSync(a).equals(readFileSync(b));
}
