import test from 'node:test';
import assert from 'node:assert/strict';
import {
  guestCountFn, carLoad, openSeats, unplacedGuests, isPlaced, normalizeRides,
  applyAssignment, setRideRole, autoAssign, rideNotifications, guestIncreaseBlocked,
} from './rides.js';

const D = (user, seats) => ({ user, role: 'driver', seats });
const P = (user, driver = null, guestRides = []) => ({ user, role: 'passenger', seats: 0, driver, guestRides });
const guests = (map) => (uid) => map[uid] ?? 0;
const entry = (rides, uid) => rides.find((r) => r.user === uid);

test('guestCountFn reads guests by clerk id', () => {
  const f = guestCountFn({ guests: [{ userId: 'c1', count: 2 }] }, new Map([['u1', 'c1'], ['u2', 'c2']]));
  assert.equal(f('u1'), 2);
  assert.equal(f('u2'), 0);
  assert.equal(f('zz'), 0);
});

test('load counts riders and guest seats; unplaced guests = count - placed', () => {
  const rides = [D('d1', 4), P('a', 'd1', [{ driver: 'd1', count: 1 }]), P('b', null, [{ driver: 'd1', count: 2 }])];
  assert.equal(carLoad(rides, 'd1'), 4);
  assert.equal(openSeats(rides, 'd1'), 0);
  assert.equal(unplacedGuests(entry(rides, 'b'), guests({ b: 3 })), 1);
  assert.equal(isPlaced(entry(rides, 'b')), true);
  assert.equal(isPlaced(P('c')), false);
  assert.equal(openSeats(rides, 'a'), 0); // not a driver
});

test('normalize releases rider and guest seats when the driver is no longer In', () => {
  const rides = [D('d1', 4), P('a', 'd1'), P('b', null, [{ driver: 'd1', count: 1 }])];
  const { rides: out, released } = normalizeRides(rides, ['a', 'b'], guests({ b: 1 }));
  assert.equal(entry(out, 'd1'), undefined);
  assert.equal(entry(out, 'a').driver, null);
  assert.deepEqual(entry(out, 'b').guestRides, []);
  assert.deepEqual(released.map((c) => [c.rider, c.from, c.self, c.guests]).sort(),
    [['a', 'd1', true, 0], ['b', 'd1', false, 1]]);
});

test('normalize releases people of a driver who switched to needing a ride', () => {
  const rides = [P('d1'), P('a', 'd1')];
  const { rides: out, released } = normalizeRides(rides, ['d1', 'a'], guests({}));
  assert.equal(entry(out, 'a').driver, null);
  assert.equal(released.length, 1);
});

test('normalize drops entries for people no longer In and records what their driver lost', () => {
  const rides = [D('d1', 3), P('a', 'd1', [{ driver: 'd1', count: 1 }])];
  const { rides: out, released } = normalizeRides(rides, ['d1'], guests({ a: 1 }));
  assert.equal(entry(out, 'a'), undefined);
  assert.deepEqual(released, [{ rider: 'a', from: 'd1', to: null, self: true, guests: 1 }]);
});

test('normalize trims guest seats above the current guest count from the last entry', () => {
  const rides = [D('d1', 4), D('d2', 4), P('a', 'd1', [{ driver: 'd1', count: 1 }, { driver: 'd2', count: 2 }])];
  const { rides: out, released } = normalizeRides(rides, ['d1', 'd2', 'a'], guests({ a: 1 }));
  assert.deepEqual(entry(out, 'a').guestRides, [{ driver: 'd1', count: 1 }]);
  assert.deepEqual(released, [{ rider: 'a', from: 'd2', to: null, self: false, guests: 2 }]);
});

test('normalize safety net releases the last placed first when a car is over its seats', () => {
  const rides = [D('d1', 2), P('a', 'd1'), P('b', 'd1'), P('c', 'd1')];
  const { rides: out, released } = normalizeRides(rides, ['d1', 'a', 'b', 'c'], guests({}));
  assert.equal(entry(out, 'a').driver, 'd1');
  assert.equal(entry(out, 'b').driver, 'd1');
  assert.equal(entry(out, 'c').driver, null);
  assert.equal(released[0].rider, 'c');
});

