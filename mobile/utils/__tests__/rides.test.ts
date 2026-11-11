import { buildCars, lineActions, planJoin, canAutoAssign, assignmentBodyFor } from '../rides';

const members = [
  { _id: 'd1', firstName: 'Sam', clerkId: 'cd1' },
  { _id: 'd2', firstName: 'Lee', clerkId: 'cd2' },
  { _id: 'a', firstName: 'Ana', clerkId: 'ca' },
  { _id: 'b', firstName: 'Bo', clerkId: 'cb' },
  { _id: 'c', firstName: 'Cy', clerkId: 'cc' },
];

const meetup = (over: any = {}) =>
  ({
    members,
    in: ['d1', 'd2', 'a', 'b', 'c'],
    guests: [{ userId: 'ca', count: 2 }],
    ridesEnabled: true,
    rides: [
      { user: 'd1', role: 'driver', seats: 2 },
      { user: 'd2', role: 'driver', seats: 3 },
      { user: 'a', role: 'passenger', seats: 0, driver: 'd1', guestRides: [{ driver: 'd1', count: 1 }, { driver: 'd2', count: 1 }] },
      { user: 'b', role: 'passenger', seats: 0, driver: null, guestRides: [] },
    ],
    group: { _id: 'g', isPremium: true },
    ...over,
  } as any);

describe('buildCars', () => {
  it('draws one line per person, including each guest', () => {
    const { cars, waiting } = buildCars(meetup(), 'b');
    const d1 = cars.find((c) => c.driverId === 'd1')!;
    expect(d1.lines.map((l) => l.label)).toEqual(['Ana', "Ana's guest"]);
    expect(d1.open).toBe(0);
    const d2 = cars.find((c) => c.driverId === 'd2')!;
    expect(d2.lines.map((l) => l.label)).toEqual(["Ana's guest 2"]);
    expect(d2.open).toBe(2);
    expect(waiting.map((l) => l.label)).toEqual(['You']);
  });

  it('lists unplaced guests as waiting and treats a missing driver as no car', () => {
    const m = meetup({
      in: ['d2', 'a', 'b'],
      rides: [
        { user: 'd2', role: 'driver', seats: 3 },
        { user: 'a', role: 'passenger', seats: 0, driver: 'd1', guestRides: [] },
      ],
    });
    const { cars, waiting } = buildCars(m, 'a');
    expect(cars.map((c) => c.driverId)).toEqual(['d2']);
    expect(waiting.map((l) => l.label)).toEqual(['You', 'Your guest', 'Your guest 2']);
  });
});

describe('lineActions', () => {
  it('a driver can only fill their own car with people who are not in a car', () => {
    const m = meetup();
    const { waiting, cars } = buildCars(m, 'd2');
    expect(lineActions({ meetup: m, me: 'd2', isManager: false, line: waiting[0] }).targets.map((t) => t.driverId)).toEqual(['d2']);
    const anaInD1 = cars.find((c) => c.driverId === 'd1')!.lines[0];
    expect(lineActions({ meetup: m, me: 'd2', isManager: false, line: anaInD1 })).toEqual({ targets: [], canRemove: false });
    const guestInD2 = cars.find((c) => c.driverId === 'd2')!.lines[0];
    expect(lineActions({ meetup: m, me: 'd2', isManager: false, line: guestInD2 }).canRemove).toBe(true);
  });

  it('riders see only cars with room; managers can do anything; others nothing', () => {
    const m = meetup();
    const { waiting } = buildCars(m, 'b');
    expect(lineActions({ meetup: m, me: 'b', isManager: false, line: waiting[0] }).targets.map((t) => t.driverId)).toEqual(['d2']);
    expect(lineActions({ meetup: m, me: 'c', isManager: false, line: waiting[0] })).toEqual({ targets: [], canRemove: false });
    const ana = buildCars(m, 'x').cars[0].lines[0];
    expect(lineActions({ meetup: m, me: 'x', isManager: true, line: ana })).toEqual({ targets: [{ driverId: 'd2', open: 2, name: 'Lee' }], canRemove: true });
  });
});

describe('planJoin', () => {
  it('says how many guests fit beside the rider', () => {
    const m = meetup({ guests: [{ userId: 'ca', count: 2 }, { userId: 'cb', count: 3 }] }); // Lee's car has 2 open
    expect(planJoin(m, 'b', 'd2')).toEqual({ fitsAll: false, guests: 1 });
    expect(planJoin(meetup(), 'b', 'd2')).toEqual({ fitsAll: true, guests: 0 });
  });
});

describe('assignmentBodyFor', () => {
  it('moves a guest from its car, or a rider', () => {
    const m = meetup();
    const guest = buildCars(m, 'a').cars.find((c) => c.driverId === 'd2')!.lines[0];
    expect(assignmentBodyFor(guest, null)).toEqual({ riderId: 'a', driverId: null, rider: false, guests: 1, fromDriverId: 'd2' });
    const ana = buildCars(m, 'a').cars[0].lines[0];
    expect(assignmentBodyFor(ana, 'd2')).toEqual({ riderId: 'a', driverId: 'd2', rider: true, guests: 0, fromDriverId: null });
  });
});

