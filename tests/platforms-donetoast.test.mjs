// tests/platforms-donetoast.test.mjs — the Windows card backend. Every tool's
// hook notification renders as a persistent Donetoast card; the statusline's
// usage/context alerts and an explicit `toast.cards: false` keep the native
// BurntToast path, which is the only one with click-to-focus.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendToast, wantsCard, cardAppName } from '../src/platforms/windows.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const donetoastDir = path.join(root, 'assets', 'windows', 'donetoast');

// Captures the spawn without running PowerShell.
function capture() {
  const seen = {};
  return {
    seen,
    deps: {
      platform: 'win32',
      execFileImpl: (file, args, options, callback) => {
        Object.assign(seen, { file, args, options });
        callback(null, 'started pid=123', '');
      },
      log: () => {},
    },
  };
}

const argOf = (args, flag) => args[args.indexOf(flag) + 1];

test('every tool\'s hook notification launches a persistent card with an acknowledgement button', async () => {
  for (const [source, app] of [['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini'], ['cursor', 'Cursor']]) {
    const { seen, deps } = capture();
    const ok = await sendToast({
      title: `demo · ${app}`, message: 'Task complete', source, event: 'task_complete',
    }, deps);

    assert.equal(ok, true, source);
    assert.equal(seen.file, 'powershell.exe', source);
    assert.equal(argOf(seen.args, '-File'), path.join(donetoastDir, 'donetoast.ps1'), source);
    assert.equal(argOf(seen.args, '-App'), app, source);
    assert.equal(argOf(seen.args, '-AcknowledgeLabel'), '知道了', source);
    assert.ok(seen.options.windowsHide, source);
    // -App doubles as the icon lookup (icons/<app>.png), so each tool needs one
    // or the card falls back to donetoast's own avatar.
    assert.ok(fs.existsSync(path.join(donetoastDir, 'icons', `${source}.png`)), `missing icons/${source}.png`);
  }
});

test('attention events use the waiting-card style, a failed turn the failed style', async () => {
  const waiting = capture();
  await sendToast({ title: 'Claude', message: 'Needs your input', source: 'claude', event: 'needs_input' }, waiting.deps);
  assert.ok(waiting.seen.args.includes('-Waiting'));

  const failed = capture();
  await sendToast({ title: 'Claude', message: 'Task failed', source: 'claude', event: 'task_complete' }, failed.deps);
  assert.ok(failed.seen.args.includes('-Failed'));
});

test('`toast.cards: false` puts every tool back on the native toast', async () => {
  const { seen, deps } = capture();
  await sendToast({
    title: 'Claude', message: 'Task complete', source: 'claude', event: 'task_complete', toastCards: false,
  }, deps);
  assert.equal(seen.file, 'pwsh');
  assert.equal(argOf(seen.args, '-File'), path.join(root, 'assets', 'windows', 'toast.ps1'));
  // The native path is the one that can focus the window again.
  assert.equal(argOf(seen.args, '-ClickToFocus'), 'true');
});

test('the statusline alerts keep the native toast: a card would cut their text in half', async () => {
  for (const event of ['usage_limit', 'context_limit']) {
    const { seen, deps } = capture();
    await sendToast({
      title: 'Claude Code · 5h limit at 85%', message: 'chat crossed 85% of the 5h usage limit. Resets 14:30.',
      source: 'claude', event, clickToFocus: false,
    }, deps);
    assert.equal(seen.file, 'pwsh', event);
    assert.equal(argOf(seen.args, '-File'), path.join(root, 'assets', 'windows', 'toast.ps1'), event);
  }
});

test('wantsCard needs the bundle, a card event, and the config switch', () => {
  assert.equal(wantsCard({ event: 'task_complete' }), true);
  assert.equal(wantsCard({ event: 'needs_input' }), true);
  assert.equal(wantsCard({ event: 'session_start' }), true);
  assert.equal(wantsCard({ event: 'usage_limit' }), false);
  assert.equal(wantsCard({ event: undefined }), false);
  assert.equal(wantsCard({ event: 'task_complete', toastCards: false }), false);
});

test('cardAppName feeds both the header and the icon lookup', () => {
  assert.equal(cardAppName('claude'), 'Claude');
  assert.equal(cardAppName('antigravity'), 'Antigravity');
  // No source (the `anotifier test` payload): the product name, and the
  // bundle's own icon.png, rather than another tool's branding.
  assert.equal(cardAppName(''), 'anotifier');
  assert.equal(cardAppName(undefined), 'anotifier');
});

test('the bundle still exposes and renders the explicit acknowledgement control', () => {
  const toast = fs.readFileSync(path.join(donetoastDir, 'toast.ps1'), 'utf8');
  const launcher = fs.readFileSync(path.join(donetoastDir, 'donetoast.ps1'), 'utf8');
  assert.match(toast, /\[string\]\$AcknowledgeLabel/);
  assert.match(toast, /x:Name="Acknowledge"/);
  assert.match(toast, /add_Click\(\{ & \$close \}\)/);
  assert.match(launcher, /\$AcknowledgeLabel/);
});
