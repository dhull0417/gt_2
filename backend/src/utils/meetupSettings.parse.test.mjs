// parseMeetupSettings: per-meetup Premium settings from a request body.
// Run with: npm test (needs --experimental-test-module-mocks).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const premium = { on: true };
mock.module(new URL('./premium.js', import.meta.url).href, {
  namedExports: {
    hasPremium: () => premium.on,
    groupHasPremium: async () => premium.on,
    groupHasWaitlist: async () => true,
    serializeUser: (u) => u,
    withGroupPremium: async (m) => m,
  },
});
const { parseMeetupSettings, MIN_HEADCOUNT_PREMIUM_REQUIRED, ASSIGNMENTS_PREMIUM_REQUIRED } = await import('./meetupSettings.js');

const id = () => new mongoose.Types.ObjectId();
const group = { _id: id(), owner: id() };
const chips = id();
const soda = id();
const alice = id();
const bob = id();
const meetup = () => ({
  capacity: 0,
  minAttendees: 0,
  rsvpLeadDays: null, rsvpLeadTime: '09:00 AM', rsvpDeadlineDays: 1, rsvpDeadlineTime: '09:00 AM',
  bringItems: [{ _id: chips, name: 'Chips', max: null }, { _id: soda, name: 'Soda', max: 2 }],
  bringClaims: [{ user: alice, item: chips }, { user: bob, item: soda }],
  ridesEnabled: true,
  rides: [{ user: alice, role: 'driver', seats: 3 }],
});

test('empty body: nothing touched', async () => {
  premium.on = true;
  const r = await parseMeetupSettings({}, { meetup: meetup(), group });
  assert.equal(r.touched, false);
  assert.deepEqual(r.patch, {});
});

test('items keep known ids; claims on removed items are dropped', async () => {
  premium.on = true;
  const r = await parseMeetupSettings({ bringItems: [{ _id: String(chips), name: 'Chips' }, { name: 'Ice', max: 3 }] }, { meetup: meetup(), group });
  assert.equal(r.touched, true);
  assert.equal(String(r.patch.bringItems[0]._id), String(chips));
  assert.equal(r.patch.bringItems[1]._id, undefined);
  assert.equal(r.patch.bringItems[1].max, 3);
  assert.deepEqual(r.patch.bringClaims.map((c) => String(c.item)), [String(chips)]);
});

test('client-made item ids are not trusted', async () => {
  premium.on = true;
  const r = await parseMeetupSettings({ bringItems: [{ _id: String(id()), name: 'Cups' }] }, { meetup: meetup(), group });
  assert.equal(r.patch.bringItems[0]._id, undefined);
});

test('rides off clears ride sign-ups', async () => {
  premium.on = true;
  const r = await parseMeetupSettings({ ridesEnabled: false }, { meetup: meetup(), group });
  assert.equal(r.patch.ridesEnabled, false);
  assert.deepEqual(r.patch.rides, []);
});

test('minimum needs a latest RSVP time', async () => {
  premium.on = true;
  const r = await parseMeetupSettings({ minAttendees: 3, rsvpDeadlineDays: null }, { meetup: meetup(), group });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'Set an RSVP deadline to use a minimum headcount.');
});

test('turning off the latest RSVP time while a minimum is set is refused', async () => {
  premium.on = true;
  const m = { ...meetup(), minAttendees: 4 };
  const r = await parseMeetupSettings({ rsvpDeadlineDays: null }, { meetup: m, group });
  assert.equal(r.status, 400);
});

test('minimum above capacity is refused', async () => {
  premium.on = true;
  const r = await parseMeetupSettings({ minAttendees: 5, capacity: 4 }, { meetup: meetup(), group, capacity: 4 });
  assert.equal(r.status, 400);
});

test('minimum with the meetup deadline is accepted', async () => {
  premium.on = true;
  const r = await parseMeetupSettings({ minAttendees: 3 }, { meetup: meetup(), group });
  assert.equal(r.patch.minAttendees, 3);
});

test('without Premium: setting needs Premium, clearing does not', async () => {
  premium.on = false;
  let r = await parseMeetupSettings({ minAttendees: 2 }, { meetup: meetup(), group });
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, MIN_HEADCOUNT_PREMIUM_REQUIRED);
  r = await parseMeetupSettings({ bringItems: [{ name: 'Chips' }] }, { meetup: meetup(), group });
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, ASSIGNMENTS_PREMIUM_REQUIRED);
  r = await parseMeetupSettings({ ridesEnabled: true }, { meetup: meetup(), group });
  assert.equal(r.status, 403);
  r = await parseMeetupSettings({ minAttendees: 0, bringItems: [], ridesEnabled: false, rsvpLeadDays: 2 }, { meetup: meetup(), group });
  assert.equal(r.status, undefined);
  assert.equal(r.patch.rsvpLeadDays, 2);
});

test('new meetup (no existing one)', async () => {
  premium.on = true;
  const r = await parseMeetupSettings(
    { rsvpLeadDays: 2, rsvpLeadTime: '10:00 AM', rsvpDeadlineDays: 0, rsvpDeadlineTime: '12:00 PM', minAttendees: 2, bringItems: [{ name: 'Ball' }], ridesEnabled: true },
    { meetup: null, group, capacity: 10 },
  );
  assert.deepEqual(
    { ...r.patch, bringItems: undefined, bringClaims: undefined, rides: undefined },
    { rsvpLeadDays: 2, rsvpLeadTime: '10:00 AM', rsvpDeadlineDays: 0, rsvpDeadlineTime: '12:00 PM', minAttendees: 2, ridesEnabled: true, bringItems: undefined, bringClaims: undefined, rides: undefined },
  );
  assert.deepEqual(r.patch.bringItems, [{ name: 'Ball', max: null }]);
});

test('bad RSVP rules come back as 400', async () => {
  premium.on = true;
  const r = await parseMeetupSettings({ rsvpLeadDays: 0, rsvpDeadlineDays: 3 }, { meetup: meetup(), group });
  assert.equal(r.status, 400);
});
