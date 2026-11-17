#!/usr/bin/env node
// cli/index.mjs
import { createRequire } from 'node:module';
import { checkForUpdate, isNewer, UPGRADE_COMMAND } from '../src/update-check.mjs';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const command = process.argv[2];

const COMMANDS = {
  setup: () => import('./setup.mjs'),
  status: () => import('./status.mjs'),
  test: () => import('./test.mjs'),
  config: () => import('./config.mjs'),
  doctor: () => import('./doctor.mjs'),
  snooze: () => import('./snooze.mjs'),
  uninstall: () => import('./uninstall.mjs'),
  // Experimental remote approval: absent from --help, and an unknown command
  // unless ANOTIFIER_EXPERIMENTAL_APPROVAL=1, until it ships. Design D4: not
  // before a real phone shows whether ntfy action buttons fire without an
  // unlock (docs/design/remote-approval.md). The flag keeps a release from
  // handing the commands to users by accident.
  ...(process.env.ANOTIFIER_EXPERIMENTAL_APPROVAL === '1'
    ? { approval: () => import('./approval.mjs'), away: () => import('./away.mjs') }
    : {}),
};

async function printUpdateBanner(c, updatePromise) {
  const latest = await updatePromise;
  // Re-assert the semver gate instead of trusting the cached hit: the shared
  // .update-check.json can hold a version recorded BEFORE the user upgraded,
  // and for the rest of the 24h TTL that would render as "v1.3.0 → v1.3.0".
  // Same guard maybeNotifyUpdate applies on the hook path.
  if (latest && isNewer(latest, pkg.version)) {
    console.log(`  ${c.warn('↑')} ${c.warn(`Update available: v${pkg.version} → v${latest}`)}`);
    console.log(`    ${c.muted(UPGRADE_COMMAND)}\n`);
  }
}

async function main() {
  const { c, banner } = await import('./ui.mjs');

  // Fire the (cached, at most one/day) update check once for this run — a no-op
  // unless the user turned updateCheck.enabled on (see checkForUpdate). status
  // shares the same memoized promise, so no command makes a second request.
  const updatePromise = checkForUpdate();

  if (command === '--version' || command === '-v' || command === '-V') {
    console.log(`${c.bold('anotifier')} ${c.accent(`v${pkg.version}`)}`);
    await printUpdateBanner(c, updatePromise);
    process.exit(0);
  }

  if (!command || command === '--help' || command === '-h') {
    printHelp(c, banner);
    await printUpdateBanner(c, updatePromise);
    process.exit(0);
  }

  const loader = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  if (!loader) {
    console.error(`${c.error('Error:')} Unknown command "${command}"\n  Run ${c.muted('anotifier --help')} for usage.`);
    process.exit(1);
  }

  const mod = await loader();
  await mod.run(...process.argv.slice(3));

  // Show update banner after command output. status prints its own; doctor
  // --json must stay machine-parseable (valid JSON only), so suppress it there.
  const suppressBanner = command === 'status'
    || (command === 'doctor' && process.argv.slice(3).includes('--json'));
  if (!suppressBanner) {
    await printUpdateBanner(c, updatePromise);
  }
}

function printHelp(c, banner) {
  console.log();
  console.log(banner());
  console.log(`  ${c.muted('Cross-platform notifications for AI coding agents')}`);
  console.log();
  console.log(`  ${c.bold('Usage:')} ${c.white('anotifier')} ${c.accent('<command>')} ${c.muted('[options]')}`);
  console.log();
  console.log(`  ${c.bold('Commands:')}`);
  console.log(`    ${c.accent('setup')}             ${c.white('First-time setup wizard')}`);
  console.log(`    ${c.accent('status')}            ${c.white('Show wired tools, ntfy topic, toast backend')}`);
  console.log(`    ${c.accent('test')} ${c.muted('[channel]')}    ${c.white('Fire test notification')} ${c.muted('(toast | ntfy | webhook | bell | both)')}`);
  console.log(`    ${c.accent('config')} ${c.muted('[section]')}  ${c.white('Interactive settings')} ${c.muted('(ntfy | webhook | sounds | events | focus)')}`);
  console.log(`    ${c.accent('doctor')} ${c.muted('[--deep]')}   ${c.white('Diagnose delivery per channel')} ${c.muted('(--deep verifies real delivery)')}`);
  console.log(`    ${c.accent('snooze')} ${c.muted('<dur|off>')}  ${c.white('Silence every channel for a while')} ${c.muted('(30m | 2h | 90s | 45)')}`);
  console.log(`    ${c.accent('uninstall')}         ${c.white('Remove hooks from all tools')}`);
  console.log(`    ${c.muted('--version, -v')}     ${c.white('Show version')}`);
  console.log();
  console.log(`  ${c.bold('Examples:')}`);
  console.log(`    ${c.muted('$')} ${c.white('anotifier setup')}`);
  console.log(`    ${c.muted('$')} ${c.white('anotifier test toast')}`);
  console.log(`    ${c.muted('$')} ${c.white('anotifier config ntfy')}`);
  console.log();
}

main().catch((err) => {
  console.error('Error:', err.message);
  if (command === 'approval' || command === 'away') process.exit(1);
  process.exit(1);
});
