import { describe, expect, it } from 'vitest';
import {
  makeKiroAgent,
  makeKiroSteering,
  parseFrontmatter,
  stripFrontmatter,
} from './kiro-convert.js';

describe('stripFrontmatter', () => {
  it('returns content unchanged when there is no frontmatter', () => {
    const input = '# Heading\n\nbody line\n';
    expect(stripFrontmatter(input)).toBe(input);
  });

  it('strips a leading YAML frontmatter block', () => {
    const input = '---\nkey: value\nanother: thing\n---\n# Heading\nbody\n';
    expect(stripFrontmatter(input)).toBe('# Heading\nbody\n');
  });

  it('returns empty when input is empty', () => {
    expect(stripFrontmatter('')).toBe('');
  });

  it('returns empty body when frontmatter has no content after it', () => {
    const input = '---\nkey: value\n---\n';
    expect(stripFrontmatter(input)).toBe('');
  });

  it('eats markdown horizontal rules in body (matches setup.sh behavior)', () => {
    const input = '---\nkey: value\n---\nintro\n---\nafter rule\n';
    expect(stripFrontmatter(input)).toBe('intro\nafter rule\n');
  });
});

describe('makeKiroSteering', () => {
  const source = '---\npaths:\n  - "**/*.ts"\n---\n# Node Standards\nbody\n';

  it('emits fileMatchPattern as a YAML flow array when given a string array', () => {
    const result = makeKiroSteering(source, ['**/*.ts', 'package.json']);
    expect(result).toBe(
      '---\n' +
        'inclusion: fileMatch\n' +
        'fileMatchPattern: ["**/*.ts", "package.json"]\n' +
        'managed-by: coderigup\n' +
        '---\n' +
        '# Node Standards\nbody\n',
    );
  });

  it('emits fileMatchPattern as a quoted string when given a single glob', () => {
    const result = makeKiroSteering(source, '**/*.ts');
    expect(result).toContain('fileMatchPattern: "**/*.ts"');
  });

  it('emits inclusion: always when pattern is omitted', () => {
    const result = makeKiroSteering(source);
    expect(result).toBe(
      '---\n' +
        'inclusion: always\n' +
        'managed-by: coderigup\n' +
        '---\n' +
        '# Node Standards\nbody\n',
    );
  });

  it('emits inclusion: always when pattern is empty string', () => {
    const result = makeKiroSteering(source, '');
    expect(result).toContain('inclusion: always');
    expect(result).not.toContain('fileMatchPattern');
  });

  it('emits inclusion: always when pattern is an empty array', () => {
    const result = makeKiroSteering(source, []);
    expect(result).toContain('inclusion: always');
    expect(result).not.toContain('fileMatchPattern');
  });

  it('always includes managed-by: coderigup', () => {
    expect(makeKiroSteering(source)).toContain('managed-by: coderigup');
    expect(makeKiroSteering(source, 'x')).toContain('managed-by: coderigup');
  });

  it('strips the source frontmatter before wrapping', () => {
    const result = makeKiroSteering(source);
    expect(result).not.toContain('paths:');
    expect(result).not.toContain('"**/*.ts"');
  });

  it('handles a source with no frontmatter', () => {
    const noFrontmatter = '# Plain Heading\nbody\n';
    const result = makeKiroSteering(noFrontmatter);
    expect(result).toBe(
      '---\ninclusion: always\nmanaged-by: coderigup\n---\n# Plain Heading\nbody\n',
    );
  });
});

describe('parseFrontmatter', () => {
  it('extracts name and description from a YAML frontmatter block', () => {
    const input = '---\nname: code-reviewer\ndescription: Reviews PRs\n---\nbody\n';
    expect(parseFrontmatter(input)).toEqual({ name: 'code-reviewer', description: 'Reviews PRs' });
  });

  it('returns an empty object when there is no frontmatter', () => {
    expect(parseFrontmatter('# Heading\nbody')).toEqual({});
  });

  it('returns only fields that are present', () => {
    expect(parseFrontmatter('---\nname: x\nother: y\n---\n')).toEqual({ name: 'x' });
  });

  it('trims surrounding whitespace from values', () => {
    expect(parseFrontmatter('---\nname:    spaced   \n---\n')).toEqual({ name: 'spaced' });
  });

  it('ignores fields after the closing ---', () => {
    expect(parseFrontmatter('---\nname: a\n---\nname: b\n')).toEqual({ name: 'a' });
  });
});

describe('makeKiroAgent', () => {
  const baseSource =
    '---\nname: code-reviewer\ndescription: Reviews code changes\n---\nYou are a reviewer.\n';

  it('produces valid JSON containing name and description from frontmatter', () => {
    const json = JSON.parse(makeKiroAgent(baseSource));
    expect(json.name).toBe('code-reviewer');
    expect(json.description).toBe('Reviews code changes');
  });

  it('puts the body (with real newlines) into prompt, with a trailing newline', () => {
    const source = '---\nname: x\ndescription: y\n---\nline1\nline2\n';
    const json = JSON.parse(makeKiroAgent(source));
    expect(json.prompt).toBe('line1\nline2\n');
  });

  it('round-trips special characters (backslash, quote, tab, CR) through JSON', () => {
    const body = 'a\\b"c\td\re';
    const source = `---\nname: x\ndescription: y\n---\n${body}\n`;
    const json = JSON.parse(makeKiroAgent(source));
    expect(json.prompt).toBe(`${body}\n`);
  });

  it('hardcodes the read-only tool profile using official Kiro tool names', () => {
    const json = JSON.parse(makeKiroAgent(baseSource));
    expect(json.tools).toEqual(['read', 'shell']);
    expect(json.allowedTools).toEqual(['read']);
  });

  it('uses regex with optional-args suffix for allowedCommands (so `git status --short` matches)', () => {
    const json = JSON.parse(makeKiroAgent(baseSource));
    const cmds: string[] = json.toolsSettings.shell.allowedCommands;
    // Each entry should be a regex of the form `<cmd>( .*)?` — no plain prefixes.
    expect(cmds).toContain('git diff( .*)?');
    expect(cmds).toContain('git status( .*)?');
    expect(cmds).toContain('git log( .*)?');
    expect(cmds).toContain('git show( .*)?');
    // Sanity: no leftover bare-prefix entries.
    expect(cmds).not.toContain('git status');
    expect(cmds).not.toContain('git diff --cached');
  });

  it('declares skills as a resource so the agent can load them', () => {
    const json = JSON.parse(makeKiroAgent(baseSource));
    expect(json.resources).toEqual(['skill://.kiro/skills/**/SKILL.md']);
  });

  it('survives quotes in description', () => {
    const source = '---\nname: x\ndescription: has "quotes"\n---\nbody\n';
    const json = JSON.parse(makeKiroAgent(source));
    expect(json.description).toBe('has "quotes"');
  });
});
