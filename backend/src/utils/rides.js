// Ride assignments (Premium): which car each rider and each of their guests sits in.
// See docs/specs/2026-11-10-ride-assignments-design.md.
//
// A passenger entry in `meetup.rides` holds `driver` (the car the rider sits in, or null) and
// `guestRides: [{ driver, count }]` (where their guests sit). Guests not covered by those counts
// still need a ride. Every function here is pure: it takes the rides array (Mongoose subdocs or
// plain objects), returns a new plain array, and describes what moved as `changes`:
//   { rider, from: driverId | null, to: driverId | null, self: boolean, guests: number }
// `self` = the rider themselves moved; `guests` = how many of their guests moved.
import { milesBetween } from './zipDistance.js';

const S = (v) => (v == null ? null : String(v));

const plain = (r) => {
  const passenger = r.role === 'passenger';
  return {
    user: S(r.user),
    role: r.role,
    seats: Number(r.seats) || 0,
    driver: passenger ? S(r.driver) : null,
    guestRides: passenger
      ? (r.guestRides || [])
        .map((g) => ({ driver: S(g.driver), count: Number(g.count) || 0 }))
        .filter((g) => g.driver && g.count > 0)
      : [],
  };
};
const plainAll = (rides) => (rides || []).map(plain);

/** (userId) => number of guests they're bringing. Guests are stored by Clerk id. */
export const guestCountFn = (meetup, clerkIdByUserId) => {
  const byClerk = new Map((meetup.guests || []).map((g) => [g.userId, Number(g.count) || 0]));
  return (userId) => byClerk.get(clerkIdByUserId.get(S(userId))) || 0;
};

const isDriverEntry = (r) => r.role === 'driver';
const isPassengerEntry = (r) => r.role === 'passenger';

/** People sitting in a driver's car: riders plus guest seats. */
export const carLoad = (rides, driverId) => {
  const d = S(driverId);
  let load = 0;
  for (const r of rides || []) {
    if (!isPassengerEntry(r)) continue;
    if (S(r.driver) === d) load += 1;
    for (const g of r.guestRides || []) if (S(g.driver) === d) load += Number(g.count) || 0;
  }
  return load;
};

/** Open seats in a driver's car (0 when the id isn't a driver). */
export const openSeats = (rides, driverId) => {
  const d = (rides || []).find((r) => isDriverEntry(r) && S(r.user) === S(driverId));
  return d ? Math.max(0, (Number(d.seats) || 0) - carLoad(rides, driverId)) : 0;
};

const placedGuests = (entry) => (entry.guestRides || []).reduce((n, g) => n + (Number(g.count) || 0), 0);
const guestsIn = (entry, driverId) => (entry.guestRides || [])
  .filter((g) => S(g.driver) === S(driverId)).reduce((n, g) => n + (Number(g.count) || 0), 0);

export const unplacedGuests = (entry, guestsOf) => Math.max(0, guestsOf(S(entry.user)) - placedGuests(entry));

/** Whether the rider or any of their guests is in a car. */
export const isPlaced = (entry) => !!entry?.driver || (entry?.guestRides || []).some((g) => (Number(g.count) || 0) > 0);

/** A rider can't add guests while any of their party is in a car (they must take everyone out first). */
export const guestIncreaseBlocked = (rides, userId) => {
  const e = (rides || []).find((r) => S(r.user) === S(userId));
  return !!e && isPassengerEntry(e) && isPlaced(e);
};

// Add `count` guests of `entry` to a car, merging with an existing entry for that car.
const addGuests = (entry, driverId, count) => {
  if (count <= 0) return;
  const existing = entry.guestRides.find((g) => g.driver === driverId);
  if (existing) existing.count += count;
  else entry.guestRides.push({ driver: driverId, count });
};
// Take up to `count` guests of `entry` out of a car; returns how many were taken.
const removeGuests = (entry, driverId, count) => {
  let taken = 0;
  for (const g of entry.guestRides) {
    if (g.driver !== driverId || taken >= count) continue;
    const n = Math.min(g.count, count - taken);
    g.count -= n;
    taken += n;
  }
  entry.guestRides = entry.guestRides.filter((g) => g.count > 0);
  return taken;
};