const base = () => [D('d1', 3), D('d2', 2), P('a', 'd1', [{ driver: 'd1', count: 1 }]), P('b'), P('c')];
const g = guests({ a: 1, b: 2 });

test('a manager moves a rider and their guest to another car', () => {
  const r = applyAssignment(base(), { actorId: 'm', isManager: true, riderId: 'a', driverId: 'd2', rider: true, guests: 1, fromDriverId: 'd1' }, g);
  assert.equal(r.ok, true);
  assert.equal(entry(r.rides, 'a').driver, 'd2');
  assert.deepEqual(entry(r.rides, 'a').guestRides, [{ driver: 'd2', count: 1 }]);
  assert.equal(r.rides.at(-1).user, 'a'); // placed entry moves to the end
  assert.deepEqual(r.changes, [{ rider: 'a', from: 'd1', to: 'd2', self: true, guests: 1 }]);
});

test('a rider places themselves and their guests', () => {
  const r = applyAssignment(base(), { actorId: 'b', isManager: false, riderId: 'b', driverId: 'd2', rider: true, guests: 1 }, g);
  assert.equal(r.ok, true);
  assert.equal(entry(r.rides, 'b').driver, 'd2');
  assert.equal(unplacedGuests(entry(r.rides, 'b'), g), 1);
});

test('too many people for the car is car_full with the room left', () => {
  const r = applyAssignment(base(), { actorId: 'b', isManager: false, riderId: 'b', driverId: 'd2', rider: true, guests: 2 }, g);
  assert.deepEqual(r, { ok: false, error: 'car_full', room: 2 });
});

test('a driver adds an unplaced guest but not a guest from another car', () => {
  const ok = applyAssignment(base(), { actorId: 'd2', isManager: false, riderId: 'b', driverId: 'd2', rider: false, guests: 1 }, g);
  assert.equal(ok.ok, true);
  const taken = applyAssignment(base(), { actorId: 'd2', isManager: false, riderId: 'a', driverId: 'd2', rider: false, guests: 1, fromDriverId: 'd1' }, g);
  assert.equal(taken.error, 'already_assigned');
  const rider = applyAssignment(base(), { actorId: 'd2', isManager: false, riderId: 'a', driverId: 'd2', rider: true, guests: 0 }, g);
  assert.equal(rider.error, 'already_assigned');
});

test('a driver can take people out of their own car only', () => {
  const own = applyAssignment(base(), { actorId: 'd1', isManager: false, riderId: 'a', driverId: null, rider: true, guests: 1, fromDriverId: 'd1' }, g);
  assert.equal(own.ok, true);
  assert.equal(entry(own.rides, 'a').driver, null);
  const other = applyAssignment(base(), { actorId: 'd2', isManager: false, riderId: 'a', driverId: null, rider: true, guests: 0 }, g);
  assert.equal(other.error, 'forbidden');
});

test('a member cannot move someone else', () => {
  const r = applyAssignment(base(), { actorId: 'c', isManager: false, riderId: 'b', driverId: 'd2', rider: true, guests: 0 }, g);
  assert.equal(r.error, 'forbidden');
});

test('assignment errors: not a rider, not a driver, not enough guests', () => {
  assert.equal(applyAssignment(base(), { actorId: 'm', isManager: true, riderId: 'd1', driverId: 'd2', rider: true, guests: 0 }, g).error, 'not_rider');
  assert.equal(applyAssignment(base(), { actorId: 'm', isManager: true, riderId: 'b', driverId: 'c', rider: true, guests: 0 }, g).error, 'not_driver');
  assert.equal(applyAssignment(base(), { actorId: 'm', isManager: true, riderId: 'a', driverId: null, rider: false, guests: 2, fromDriverId: 'd1' }, g).error, 'not_enough_guests');
  assert.equal(applyAssignment(base(), { actorId: 'm', isManager: true, riderId: 'b', driverId: 'd1', rider: false, guests: 3 }, g).error, 'not_enough_guests');
});

test('guests cannot be added while any of the party is placed', () => {
  const rides = base();
  assert.equal(guestIncreaseBlocked(rides, 'a'), true);
  assert.equal(guestIncreaseBlocked(rides, 'b'), false);
  assert.equal(guestIncreaseBlocked(rides, 'd1'), false);
  assert.equal(guestIncreaseBlocked([P('x', null, [{ driver: 'd1', count: 1 }])], 'x'), true);
});

