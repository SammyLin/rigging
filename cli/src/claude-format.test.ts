import { describe, expect, it } from 'vitest';
import { makeSkill } from './claude-format.js';

describe('makeSkill', () => {
  it('wraps source content with name + description frontmatter', () => {
    const result = makeSkill('security-check', '10-item security checklist', '# Security\nbody\n');
    expect(result).toBe(
      '---\n' +
        'name: security-check\n' +
        'description: "10-item security checklist"\n' +
        'managed-by: coderigup\n' +
        '---\n' +
        '\n' +
        '# Security\nbody\n',
    );
  });

  it('does not strip the source content', () => {
    const source = '---\npaths:\n  - x\n---\nkept as-is';
    expect(makeSkill('x', 'y', source)).toContain(source);
  });

  it('always includes managed-by: coderigup', () => {
    expect(makeSkill('a', 'b', 'c')).toContain('managed-by: coderigup');
  });
});
