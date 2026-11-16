// tests/status-box-width.test.mjs — the `anotifier status` frame survives long
// rows. A fixed box width used to clip the fill to zero and push the right
// border past the frame, so one long value (the Windows card-backend label, an
// ntfy URL on a LAN host, Codex's event list) broke every row below it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { box, kv } from '../cli/ui.mjs';
import { PLATFORM_DISPLAY } from '../cli/status.mjs';

const strip = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');
const widths = (rendered) => strip(rendered).split('\n').map((l) => [...l].length);

// The one the status box asks for.
const MIN_WIDTH = 52;

describe('status box frame', () => {
  it('every row is the same width when a value is longer than minWidth', () => {
    const long = 'http://192.168.5.5:7667/anotifier-ic5e5tamgl4b0wza-and-then-some';
    const rendered = box([kv('Platform', 'Windows'), kv('ntfy', long), '---', kv('Sentry', 'disabled')], {
      padding: 2,
      minWidth: MIN_WIDTH,
    });
    const rows = widths(rendered);
    assert.equal(new Set(rows).size, 1, `ragged frame: ${rows.join(',')}\n${strip(rendered)}`);
    // Wide enough to hold the longest row, not merely clipped to minWidth.
    assert.ok(rows[0] > MIN_WIDTH + 2 * 2 + 2, `frame did not grow: ${rows[0]}`);
  });

  it('minWidth is a floor for short content', () => {
    const rendered = box([kv('Snooze', 'off')], { padding: 2, minWidth: MIN_WIDTH });
    const rows = widths(rendered);
    assert.equal(new Set(rows).size, 1);
    assert.equal(rows[0], MIN_WIDTH + 2 * 2 + 2, 'minWidth plus padding 2 each side plus both borders');
  });

  it('no border character ever lands inside a row', () => {
    const rendered = box([kv('Toast', 'x'.repeat(80)), kv('Bell', 'on')], { padding: 2, minWidth: MIN_WIDTH });
    for (const line of strip(rendered).split('\n').slice(1, -1)) {
      if (line.startsWith('├')) continue;
      assert.match(line, /^│.*│$/, line);
      assert.equal([...line].filter((ch) => ch === '│').length, 2, `stray border: ${line}`);
    }
  });

  it('each platform toast label still fits the frame on its own row', () => {
    // Guards the label itself, not just the frame: a row that fits needs no
    // continuation line and keeps the box at its intended width.
    for (const [key, { toast }] of Object.entries(PLATFORM_DISPLAY)) {
      const row = strip(kv('Toast', toast)).length;
      assert.ok(row <= MIN_WIDTH, `${key}: "${toast}" renders ${row} columns, over ${MIN_WIDTH}`);
    }
  });
});
