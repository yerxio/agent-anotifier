// tests/platforms-donetoast.test.mjs — the Windows card backend. Every tool's
// hook notification renders as a persistent Donetoast card; the statusline's
// usage/context alerts and an explicit `toast.cards: false` keep the native
// BurntToast path, which is the only one with click-to-focus.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendToast, wantsCard, cardAppName, cardContent, cardSoundArgs, cardState } from '../src/platforms/windows.mjs';

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

test('the statusline warnings are warning cards and keep their headline as the title', async () => {
  for (const event of ['usage_limit', 'context_limit']) {
    const { seen, deps } = capture();
    await sendToast({
      title: 'Claude Code · 5h limit at 85%', message: 'chat crossed 85% of the 5h usage limit. Resets 14:30.',
      source: 'claude', event, projectName: 'chat', clickToFocus: false,
    }, deps);
    assert.equal(seen.file, 'powershell.exe', event);
    assert.ok(seen.args.includes('-Warning'), event);
    // Not a hook event: the title is the headline, not a project name to
    // re-cut — replacing it with "chat" would drop what the warning is about.
    assert.equal(argOf(seen.args, '-Title'), 'Claude Code · 5h limit at 85%', event);
  }
});

test('the update notice is an info card under the product name', async () => {
  const { seen, deps } = capture();
  await sendToast({ title: 'anotifier v9.9.9 available', message: 'You have v1.0.0', event: 'update_available' }, deps);
  assert.equal(seen.file, 'powershell.exe');
  assert.ok(seen.args.includes('-Info'));
  assert.equal(argOf(seen.args, '-App'), 'anotifier');
  assert.equal(argOf(seen.args, '-Title'), 'anotifier v9.9.9 available');
});

test('cardState says what the notification is, not just which hook sent it', () => {
  assert.equal(cardState({ event: 'task_complete', message: 'Task complete' }), 'done');
  assert.equal(cardState({ event: 'task_complete', message: 'p: Task failed' }), 'failed');
  assert.equal(cardState({ event: 'needs_input' }), 'waiting');
  // Claude Code sends "a background agent finished" through the same
  // Notification hook as its prompts. Nothing is waiting on the user, so the
  // card must not say "needs you".
  assert.equal(cardState({ event: 'needs_input', informational: true }), 'info');
  assert.equal(cardState({ event: 'usage_limit' }), 'warning');
  assert.equal(cardState({ event: 'context_limit' }), 'warning');
  assert.equal(cardState({ event: 'update_available' }), 'info');
  assert.equal(cardState({ event: 'session_start' }), 'info');
  assert.equal(cardState({}), 'info');
});

test('an informational Claude notice reaches the card as info, a prompt as waiting', async () => {
  const { route } = await import('../src/router.mjs');
  const config = { toast: {}, events: { needs_input: {} }, sources: {} };
  const notice = route({ source: 'claude', event: 'needs_input', notificationType: 'agent_completed' }, config);
  assert.equal(notice.informational, true);
  assert.equal(cardState(notice), 'info');
  const prompt = route({ source: 'claude', event: 'needs_input', notificationType: 'permission_prompt' }, config);
  assert.equal(prompt.informational, undefined);
  assert.equal(cardState(prompt), 'waiting');
});

test('wantsCard: every notification, unless the config says otherwise', () => {
  for (const event of ['task_complete', 'needs_input', 'session_start', 'usage_limit', 'update_available', undefined]) {
    assert.equal(wantsCard({ event }), true, String(event));
  }
  assert.equal(wantsCard({ event: 'task_complete', toastCards: false }), false);
  assert.equal(wantsCard({ event: 'usage_limit', toastCards: false }), false);
});

