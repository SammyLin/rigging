// Copy (or clean) coderigup source dirs into cli/ for npm pack.
// The published package needs rules/, skills/, agents/, commands/, hooks/,
// and settings.json bundled alongside dist/ so resolveSourceRoot() can find
// them at runtime. In dev these live at the repo root (one level above cli/);
// publish-time we copy a snapshot in. Run with `--clean` to remove copies
// after packing (postpack), so dev resolution doesn't mistake the copies
// for a published install.

import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(cliDir, '..');

const dirs = ['rules', 'skills', 'agents', 'commands', 'hooks'];
const files = ['settings.json'];
const mode = process.argv.includes('--clean') ? 'clean' : 'copy';

if (mode === 'clean') {
  for (const d of dirs) {
    const dest = join(cliDir, d);
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
      console.log(`cleaned ${d}/`);
    }
  }
  for (const f of files) {
    const dest = join(cliDir, f);
    if (existsSync(dest)) {
      rmSync(dest, { force: true });
      console.log(`cleaned ${f}`);
    }
  }
  process.exit(0);
}

for (const d of dirs) {
  const src = join(repoRoot, d);
  const dest = join(cliDir, d);
  if (!existsSync(src)) {
    console.error(`✗ missing source: ${src}`);
    process.exit(1);
  }
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  console.log(`copied ${d}/`);
}
for (const f of files) {
  cpSync(join(repoRoot, f), join(cliDir, f));
  console.log(`copied ${f}`);
}
