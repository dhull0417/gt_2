import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendRsvpLog, RSVP_LOG_CAP } from './rsvpLog.js';

test('appends entry', () => {
  const m = { rsvpLog: [] };
  const at = new Date('2026-11-10T10:00:00Z');
  appendRsvpLog(m, 'u1', 'in', at);
  assert.deepEqual(m.rsvpLog, [{ user: 'u1', status: 'in', at }]);
});

test('keeps newest 200', () => {
  assert.equal(RSVP_LOG_CAP, 200);
  const m = { rsvpLog: Array.from({ length: 200 }, (_, i) => ({ user: 'u', status: 'in', at: new Date(i) })) };
  appendRsvpLog(m, 'u2', 'out', new Date(999));
  assert.equal(m.rsvpLog.length, 200);
  assert.equal(m.rsvpLog[0].at.getTime(), 0); // u's first answer is kept
  assert.equal(m.rsvpLog[1].at.getTime(), 2); // their oldest later answer was dropped
  assert.equal(m.rsvpLog.at(-1).user, 'u2');
});

test('starts a log on a meetup that has none', () => {
  const m = {};
  appendRsvpLog(m, 'u1', 'waitlist');
  assert.equal(m.rsvpLog.length, 1);
  assert.ok(m.rsvpLog[0].at instanceof Date);
});

test('the cap keeps everyone\'s first answer', () => {
  const m = { rsvpLog: [{ user: 'first', status: 'in', at: new Date(0) },
    ...Array.from({ length: 199 }, (_, i) => ({ user: 'busy', status: i % 2 ? 'in' : 'out', at: new Date(i + 1) }))] };
  appendRsvpLog(m, 'late', 'in', new Date(999));
  assert.equal(m.rsvpLog.length, 200);
  assert.equal(m.rsvpLog[0].user, 'first');
  assert.equal(m.rsvpLog[1].user, 'busy');
  assert.equal(m.rsvpLog[1].at.getTime(), 1); // busy's first answer kept too; their second was dropped
  assert.equal(m.rsvpLog[2].at.getTime(), 3);
});

test('a log started after people already answered is marked partial', () => {
  const answered = { rsvpLog: [], in: ['x'], out: [], waitlist: [] };
  appendRsvpLog(answered, 'u1', 'in', new Date(), { hadAnswers: true });
  assert.equal(answered.rsvpLogPartial, true);
  const fresh = { rsvpLog: [] };
  appendRsvpLog(fresh, 'u1', 'in', new Date(), { hadAnswers: false });
  assert.notEqual(fresh.rsvpLogPartial, true);
  appendRsvpLog(fresh, 'u2', 'in', new Date(), { hadAnswers: true }); // later answers don't matter
  assert.notEqual(fresh.rsvpLogPartial, true);
});
