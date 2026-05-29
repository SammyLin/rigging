#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cac } from 'cac';
import { runInit } from './commands/init.js';
import { runUpgrade } from './commands/upgrade.js';
import { runUninstall } from './commands/uninstall.js';

// Single source of truth for the version: read it from package.json at runtime
// rather than duplicating the literal here. `..` resolves to the package root
// in both layouts — dev (cli/src or cli/dist) and published (package/dist).
const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
) as { version: string };

const cli = cac('coderigup');

cli
  .command('init', 'Install coderigup standards into the current project')
  .option('--target <target>', 'Target tool: claude (default), kiro, opencode, or all')
  .option('--lang <langs>', 'Comma-separated list (e.g. node,python,go). Default: auto-detect.')
  .option('--dry-run', 'Show what would change without writing files')
  .action(runInit);

cli
  .command('upgrade', 'Upgrade an existing coderigup install')
  .option('--target <target>', 'Target tool: claude (default), kiro, opencode, or all')
  .option('--lang <langs>', 'Comma-separated list (e.g. node,python,go). Default: auto-detect.')
  .option('--rules-only', 'Only update rules, preserve user-edited settings')
  .action(runUpgrade);

cli
  .command('uninstall', 'Remove coderigup from the current project')
  .option('--target <target>', 'Target tool: claude (default), kiro, opencode, or all')
  .action(runUninstall);

cli.help();
cli.version(pkg.version);

cli.parse();
