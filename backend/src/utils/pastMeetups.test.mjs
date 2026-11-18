import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { listPastMeetups, getPastMeetup } = await import('./pastMeetups.js');
const { default: Meetup } = await import('../models/meetup.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: AttendanceRecord } = await import('../models/attendanceRecord.model.js');
const { default: Tournament } = await import('../models/tournament.model.js');

const q = (v) => { const c = { select: () => c, lean: () => c, sort: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const id = () => new mongoose.Types.ObjectId();
const g = id();
const [ann, bo, cy, dee, gone] = [id(), id(), id(), id(), id()];
const users = [
  { _id: ann, clerkId: 'c-ann', firstName: 'Ann', lastName: 'A' },
  { _id: bo, clerkId: 'c-bo', firstName: 'Bo' },
  { _id: cy, clerkId: 'c-cy', firstName: 'Cy' },
  { _id: dee, clerkId: 'c-dee', firstName: 'Dee' },
];
const rec = (over) => ({
  group: g, meetupId: id(), name: 'Hike', startsAt: new Date('2026-10-01T16:00:00Z'),
  members: [ann, bo, cy, dee], in: [ann], out: [bo], waitlist: [], capacity: 0, guests: 0, ...over,
});

let records, live, tournaments, saved;
beforeEach(() => {
  records = []; live = []; tournaments = [];
  saved = [AttendanceRecord.find, AttendanceRecord.findOne, Meetup.find, Meetup.findOne, User.find, Tournament.find, Tournament.findOne];
  AttendanceRecord.find = () => q(records);
  AttendanceRecord.findOne = (f) => q(records.find((r) => String(r.meetupId) === String(f.meetupId) && String(r.group) === String(f.group)) ?? null);
  Meetup.find = () => q(live);
  Meetup.findOne = (f) => q(live.find((m) => String(m._id) === String(f._id) && String(m.group) === String(f.group)) ?? null);
  User.find = (f) => {
    const want = f._id?.$in?.map(String); const clerks = f.clerkId?.$in;
    return q(users.filter((u) => (want ? want.includes(String(u._id)) : clerks.includes(u.clerkId))));
  };
  Tournament.find = () => q(tournaments);
  Tournament.findOne = (f) => q(tournaments.find((t) => String(t.meetup) === String(f.meetup)) ?? null);
});
afterEach(() => {
  [AttendanceRecord.find, AttendanceRecord.findOne, Meetup.find, Meetup.findOne, User.find, Tournament.find, Tournament.findOne] = saved;
});

test('lists archived and not-yet-archived meetups once each, newest first, with counts', async () => {
  const shared = id();
  records = [
    rec({ meetupId: shared, name: 'Archived copy', startsAt: new Date('2026-11-10T16:00:00Z'), location: 'Park' }),
    rec({ name: 'Old', startsAt: new Date('2026-09-01T16:00:00Z') }),
  ];
  live = [
    { _id: shared, group: g, name: 'Live copy', startsAt: new Date('2026-11-10T16:00:00Z'), members: [ann], in: [ann], out: [], status: 'expired' },
    { _id: id(), group: g, name: 'Recent', startsAt: new Date('2026-11-15T16:00:00Z'), location: 'Gym',
      members: [ann, bo, cy], in: [ann, bo], out: [], waitlist: [cy], status: 'expired' },
  ];
  tournaments = [{ _id: id(), meetup: shared }];
  const { meetups, nextBefore } = await listPastMeetups(g, {});
  assert.deepEqual(meetups.map((m) => m.name), ['Recent', 'Archived copy', 'Old']);
  assert.deepEqual(meetups.map((m) => [m.inCount, m.outCount, m.undecidedCount]), [[2, 0, 0], [1, 1, 2], [1, 1, 2]]);
  assert.deepEqual(meetups.map((m) => m.location), ['Gym', 'Park', null]);
  assert.deepEqual(meetups.map((m) => m.hasTournament), [false, true, false]);
  assert.equal(nextBefore, null);
});

test('pages with before and limit', async () => {
  records = [1, 2, 3, 4, 5].map((d) => rec({ name: `D${d}`, startsAt: new Date(`2026-10-0${d}T16:00:00Z`) }));
  const page1 = await listPastMeetups(g, { limit: 2 });
  assert.deepEqual(page1.meetups.map((m) => m.name), ['D5', 'D4']);
  assert.equal(page1.nextBefore, new Date('2026-10-04T16:00:00Z').toISOString());
  const page2 = await listPastMeetups(g, { limit: 2, before: new Date(page1.nextBefore) });
  assert.deepEqual(page2.meetups.map((m) => m.name), ['D3', 'D2']);
  const page3 = await listPastMeetups(g, { limit: 2, before: new Date(page2.nextBefore) });
  assert.deepEqual(page3.meetups.map((m) => m.name), ['D1']);
  assert.equal(page3.nextBefore, null);
});

test('limit is capped at 50 and defaults to 20', async () => {
  records = Array.from({ length: 60 }, (_, i) => rec({ startsAt: new Date(Date.UTC(2026, 0, 1) + i * 864e5) }));
  assert.equal((await listPastMeetups(g, {})).meetups.length, 20);
  assert.equal((await listPastMeetups(g, { limit: 500 })).meetups.length, 50);
});

test('detail: people, undecided, waitlist, guests, items, cars and former members', async () => {
  const r = rec({
    location: 'Red Rocks', members: [ann, bo, cy, dee, gone], in: [ann, gone], out: [bo], waitlist: [dee],
    guestsBy: [{ user: ann, count: 2 }],
    items: [{ name: 'Chips', by: [ann, gone] }],
    cars: [{ driver: ann, seats: 4, riders: [gone], guests: 2 }],
    needsRide: [cy],
  });
  records = [r];
  const d = await getPastMeetup(g, r.meetupId);
  assert.equal(d.location, 'Red Rocks');
  assert.deepEqual(d.in.map((p) => p.firstName), ['Ann', 'Former member']);
  assert.equal(d.in[1].former, true);
  assert.deepEqual(d.out.map((p) => p.firstName), ['Bo']);
  assert.deepEqual(d.undecided.map((p) => p.firstName), ['Cy']);
  assert.deepEqual(d.waitlist.map((p) => p.firstName), ['Dee']);
  assert.deepEqual(d.guestsBy, [{ userId: String(ann), count: 2 }]);
  assert.deepEqual(d.items.map((i) => [i.name, i.by.map((p) => p.firstName)]), [['Chips', ['Ann', 'Former member']]]);
  assert.equal(d.cars[0].driver.firstName, 'Ann');
  assert.deepEqual([d.cars[0].seats, d.cars[0].guests, d.cars[0].riders.map((p) => p.firstName)], [4, 2, ['Former member']]);
  assert.deepEqual(d.needsRide.map((p) => p.firstName), ['Cy']);
  assert.equal(d.tournament, null);
});

test('detail: records archived before items/cars were kept read as not recorded (null)', async () => {
  const r = rec({});
  records = [r];
  const d = await getPastMeetup(g, r.meetupId);
  assert.deepEqual([d.items, d.cars, d.needsRide, d.location], [null, null, null, null]);
});

test('detail: a meetup not archived yet is built from the live meetup', async () => {
  const chips = id(); const mid = id();
  live = [{ _id: mid, group: g, name: 'Fresh', startsAt: new Date('2026-11-15T16:00:00Z'), location: 'Gym', status: 'expired',
    members: [ann, bo], in: [ann], out: [], guests: [{ userId: 'c-ann', count: 1 }],
    bringItems: [{ _id: chips, name: 'Chips' }], bringClaims: [{ user: bo, item: chips }],
    rides: [{ user: ann, role: 'driver', seats: 3 }, { user: bo, role: 'passenger', driver: ann }] }];
  const d = await getPastMeetup(g, mid);
  assert.equal(d.name, 'Fresh');
  assert.deepEqual(d.guestsBy, [{ userId: String(ann), count: 1 }]);
  assert.deepEqual(d.items.map((i) => [i.name, i.by.map((p) => p.firstName)]), [['Chips', ['Bo']]]);
  assert.deepEqual(d.cars.map((c) => [c.driver.firstName, c.riders.map((p) => p.firstName)]), [['Ann', ['Bo']]]);
  assert.deepEqual(d.undecided.map((p) => p.firstName), ['Bo']);
});

test('detail: tournament summary with the champion named', async () => {
  const r = rec({});
  records = [r];
  const tid = id();
  tournaments = [{ _id: tid, meetup: r.meetupId, format: 'single', mode: 'singles', status: 'finished', champion: 't1',
    teams: [{ key: 't1', name: '', players: [{ user: ann }] }, { key: 't2', name: 'Bees', players: [{ user: bo }] }] }];
  const d = await getPastMeetup(g, r.meetupId);
  assert.deepEqual(d.tournament, { id: String(tid), format: 'single', mode: 'singles', status: 'finished', champion: 'Ann' });
});

test('detail: unknown meetup or another group gives null', async () => {
  const r = rec({});
  records = [r];
  assert.equal(await getPastMeetup(id(), r.meetupId), null);
  assert.equal(await getPastMeetup(g, id()), null);
});
