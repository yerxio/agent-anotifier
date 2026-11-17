// tests/brand-icons.test.mjs — third-party logos are the vendors' own files.
//
// The toast icons (assets/icons/) name real products, so each one must be the
// vendor's artwork with its source in assets/icons/SOURCES.md. These checks
// catch an icon being swapped back to an unsourced placeholder.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Width and height from a PNG's IHDR chunk. */
function pngSize(rel) {
  const buf = read(rel);
  assert.equal(buf.toString('latin1', 1, 4), 'PNG', `${rel} is not a PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const sources = read('assets/icons/SOURCES.md').toString('utf8');

describe('brand icons', () => {
  it('every toast icon has a source line in SOURCES.md', () => {
    const icons = fs.readdirSync(path.join(repoRoot, 'assets/icons')).filter((f) => f.endsWith('.png'));
    assert.ok(icons.length >= 5, `only ${icons.length} icons in assets/icons`);
    for (const f of icons) {
      assert.ok(sources.includes(`\`${f}\``), `${f} has no row in assets/icons/SOURCES.md`);
    }
  });

  it('Cursor is the brand-kit app icon, not the old unsourced cube', () => {
    // sha256 of the cursor.png files before 2026-10-10 (no recorded source).
    const placeholders = new Set([
      '1a42154399a081e3a9ca8d2a8327a7d3fcbba3ba0978799dd83fef39e9d36738',
      'ce22d2e9b891338cfff0c031ab90d705bc36a8bd78e33ce8b948fa62a305dc88',
    ]);
    const rel = 'assets/icons/cursor.png';
    assert.deepEqual(pngSize(rel), [512, 512], rel);
    assert.ok(!placeholders.has(sha256(read(rel))), `${rel} is the old placeholder cube`);
    assert.match(sources, /APP_ICON_3D_DARK\.png/);
    assert.match(sources, /cursor\.com\/brand/);
  });

  it('the card icons are the same vendor files as the toast icons', () => {
    // The Windows card looks its icon up by tool name in its own folder; those
    // are copies of the sourced toast icons, not a second set to keep honest.
    const cardIcons = 'assets/windows/donetoast/icons';
    for (const [card, toast] of [['gemini.png', 'gemini.png'], ['cursor.png', 'cursor.png'], ['antigravity.png', 'gemini.png']]) {
      assert.equal(sha256(read(`${cardIcons}/${card}`)), sha256(read(`assets/icons/${toast}`)), `${card} drifted from assets/icons/${toast}`);
    }
  });
});
