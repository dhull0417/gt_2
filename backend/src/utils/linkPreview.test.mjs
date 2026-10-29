import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { isPrivateIp, parsePreview, normalizeUrl, fetchPreview, makePinnedLookup, orderAddresses } from './linkPreview.js';

test('isPrivateIp blocks internal ranges and allows public ones', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '172.31.255.255', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.1.2.3', '224.0.0.1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
  assert.equal(isPrivateIp('not-an-ip'), true);
});

test('normalizeUrl only allows plain http(s)', () => {
  assert.ok(normalizeUrl('https://example.com/a?b=1'));
  assert.equal(normalizeUrl('file:///etc/passwd'), null);
  assert.equal(normalizeUrl('ftp://example.com'), null);
  assert.equal(normalizeUrl('https://user:pw@example.com'), null);
  assert.equal(normalizeUrl('http://example.com:22'), null);
  assert.equal(normalizeUrl('nonsense'), null);
});

test('orderAddresses puts IPv4 first', () => {
  const out = orderAddresses([{ address: '::2', family: 6 }, { address: '8.8.8.8', family: 4 }, { address: '::3', family: 6 }]);
  assert.deepEqual(out.map((a) => a.family), [4, 6, 6]);
});

test('fetchPreview refuses internal hosts without making a request', async () => {
  await assert.rejects(fetchPreview('http://127.0.0.1/'), /blocked/);
  await assert.rejects(fetchPreview('http://169.254.169.254/latest/meta-data'), /blocked/);
  await assert.rejects(fetchPreview('http://[::1]/'), /blocked/);
  await assert.rejects(fetchPreview('http://localhost/'), /blocked/);
});

test('parsePreview reads Open Graph, resolves relative images, decodes entities', () => {
  const html = `<html><head><title>Fallback</title>
    <meta property="og:title" content="Tom &amp; Jerry&#39;s">
    <meta content="Best pizza in town" property="og:description">
    <meta property="og:image" content="/img/a.png">
    <meta property="og:site_name" content="Pizza Co"></head></html>`;
  assert.deepEqual(parsePreview(html, 'https://www.pizza.com/menu'), {
    url: 'https://www.pizza.com/menu',
    title: "Tom & Jerry's",
    description: 'Best pizza in town',
    image: 'https://www.pizza.com/img/a.png',
    siteName: 'Pizza Co',
  });
});

test('parsePreview falls back to <title>/hostname and returns null when empty', () => {
  const p = parsePreview('<title> Hello \n World </title>', 'https://www.example.com/x');
  assert.equal(p.title, 'Hello World');
  assert.equal(p.siteName, 'example.com');
  assert.equal(p.image, null);
  assert.equal(parsePreview('<html><body>nothing</body></html>', 'https://example.com'), null);
  assert.equal(parsePreview('<meta property="og:image" content="javascript:alert(1)"><title>t</title>', 'https://e.com').image, null);
});

test('pinned lookup works with a real socket on this Node version (all:true and legacy shapes)', async () => {
  const server = http.createServer((_q, r) => { r.setHeader('content-type', 'text/html'); r.end('<title>ok</title>'); });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const { port } = server.address();
  try {
    const status = await new Promise((resolve, reject) => {
      const req = http.request(`http://example.invalid:${port}/`, { lookup: makePinnedLookup({ address: '127.0.0.1', family: 4 }) }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 200);
  } finally {
    server.close();
  }
  const v4 = { address: '1.2.3.4', family: 4 };
  const v6 = { address: '2606:4700::1', family: 6 };
  makePinnedLookup([v4, v6])('h', {}, (err, a, f) => { assert.equal(a, '1.2.3.4'); assert.equal(f, 4); });
  makePinnedLookup([v4, v6])('h', { all: true }, (err, list) => assert.deepEqual(list, [v4, v6]));
  makePinnedLookup(v4)('h', (err, a) => assert.equal(a, '1.2.3.4'));
});

test('fetchPreview reports a reason for an invalid url', async () => {
  await assert.rejects(fetchPreview('ftp://x.com'), /invalid url/);
});
