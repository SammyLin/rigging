#!/usr/bin/env node
import { cac } from 'cac';
import { runInit } from './commands/init.js';
import { runUpgrade } from './commands/upgrade.js';
import { runUninstall } from './commands/uninstall.js';

const cli = cac('coderigup');

cli
  .command('init', 'Install rigging standards into the current project')
  .option('--target <target>', 'Target tool: claude (default), kiro, or all')
  .option('--lang <langs>', 'Comma-separated list (e.g. node,python,go). Default: auto-detect.')
  .option('--dry-run', 'Show what would change without writing files')
  .action(runInit);

cli
  .command('upgrade', 'Upgrade an existing rigging install')
  .option('--target <target>', 'Target tool: claude (default), kiro, or all')
  .option('--lang <langs>', 'Comma-separated list (e.g. node,python,go). Default: auto-detect.')
  .option('--rules-only', 'Only update rules, preserve user-edited settings')
  .action(runUpgrade);

cli
  .command('uninstall', 'Remove rigging from the current project')
  .option('--target <target>', 'Target tool: claude (default), kiro, or all')
  .action(runUninstall);

cli.help();
cli.version('0.1.1');

cli.parse();