describe('canAutoAssign', () => {
  it('needs a manager, someone waiting and an open seat', () => {
    expect(canAutoAssign(meetup(), true)).toBe(true);
    expect(canAutoAssign(meetup(), false)).toBe(false);
    const full = meetup({ rides: [{ user: 'd1', role: 'driver', seats: 0 }, { user: 'b', role: 'passenger', seats: 0 }] });
    expect(canAutoAssign(full, true)).toBe(false);
  });
});

describe('rideNoticeLead', () => {
  const { rideNoticeLead } = require('../rides');
  it('matches the push wording', () => {
    expect(rideNoticeLead('ride-assigned', { role: 'rider', otherName: 'Sam', self: true, guests: 0 })).toBe('You are riding with Sam to');
    expect(rideNoticeLead('ride-assigned', { role: 'rider', otherName: 'Sam', self: false, guests: 1 })).toBe('1 guest of yours is riding with Sam to');
    expect(rideNoticeLead('ride-removed', { role: 'rider', otherName: 'Sam', self: false, guests: 2 })).toBe('2 guests of yours no longer have a ride to');
    expect(rideNoticeLead('ride-removed', { role: 'rider', otherName: 'Sam', self: true, guests: 1 })).toBe('You and 1 guest no longer have a ride to');
    expect(rideNoticeLead('ride-assigned', { role: 'driver', otherName: 'Ana', self: true, guests: 2 })).toBe('Ana and 2 guests are riding with you to');
    expect(rideNoticeLead('ride-removed', { role: 'driver', otherName: 'Ana', self: false, guests: 1 })).toBe('1 guest of Ana is no longer riding with you to');
  });
});

describe('pickerOptionsFor', () => {
  const { pickerOptionsFor } = require('../rides');
  it('lists cars with room by driver name, and "Take out of car" when allowed', () => {
    const m = meetup();
    const bo = buildCars(m, 'b').waiting[0];
    expect(pickerOptionsFor({ meetup: m, me: 'b', isManager: false, line: bo })).toEqual([{ key: 'to:d2', label: 'Ride with Lee (2 open)' }]);
    const ana = buildCars(m, 'x').cars[0].lines[0];
    expect(pickerOptionsFor({ meetup: m, me: 'x', isManager: true, line: ana })).toEqual([
      { key: 'to:d2', label: 'Ride with Lee (2 open)' },
      { key: 'remove', label: 'Take out of car' },
    ]);
  });
  it('a driver sees their own car as "you"', () => {
    const m = meetup();
    const bo = buildCars(m, 'd2').waiting[0];
    expect(pickerOptionsFor({ meetup: m, me: 'd2', isManager: false, line: bo })).toEqual([{ key: 'to:d2', label: 'Ride with you (2 open)' }]);
  });
});

describe('resolvePick', () => {
  const { resolvePick } = require('../rides');
  it('takes a person out of their car', () => {
    const m = meetup();
    const ana = buildCars(m, 'x').cars[0].lines[0];
    expect(resolvePick({ meetup: m, me: 'x', line: ana, key: 'remove' })).toEqual({ kind: 'send', body: { riderId: 'a', driverId: null, rider: true, guests: 0, fromDriverId: null } });
  });
  it('moves one guest by itself', () => {
    const m = meetup();
    const guest = buildCars(m, 'x').cars[0].lines[1];
    expect(resolvePick({ meetup: m, me: 'x', line: guest, key: 'to:d2' })).toEqual({ kind: 'send', body: { riderId: 'a', driverId: 'd2', rider: false, guests: 1, fromDriverId: 'd1' } });
  });
  it('brings a waiting rider\'s guests along when they all fit', () => {
    const m = meetup({ guests: [{ userId: 'ca', count: 2 }, { userId: 'cb', count: 1 }] });
    const bo = buildCars(m, 'b').waiting[0];
    expect(resolvePick({ meetup: m, me: 'b', line: bo, key: 'to:d2' })).toEqual({ kind: 'send', body: { riderId: 'b', driverId: 'd2', rider: true, guests: 1, fromDriverId: null } });
  });
  it('asks first when the rider\'s guests do not all fit', () => {
    const m = meetup({ guests: [{ userId: 'ca', count: 2 }, { userId: 'cb', count: 3 }] });
    const mine = resolvePick({ meetup: m, me: 'b', line: buildCars(m, 'b').waiting[0], key: 'to:d2' });
    expect(mine).toEqual({
      kind: 'confirm',
      title: 'Not enough space',
      message: 'Not enough space for you and your guests with Lee. Your remaining guests will need to ride with another driver.',
      body: { riderId: 'b', driverId: 'd2', rider: true, guests: 1, fromDriverId: null },
    });
    const theirs = resolvePick({ meetup: m, me: 'x', line: buildCars(m, 'x').waiting[0], key: 'to:d2' });
    expect(theirs.message).toBe('Not enough space for Bo and their guests with Lee. Their remaining guests will need to ride with another driver.');
  });
});

describe('autoAssignMessage', () => {
  const { autoAssignMessage } = require('../rides');
  it('says how many were placed and how many still need a ride', () => {
    expect(autoAssignMessage(4, 1)).toBe('Placed 4 people. 1 person still needs a ride.');
    expect(autoAssignMessage(1, 0)).toBe('Placed 1 person.');
    expect(autoAssignMessage(0, 2)).toBe('Nobody could be placed. 2 people still need a ride.');
  });
});