test('setRideRole keeps placements, blocks seats below load, and releases a driver turned rider', () => {
  const kept = setRideRole(base(), 'a', { role: 'passenger' });
  assert.equal(entry(kept.rides, 'a').driver, 'd1');
  assert.deepEqual(setRideRole(base(), 'd1', { role: 'driver', seats: 1 }), { ok: false, error: 'seats_in_use', load: 2 });
  assert.equal(setRideRole(base(), 'd1', { role: 'driver', seats: 2 }).ok, true);
  const switched = setRideRole(base(), 'd1', { role: 'passenger' });
  const { rides, released } = normalizeRides(switched.rides, ['d1', 'd2', 'a', 'b', 'c'], g);
  assert.equal(entry(rides, 'a').driver, null);
  assert.equal(released.length, 1);
  const rider = setRideRole(base(), 'a', null);
  assert.equal(entry(rider.rides, 'a'), undefined);
  assert.deepEqual(rider.changes, [{ rider: 'a', from: 'd1', to: null, self: true, guests: 1 }]);
});

const coords = { d1: [40.76, -111.89], d2: [40.23, -111.66], a: [40.25, -111.65], b: [40.75, -111.9], c: null, e: [40.24, -111.66] };
const coordsOf = (u) => coords[u] ?? null;

test('auto-assign picks the nearest car that fits and never moves placed people', () => {
  const rides = [D('d1', 3), D('d2', 3), P('a'), P('b'), P('z', 'd1')];
  const r = autoAssign(rides, guests({}), coordsOf);
  assert.equal(entry(r.rides, 'a').driver, 'd2');
  assert.equal(entry(r.rides, 'b').driver, 'd1');
  assert.equal(entry(r.rides, 'z').driver, 'd1');
  assert.equal(r.placed, 2);
  assert.equal(r.unplaced, 0);
});

test('auto-assign prefers the nearest driver even when another car has more open seats', () => {
  const rides = [D('d1', 4), D('d2', 2), P('a')]; // a lives near d2 (Provo); d1 (Salt Lake) has more room
  const r = autoAssign(rides, guests({}), coordsOf);
  assert.equal(entry(r.rides, 'a').driver, 'd2');
});

test('auto-assign keeps a party together in a farther car rather than splitting it', () => {
  const rides = [D('d1', 3), D('d2', 1), P('a')]; // nearest (d2) has 1 seat; d1 fits all 3
  const r = autoAssign(rides, guests({ a: 2 }), coordsOf);
  const a = entry(r.rides, 'a');
  assert.equal(a.driver, 'd1');
  assert.deepEqual(a.guestRides, [{ driver: 'd1', count: 2 }]);
});

test('auto-assign seats the largest party first', () => {
  // d2 is nearest to both a and e, but has room for only one party; a (with 2 guests) goes first.
  const rides = [D('d1', 3), D('d2', 3), P('e'), P('a')];
  const r = autoAssign(rides, guests({ a: 2 }), coordsOf);
  assert.equal(entry(r.rides, 'a').driver, 'd2');
  assert.equal(entry(r.rides, 'e').driver, 'd1');
});

test('auto-assign splits a party only when no single car fits', () => {
  const rides = [D('d1', 2), D('d2', 3), P('a')];
  const r = autoAssign(rides, guests({ a: 3 }), coordsOf); // party of 4, cars of 2 and 3
  const a = entry(r.rides, 'a');
  assert.equal(a.driver, 'd2'); // nearest gets the rider first
  assert.deepEqual(a.guestRides, [{ driver: 'd2', count: 2 }, { driver: 'd1', count: 1 }]);
  assert.equal(r.unplaced, 0);
});

test('auto-assign puts a placed rider\'s remaining guests in the rider\'s car when it has room', () => {
  const rides = [D('d1', 3), D('d2', 3), P('a', 'd1')];
  const r = autoAssign(rides, guests({ a: 1 }), coordsOf); // d2 is nearer to a, but d1 is a's car
  assert.deepEqual(entry(r.rides, 'a').guestRides, [{ driver: 'd1', count: 1 }]);
});

