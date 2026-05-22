// Runner for the README skill-table generator (logic in src/gen-docs.ts).
//   pnpm gen:docs            → rewrite the tables from the manifest
//   pnpm gen:docs --check    → exit non-zero if any table is stale (for CI)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncDocs } from '../src/gen-docs.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const check = process.argv.includes('--check');

const results = syncDocs({ repoRoot, check });
const stale = results.filter((r) => r.changed);

if (check) {
  if (stale.length > 0) {
    console.error(
      `Skill tables are out of sync with the manifest: ${stale.map((r) => r.file).join(', ')}.\n` +
        `Run \`pnpm gen:docs\` to regenerate.`,
    );
    process.exit(1);
  }
  console.log('Skill tables are in sync with the manifest.');
} else {
  for (const r of results) {
    console.log(r.changed ? `updated ${r.file}` : `unchanged ${r.file}`);
  }
}
