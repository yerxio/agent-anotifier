import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendToast } from '../src/platforms/windows.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Windows Codex notifications launch a persistent Donetoast card with an acknowledgement button', async () => {
  let invoked;
  const result = await sendToast({
    title: 'demo · Codex', message: 'Task complete', source: 'codex', event: 'task_complete',
  }, {
    platform: 'win32',
    execFileImpl: (file, args, options, callback) => {
      invoked = { file, args, options };
      callback(null, 'started pid=123', '');
    },
    log: () => {},
  });

  assert.equal(result, true);
  assert.equal(invoked.file, 'powershell.exe');
  assert.equal(invoked.args[invoked.args.indexOf('-File') + 1], path.join(root, 'assets', 'windows', 'donetoast', 'donetoast.ps1'));
  assert.equal(invoked.args[invoked.args.indexOf('-AcknowledgeLabel') + 1], '知道了');
  assert.equal(invoked.args[invoked.args.indexOf('-App') + 1], 'Codex');
  assert.ok(invoked.options.windowsHide);
  assert.ok(fs.existsSync(path.join(root, 'assets', 'windows', 'donetoast', 'toast.ps1')));
});

test('Windows Codex attention events use the waiting-card style', async () => {
  let args;
  await sendToast({ title: 'Codex', message: 'Needs your input', source: 'codex', event: 'needs_input' }, {
    platform: 'win32',
    execFileImpl: (_file, commandArgs, _options, callback) => { args = commandArgs; callback(null, '', ''); },
    log: () => {},
  });
  assert.ok(args.includes('-Waiting'));
});

test('non-Codex Windows notifications retain the native toast backend', async () => {
  let invoked;
  await sendToast({ title: 'Claude', message: 'Task complete', source: 'claude' }, {
    platform: 'win32',
    execFileImpl: (file, args, options, callback) => { invoked = { file, args, options }; callback(null, '', ''); },
    log: () => {},
  });
  assert.equal(invoked.file, 'pwsh');
  assert.equal(invoked.args[invoked.args.indexOf('-File') + 1], path.join(root, 'assets', 'windows', 'toast.ps1'));
});

test('Donetoast exposes and renders the explicit acknowledgement control', () => {
  const dir = path.join(root, 'assets', 'windows', 'donetoast');
  const toast = fs.readFileSync(path.join(dir, 'toast.ps1'), 'utf8');
  const launcher = fs.readFileSync(path.join(dir, 'donetoast.ps1'), 'utf8');
  assert.match(toast, /\[string\]\$AcknowledgeLabel/);
  assert.match(toast, /x:Name="Acknowledge"/);
  assert.match(toast, /add_Click\(\{ & \$close \}\)/);
  assert.match(launcher, /\$AcknowledgeLabel/);
});
