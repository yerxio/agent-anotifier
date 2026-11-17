// tests/support.test.mjs — this fork asks its users for nothing.
//
// Upstream prints a sponsorship link, a Discord invite and a star ask from its
// CLI. This is an internal fork: nobody is being asked for money or attention,
// and those channels are upstream's, not this fork's to hand out. These checks
// keep them from coming back through a merge.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as support from '../src/support.mjs';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A sponsorship page, a chat invite, or a request for a star.
const SOLICITATION = /github\.com\/sponsors|opencollective|patreon|ko-fi|buymeacoffee|discord\.gg|discord(?:app)?\.com\/invite|github star|consider supporting/i;

function runCli(args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-support-'));
  const res = spawnSync(process.execPath, ['cli/index.mjs', ...args], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
    encoding: 'utf8',
    timeout: 60000,
  });
  fs.rmSync(home, { recursive: true, force: true });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', '.git'].includes(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

describe('no solicitation', () => {
  it('support.mjs exports the docs URL and nothing else', () => {
    assert.deepEqual(Object.keys(support), ['DOCS_URL']);
    assert.match(support.DOCS_URL, /^https:\/\/\S+$/);
  });

  it('package.json declares no funding and is not publishable', () => {
    assert.equal(pkg.funding, undefined);
    assert.equal(pkg.private, true);
    assert.equal(fs.existsSync(path.join(repoRoot, '.github', 'FUNDING.yml')), false);
  });

  it('--help, status and doctor print no sponsorship link, invite or star ask', () => {
    for (const args of [['--help'], ['status'], ['doctor']]) {
      const res = runCli(args);
      assert.doesNotMatch(res.stdout + res.stderr, SOLICITATION, `anotifier ${args.join(' ')}`);
    }
  });

  it('nothing shipped or documented carries one', () => {
    // The code the CLI and the hooks run, and the documents a reader of this
    // repository is pointed at. CHANGELOG.md and docs/ are history, and say
    // what upstream did; they are not checked.
    const checked = [
      ...['src', 'cli', 'setup', 'commands', 'hooks', '.claude-plugin', '.github'].flatMap((d) => walk(path.join(repoRoot, d))),
      ...['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'package.json'].map((f) => path.join(repoRoot, f)),
    ].filter((f) => /\.(m?js|json|md|ya?ml)$/.test(f));
    for (const file of checked) {
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), SOLICITATION, path.relative(repoRoot, file));
    }
  });
});
