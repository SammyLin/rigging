import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectLanguages, LANGUAGES, parseLanguages, type Language } from './detect.js';

export const TARGETS = ['claude', 'kiro', 'all'] as const;
export type Target = (typeof TARGETS)[number];

// Returns 'claude' for undefined input. Returns undefined for any unknown
// value so callers can print a teaching error.
export function parseTarget(raw: string | undefined): Target | undefined {
  if (raw === undefined) return 'claude';
  return (TARGETS as readonly string[]).includes(raw) ? (raw as Target) : undefined;
}

// Locate rigging's source files (rules/, skills/, etc.).
//   - dev (tsx src/...)        : src/cli-shared.ts → up 2 → repo root (rules/ siblings cli/)
//   - built local (node dist/) : dist/cli-shared.js → up 2 → repo root (same as dev)
//   - published npm package    : dist/cli-shared.js → up 1 → package root, where the
//                                prepack step (scripts/copy-sources.mjs) bundled rules/.
// We pick the published layout when the package root has rules/ directly inside
// (next to dist/), otherwise fall back to the dev layout one more level up.
export function resolveSourceRoot(): string {
  const here = fileURLToPath(import.meta.url);
  const packageRoot = join(dirname(here), '..'); // .../cli or .../node_modules/coderigup
  if (existsSync(join(packageRoot, 'rules'))) return packageRoot;
  return join(packageRoot, '..');
}

// Resolve the language list either from explicit --lang or auto-detection.
// Logs the outcome to console for user visibility — helpers here do double
// duty as UX, since init/upgrade/uninstall share the same flow.
export function pickLanguages(langOption: string | undefined, cwd: string): Language[] {
  if (langOption !== undefined) {
    const parsed = parseLanguages(langOption);
    const dropped = langOption
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !LANGUAGES.includes(s as Language));
    for (const unknown of dropped) {
      console.warn(`Unknown language: ${unknown} — ignoring.`);
    }
    console.log(`Languages (override): ${parsed.join(', ') || '(none)'}`);
    return parsed;
  }
  const detected = detectLanguages(cwd);
  if (detected.length > 0) {
    console.log(`Detected: ${detected.join(', ')}`);
  } else {
    console.log('No languages detected — installing all.');
  }
  return detected;
}
