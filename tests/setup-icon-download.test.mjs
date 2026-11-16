// tests/setup-icon-download.test.mjs — the fallback icon download in setup.
//
// A request that is neither read to the end nor destroyed keeps its connection
// open, and an open connection keeps Node alive: setup printed "Setup complete"
// and never exited. That happened on every non-200 answer, and the icon URL
// answers a 302 to a region-block page from some networks. Each failure below
// asserts the three things that went wrong together: the result, the socket,
// and the file left on disk.
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { downloadIcon, iconUsable } from '../cli/setup.mjs';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describe('setup icon download', () => {
  let server;
  let base;
  let dir;
  let dest;
  // What the server does with the next request, and the sockets it has seen.
  let handler;
  const sockets = new Set();

  before(async () => {
    server = http.createServer((req, res) => handler(req, res));
    server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => { for (const s of sockets) s.destroy(); server.close(); });
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-icon-')); dest = path.join(dir, 'icon.png'); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  // The client side of every connection is gone: nothing is left to hold the
  // process open. Polled because the close arrives a tick after the promise.
  async function allClosed() {
    for (let i = 0; i < 50 && sockets.size; i++) await new Promise((r) => setTimeout(r, 20));
    return sockets.size === 0;
  }
  const fetchIcon = (extra = {}) => downloadIcon(dest, { url: `${base}/icon.png`, get: http.get, ...extra });

  it('200: the complete file is in place and nothing else', async () => {
    handler = (req, res) => { res.writeHead(200, { 'content-type': 'image/png' }); res.end(PNG); };
    assert.equal(await fetchIcon(), true);
    assert.deepEqual(fs.readFileSync(dest), PNG);
    assert.deepEqual(fs.readdirSync(dir), ['icon.png'], 'no .part file left');
  });

  it('302 with a keep-alive connection: false, the socket is dropped, no file is left', async () => {
    // The real failure: a redirect to an HTML page, on a connection the server
    // is happy to keep open.
    handler = (req, res) => {
      res.writeHead(302, { location: 'https://example.invalid/unavailable', connection: 'keep-alive', 'content-type': 'text/html' });
      res.end('<html>unavailable in region</html>');
    };
    assert.equal(await fetchIcon(), false);
    assert.equal(await allClosed(), true, 'the connection must not outlive the download');
    assert.deepEqual(fs.readdirSync(dir), [], 'a failed download leaves no file, least of all an empty icon.png');
  });

  it('a body that never ends: the timeout aborts the request instead of only announcing itself', async () => {
    handler = (req, res) => { res.writeHead(200, { 'content-type': 'image/png' }); res.write(PNG.subarray(0, 4)); };
    assert.equal(await fetchIcon({ timeoutMs: 150 }), false);
    assert.equal(await allClosed(), true);
    assert.deepEqual(fs.readdirSync(dir), [], 'the half-written .part file is removed');
  });

  it('a server that never answers: false after the timeout', async () => {
    handler = () => {};
    assert.equal(await fetchIcon({ timeoutMs: 150 }), false);
    assert.equal(await allClosed(), true);
  });

  it('nothing listening: false, no throw', async () => {
    assert.equal(await downloadIcon(dest, { url: 'http://127.0.0.1:1/icon.png', get: http.get }), false);
    assert.deepEqual(fs.readdirSync(dir), []);
  });

  it('iconUsable: an empty file is a missing icon, so setup tries again', () => {
    assert.equal(iconUsable(dest), false);
    fs.writeFileSync(dest, '');
    assert.equal(iconUsable(dest), false, 'what the old download left behind on failure');
    fs.writeFileSync(dest, PNG);
    assert.equal(iconUsable(dest), true);
  });
});
