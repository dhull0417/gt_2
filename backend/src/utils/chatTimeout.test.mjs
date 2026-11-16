import test from 'node:test';
import assert from 'node:assert/strict';
import { TIMEOUT_DURATIONS, timeoutUntil, activeTimeout, pruneExpired, timeoutPushBody } from './chatTimeout.js';

const t = new Date('2026-11-16T15:00:00Z');
const min = (n) => new Date(t.getTime() + n * 60_000);

test('every duration key maps to the right length', () => {
  assert.deepEqual(Object.keys(TIMEOUT_DURATIONS), ['5m', '15m', '30m', '1h', '2h', '12h', '1d', '1w', 'indefinite']);
  assert.deepEqual(timeoutUntil('5m', t), min(5));
  assert.deepEqual(timeoutUntil('1h', t), min(60));
  assert.deepEqual(timeoutUntil('12h', t), min(720));
  assert.deepEqual(timeoutUntil('1d', t), min(1440));
  assert.deepEqual(timeoutUntil('1w', t), min(10080));
  assert.equal(timeoutUntil('indefinite', t), null);
});

test('unknown duration throws', () => {
  assert.throws(() => timeoutUntil('2d', t), RangeError);
  assert.throws(() => timeoutUntil(undefined, t), RangeError);
  assert.throws(() => timeoutUntil('toString', t), RangeError);
});

test('activeTimeout ignores expired entries and other people', () => {
  const me = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const other = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  assert.equal(activeTimeout([{ user: me, until: min(-1) }], me, t), null);
  assert.equal(activeTimeout([{ user: other, until: null }], me, t), null);
  assert.deepEqual(activeTimeout([{ user: me, until: null }], me, t), { until: null });
  assert.deepEqual(activeTimeout([{ user: me, until: min(5) }], me, t), { until: min(5) });
  assert.equal(activeTimeout(undefined, me, t), null);
});

test('pruneExpired keeps indefinite and future entries', () => {
  const kept = pruneExpired([{ user: 'a', until: null }, { user: 'b', until: min(1) }, { user: 'c', until: min(-1) }, { user: 'd', until: t }], t);
  assert.deepEqual(kept.map((e) => e.user), ['a', 'b']);
});

test('push wording', () => {
  assert.equal(timeoutPushBody('1h'), "You've been timed out of the chat for 1 hour.");
  assert.equal(timeoutPushBody('5m'), "You've been timed out of the chat for 5 minutes.");
  assert.equal(timeoutPushBody('1w'), "You've been timed out of the chat for 1 week.");
  assert.equal(timeoutPushBody('indefinite'), "You've been timed out of the chat until a moderator lifts it.");
});
