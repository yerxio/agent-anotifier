// src/platforms/windows.mjs
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { platform } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logHookError } from '../error-log.mjs';
import { execFailureReason, noteFailure } from '../channel-failure.mjs';
import { PLAY_SCRIPT, isSoundFilePath, playFirst, prepareSoundFile, windowsPlayerArgs } from './sound.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOAST_SCRIPT = path.join(__dirname, '..', '..', 'assets', 'windows', 'toast.ps1');
const DONETOAST_DIR = path.join(__dirname, '..', '..', 'assets', 'windows', 'donetoast');
const DONETOAST_SCRIPT = path.join(DONETOAST_DIR, 'donetoast.ps1');
const DONETOAST_CARD_SCRIPT = path.join(DONETOAST_DIR, 'toast.ps1');

// The events a tool's own hook produces. Their shared title is
// "<project> · <tool label>", which the card re-cuts (see cardContent); every
// other notification — the statusline's usage and context warnings, the update
// notice — has a headline for a title and keeps it.
const HOOK_EVENTS = new Set(['task_complete', 'needs_input', 'session_start']);

// Which of the card's states a notification is. The card puts the state word
// next to the tool name ("Claude · needs you"), so a wrong state is a wrong
// statement, not a wrong colour:
//   waiting  the agent is blocked on the user
//   info     something happened and nothing waits: a notice Claude Code sends
//            through the same Notification hook as its prompts (a background
//            agent finished), a session start, the update notice, anything else
//   warning  the usage-limit and context-window warnings
//   failed   a run that ended in an error
//   done     a finished turn
export function cardState(notification) {
  const { event } = notification;
  if (event === 'needs_input') return notification.informational ? 'info' : 'waiting';
  if (event === 'task_complete') return /\bTask failed\b/i.test(notification.message || '') ? 'failed' : 'done';
  if (event === 'usage_limit' || event === 'context_limit') return 'warning';
  return 'info';
}
const STATE_FLAG = { waiting: '-Waiting', failed: '-Failed', info: '-Info', warning: '-Warning' };

// donetoast reads -App for BOTH the card header and icons/<app>.png, so this is
// the capitalized source token, never the config's display label ('Claude Code'
// would look for "claude code.png"). No source — the `anotifier test` payload —
// reads as the product and falls back to the bundle's own icon.png.
export function cardAppName(source) {
  if (typeof source !== 'string' || !source) return 'anotifier';
  return source.charAt(0).toUpperCase() + source.slice(1);
}

// Every desktop notification on Windows is a card: one look, and no dependency
// on PowerShell 7 or BurntToast. `toast.cards: false` in the config puts all of
// them back on the native toast, and a bundle that did not ship (or was
// deleted) falls back on its own.
export function wantsCard(notification) {
  return notification.toastCards !== false
    && fs.existsSync(DONETOAST_SCRIPT)
    && fs.existsSync(DONETOAST_CARD_SCRIPT);
}

// 7s: the host hook budget is 10s total (hooks.json), shared with stdin read
// and the other channels — the toast subprocess must never be the thing that
// blows that budget.
const TOAST_TIMEOUT_MS = 7000;

// What to record next to a failed toast. execFile's own message is just
// "Command failed: <cmd>", which reads the same for a timeout kill, a non-zero
// exit and a missing pwsh, so the cause is spelled out here.
//
// err.killed is only set when Node itself killed the child, and sendToast only
// does that on the timeout, so killed alone means timed out. Comparing elapsed
// time against the timeout would misread a timer that fires a millisecond early.
export function toastFailureDetail(err, stderr, elapsedMs, timeoutMs = TOAST_TIMEOUT_MS, executable = 'pwsh') {
  let cause;
  if (err?.killed) cause = `timed out after ${timeoutMs} ms`;
  else if (err?.code === 'ENOENT') cause = `${executable} not found`;
  else if (typeof err?.code === 'number') cause = `exit code ${err.code}`;
  else if (typeof err?.code === 'string' && err.code) cause = err.code;
  else if (err?.signal) cause = `killed by ${err.signal}`;
  else cause = 'unknown';
  return {
    cause,
    exitCode: typeof err?.code === 'number' ? err.code : null,
    signal: err?.signal ?? null,
    elapsedMs: Math.round(elapsedMs),
    stderr: (stderr || '').slice(0, 400),
  };
}

