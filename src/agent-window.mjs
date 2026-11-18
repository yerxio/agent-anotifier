// src/agent-window.mjs — remember which window the user drives the agent from,
// so the Windows card's "jump to window" button can bring it back.
//
// The card can show on every virtual desktop, but the agent's terminal lives
// on one. To jump there, the card needs that window's handle — and the only
// moment it can be identified is when the user submits a prompt, because that
// is when the agent's window is the foreground window. By the time the agent
// finishes, the user may be elsewhere, and Windows Terminal's one-process,
// many-windows design defeats resolving it from the process tree. So the
// turn-start hook captures the foreground window then and stores it per
// session; the card reads it back and, on the button, focuses it, which
// switches Windows to that window's desktop.
//
// Windows only, and entirely best-effort: a capture that does not happen, or a
// window that was closed, simply means no jump button on that card.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getConfigDir } from './config-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAPTURE_SCRIPT = path.join(__dirname, '..', 'assets', 'windows', 'capture-window.ps1');

// A capture older than this is ignored: the session is from another day and the
// window handle it named is long gone (and the integer may have been reused).
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

// One file per session, like the dedup locks: no reader/writer races on a
// shared file, and `anotifier uninstall` can wipe the lot by prefix.
export function windowStatePath(source, sessionId, dir = getConfigDir()) {
  const key = `${source}-${String(sessionId).slice(0, 40)}`.replace(/[^A-Za-z0-9_.-]/g, '_');
  return path.join(dir, `.agentwin-${key}.json`);
}

// True only on a real Windows host. The card backend is the only caller, and it
// only runs there; WSL reaches Windows a different way and has no card.
function onWindows(platform = os.platform()) {
  return platform === 'win32';
}

// Record the foreground window for this session, at turn start. Synchronous —
// about a quarter second for the PowerShell to read GetForegroundWindow — and
// done only ONCE per session: the agent's window does not change for the life
// of a session, and focusing a stored handle follows that window even after it
// moves to another desktop. So only the first prompt of a session pays for it;
// every later prompt finds a fresh capture and returns at once. A detached
// capture that outlived the hook would be ideal, but a detached child does not
// reliably survive the hook's immediate exit on Windows, where a short
// blocking call does. Never throws, and a failure just means no jump button.
export function recordAgentWindow(event, { platform = os.platform(), now = Date.now(), dir = getConfigDir(), spawnSyncImpl = spawnSync } = {}) {
  if (!onWindows(platform) || !event?.sessionId) return false;
  if (readAgentWindow(event, { platform, now, dir })) return false; // already have a fresh one
  try {
    const out = windowStatePath(event.source, event.sessionId, dir);
    spawnSyncImpl('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', CAPTURE_SCRIPT, '-Out', out,
    ], { timeout: 4000, stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

// The captured handle for this session, or 0 when there is none, it is stale,
// or anything about it does not parse. Never throws.
export function readAgentWindow(event, { platform = os.platform(), now = Date.now(), dir = getConfigDir() } = {}) {
  if (!onWindows(platform) || !event?.sessionId) return 0;
  try {
    const raw = fs.readFileSync(windowStatePath(event.source, event.sessionId, dir), 'utf8');
    const { hwnd, at } = JSON.parse(raw);
    if (typeof hwnd !== 'number' || !Number.isFinite(hwnd) || hwnd <= 0) return 0;
    if (typeof at !== 'number' || now - at > MAX_AGE_MS) return 0;
    return Math.trunc(hwnd);
  } catch {
    return 0;
  }
}

// Remove every per-session capture file (anotifier uninstall).
export function removeAgentWindows(dir = getConfigDir()) {
  let removed = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.agentwin-') && name.endsWith('.json')) {
        try { fs.unlinkSync(path.join(dir, name)); removed += 1; } catch {}
      }
    }
  } catch {}
  return removed;
}
