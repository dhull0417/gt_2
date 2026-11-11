import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { toRecord, loadEvents, ARCHIVE_FIELDS } = await import('./groupStats.js');
const { default: Meetup } = await import('../models/meetup.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: AttendanceRecord } = await import('../models/attendanceRecord.model.js');

const q = (v) => { const c = { select: () => c, lean: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const id = () => new mongoose.Types.ObjectId();
const [a, b, c] = [id(), id(), id()];
const base = (over = {}) => ({
  _id: id(), group: id(), name: 'Hike', startsAt: new Date('2026-11-01T16:00:00Z'), members: [a, b, c], in: [a], out: [b],
  capacity: 10, guests: [], ...over,
});

test('toRecord converts guests to user ids', () => {
  const rec = toRecord(base({ guests: [{ userId: 'c-a', count: 2 }, { userId: 'c-gone', count: 1 }, { userId: 'c-b', count: 0 }] }),
    new Map([['c-a', a], ['c-b', b]]));
  assert.equal(rec.guests, 3); // total stays as before
  assert.deepEqual(rec.guestsBy.map((g) => [String(g.user), g.count]), [[String(a), 2]]);
});

test('toRecord counts claims per user and driver seats', () => {
  const item1 = id(); const item2 = id();
  const rec = toRecord(base({
    bringClaims: [{ user: a, item: item1 }, { user: a, item: item2 }, { user: b, item: item1 }],
    rides: [{ user: a, role: 'driver', seats: 3 }, { user: b, role: 'passenger', seats: 0 }, { user: c, role: 'driver', seats: 0 }],
  }));
  assert.deepEqual(rec.itemsBy.map((g) => [String(g.user), g.count]), [[String(a), 2], [String(b), 1]]);
  assert.deepEqual(rec.seatsBy.map((g) => [String(g.user), g.seats]), [[String(a), 3]]);
});

test('toRecord flattens tiers and copies the log and RSVP window', () => {
  const t1 = new Date('2026-10-30T10:00:00Z'); const open = new Date('2026-10-31T10:00:00Z');
  const at = new Date('2026-10-31T10:05:00Z');
  const rec = toRecord(base({
    priorityTiers: [{ members: [a, b], opensAt: t1 }], rsvpOpenDate: open, rsvpCloseDate: null,
    rsvpLog: [{ user: a, status: 'in', at }],
  }));
  assert.deepEqual(rec.tierOpens.map((t) => [String(t.user), t.opensAt]), [[String(a), t1], [String(b), t1]]);
  assert.deepEqual(rec.rsvpLog, [{ user: a, status: 'in', at }]);
  assert.equal(rec.rsvpOpenDate, open);
  assert.equal(rec.rsvpCloseDate, null);
});

test('toRecord leaves the log out when the meetup has none', () => {
  assert.equal(toRecord(base()).rsvpLog, undefined);
});

test('ARCHIVE_FIELDS selects everything toRecord reads', () => {
  for (const f of ['rsvpLog', 'rsvpOpenDate', 'rsvpCloseDate', 'priorityTiers', 'bringClaims', 'rides', 'guests', 'members', 'in', 'out']) {
    assert.ok(ARCHIVE_FIELDS.split(' ').includes(f), f);
  }
});

test('loadEvents maps missing fields to null', async () => {
  const g = id();
  const old = { meetupId: id(), group: g, name: 'Old', startsAt: new Date('2026-01-01'), members: [a], in: [a], out: [], capacity: 0, guests: 0 };
  const live = base({ group: g, guests: [{ userId: 'c-a', count: 1 }], rsvpLog: [], status: 'expired' });
  const saveFind = [AttendanceRecord.find, Meetup.find, User.find];
  AttendanceRecord.find = () => q([old]);
  Meetup.find = () => q([live]);
  User.find = () => q([{ _id: a, clerkId: 'c-a' }]);
  try {
    const events = await loadEvents(g);
    const o = events.find((e) => e.name === 'Old');
    assert.deepEqual([o.rsvpLog, o.guestsBy, o.itemsBy, o.seatsBy, o.rsvpOpenDate], [null, null, null, null, null]);
    assert.deepEqual(o.tierOpens, []);
    const l = events.find((e) => e.name === 'Hike');
    assert.deepEqual(l.rsvpLog, []);
    assert.deepEqual(l.guestsBy.map((x) => [x.user, x.count]), [[String(a), 1]]);
  } finally {
    [AttendanceRecord.find, Meetup.find, User.find] = saveFind;
  }
});

// ---- account deletion (Task 9) ----
import { removeUserStatsData } from './groupStats.js';

test('removeUserStatsData pulls the user from rsvpLog and archived per-person data', async () => {
  const calls = [];
  const saved = [Meetup.updateMany, AttendanceRecord.updateMany];
  Meetup.updateMany = async (filter, update) => { calls.push(['Meetup', filter, update]); };
  AttendanceRecord.updateMany = async (filter, update) => { calls.push(['AttendanceRecord', filter, update]); };
  try {
    await removeUserStatsData(a);
  } finally {
    [Meetup.updateMany, AttendanceRecord.updateMany] = saved;
  }
  assert.deepEqual(calls[0], ['Meetup', { 'rsvpLog.user': a }, { $pull: { rsvpLog: { user: a } } }]);
  const [, filter, update] = calls[1];
  assert.equal(calls[1][0], 'AttendanceRecord');
  assert.deepEqual(Object.keys(update.$pull).sort(), ['guestsBy', 'itemsBy', 'rsvpLog', 'seatsBy', 'tierOpens']);
  for (const v of Object.values(update.$pull)) assert.deepEqual(v, { user: a });
  assert.deepEqual(filter.$or.length, 5);
});

test('toRecord keeps the waitlist and drops a partial log', () => {
  const rec = toRecord(base({ waitlist: [c], rsvpLog: [{ user: a, status: 'in', at: new Date() }], rsvpLogPartial: true }));
  assert.deepEqual(rec.waitlist, [c]);
  assert.equal(rec.rsvpLog, undefined);
  assert.ok(ARCHIVE_FIELDS.split(' ').includes('waitlist'));
  assert.ok(ARCHIVE_FIELDS.split(' ').includes('rsvpLogPartial'));
});