test('both card scripts know the info and warning states', () => {
  const toast = fs.readFileSync(path.join(donetoastDir, 'toast.ps1'), 'utf8');
  const launcher = fs.readFileSync(path.join(donetoastDir, 'donetoast.ps1'), 'utf8');
  assert.match(toast, /info\s+= @\('#[0-9A-Fa-f]{6}', 0x[0-9A-F]{4}, 'info',/);
  assert.match(toast, /warning = @\('#[0-9A-Fa-f]{6}', 0x[0-9A-F]{4}, 'warning',/);
  assert.match(launcher, /\[switch\]\$Info/);
  assert.match(launcher, /\[switch\]\$Warning/);
  assert.match(launcher, /' -State info'/);
  assert.match(launcher, /' -State warning'/);
});

test('cardAppName feeds both the header and the icon lookup', () => {
  assert.equal(cardAppName('claude'), 'Claude');
  assert.equal(cardAppName('antigravity'), 'Antigravity');
  // No source (the `anotifier test` payload): the product name, and the
  // bundle's own icon.png, rather than another tool's branding.
  assert.equal(cardAppName(''), 'anotifier');
  assert.equal(cardAppName(undefined), 'anotifier');
});

test('every card is one size, with a message that wraps instead of truncating', () => {
  const toast = fs.readFileSync(path.join(donetoastDir, 'toast.ps1'), 'utf8');
  // Constants, not expressions: the size must not vary with the tool, the
  // state or -AcknowledgeLabel, or there are several layouts to maintain.
  assert.match(toast, /^\$cardWidth = 480$/m);
  assert.match(toast, /^\$cardHeight = 160$/m);
  // The message wraps (and only then trims), so the 180-character cap on
  // notification text fits; the old single line showed about 40 of them.
  const message = toast.slice(toast.indexOf('x:Name="MessageText"'));
  assert.match(message.slice(0, 300), /TextWrapping="Wrap"/);
  assert.match(message.slice(0, 300), /TextTrimming="CharacterEllipsis"/);
  // Nothing keeps upstream's width around: the progress bar scales with the card.
  assert.doesNotMatch(toast, /\$width = 283/);
  assert.match(toast, /\$width = \$cardWidth \* \$p \/ 100/);
});

test('the card title is the project alone and the turn length moves to the header', async () => {
  const { seen, deps } = capture();
  await sendToast({
    title: 'my-project · Claude Code', message: 'All 12 tests pass now. (took 4m 12s)', durationText: '4m 12s',
    projectName: 'my-project', source: 'claude', event: 'task_complete',
  }, deps);
  // The header names the tool already, so the title does not repeat it.
  assert.equal(argOf(seen.args, '-Title'), 'my-project');
  // The duration is its own field, and no longer trails the message, where a
  // long text pushed it off the card.
  assert.equal(argOf(seen.args, '-Duration'), '4m 12s');
  assert.equal(argOf(seen.args, '-Message'), 'All 12 tests pass now.');
});

test('cardContent leaves a notification without project or duration as it is', () => {
  assert.deepEqual(
    cardContent({ title: 'anotifier', message: 'Test notification', event: 'task_complete' }),
    { app: 'anotifier', title: 'anotifier', message: 'Test notification', duration: '' },
  );
  // A message that merely mentions a duration elsewhere is not rewritten.
  assert.equal(
    cardContent({ message: 'It (took 5s) to build, then failed', durationText: '5s', source: 'codex' }).message,
    'It (took 5s) to build, then failed',
  );
  // The other channels read the same object afterwards: it must not be mutated.
  const shared = { title: 'p · Codex', message: 'p: Task complete (took 9s)', durationText: '9s', projectName: 'p', source: 'codex' };
  cardContent(shared);
  assert.equal(shared.message, 'p: Task complete (took 9s)');
  assert.equal(shared.title, 'p · Codex');
});

test('the launcher and the card both carry the duration through to the header', () => {
  const toast = fs.readFileSync(path.join(donetoastDir, 'toast.ps1'), 'utf8');
  const launcher = fs.readFileSync(path.join(donetoastDir, 'donetoast.ps1'), 'utf8');
  assert.match(launcher, /\[string\]\$Duration = ''/);
  assert.match(launcher, /-Duration \$\(& \$dec \$Duration\)/);
  assert.match(toast, /\[string\]\$Duration = ''/);
  assert.match(toast, /\$el\.Header\.Text = .*\$Duration/);
});

test('a configured sound name reaches the card, which resolves it itself', async () => {
  const { seen, deps } = capture();
  await sendToast({ title: 'p', message: 'Task complete', source: 'claude', event: 'task_complete', toastSound: 'IM' }, deps);
  assert.equal(argOf(seen.args, '-Sound'), 'IM');
  assert.ok(!seen.args.includes('-Silent'));

  // Nothing configured: no flag, and the card keeps its own chime.
  const plain = capture();
  await sendToast({ title: 'p', message: 'Task complete', source: 'claude', event: 'task_complete' }, plain.deps);
  assert.ok(!plain.seen.args.includes('-Sound'));
});

test('cardSoundArgs: a wav goes to the card, other audio plays here and silences it', async () => {
  const usable = { statSync: () => ({ isFile: () => true }), accessSync: () => {} };
  const log = () => {};

  const wav = await cardSoundArgs({ toastSound: 'C:\\sounds\\done.wav' }, { log, ...usable });
  assert.deepEqual(wav, ['-Sound', 'C:\\sounds\\done.wav']);

  // An mp3 cannot be played by the card's SoundPlayer, so the same player the
  // native backend uses takes it, and the card is told to stay quiet.
  const spawned = [];
  const spawnImpl = (command, args) => {
    spawned.push([command, args]);
    return { once: (event, cb) => { if (event === 'spawn') cb(); }, unref: () => {} };
  };
  const mp3 = await cardSoundArgs({ toastSound: 'C:\\sounds\\done.mp3' }, { log, spawnImpl, ...usable });
  assert.deepEqual(mp3, ['-Silent']);
  assert.equal(spawned[0][0], 'pwsh');
  assert.ok(spawned[0][1].includes('C:\\sounds\\done.mp3'));

  // No player could start: no flag, so the card falls back to its own chime
  // rather than going silent.
  const failing = (command, args) => ({ once: (event, cb) => { if (event === 'error') cb(new Error('ENOENT')); }, unref: () => {} });
  assert.deepEqual(await cardSoundArgs({ toastSound: 'C:\\sounds\\done.mp3' }, { log, spawnImpl: failing, ...usable }), []);

  // A file that is not there: logged by prepareSoundFile, and again no flag.
  const missing = { statSync: () => { throw Object.assign(new Error('nope'), { code: 'ENOENT' }); }, accessSync: () => {} };
  assert.deepEqual(await cardSoundArgs({ toastSound: 'C:\\sounds\\gone.wav' }, { log, ...missing }), []);
});

test('the card plays the configured sound once and falls back to its own chime', () => {
  const toast = fs.readFileSync(path.join(donetoastDir, 'toast.ps1'), 'utf8');
  const launcher = fs.readFileSync(path.join(donetoastDir, 'donetoast.ps1'), 'utf8');
  assert.match(toast, /\[string\]\$Sound = ''/);
  assert.match(toast, /\[switch\]\$Silent/);
  // Names come from the user's Windows sound scheme, not a hard-coded media path.
  assert.match(toast, /HKCU:\\AppEvents\\Schemes\\Apps\\\.Default\\\$key\\\.Current/);
  assert.match(toast, /Notification\.Looping\.\$value/);
  // .Play() and never .PlayLooping(): the card is persistent, a loop would not end.
  assert.doesNotMatch(toast, /PlayLooping/);
  // The bundled chime is still there behind it.
  const play = toast.slice(toast.indexOf('function Play($state)'));
  assert.ok(play.indexOf('$script:cardSound') < play.indexOf('$looks[$state]'), 'configured sound first, bundled chime as the fallback');
  assert.match(launcher, /-Sound \$\(& \$dec \$Sound\)/);
  assert.match(launcher, /if \(\$Silent\) \{ ' -Silent' \}/);
});

test('the bundle still exposes and renders the explicit acknowledgement control', () => {
  const toast = fs.readFileSync(path.join(donetoastDir, 'toast.ps1'), 'utf8');
  const launcher = fs.readFileSync(path.join(donetoastDir, 'donetoast.ps1'), 'utf8');
  assert.match(toast, /\[string\]\$AcknowledgeLabel/);
  assert.match(toast, /x:Name="Acknowledge"/);
  assert.match(toast, /add_Click\(\{ & \$close \}\)/);
  assert.match(launcher, /\$AcknowledgeLabel/);
});
