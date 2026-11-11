// Ride assignments through the real handlers: endpoints, the assignments sheet, RSVPs, guest
// changes, priority bumps and members leaving. Models are stubbed per test; pushes are captured.
// Run with: npm test (from backend/) -- needs --experimental-test-module-mocks.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const pushes = [];
const premium = { on: true };
mock.module('@clerk/express', {
  namedExports: {
    getAuth: (req) => ({ userId: req.clerkId }),
    clerkClient: {},
    createClerkClient: () => ({}),
    clerkMiddleware: () => (req, res, next) => next(),
  },
});
mock.module(new URL('../utils/push.notifications.js', import.meta.url).href, {
  namedExports: {
    notifyAndPersist: async (users, payload) => { pushes.push({ to: users.map((u) => String(u._id)), ...payload }); },
    notifyUsers: async () => {},
    sendPushNotifications: async () => {},
    tokensOf: () => [],
    inQuietHours: () => false,
    userWantsPush: () => true,
    isGroupMuted: () => false,
  },
});
mock.module(new URL('../utils/premium.js', import.meta.url).href, {
  namedExports: {
    hasPremium: () => premium.on,
    groupHasPremium: async () => premium.on,
    groupHasWaitlist: async () => true,
    serializeUser: (u) => u,
    withGroupPremium: async (m) => m,
  },
});

const { default: Meetup } = await import('../models/meetup.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: Group } = await import('../models/group.model.js');
const ctrl = await import('./meetup.controller.js');
const { default: router } = await import('../routes/meetup.route.js');
const { rebalanceMeetup } = await import('../utils/priorityRsvp.js');
const { scrubMemberFromUpcomingMeetups } = await import('../utils/memberCleanup.js');

const routeHandler = (path) => router.stack.find((l) => l.route?.path === path && l.route.methods.patch).route.stack.at(-1).handle;
const setGuests = routeHandler('/:meetupId/guests');
const setGuestsFor = routeHandler('/:meetupId/guests/:hostClerkId');

// A Mongoose-query stand-in: chainable and awaitable.
const q = (v) => { const c = { select: () => c, lean: () => c, populate: () => c, sort: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };

const person = (name, zipCode = '') => ({ _id: new mongoose.Types.ObjectId(), clerkId: `c-${name}`, firstName: name, zipCode });
let P, users, group, doc;

const makeMeetup = (over = {}) => {
  const m = new Meetup({
    group: group._id, name: 'Hike', date: new Date(Date.now() + 7 * 864e5), time: '9:00 AM', timezone: 'America/Denver',
    ridesEnabled: true, members: users.map((u) => u._id), in: [], capacity: 0, ...over,
  });
  m.save = async function save() { return this; };
  return m;
};

beforeEach(() => {
  pushes.length = 0;
  premium.on = true;
  P = { owner: person('Olive'), d1: person('Sam', '84101'), d2: person('Lee', '84601'), a: person('Ana', '84604'), b: person('Bo', '84102'), m: person('Max') };
  users = Object.values(P);
  group = { _id: new mongoose.Types.ObjectId(), owner: P.owner._id, moderators: [], members: users.map((u) => u._id), name: 'Hikers' };
  User.findOne = (f) => q(users.find((u) => u.clerkId === f.clerkId) ?? null);
  User.findById = (id) => q(users.find((u) => String(u._id) === String(id)) ?? null);
  User.find = (f = {}) => q(f._id?.$in ? users.filter((u) => f._id.$in.map(String).includes(String(u._id))) : users);
  Group.findById = () => q(group);
  Group.updateMany = async () => {};
  Meetup.findById = () => q(doc);
  Meetup.find = () => q([]);
  Meetup.updateMany = async () => {};
});

const call = async (handler, { as, params = {}, body = {} }) => {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let failure;
  await handler({ clerkId: as.clerkId, params: { meetupId: String(doc._id), ...params }, body, headers: {} }, res, (e) => { failure = e; });
  if (failure) throw failure;
  return res;
};

const D = (u, seats) => ({ user: u._id, role: 'driver', seats });
const R = (u, driver = null, guestRides = []) => ({ user: u._id, role: 'passenger', seats: 0, driver: driver?._id ?? null, guestRides });
const rideOf = (u) => doc.rides.find((r) => String(r.user) === String(u._id));
const pushesTo = (u, type) => pushes.filter((p) => p.to.includes(String(u._id)) && (!type || p.type === type));

// --- PATCH /rides/assignment ---

test('a driver puts a rider who needs a ride in their car, and the rider is told', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.a._id], rides: [D(P.d1, 3), R(P.a)] });
  const res = await call(ctrl.assignRide, { as: P.d1, body: { riderId: String(P.a._id), driverId: String(P.d1._id), rider: true, guests: 0 } });
  assert.equal(res.code, 200);
  assert.equal(String(rideOf(P.a).driver), String(P.d1._id));
  assert.equal(pushesTo(P.a, 'ride-assigned').length, 1);
  assert.equal(pushesTo(P.d1).length, 0); // the driver did it
});

