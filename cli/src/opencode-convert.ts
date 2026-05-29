import { parseFrontmatter, stripFrontmatter } from './kiro-convert.js';

// Wrap source rule content as an opencode instruction file. Opencode has no
// native path-gating like Claude's `paths:` or Kiro's `inclusion: fileMatch`,
// so the source frontmatter is stripped and the file is loaded always-on via
// opencode.json's `instructions` glob.
export function makeOpencodeRule(sourceContent: string): string {
  return stripFrontmatter(sourceContent);
}

// Convert a Claude agent markdown file (frontmatter + body) into opencode's
// agent markdown format. Opencode reads the body as the prompt and expects
// frontmatter fields: description (required), mode, model, permission,
// temperature, steps. Claude's `tools:` field has no opencode equivalent —
// permissions live elsewhere (opencode.json or agent `permission:` block) —
// so it's dropped.
export function makeOpencodeAgent(sourceContent: string): string {
  const { description = '' } = parseFrontmatter(sourceContent);
  const model = parseFrontmatterField(sourceContent, 'model');
  const body = stripFrontmatter(sourceContent);

  const header = ['---', `description: ${description}`, 'mode: subagent'];
  if (model) header.push(`model: ${model}`);
  header.push('managed-by: rigging');
  header.push('---');
  return header.join('\n') + '\n' + body;
}

// Convert a Claude command markdown file into opencode's command format.
// Opencode treats the body as the template directly (no `template:` field).
// Claude's `allowed-tools:` and `argument-hint:` have no opencode equivalent
// and are dropped. The `$ARGUMENTS` placeholder works in both, so the body
// passes through unchanged.
export function makeOpencodeCommand(sourceContent: string): string {
  const { description = '' } = parseFrontmatter(sourceContent);
  const body = stripFrontmatter(sourceContent);
  return `---\n` + `description: ${description}\n` + `managed-by: rigging\n` + `---\n` + body;
}

// Build the opencode.json contents that wire up `.opencode/rules/*.md` as
// always-on instructions. Kept minimal so users can extend it with their own
// model/permission settings without us trampling them on upgrade.
export function buildOpencodeConfig(): string {
  return (
    JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        instructions: ['.opencode/rules/*.md'],
      },
      null,
      2,
    ) + '\n'
  );
}

// Extract a single named field from a leading YAML frontmatter block. Mirrors
// parseFrontmatter's narrow scope but for arbitrary keys — used to forward
// optional fields like `model:` from Claude agents into opencode agents.
function parseFrontmatterField(content: string, field: string): string | undefined {
  const lines = content.split('\n');
  if (lines[0] !== '---') return undefined;
  const re = new RegExp(`^${field}:\\s*(.*?)\\s*$`);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === '---') break;
    if (line === undefined) break;
    const m = line.match(re);
    if (m && m[1] !== undefined) return m[1];
  }
  return undefined;
}
