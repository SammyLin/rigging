import { describe, expect, it } from 'vitest';
import {
  buildOpencodeConfig,
  makeOpencodeAgent,
  makeOpencodeCommand,
  makeOpencodeRule,
} from './opencode-convert.js';

describe('makeOpencodeRule', () => {
  it('strips paths: frontmatter from a language rule', () => {
    const input = '---\npaths:\n  - "**/*.ts"\n---\n# Node Standards\nbody\n';
    expect(makeOpencodeRule(input)).toBe('# Node Standards\nbody\n');
  });

  it('passes through content with no frontmatter', () => {
    const input = '# Heading\nbody\n';
    expect(makeOpencodeRule(input)).toBe(input);
  });
});

describe('makeOpencodeAgent', () => {
  const baseSource =
    '---\nname: code-reviewer\ndescription: Reviews code changes\ntools: Read, Grep\nmodel: sonnet\n---\nYou are a reviewer.\n';

  it('emits description, mode: subagent, and managed-by marker in the frontmatter', () => {
    const out = makeOpencodeAgent(baseSource);
    expect(out).toContain('description: Reviews code changes');
    expect(out).toContain('mode: subagent');
    expect(out).toContain('managed-by: rigging');
  });

  it('forwards the source model when present', () => {
    expect(makeOpencodeAgent(baseSource)).toContain('model: sonnet');
  });

  it('omits model: when the source has none', () => {
    const noModel = '---\nname: x\ndescription: y\ntools: Read\n---\nbody\n';
    expect(makeOpencodeAgent(noModel)).not.toContain('model:');
  });

  it('drops Claude-specific tools: field', () => {
    expect(makeOpencodeAgent(baseSource)).not.toContain('tools:');
  });

  it('preserves the body verbatim after the frontmatter', () => {
    const out = makeOpencodeAgent(baseSource);
    expect(out.endsWith('You are a reviewer.\n')).toBe(true);
  });

  it('produces frontmatter that parses as well-formed YAML structure', () => {
    const out = makeOpencodeAgent(baseSource);
    // Should start with --- and have a closing --- followed by the body.
    const lines = out.split('\n');
    expect(lines[0]).toBe('---');
    const closingIdx = lines.indexOf('---', 1);
    expect(closingIdx).toBeGreaterThan(0);
  });
});

describe('makeOpencodeCommand', () => {
  const baseSource =
    '---\ndescription: Lint + test + commit\nargument-hint: [optional context]\nallowed-tools: Bash(git:*), Read\n---\n## 1. Run pipeline\n$ARGUMENTS\n';

  it('keeps description in the emitted frontmatter', () => {
    expect(makeOpencodeCommand(baseSource)).toContain('description: Lint + test + commit');
  });

  it('drops Claude-only allowed-tools and argument-hint fields', () => {
    const out = makeOpencodeCommand(baseSource);
    expect(out).not.toContain('allowed-tools:');
    expect(out).not.toContain('argument-hint:');
  });

  it('marks the file as managed-by: rigging', () => {
    expect(makeOpencodeCommand(baseSource)).toContain('managed-by: rigging');
  });

  it('preserves the body (template) verbatim, including $ARGUMENTS placeholder', () => {
    const out = makeOpencodeCommand(baseSource);
    expect(out).toContain('## 1. Run pipeline');
    expect(out).toContain('$ARGUMENTS');
  });
});

describe('buildOpencodeConfig', () => {
  it('produces JSON with the opencode schema and an instructions glob', () => {
    const cfg = JSON.parse(buildOpencodeConfig());
    expect(cfg.$schema).toBe('https://opencode.ai/config.json');
    expect(cfg.instructions).toEqual(['.opencode/rules/*.md']);
  });

  it('is idempotent (calling twice produces the same string)', () => {
    expect(buildOpencodeConfig()).toBe(buildOpencodeConfig());
  });

  it('ends with a trailing newline (standard config-file convention)', () => {
    expect(buildOpencodeConfig().endsWith('\n')).toBe(true);
  });
});