test('a member cannot move someone else\'s ride', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.a._id, P.b._id], rides: [D(P.d1, 3), R(P.a)] });
  const res = await call(ctrl.assignRide, { as: P.b, body: { riderId: String(P.a._id), driverId: String(P.d1._id), rider: true, guests: 0 } });
  assert.equal(res.code, 403);
  assert.equal(rideOf(P.a).driver, null);
});

test('a full car is refused with the room left', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.a._id], rides: [D(P.d1, 1), R(P.a)], guests: [{ userId: P.a.clerkId, count: 2 }] });
  const res = await call(ctrl.assignRide, { as: P.a, body: { riderId: String(P.a._id), driverId: String(P.d1._id), rider: true, guests: 2 } });
  assert.equal(res.code, 409);
  assert.equal(res.body.error, 'car_full');
  assert.equal(res.body.room, 1);
});

test('ride assignments need Premium', async () => {
  premium.on = false;
  doc = makeMeetup({ in: [P.d1._id, P.a._id], rides: [D(P.d1, 3), R(P.a)] });
  const res = await call(ctrl.assignRide, { as: P.a, body: { riderId: String(P.a._id), driverId: String(P.d1._id), rider: true, guests: 0 } });
  assert.equal(res.code, 403);
  assert.equal(res.body.error, 'premium_required');
});

// --- POST /rides/auto-assign ---

test('only owners and moderators can auto-assign', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.a._id], rides: [D(P.d1, 3), R(P.a)] });
  const res = await call(ctrl.autoAssignRides, { as: P.a });
  assert.equal(res.code, 403);
});

test('auto-assign seats riders with the nearest driver by zip and reports counts', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.d2._id, P.a._id, P.b._id], rides: [D(P.d1, 1), D(P.d2, 1), R(P.a), R(P.b)] });
  const res = await call(ctrl.autoAssignRides, { as: P.owner });
  assert.equal(res.code, 200);
  assert.equal(String(rideOf(P.a).driver), String(P.d2._id)); // Provo rider, Provo driver
  assert.equal(String(rideOf(P.b).driver), String(P.d1._id)); // Salt Lake rider, Salt Lake driver
  assert.deepEqual([res.body.placed, res.body.unplaced], [2, 0]);
  assert.equal(pushesTo(P.a, 'ride-assigned').length, 1);
  assert.equal(pushesTo(P.d2, 'ride-assigned').length, 1);
});

// --- PUT /assignments (the sheet) ---

test('a rider re-saving "I need a ride" keeps their car', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.a._id], rides: [D(P.d1, 3), R(P.a, P.d1)] });
  const res = await call(ctrl.setAssignments, { as: P.a, body: { ride: { role: 'passenger' } } });
  assert.equal(res.code, 200);
  assert.equal(String(rideOf(P.a).driver), String(P.d1._id));
});

test('a driver cannot drop below the people in their car', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.a._id, P.b._id], rides: [D(P.d1, 3), R(P.a, P.d1), R(P.b, P.d1)] });
  const res = await call(ctrl.setAssignments, { as: P.d1, body: { ride: { role: 'driver', seats: 1 } } });
  assert.equal(res.code, 409);
  assert.equal(res.body.error, 'seats_in_use');
  assert.equal(rideOf(P.d1).seats, 3);
});

test('a driver who stops driving frees their riders, who are told', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.a._id], rides: [D(P.d1, 3), R(P.a, P.d1)] });
  const res = await call(ctrl.setAssignments, { as: P.d1, body: { ride: null } });
  assert.equal(res.code, 200);
  assert.equal(rideOf(P.a).driver, null);
  assert.equal(pushesTo(P.a, 'ride-removed').length, 1);
});

// --- RSVP ---

