// tests/setup-bundled-icons.test.mjs — setup fetches nothing. The icons ship
// with the package; setup used to download a copy of one of them, which hung
// the process and left an empty file behind wherever the download failed.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeEmptyLegacyIcon } from '../cli/setup.mjs';
import { sendToast as linuxToast } from '../src/platforms/linux.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const icons = path.join(root, 'assets', 'icons');

describe('icons are bundled, not downloaded', () => {
  it('setup has no HTTP client and no icon URL left in it', () => {
    const src = fs.readFileSync(path.join(root, 'cli', 'setup.mjs'), 'utf8');
    assert.doesNotMatch(src, /from 'node:https?'/);
    assert.doesNotMatch(src, /https?\.get\(/);
    assert.doesNotMatch(src, /claude_app_icon/);
  });

  it('every icon a backend falls back to is in the package', () => {
    for (const name of ['claude', 'codex', 'cursor', 'gemini']) {
      assert.ok(fs.statSync(path.join(icons, `${name}.png`)).size > 0, `${name}.png`);
    }
    // package.json ships the directory.
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.ok(pkg.files.includes('assets/icons/'));
  });

  it('linux: a notification with no source of its own gets the bundled icon', async () => {
    const seen = [];
    const execFileImpl = (file, args, options, cb) => { seen.push(args); cb(null, '', ''); };
    await linuxToast({ title: 'T', message: 'm' }, { execFileImpl, log: () => {} });
    await linuxToast({ title: 'T', message: 'm', source: 'no-such-tool' }, { execFileImpl, log: () => {} });
    for (const args of seen) {
      assert.ok(args.includes(path.join(icons, 'claude.png')), args.join(' '));
    }
    // A known source still gets its own.
    await linuxToast({ title: 'T', message: 'm', source: 'codex' }, { execFileImpl, log: () => {} });
    assert.ok(seen[2].includes(path.join(icons, 'codex.png')));
  });
});

describe('removeEmptyLegacyIcon', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-legacy-icon-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const legacy = () => path.join(dir, 'icon.png');

  it('removes the empty file a failed download left behind', () => {
    fs.writeFileSync(legacy(), '');
    assert.equal(removeEmptyLegacyIcon(dir), true);
    assert.equal(fs.existsSync(legacy()), false);
  });

  it('leaves a file with content alone: a good download, or the user\'s own', () => {
    fs.writeFileSync(legacy(), 'png bytes');
    assert.equal(removeEmptyLegacyIcon(dir), false);
    assert.equal(fs.readFileSync(legacy(), 'utf8'), 'png bytes');
  });

  it('nothing there: nothing to do, no throw', () => {
    assert.equal(removeEmptyLegacyIcon(dir), false);
    assert.equal(removeEmptyLegacyIcon(path.join(dir, 'missing')), false);
  });
});
