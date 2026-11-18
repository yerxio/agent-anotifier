// tests/agent-window.test.mjs — remembering the window the user drives the
// agent from, for the card's "jump to window" button.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordAgentWindow, readAgentWindow, removeAgentWindows, windowStatePath } from '../src/agent-window.mjs';

describe('agent-window capture', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-win-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ev = { source: 'claude', sessionId: 'abc12345-session' };

  it('records nothing off Windows, and reads back nothing', () => {
    const spawned = [];
    assert.equal(recordAgentWindow(ev, { platform: 'linux', dir, spawnSyncImpl: (...a) => { spawned.push(a); } }), false);
    assert.equal(spawned.length, 0);
    assert.equal(readAgentWindow(ev, { platform: 'linux', dir }), 0);
  });

  it('on Windows runs the capture once, pointed at this session file, and skips when fresh', () => {
    const calls = [];
    const spy = (cmd, args, opts) => { calls.push({ cmd, args, opts }); fs.writeFileSync(windowStatePath('claude', ev.sessionId, dir), JSON.stringify({ hwnd: 4242, at: Date.now() })); };
    assert.equal(recordAgentWindow(ev, { platform: 'win32', dir, spawnSyncImpl: spy }), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].cmd, 'powershell.exe');
    assert.equal(calls[0].args[calls[0].args.indexOf('-Out') + 1], windowStatePath('claude', ev.sessionId, dir));
    assert.ok(calls[0].args.some((a) => a.endsWith('capture-window.ps1')));
    assert.equal(calls[0].opts.windowsHide, true);
    assert.ok(typeof calls[0].opts.timeout === 'number');
    // A second turn in the same session has a fresh capture, so it does not run again.
    assert.equal(recordAgentWindow(ev, { platform: 'win32', dir, spawnSyncImpl: spy }), false);
    assert.equal(calls.length, 1);
  });

  it('reads back the captured handle, and 0 for a session never captured', () => {
    fs.writeFileSync(windowStatePath('claude', ev.sessionId, dir), JSON.stringify({ hwnd: 133604, at: Date.now() }));
    assert.equal(readAgentWindow(ev, { platform: 'win32', dir }), 133604);
    assert.equal(readAgentWindow({ source: 'claude', sessionId: 'never' }, { platform: 'win32', dir }), 0);
  });

  it('ignores a stale, zero, negative, non-numeric or malformed capture', () => {
    const write = (o) => fs.writeFileSync(windowStatePath('claude', ev.sessionId, dir), typeof o === 'string' ? o : JSON.stringify(o));
    write({ hwnd: 133604, at: Date.now() - 13 * 60 * 60 * 1000 });
    assert.equal(readAgentWindow(ev, { platform: 'win32', dir }), 0, 'stale');
    write({ hwnd: 0, at: Date.now() });
    assert.equal(readAgentWindow(ev, { platform: 'win32', dir }), 0, 'zero');
    write({ hwnd: -5, at: Date.now() });
    assert.equal(readAgentWindow(ev, { platform: 'win32', dir }), 0, 'negative');
    write({ hwnd: 'x', at: Date.now() });
    assert.equal(readAgentWindow(ev, { platform: 'win32', dir }), 0, 'non-numeric');
    write('{not json');
    assert.equal(readAgentWindow(ev, { platform: 'win32', dir }), 0, 'malformed');
  });

  it('a session without an id is never captured or read', () => {
    assert.equal(recordAgentWindow({ source: 'claude' }, { platform: 'win32', dir, spawnSyncImpl: () => { throw new Error('should not spawn'); } }), false);
    assert.equal(readAgentWindow({ source: 'claude' }, { platform: 'win32', dir }), 0);
  });

  it('removeAgentWindows clears only the capture files', () => {
    fs.writeFileSync(windowStatePath('claude', 's1', dir), '{}');
    fs.writeFileSync(windowStatePath('codex', 's2', dir), '{}');
    fs.writeFileSync(path.join(dir, 'config.json'), '{}');
    assert.equal(removeAgentWindows(dir), 2);
    assert.deepEqual(fs.readdirSync(dir), ['config.json']);
  });
});
