// tests/update-banner.test.mjs — regression for the stale "v1.3.0 → v1.3.0"
// banner. Both CLI call sites used to print whatever version the shared
// .update-check.json cache held, so for up to the 24h TTL after an upgrade they
// nagged you to install the version you had just installed. The semver gate is
// now re-asserted at both sites, exactly as the hook path already did.
//
// Every case seeds a FRESH cache, so the CLI is served entirely from disk and
// these run offline.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = require('../package.json');

// Runs the real CLI with a throwaway HOME whose update cache claims `latest`.
// `enabled` is the user's updateCheck.enabled; null writes no config at all,
// which is a fresh install on the defaults.
function runCli(args, latest, enabled = true) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-banner-'));
  const cfgDir = path.join(home, '.anotifier');
  fs.mkdirSync(cfgDir, { recursive: true });
  if (enabled !== null) {
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ updateCheck: { enabled } }));
  }
  fs.writeFileSync(
    path.join(cfgDir, '.update-check.json'),
    JSON.stringify({ checkedAt: Date.now(), latest }), // fresh: no network
  );
  const res = spawnSync(process.execPath, ['cli/index.mjs', ...args], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: 'utf8',
    timeout: 30000,
  });
  fs.rmSync(home, { recursive: true, force: true });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

// `--version` exercises cli/index.mjs's banner; `status` prints its own copy and
// suppresses index's, so it exercises the second call site.
for (const [label, args] of [['--version', ['--version']], ['status', ['status']]]) {
  describe(`update banner via \`anotifier ${label}\``, () => {
    it('stays quiet when the cached version is the one already installed', () => {
      const res = runCli(args, pkg.version);
      assert.equal(res.status, 0, res.stderr);
      assert.ok(!res.stdout.includes('Update available'), `banner must not fire for v${pkg.version}: ${res.stdout}`);
    });

    it('stays quiet when the cached version is OLDER than the installed one', () => {
      const res = runCli(args, '0.0.1');
      assert.equal(res.status, 0, res.stderr);
      assert.ok(!res.stdout.includes('Update available'), `never nag a downgrade: ${res.stdout}`);
    });

    // The check is opt-in. With it off the CLI must not even read the cache: a
    // newer version sitting there proves the banner is gated, not just quiet.
    it('says nothing when the check is off, whatever the cache holds', () => {
      const off = runCli(args, '99.0.0', false);
      assert.equal(off.status, 0, off.stderr);
      assert.ok(!off.stdout.includes('Update available'), `off must be off: ${off.stdout}`);
    });

    it('says nothing on a fresh install, where the default is off', () => {
      const fresh = runCli(args, '99.0.0', null);
      assert.equal(fresh.status, 0, fresh.stderr);
      assert.ok(!fresh.stdout.includes('Update available'), `default must be off: ${fresh.stdout}`);
    });

    it('still fires for a genuinely newer version', () => {
      const res = runCli(args, '99.0.0');
      assert.equal(res.status, 0, res.stderr);
      assert.ok(res.stdout.includes('Update available'), `banner should fire: ${res.stdout}`);
      assert.ok(res.stdout.includes('99.0.0'), res.stdout);
    });

    it('stays quiet when the cache holds no version at all', () => {
      const res = runCli(args, null);
      assert.equal(res.status, 0, res.stderr);
      assert.ok(!res.stdout.includes('Update available'), res.stdout);
    });
  });
}
