import test from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, rateLimit, clientIp } from './rateLimit.js';

test('createLimiter allows `limit` hits per window per key, then resets', () => {
  let now = 1_000_000;
  const hit = createLimiter({ limit: 3, windowMs: 60_000, now: () => now });
  assert.deepEqual([hit('a'), hit('a'), hit('a'), hit('a')].map((r) => r.allowed), [true, true, true, false]);
  assert.equal(hit('b').allowed, true); // separate key
  assert.ok(hit('a').retryAfterSec >= 1);
  now += 60_000;
  assert.equal(hit('a').allowed, true);
});

test('clientIp prefers the first x-forwarded-for address', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, ip: '9.9.9.9' }), '1.2.3.4');
  assert.equal(clientIp({ headers: {}, ip: '9.9.9.9' }), '9.9.9.9');
  assert.equal(clientIp({ headers: {} }), 'unknown');
});

test('rateLimit middleware answers 429 with Retry-After once over the limit', () => {
  const mw = rateLimit({ name: 'test-mw', limit: 1, windowMs: 60_000 });
  const req = { headers: { 'x-forwarded-for': '5.5.5.5' } };
  let nexts = 0;
  const res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  mw(req, res, () => nexts++);
  mw(req, res, () => nexts++);
  assert.equal(nexts, 1);
  assert.equal(res.statusCode, 429);
  assert.ok(Number(res.headers['Retry-After']) >= 1);
  assert.match(res.body.error, /Too many requests/);
});