// What the card shows, re-cut from the shared notification, because the card
// has a header row the other channels lack:
//   title    the project alone. The shared title is "<project> · <tool label>",
//            but the header already names the tool, and the repeat pushed long
//            project names into an ellipsis.
//   duration its own header field. The shared message ends in " (took 4m 12s)",
//            the first thing a long text pushes off the card.
//   message  the shared message without that suffix.
// Other channels still get the notification untouched.
export function cardContent(notification) {
  const app = cardAppName(notification.source);
  const project = typeof notification.projectName === 'string'
    ? notification.projectName.replace(/\s+/g, ' ').trim()
    : '';
  const duration = typeof notification.durationText === 'string' ? notification.durationText : '';
  let message = notification.message || '';
  const suffix = ` (took ${duration})`;
  if (duration && message.endsWith(suffix)) message = message.slice(0, -suffix.length);
  const hookTitle = HOOK_EVENTS.has(notification.event) ? project : '';
  return { app, title: hookTitle || notification.title || app, message, duration, label: cardLabel(notification) };
}

// What raised the card, for its header: the hook's own name as the tool sent
// it ("Stop", "AfterAgent", "PermissionRequest"), and for a Claude Code
// Notification the type inside it ("Notification · permission_prompt"), since
// that one hook carries thirteen different things. A notification no hook
// raised names its origin instead ("statusline", "update check", "test").
// Empty when the sender gave neither, and the card then falls back to its
// state word.
//
// Both parts come from outside — a hook payload — so only plain identifier
// characters survive and the length is capped: this is a header, not a place
// for a payload to put text.
export function cardLabel(notification) {
  const clean = (value) => (typeof value === 'string' ? value.replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 32) : '');
  const hook = clean(notification.hook);
  const detail = clean(notification.hookDetail);
  if (!hook) return '';
  return detail ? `${hook} · ${detail}` : hook;
}

// How the card should sound, from the same `toastSound` the native toast reads
// (events.<event>.toastSound, set by `anotifier config sounds`):
//   a sound name (IM, Reminder, ...)  -> -Sound <name>; the card looks up the wav
//                                        Windows has assigned to that name
//   a .wav file                       -> -Sound <path>; the card plays it itself
//   any other audio file              -> played here through play-sound.ps1, as
//                                        the native backend does, and the card
//                                        is told to stay -Silent
// No args at all — nothing configured, an unusable file, no player — leaves the
// card on its own chime, so a bad sound setting never costs the notification
// its sound, let alone the card.
export async function cardSoundArgs(notification, { log, ...soundDeps } = {}) {
  const sound = typeof notification.toastSound === 'string' ? notification.toastSound.trim() : '';
  if (!sound) return [];
  if (!isSoundFilePath(sound)) return ['-Sound', sound];
  const file = prepareSoundFile(sound, 'toast:donetoast', { log, ...soundDeps });
  if (!file) return [];
  if (path.extname(file).toLowerCase() === '.wav') return ['-Sound', file];
  const playing = await playFirst([['pwsh', windowsPlayerArgs(PLAY_SCRIPT, file)]], 'toast:donetoast', { log, windowsHide: true, ...soundDeps });
  return playing ? ['-Silent'] : [];
}