// Merge changes that describe the same rider moving between the same two cars.
const mergeChanges = (changes) => {
  const out = [];
  for (const c of changes) {
    if (!c.self && !c.guests) continue;
    const same = out.find((o) => o.rider === c.rider && o.from === c.from && o.to === c.to);
    if (same) {
      same.self = same.self || c.self;
      same.guests += c.guests;
    } else out.push({ ...c });
  }
  return out;
};

/**
 * Makes the rides consistent: drops entries for people who aren't In, releases seats in cars
 * whose driver is no longer an In driver, trims guest seats above the rider's guest count (from
 * the last car first), and, as a safety net, releases people from over-full cars last-placed
 * first. Returns the new rides and what was released.
 */
export const normalizeRides = (rides, inIds, guestsOf) => {
  const inSet = new Set((inIds || []).map(S));
  const all = plainAll(rides);
  const changes = [];

  // People who aren't In lose their place (their drivers are told).
  for (const r of all) {
    if (inSet.has(r.user) || !isPassengerEntry(r)) continue;
    if (r.driver) changes.push({ rider: r.user, from: r.driver, to: null, self: true, guests: 0 });
    for (const g of r.guestRides) changes.push({ rider: r.user, from: g.driver, to: null, self: false, guests: g.count });
  }
  const kept = all.filter((r) => inSet.has(r.user));
  const drivers = new Set(kept.filter(isDriverEntry).map((r) => r.user));

  for (const r of kept.filter(isPassengerEntry)) {
    if (r.driver && !drivers.has(r.driver)) {
      changes.push({ rider: r.user, from: r.driver, to: null, self: true, guests: 0 });
      r.driver = null;
    }
    for (const g of r.guestRides) {
      if (!drivers.has(g.driver)) {
        changes.push({ rider: r.user, from: g.driver, to: null, self: false, guests: g.count });
        g.count = 0;
      }
    }
    r.guestRides = r.guestRides.filter((g) => g.count > 0);
    // Fewer guests than seats held: give back seats from the last car first.
    let extra = placedGuests(r) - guestsOf(r.user);
    for (let i = r.guestRides.length - 1; i >= 0 && extra > 0; i--) {
      const g = r.guestRides[i];
      const n = Math.min(g.count, extra);
      g.count -= n;
      extra -= n;
      changes.push({ rider: r.user, from: g.driver, to: null, self: false, guests: n });
    }
    r.guestRides = r.guestRides.filter((g) => g.count > 0);
  }

  // Safety net: an over-full car releases the most recently placed people first.
  for (const d of kept.filter(isDriverEntry)) {
    let over = carLoad(kept, d.user) - d.seats;
    for (let i = kept.length - 1; i >= 0 && over > 0; i--) {
      const r = kept[i];
      if (!isPassengerEntry(r)) continue;
      const g = removeGuests(r, d.user, over);
      if (g) changes.push({ rider: r.user, from: d.user, to: null, self: false, guests: g });
      over -= g;
      if (over > 0 && r.driver === d.user) {
        r.driver = null;
        over -= 1;
        changes.push({ rider: r.user, from: d.user, to: null, self: true, guests: 0 });
      }
    }
  }

  return { rides: kept, released: mergeChanges(changes) };
};

/**
 * One manual change: put the rider (if `rider`) and `guests` of their guests in `driverId`'s car,
 * or take them out (`driverId` null). Guests come from `fromDriverId`'s car when given, otherwise
 * from the unplaced ones (placing) — taking guests out needs `fromDriverId`.
 * Managers may do anything; a rider may move their own party; a driver may add people who aren't
 * in a car to their own car, and take people out of their own car.
 */
