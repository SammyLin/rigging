// Wrap raw rule content as a Claude Code SKILL.md.
// NOTE: matches setup.sh::make_skill — the description is interpolated raw,
// so a description containing `"` will produce invalid YAML. Skill descriptions
// in the source arrays don't currently contain quotes; revisit if that changes.
export function makeSkill(name: string, description: string, sourceContent: string): string {
  return (
    `---\n` +
    `name: ${name}\n` +
    `description: "${description}"\n` +
    `managed-by: coderigup\n` +
    `---\n` +
    `\n` +
    sourceContent
  );
}
