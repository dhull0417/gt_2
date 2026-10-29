import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, isLegacyVersion, clientInfo, isLegacyClient } from './clientInfo.middleware.js';

test('parseVersion reads major.minor[.patch]', () => {
  assert.deepEqual(parseVersion('1.4.2'), [1, 4, 2]);
  assert.deepEqual(parseVersion('2.0'), [2, 0, 0]);
  assert.equal(parseVersion(''), null);
  assert.equal(parseVersion('abc'), null);
});

test('no header or an old version is legacy; 1.4.0 and later is not', () => {
  assert.equal(isLegacyVersion(undefined), true);
  assert.equal(isLegacyVersion('1.3.3'), true);
  assert.equal(isLegacyVersion('1.4.0'), false);
  assert.equal(isLegacyVersion('1.4.2'), false);
  assert.equal(isLegacyVersion('1.10.0'), false);
  assert.equal(isLegacyVersion('2.0.0'), false);
});

test('clientInfo middleware tags the request', () => {
  const run = (headers) => { const req = { headers }; clientInfo(req, {}, () => {}); return req; };
  assert.deepEqual(run({}).clientInfo, { version: null, isLegacy: true });
  assert.deepEqual(run({ 'x-app-version': '1.4.2' }).clientInfo, { version: '1.4.2', isLegacy: false });
  assert.equal(isLegacyClient(run({ 'x-app-version': '1.3.3' })), true);
  // Works without the middleware too (e.g. a handler called directly in a test).
  assert.equal(isLegacyClient({ headers: { 'x-app-version': '1.5.0' } }), false);
  assert.equal(isLegacyClient({ headers: {} }), true);
});
