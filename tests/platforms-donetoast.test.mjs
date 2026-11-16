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

test('a card carries the project and cwd so clicking it focuses that window', async () => {
  const { seen, deps } = capture();
  await sendToast({
    title: 'demo', message: 'Task complete', source: 'claude', event: 'task_complete',
    projectName: 'demo', cwd: 'D:' + path.sep + 'work' + path.sep + 'demo', clickToFocus: true,
  }, deps);
  assert.equal(argOf(seen.args, '-ProjectName'), 'demo');
  assert.equal(argOf(seen.args, '-Cwd'), 'D:' + path.sep + 'work' + path.sep + 'demo');
  assert.ok(!seen.args.includes('-ClickToFocus'), 'focus is the default, not a flag to pass');
});

test('clickToFocus: false turns the card click back into a plain dismiss', async () => {
  const { seen, deps } = capture();
  await sendToast({
    title: 'demo', message: 'Task complete', source: 'claude', event: 'task_complete',
    projectName: 'demo', cwd: 'D:' + path.sep + 'work', clickToFocus: false,
  }, deps);
  assert.equal(argOf(seen.args, '-ClickToFocus'), 'false');
  // Nothing to focus with, so neither value is handed to the detached card.
  assert.ok(!seen.args.includes('-ProjectName'));
  assert.ok(!seen.args.includes('-Cwd'));
});

test('the card focuses on a body click and only dismisses on the button', () => {
  const toast = fs.readFileSync(path.join(donetoastDir, 'toast.ps1'), 'utf8');
  const launcher = fs.readFileSync(path.join(donetoastDir, 'donetoast.ps1'), 'utf8');

  // The order inside the body-click handler is the contract: focus first, then
  // close — the window has to come forward before this process exits.
  const bodyClick = toast.indexOf('$w.add_MouseLeftButtonUp({');
  const focusCall = toast.indexOf('& $focus', bodyClick);
  const closeCall = toast.indexOf('& $close', bodyClick);
  assert.ok(bodyClick > -1, 'no body-click handler');
  assert.ok(focusCall > bodyClick && focusCall < closeCall, 'body click must focus before it closes');

  // The acknowledgement button is dismiss-only: that is the whole distinction
  // between the two controls.
  assert.match(toast, /\$el\.Acknowledge\.add_Click\(\{ & \$close \}\)/);
  assert.doesNotMatch(toast, /Acknowledge\.add_Click\(\{ & \$focus/);

  // The window is identified by a handle taken from the process chain, not by
  // guessing at window titles: a terminal tab is usually named something other
  // than the project. The handle has to be resolved in the launcher, which is
  // still a descendant of the terminal — the card is detached from it.
  assert.ok(fs.existsSync(path.join(donetoastDir, '..', 'ancestor-hwnd.ps1')));
  assert.match(launcher, /\. \$helper; \$hwnd = Get-AncestorWindowHandle/);
  assert.match(launcher, /\$foc \+= " -Hwnd \$hwnd"/);
  assert.match(toast, /\[int64\]\$Hwnd = 0/);
  assert.match(toast, /\$query \+= "hwnd=\$Hwnd"/);

  // In-process, not a spawned child: the clicked card owns the foreground
  // window, so it is allowed to hand focus over; a detached child is not.
  assert.match(toast, /& \$handler -Arg \$arg/);
  assert.doesNotMatch(toast, /Start-Process[^\n]*focus-window/);
  // The helper is the same one the agentfocus:// protocol handler runs.
  assert.ok(fs.existsSync(path.join(donetoastDir, '..', 'focus-window.ps1')));
  assert.ok(toast.includes("Join-Path $PSScriptRoot '..\\focus-window.ps1'"), 'card must point at the shared helper');

  // And the launcher forwards what the card needs to resolve the window.
  assert.match(launcher, /\[string\]\$ProjectName = ''/);
  assert.match(launcher, /\[string\]\$Cwd = ''/);
  assert.match(launcher, /\$ClickToFocus -ne 'false'/);
});

test('the bundle still exposes and renders the explicit acknowledgement control', () => {
  const toast = fs.readFileSync(path.join(donetoastDir, 'toast.ps1'), 'utf8');
  const launcher = fs.readFileSync(path.join(donetoastDir, 'donetoast.ps1'), 'utf8');
  assert.match(toast, /\[string\]\$AcknowledgeLabel/);
  assert.match(toast, /x:Name="Acknowledge"/);
  assert.match(toast, /add_Click\(\{ & \$close \}\)/);
  assert.match(launcher, /\$AcknowledgeLabel/);
});