test('auto-assign places unknown-zip riders last into the most open seats, and reports leftovers', () => {
  const rides = [D('d1', 1), D('d2', 2), P('c'), P('a'), P('b')];
  const r = autoAssign(rides, guests({}), coordsOf);
  assert.equal(entry(r.rides, 'a').driver, 'd2');
  assert.equal(entry(r.rides, 'b').driver, 'd1');
  assert.equal(entry(r.rides, 'c').driver, 'd2');
  const full = autoAssign([D('d1', 1), P('a'), P('b')], guests({}), coordsOf);
  assert.equal(full.placed, 1);
  assert.equal(full.unplaced, 1);
});

test('auto-assign is deterministic', () => {
  const rides = [D('d1', 2), D('d2', 2), P('c'), P('x'), P('y')];
  const a = autoAssign(rides, guests({ x: 1 }), coordsOf);
  const b = autoAssign(rides, guests({ x: 1 }), coordsOf);
  assert.deepEqual(a.rides, b.rides);
});

test('rideNotifications skips whoever made the change and covers both sides', () => {
  const move = [{ rider: 'a', from: 'd1', to: 'd2', self: true, guests: 1 }];
  const byManager = rideNotifications(move, 'm');
  assert.deepEqual(byManager.map((n) => [n.to, n.type, n.role]).sort(), [
    ['a', 'ride-assigned', 'rider'], ['d1', 'ride-removed', 'driver'], ['d2', 'ride-assigned', 'driver'],
  ]);
  const byRider = rideNotifications(move, 'a');
  assert.equal(byRider.some((n) => n.to === 'a'), false);
  const byDriver = rideNotifications([{ rider: 'a', from: 'd1', to: null, self: true, guests: 0 }], 'd1');
  assert.deepEqual(byDriver.map((n) => [n.to, n.type]), [['a', 'ride-removed']]);
});

test('rideNotifications merges changes for the same person and car', () => {
  const out = rideNotifications([
    { rider: 'a', from: 'd1', to: null, self: true, guests: 0 },
    { rider: 'a', from: 'd1', to: null, self: false, guests: 2 },
  ], 'x');
  const rider = out.filter((n) => n.to === 'a');
  assert.equal(rider.length, 1);
  assert.equal(rider[0].self, true);
  assert.equal(rider[0].guests, 2);
});

test('ride push wording', async () => {
  const { rideNoticeBody } = await import('./rideNotify.js');
  assert.equal(rideNoticeBody({ type: 'ride-assigned', role: 'rider', self: true, guests: 0 }, 'Sam', 'Hike'), 'You are riding with Sam to "Hike".');
  assert.equal(rideNoticeBody({ type: 'ride-assigned', role: 'rider', self: true, guests: 2 }, 'Sam', 'Hike'), 'You and 2 guests are riding with Sam to "Hike".');
  assert.equal(rideNoticeBody({ type: 'ride-assigned', role: 'rider', self: false, guests: 1 }, 'Sam', 'Hike'), '1 guest of yours is riding with Sam to "Hike".');
  assert.equal(rideNoticeBody({ type: 'ride-removed', role: 'rider', self: true, guests: 0 }, 'Sam', 'Hike'), 'You no longer have a ride to "Hike". Pick another car on the meetup.');
  assert.equal(rideNoticeBody({ type: 'ride-removed', role: 'rider', self: false, guests: 2 }, 'Sam', 'Hike'), '2 guests of yours no longer have a ride to "Hike".');
  assert.equal(rideNoticeBody({ type: 'ride-assigned', role: 'driver', self: true, guests: 0 }, 'Ana', 'Hike'), 'Ana is riding with you to "Hike".');
  assert.equal(rideNoticeBody({ type: 'ride-assigned', role: 'driver', self: true, guests: 1 }, 'Ana', 'Hike'), 'Ana and 1 guest are riding with you to "Hike".');
  assert.equal(rideNoticeBody({ type: 'ride-removed', role: 'driver', self: false, guests: 1 }, 'Ana', 'Hike'), '1 guest of Ana is no longer riding with you to "Hike".');
});