export const applyAssignment = (rides, { actorId, isManager, riderId, driverId, rider, guests = 0, fromDriverId = null }, guestsOf) => {
  const all = plainAll(rides);
  const actor = S(actorId);
  const to = S(driverId);
  const from = S(fromDriverId);
  const idx = all.findIndex((r) => r.user === S(riderId) && isPassengerEntry(r));
  if (idx < 0) return { ok: false, error: 'not_rider' };
  const entry = all[idx];
  if (to && !all.some((r) => r.user === to && isDriverEntry(r))) return { ok: false, error: 'not_driver' };
  if (!rider && !guests) return { ok: false, error: 'nothing_to_move' };

  // Permissions.
  if (!isManager && actor !== entry.user) {
    if (to) {
      // A driver filling their own car, only with people who aren't in a car.
      if (actor !== to) return { ok: false, error: 'forbidden' };
      if (rider && entry.driver && entry.driver !== to) return { ok: false, error: 'already_assigned' };
      if (guests && from && from !== to) return { ok: false, error: 'already_assigned' };
    } else {
      // A driver taking people out of their own car.
      if (rider && entry.driver !== actor) return { ok: false, error: 'forbidden' };
      if (guests && from !== actor) return { ok: false, error: 'forbidden' };
    }
  }

  const changes = [];
  if (to) {
    const guestSource = from && from !== to ? guestsIn(entry, from) : from === to ? 0 : unplacedGuests(entry, guestsOf);
    if (guests > guestSource) return { ok: false, error: 'not_enough_guests' };
    const need = (rider && entry.driver !== to ? 1 : 0) + guests;
    const room = openSeats(all, to);
    if (need > room) return { ok: false, error: 'car_full', room };

    if (rider && entry.driver !== to) {
      changes.push({ rider: entry.user, from: entry.driver, to, self: true, guests: 0 });
      entry.driver = to;
    }
    if (guests) {
      if (from) removeGuests(entry, from, guests);
      addGuests(entry, to, guests);
      changes.push({ rider: entry.user, from: from || null, to, self: false, guests });
    }
  } else {
    if (rider && !entry.driver) return { ok: false, error: 'not_in_car' };
    if (guests && (!from || guestsIn(entry, from) < guests)) return { ok: false, error: 'not_enough_guests' };
    if (rider) {
      changes.push({ rider: entry.user, from: entry.driver, to: null, self: true, guests: 0 });
      entry.driver = null;
    }
    if (guests) {
      removeGuests(entry, from, guests);
      changes.push({ rider: entry.user, from, to: null, self: false, guests });
    }
  }

  // The most recently placed go to the end (the safety net releases from the end).
  all.splice(idx, 1);
  all.push(entry);
  return { ok: true, rides: all, changes: mergeChanges(changes) };
};

/**
 * Sets a member's own ride role from the assignments sheet. A passenger staying a passenger keeps
 * their car; a driver can't go below the people already in their car; leaving rides or switching
 * role gives up the person's own seats (run normalizeRides afterwards to release a former driver's
 * people).
 */
export const setRideRole = (rides, userId, ride) => {
  const all = plainAll(rides);
  const uid = S(userId);
  const idx = all.findIndex((r) => r.user === uid);
  const current = idx >= 0 ? all[idx] : null;

  if (ride?.role === 'driver' && current?.role === 'driver') {
    const load = carLoad(all, uid);
    if (Number(ride.seats) < load) return { ok: false, error: 'seats_in_use', load };
    current.seats = Number(ride.seats);
    return { ok: true, rides: all, changes: [] };
  }
  if (ride?.role === 'passenger' && current?.role === 'passenger') return { ok: true, rides: all, changes: [] };

  const changes = [];
  if (current?.role === 'passenger') {
    if (current.driver) changes.push({ rider: uid, from: current.driver, to: null, self: true, guests: 0 });
    for (const g of current.guestRides) changes.push({ rider: uid, from: g.driver, to: null, self: false, guests: g.count });
  }
  const rest = all.filter((r) => r.user !== uid);
  if (ride) {
    rest.push({
      user: uid,
      role: ride.role,
      seats: ride.role === 'driver' ? Number(ride.seats) || 0 : 0,
      driver: null,
      guestRides: [],
    });
  }
  return { ok: true, rides: rest, changes: mergeChanges(changes) };
};

/**
 * Seats everyone who isn't in a car yet, without moving anyone who is. Largest party first;
 * riders with a known zip before those without. Each party goes whole into the nearest car that
 * fits (a placed rider's remaining guests prefer the rider's car); when no car fits the whole
 * party it is split, rider first, across the nearest cars with room. `coordsOf(userId)` returns
 * [lat, lng] or null. Expects normalized rides.
 */