test('a driver going Out frees their riders, who are told', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.a._id], rides: [D(P.d1, 3), R(P.a, P.d1)] });
  const res = await call(ctrl.rsvpMeetup, { as: P.d1, body: { status: 'out' } });
  assert.equal(res.code, 200);
  assert.equal(rideOf(P.d1), undefined);
  assert.equal(rideOf(P.a).driver, null);
  assert.equal(pushesTo(P.a, 'ride-removed').length, 1);
});

test('a rider going Out leaves the car; the driver is told, the rider is not', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.a._id], rides: [D(P.d1, 3), R(P.a, P.d1)] });
  await call(ctrl.rsvpMeetup, { as: P.a, body: { status: 'out' } });
  assert.equal(rideOf(P.a), undefined);
  assert.equal(pushesTo(P.d1, 'ride-removed').length, 1);
  assert.equal(pushesTo(P.a, 'ride-removed').length, 0);
});

// --- Guests ---

test('a rider in a car cannot add guests', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.a._id], rides: [D(P.d1, 3), R(P.a, P.d1)] });
  const res = await call(setGuests, { as: P.a, body: { count: 1 } });
  assert.equal(res.code, 409);
  assert.equal(res.body.error, 'leave_ride_first');
});

test('the per-member guests route also blocks a rider whose guest is in a car', async () => {
  // Organizers can only lower other people's guests there; the host can raise their own.
  doc = makeMeetup({ in: [P.d1._id, P.a._id], rides: [D(P.d1, 3), R(P.a, null, [{ driver: P.d1._id, count: 1 }])], guests: [{ userId: P.a.clerkId, count: 1 }] });
  const res = await call(setGuestsFor, { as: P.a, params: { hostClerkId: P.a.clerkId }, body: { count: 2 } });
  assert.equal(res.code, 409);
  assert.equal(res.body.error, 'leave_ride_first');
});

test('lowering guests gives back their seats; the driver is told', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.a._id], rides: [D(P.d1, 3), R(P.a, P.d1, [{ driver: P.d1._id, count: 2 }])], guests: [{ userId: P.a.clerkId, count: 2 }] });
  const res = await call(setGuests, { as: P.a, body: { count: 1 } });
  assert.equal(res.code, 200);
  assert.equal(rideOf(P.a).guestRides[0].count, 1);
  assert.equal(pushesTo(P.d1, 'ride-removed').length, 1);
  assert.equal(pushesTo(P.a).length, 0);
});

test('an organizer removing a rider\'s placed guests tells the rider', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.a._id], rides: [D(P.d1, 3), R(P.a, null, [{ driver: P.d1._id, count: 1 }])], guests: [{ userId: P.a.clerkId, count: 1 }] });
  const res = await call(setGuestsFor, { as: P.owner, params: { hostClerkId: P.a.clerkId }, body: { count: 0 } });
  assert.equal(res.code, 200);
  assert.deepEqual(rideOf(P.a).guestRides.length, 0);
  assert.equal(pushesTo(P.a, 'ride-removed').length, 1);
});

// --- Priority bump and leaving the group ---

test('a driver bumped by priority RSVP frees their riders, who are told', async () => {
  const w = P.b;
  doc = makeMeetup({
    capacity: 2, in: [P.d1._id, P.a._id], waitlist: [w._id],
    priorityTiers: [{ members: [w._id, P.a._id], opensAt: new Date(Date.now() - 864e5) }],
    rides: [D(P.d1, 3), R(P.a, P.d1)],
  });
  const result = await rebalanceMeetup(doc._id);
  assert.deepEqual(result.bumped.map(String), [String(P.d1._id)]);
  assert.equal(rideOf(P.a).driver, null);
  assert.equal(pushesTo(P.a, 'ride-removed').length, 1);
});

test('a driver leaving the group frees their riders, who are told', async () => {
  doc = makeMeetup({ in: [P.d1._id, P.a._id], rides: [D(P.d1, 3), R(P.a, P.d1)] });
  Meetup.find = (f) => q(f['rides.user'] ? [{ _id: doc._id }] : []);
  await scrubMemberFromUpcomingMeetups({ userId: P.d1._id, clerkId: P.d1.clerkId, groupId: group._id });
  assert.equal(rideOf(P.d1), undefined);
  assert.equal(rideOf(P.a).driver, null);
  assert.equal(pushesTo(P.a, 'ride-removed').length, 1);
});
