// tests/doctor-windows.test.mjs — the real win32 toast-backend probe.
// Dependencies are injected (hasBin, psRun) so these run on any OS: no real
// PowerShell is spawned. Replaces the old hardcoded 'ok' with honest states.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowsToastBackendCheck } from '../cli/doctor-checks.mjs';

const present = () => true;
const absent = () => false;
const onlyPwsh = (bin) => bin === 'pwsh';
const okProbe = () => ({ burntToast: true, machinePolicy: 'Undefined', userPolicy: 'Undefined' });

test('fails when no PowerShell is present', () => {
  const r = windowsToastBackendCheck({ hasBin: absent, psRun: okProbe });
  assert.equal(r.id, 'toast-backend');
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /PowerShell 7 \(pwsh\) not found/);
  assert.ok(r.hint);
});

test('ok when pwsh + BurntToast present and no blocking policy', () => {
  const r = windowsToastBackendCheck({ hasBin: onlyPwsh, psRun: okProbe });
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /pwsh \+ BurntToast/);
});

// windows.mjs spawns only pwsh, so 5.1 alone must not read as healthy.
test('fails when only Windows PowerShell 5.1 is present', () => {
  let probed = false;
  const r = windowsToastBackendCheck({ hasBin: (b) => b === 'powershell', psRun: () => { probed = true; return okProbe(); } });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /only Windows PowerShell 5\.1 found/);
  assert.match(r.hint, /winget install --id Microsoft\.PowerShell/);
  assert.equal(probed, false, 'no point probing BurntToast through a shell the toast never uses');
});

test('warns when BurntToast module is not installed', () => {
  const r = windowsToastBackendCheck({
    hasBin: onlyPwsh,
    psRun: () => ({ burntToast: false, machinePolicy: 'Undefined', userPolicy: 'Undefined' }),
  });
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /BurntToast module not installed/);
  assert.match(r.hint, /Install-Module BurntToast/);
});

test('fails when a policy-scope execution policy blocks scripts (overrides -Bypass)', () => {
  for (const scope of ['machinePolicy', 'userPolicy']) {
    for (const pol of ['Restricted', 'AllSigned']) {
      const r = windowsToastBackendCheck({
        hasBin: onlyPwsh,
        psRun: () => ({ burntToast: true, machinePolicy: 'Undefined', userPolicy: 'Undefined', [scope]: pol }),
      });
      assert.equal(r.status, 'fail', `${scope}=${pol} should fail`);
      assert.match(r.detail, /execution policy/i);
    }
  }
});

test('a Restricted Process/CurrentUser policy does NOT block (product uses -Bypass)', () => {
  // Only MachinePolicy/UserPolicy scopes override -Bypass; the probe only reports
  // those two, so a machine with Restricted CurrentUser still resolves ok here.
  const r = windowsToastBackendCheck({ hasBin: onlyPwsh, psRun: okProbe });
  assert.equal(r.status, 'ok');
});

test('warns (never throws) when the probe itself fails', () => {
  const r = windowsToastBackendCheck({
    hasBin: onlyPwsh,
    psRun: () => { throw new Error('spawn pwsh ENOENT'); },
  });
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /probe failed/);
});

// --- the card backend: what doctor reports while Donetoast cards are on ------
import { windowsCardBackendCheck } from '../cli/doctor-checks.mjs';

test('cards on + bundle present: ok on Windows PowerShell alone, pwsh and BurntToast never consulted', () => {
  const asked = [];
  const r = windowsCardBackendCheck({ toast: {} }, { hasBin: (b) => { asked.push(b); return b === 'powershell'; }, bundleReady: () => true });
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /Donetoast cards/);
  assert.deepEqual(asked, ['powershell'], 'a machine whose cards work must not be failed for lacking pwsh');
});

test('cards on but no powershell.exe: fail, since the card cannot be spawned', () => {
  const r = windowsCardBackendCheck({}, { hasBin: () => false, bundleReady: () => true });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /powershell\.exe/);
});

test('cards off, or the bundle missing: null, so the native backend is checked instead', () => {
  const present = { hasBin: () => true, bundleReady: () => true };
  assert.equal(windowsCardBackendCheck({ toast: { cards: false } }, present), null);
  assert.equal(windowsCardBackendCheck({}, { hasBin: () => true, bundleReady: () => false }), null);
});