async function sendDonetoast(notification, { execFileImpl, log, ...soundDeps }) {
  const card = cardContent(notification);
  const args = [
    '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', DONETOAST_SCRIPT,
    '-Title', card.title,
    '-Message', card.message,
    '-App', card.app,
    '-AcknowledgeLabel', '知道了',
  ];
  if (card.duration) args.push('-Duration', card.duration);
  if (card.label) args.push('-Label', card.label);
  // The "jump to window" button, when turn-start captured a window for this
  // session (src/agent-window.mjs). The card activates it on click, which
  // switches to its virtual desktop.
  const hwnd = Number.isInteger(notification.focusHwnd) && notification.focusHwnd > 0 ? notification.focusHwnd : 0;
  if (hwnd) args.push('-FocusLabel', '跳转窗口', '-Hwnd', String(hwnd));
  const stateFlag = STATE_FLAG[cardState(notification)];
  if (stateFlag) args.push(stateFlag);
  args.push(...await cardSoundArgs(notification, { log, ...soundDeps }));

  return new Promise((resolve) => {
    const started = Date.now();
    execFileImpl('powershell.exe', args, { timeout: TOAST_TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const detail = toastFailureDetail(err, stderr, Date.now() - started, TOAST_TIMEOUT_MS, 'powershell.exe');
        log('toast:donetoast', new Error(`donetoast.ps1 failed: ${detail.cause}`), detail);
        noteFailure('toast', execFailureReason(err));
      }
      resolve(!err);
    });
  });
}

// deps are injectable for tests: the platform, execFile, the spawn that starts
// the sound player, and the error logger.
export async function sendToast(notification, deps = {}) {
  const { platform: host = platform, execFileImpl = execFile, log = logHookError, ...soundDeps } = deps;
  if (host !== 'win32') {
    noteFailure('toast', 'unsupported');
    return false;
  }

  // Notifications render as donetoast's persistent card, with an explicit
  // acknowledgement button. The native-toast path below is what is left when
  // `toast.cards` is off or the card bundle is missing.
  if (wantsCard(notification)) {
    return sendDonetoast(notification, { execFileImpl, log, ...soundDeps });
  }

  // A custom sound file plays in its own detached pwsh and the toast is made
  // silent; if the file is unusable or the player cannot start, the toast keeps
  // the default sound.
  const file = prepareSoundFile(notification.toastSound, 'toast:windows', { log, ...soundDeps });
  const playing = file
    ? await playFirst([['pwsh', windowsPlayerArgs(PLAY_SCRIPT, file)]], 'toast:windows', { log, windowsHide: true, ...soundDeps })
    : false;
  // A path is never a BurntToast sound name, so it never goes into -Sound.
  const sound = isSoundFilePath(notification.toastSound) ? 'Default' : (notification.toastSound || 'Default');

  return new Promise((resolve) => {
    const args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', TOAST_SCRIPT,
      '-Title', notification.title,
      '-Message', notification.message,
      '-Sound', sound,
      '-ClickToFocus', notification.clickToFocus === false ? 'false' : 'true',
    ];
    if (playing) args.push('-Silent', 'true');

    if (notification.projectName) {
      args.push('-ProjectName', notification.projectName);
    }

    if (notification.cwd) {
      args.push('-Cwd', notification.cwd);
    }

    if (notification.source) {
      args.push('-Source', notification.source);
    }

    // windowsHide: a caller with no console of its own (the detached usage-alert
    // sender) would otherwise get a visible PowerShell window flashing up.
    const started = Date.now();
    execFileImpl('pwsh', args, { timeout: TOAST_TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        // The first line of the message is what `anotifier status` prints, so
        // it names the cause; execFile's "Command failed: <cmd>" goes to extra.
        const detail = toastFailureDetail(err, stderr, Date.now() - started);
        // The original stack is not copied: its first line repeats the whole
        // command line, which extra.command already keeps once.
        const logged = new Error(`toast.ps1 failed: ${detail.cause}`);
        log('toast:windows', logged, { ...detail, command: String(err.message || '').split('\n')[0].slice(0, 300) });
        noteFailure('toast', execFailureReason(err));
      }
      resolve(!err);
    });
  });
}
