// Strip a leading YAML frontmatter block (between two `---` lines).
// Mirrors setup.sh::strip_frontmatter — including its quirk of also eating
// any later standalone `---` lines (markdown horizontal rules) in the body.
export function stripFrontmatter(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let state = 0;
  for (const line of lines) {
    if (line === '---') {
      state++;
      continue;
    }
    if (state === 0 || state >= 2) {
      out.push(line);
    }
  }
  return out.join('\n');
}

// Extract `name` and `description` from a leading YAML frontmatter block.
// Returns an empty object when the input has no frontmatter or the keys are
// absent. Only these two fields are recognized — additional keys are ignored.
export function parseFrontmatter(content: string): { name?: string; description?: string } {
  const lines = content.split('\n');
  if (lines[0] !== '---') return {};
  const result: { name?: string; description?: string } = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === '---') break;
    if (line === undefined) break;
    const match = line.match(/^(name|description):\s*(.*?)\s*$/);
    if (match && match[1] && match[2] !== undefined) {
      result[match[1] as 'name' | 'description'] = match[2];
    }
  }
  return result;
}

// Hardcoded read-only tool profile. Tool names follow Kiro's official
// "Built-in tools" reference (`read`, `shell`). `allowedCommands` is a regex
// list anchored `\A...\z` by Kiro — bare strings like `"git status"` would
// not match `"git status --short"`. The `( .*)?` suffix lets each command
// take optional arguments. Currently only code-reviewer uses this profile;
// revisit when adding agents with different tool needs.
const READ_ONLY_AGENT_TOOLS = {
  tools: ['read', 'shell'],
  allowedTools: ['read'],
  toolsSettings: {
    shell: {
      allowedCommands: ['git diff( .*)?', 'git status( .*)?', 'git log( .*)?', 'git show( .*)?'],
    },
  },
  // Make installed skills discoverable to the agent. Kiro resolves
  // `skill://` URIs against the project's `.kiro/skills/` directory.
  resources: ['skill://.kiro/skills/**/SKILL.md'],
};

// Convert a Claude agent markdown file (frontmatter + body) into Kiro CLI
// agent JSON. Output is JSON.stringify(_, null, 2) — valid JSON, but does
// not match setup.sh's hand-rolled formatting byte-for-byte. Acceptance only
// requires byte parity for `.kiro/steering/`, not agent JSON.
export function makeKiroAgent(sourceContent: string): string {
  const { name = '', description = '' } = parseFrontmatter(sourceContent);
  const body = stripFrontmatter(sourceContent);
  return JSON.stringify(
    {
      name,
      description,
      ...READ_ONLY_AGENT_TOOLS,
      prompt: normalizeAgentPrompt(body),
    },
    null,
    2,
  );
}

// Match setup.sh's awk: emit each line followed by a literal `\n`. The result
// always ends with a newline (or is empty for empty input). JSON.stringify
// then handles the JSON-level escaping for us.
function normalizeAgentPrompt(body: string): string {
  const lines = body.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) return '';
  return lines.join('\n') + '\n';
}

// Wrap source rule content as a Kiro CLI steering file.
// When `pattern` is set, Kiro auto-loads the rule on matching files;
// otherwise the rule is always loaded. Pattern can be a single glob string
// or a list of globs — Kiro accepts both. `managed-by` lets us identify
// files the CLI owns (vs. user-authored steering files).
export function makeKiroSteering(sourceContent: string, pattern?: string | string[]): string {
  const header = ['---'];
  const patternValue = formatFileMatchPattern(pattern);
  if (patternValue !== null) {
    header.push('inclusion: fileMatch');
    header.push(`fileMatchPattern: ${patternValue}`);
  } else {
    header.push('inclusion: always');
  }
  header.push('managed-by: coderigup');
  header.push('---');
  return header.join('\n') + '\n' + stripFrontmatter(sourceContent);
}

// Format a Kiro fileMatchPattern value. Returns null when there's no usable
// pattern, signaling the caller to fall back to inclusion: always.
function formatFileMatchPattern(pattern: string | string[] | undefined): string | null {
  if (pattern === undefined) return null;
  if (typeof pattern === 'string') {
    return pattern.length === 0 ? null : `"${pattern}"`;
  }
  if (pattern.length === 0) return null;
  return `[${pattern.map((p) => `"${p}"`).join(', ')}]`;
}