export const autoAssign = (rides, guestsOf, coordsOf) => {
  const all = plainAll(rides);
  const drivers = all.filter(isDriverEntry).map((d) => d.user);
  const open = new Map(drivers.map((d) => [d, openSeats(all, d)]));
  const driverCoords = new Map(drivers.map((d) => [d, coordsOf(d)]));

  const parties = all.filter(isPassengerEntry).map((r) => {
    const riderNeeds = !r.driver;
    const g = unplacedGuests(r, guestsOf);
    return { entry: r, riderNeeds, guests: g, size: (riderNeeds ? 1 : 0) + g, coords: coordsOf(r.user), preferred: r.driver };
  }).filter((p) => p.size > 0);

  parties.sort((a, b) => (a.coords ? 0 : 1) - (b.coords ? 0 : 1) || b.size - a.size || (a.entry.user < b.entry.user ? -1 : a.entry.user > b.entry.user ? 1 : 0));

  const changes = [];
  let placed = 0;
  let unplaced = 0;

  for (const p of parties) {
    const dist = (d) => {
      const dc = driverCoords.get(d);
      return p.coords && dc ? milesBetween(p.coords, dc) : Infinity;
    };
    const ranked = drivers.filter((d) => open.get(d) > 0).sort((a, b) => {
      if (p.preferred) {
        if (a === p.preferred) return -1;
        if (b === p.preferred) return 1;
      }
      if (p.coords) {
        const da = dist(a);
        const db = dist(b);
        if (da !== db) return da < db ? -1 : 1;
      }
      return open.get(b) - open.get(a) || (a < b ? -1 : a > b ? 1 : 0);
    });
    const whole = ranked.find((d) => open.get(d) >= p.size);
    const cars = whole ? [whole] : ranked;

    let riderLeft = p.riderNeeds;
    let guestsLeft = p.guests;
    for (const d of cars) {
      if (!riderLeft && !guestsLeft) break;
      let room = open.get(d);
      if (room <= 0) continue;
      let movedSelf = false;
      if (riderLeft) {
        p.entry.driver = d;
        riderLeft = false;
        movedSelf = true;
        room -= 1;
      }
      const g = Math.min(room, guestsLeft);
      addGuests(p.entry, d, g);
      guestsLeft -= g;
      room -= g;
      open.set(d, room);
      changes.push({ rider: p.entry.user, from: null, to: d, self: movedSelf, guests: g });
      placed += (movedSelf ? 1 : 0) + g;
    }
    unplaced += (riderLeft ? 1 : 0) + guestsLeft;
  }

  return { rides: all, changes: mergeChanges(changes), placed, unplaced };
};

/**
 * Who to tell about a set of changes. The rider hears about any change to their party that they
 * didn't make; a driver hears about people joining or leaving their car unless they did it.
 * Returns [{ to, type: 'ride-assigned' | 'ride-removed', role: 'rider' | 'driver', otherId, self, guests }].
 */
export const rideNotifications = (changes, actorId) => {
  const actor = S(actorId);
  const out = [];
  const add = (n) => {
    const same = out.find((o) => o.to === n.to && o.type === n.type && o.role === n.role && o.otherId === n.otherId);
    if (same) {
      same.self = same.self || n.self;
      same.guests += n.guests;
    } else out.push(n);
  };
  for (const c of changes || []) {
    if (!c.self && !c.guests) continue;
    if (c.rider !== actor) {
      add({ to: c.rider, type: c.to ? 'ride-assigned' : 'ride-removed', role: 'rider', otherId: c.to || c.from, self: c.self, guests: c.guests });
    }
    if (c.from && c.from !== actor) {
      add({ to: c.from, type: 'ride-removed', role: 'driver', otherId: c.rider, self: c.self, guests: c.guests });
    }
    if (c.to && c.to !== actor) {
      add({ to: c.to, type: 'ride-assigned', role: 'driver', otherId: c.rider, self: c.self, guests: c.guests });
    }
  }
  return out;
};
