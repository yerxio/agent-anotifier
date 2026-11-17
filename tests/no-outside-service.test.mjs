// tests/no-outside-service.test.mjs — this fork reports nothing to anyone.
//
// Upstream ships opt-in usage stats (to its PostHog), opt-in error reporting
// (to Sentry) and CLI lines that advertise its sponsorship page, Discord, star
// button and documentation site. All of it is removed here: an internal tool
// sends its user's notifications and nothing else. These checks keep a merge
// from upstream from quietly bringing any of it back.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadConfigResult, REMOVED_KEYS } from '../src/config-loader.mjs';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const defaults = require('../config/default-config.json');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', '.git'].includes(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const rel = (f) => path.relative(repoRoot, f).split(path.sep).join('/');

// The code that runs, and the documents a reader is pointed at. CHANGELOG.md
// and docs/ are history and describe what upstream did; they are not checked.
const shipped = ['src', 'cli', 'setup', 'commands', 'hooks', '.claude-plugin'].flatMap((d) => walk(path.join(repoRoot, d)));
const documents = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'package.json'].map((f) => path.join(repoRoot, f));
const text = (files) => files.filter((f) => /\.(m?js|json|md|ya?ml)$/.test(f)).map((f) => [rel(f), fs.readFileSync(f, 'utf8')]);

function runCli(args, home) {
  const res = spawnSync(process.execPath, ['cli/index.mjs', ...args], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
    encoding: 'utf8',
    timeout: 60000,
    input: '',
  });
  return { status: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

describe('nothing is reported to an outside service', () => {
  it('the usage-stats and error-reporting modules are gone', () => {
    for (const gone of ['src/telemetry.mjs', 'src/sentry.mjs', 'cli/telemetry.mjs', 'src/support.mjs']) {
      assert.equal(fs.existsSync(path.join(repoRoot, gone)), false, gone);
    }
  });

  it('no shipped code names a reporting service or its plumbing', () => {
    const service = /posthog|sentry\.io|sendSentry|recordHookRun|maybeSendHookSummary|flushTelemetry/i;
    for (const [file, body] of text(shipped)) assert.doesNotMatch(body, service, file);
  });

  it('the only requests the code makes on its own go to ntfy and, when asked, the npm registry', () => {
    // Every module that can open a connection, and the one thing each is for.
    // A new entry here is a new place the code talks to the network.
    const clients = text(shipped.filter((f) => /[\\/](src|cli|setup)[\\/]/.test(f)))
      .filter(([, body]) => /from 'node:https?'/.test(body))
      .map(([file]) => file)
      .sort();
    assert.deepEqual(clients, [
      'src/approval-ntfy.mjs', // the experimental remote approval, over the user's ntfy
      'src/ntfy.mjs',          // the user's ntfy server
      'src/update-check.mjs',  // the npm registry, only when updateCheck.enabled is true
      'src/webhook.mjs',       // the user's webhook URL
    ]);
  });

  it('the config has no such settings, and an old file that carries them loads clean', () => {
    assert.equal(defaults.telemetry, undefined);
    assert.equal(defaults.sentry, undefined);
    assert.deepEqual(REMOVED_KEYS, ['sentry', 'telemetry']);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-removed-'));
    try {
      const file = path.join(dir, 'config.json');
      // What upstream's setup wrote.
      fs.writeFileSync(file, JSON.stringify({
        sentry: { enabled: true, dsn: 'https://key@example.invalid/1' },
        telemetry: { enabled: true, asked: true },
        ntfy: { topic: 'kept' },
      }));
      const { config, problem } = loadConfigResult(file);
      assert.equal(problem, null, 'a config from upstream must not be reported as broken');
      assert.equal(config.sentry, undefined);
      assert.equal(config.telemetry, undefined);
      assert.equal(config.ntfy.topic, 'kept');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('there is no telemetry command and --help does not offer one', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-nocmd-'));
    try {
      const unknown = runCli(['telemetry'], home);
      assert.equal(unknown.status, 1);
      assert.match(unknown.out, /Unknown command/);
      assert.doesNotMatch(runCli(['--help'], home).out, /telemetry|usage stats|sentry/i);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('nobody is asked for anything', () => {
  // A sponsorship page, a chat invite, a request for a star.
  const solicitation = /github\.com\/sponsors|opencollective|patreon|ko-fi|buymeacoffee|discord\.gg|discord(?:app)?\.com\/invite|github star|consider supporting/i;
  // Upstream's documentation site, which describes upstream's behaviour.
  const docsSite = /anotifier\.io/i;

  it('package.json declares no funding and cannot be published', () => {
    assert.equal(pkg.funding, undefined);
    assert.equal(pkg.private, true);
    assert.equal(fs.existsSync(path.join(repoRoot, '.github', 'FUNDING.yml')), false);
  });

  it('no shipped code or document carries a sponsorship link, an invite, a star ask or the docs site', () => {
    for (const [file, body] of text([...shipped, ...documents])) {
      assert.doesNotMatch(body, solicitation, file);
      assert.doesNotMatch(body, docsSite, file);
    }
  });

  it('--help, status and doctor print none of them', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-ask-'));
    try {
      for (const args of [['--help'], ['status'], ['doctor']]) {
        const { out } = runCli(args, home);
        assert.doesNotMatch(out, solicitation, `anotifier ${args.join(' ')}`);
        assert.doesNotMatch(out, docsSite, `anotifier ${args.join(' ')}`);
      }
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
