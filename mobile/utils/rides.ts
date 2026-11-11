// Ride assignments as the app shows them: cars with one line per person (riders and each of
// their guests), and who still needs a ride. Mirrors backend/src/utils/rides.js; the server
// has the final say. See docs/specs/2026-11-10-ride-assignments-design.md.
import type { Meetup, RideAssignmentBody, RideEntry } from '@/utils/api';

const idOf = (u: any): string => (typeof u === 'string' ? u : u?._id);

export interface PersonLine {
  key: string;
  riderId: string;
  isGuest: boolean;
  /** 0 = the rider; 1, 2… = their guests in order. */
  guestIndex: number;
  label: string;
  /** Driver id of the car this person is in, or null. */
  carId: string | null;
  isMine: boolean;
}

export interface Car {
  driverId: string;
  name: string;
  seats: number;
  open: number;
  isMine: boolean;
  lines: PersonLine[];
}

const firstName = (meetup: Meetup, userId: string) =>
  meetup.members.find((m) => m._id === userId)?.firstName?.trim() || 'Someone';

const guestCountOf = (meetup: Meetup) => {
  const byClerk = new Map((meetup.guests ?? []).map((g) => [g.userId, g.count]));
  return (userId: string) => {
    const clerkId = meetup.members.find((m) => m._id === userId)?.clerkId;
    return (clerkId && byClerk.get(clerkId)) || 0;
  };
};

const label = (meetup: Meetup, riderId: string, guestIndex: number, me: string) => {
  if (guestIndex === 0) return riderId === me ? 'You' : firstName(meetup, riderId);
  const owner = riderId === me ? 'Your' : `${firstName(meetup, riderId)}'s`;
  return guestIndex === 1 ? `${owner} guest` : `${owner} guest ${guestIndex}`;
};

/** Drivers and riders who are In, with stale placements (driver gone) treated as no car. */
const activeRides = (meetup: Meetup) => {
  const inIds = new Set((meetup.in ?? []).map(idOf));
  const rides = (meetup.rides ?? []).filter((r) => inIds.has(r.user));
  const drivers = rides.filter((r) => r.role === 'driver');
  const driverIds = new Set(drivers.map((d) => d.user));
  const passengers = rides.filter((r) => r.role === 'passenger');
  return { drivers, driverIds, passengers };
};

export const buildCars = (meetup: Meetup, currentUserId: string): { cars: Car[]; waiting: PersonLine[] } => {
  const { drivers, driverIds, passengers } = activeRides(meetup);
  const guestsOf = guestCountOf(meetup);
  const lines = new Map<string, PersonLine[]>(drivers.map((d) => [d.user, []]));
  const waiting: PersonLine[] = [];

  for (const p of passengers) {
    const line = (guestIndex: number, carId: string | null): PersonLine => ({
      key: `${p.user}:${guestIndex}`,
      riderId: p.user,
      isGuest: guestIndex > 0,
      guestIndex,
      label: label(meetup, p.user, guestIndex, currentUserId),
      carId,
      isMine: p.user === currentUserId,
    });
    const car = p.driver && driverIds.has(p.driver) ? p.driver : null;
    (car ? lines.get(car)! : waiting).push(line(0, car));

    let index = 1;
    const total = guestsOf(p.user);
    for (const g of p.guestRides ?? []) {
      if (!driverIds.has(g.driver)) continue;
      for (let i = 0; i < g.count && index <= total; i++) lines.get(g.driver)!.push(line(index++, g.driver));
    }
    while (index <= total) waiting.push(line(index++, null));
  }

  const cars = drivers.map<Car>((d) => {
    const people = lines.get(d.user)!;
    return {
      driverId: d.user,
      name: d.user === currentUserId ? 'You' : firstName(meetup, d.user),
      seats: d.seats,
      open: Math.max(0, d.seats - people.length),
      isMine: d.user === currentUserId,
      lines: people,
    };
  });
  return { cars, waiting };
};

/** What the viewer may do with one person line: cars they may move them to, and whether they may take them out. */
export const lineActions = ({ meetup, me, isManager, line }: { meetup: Meetup; me: string; isManager: boolean; line: PersonLine }) => {
  const { cars } = buildCars(meetup, me);
  const isRider = line.riderId === me;
  const allowed = (driverId: string) => isManager || isRider || (driverId === me && line.carId === null);
  const targets = cars
    .filter((c) => c.driverId !== line.carId && c.open > 0 && allowed(c.driverId))
    .map((c) => ({ driverId: c.driverId, open: c.open, name: firstName(meetup, c.driverId) }));
  const canRemove = line.carId !== null && (isManager || isRider || line.carId === me);
  return { targets, canRemove };
};

/** Joining a car with a rider who isn't in one yet: whether everyone fits, and how many guests come along. */
export const planJoin = (meetup: Meetup, riderId: string, driverId: string) => {
  const { cars, waiting } = buildCars(meetup, '');
  const car = cars.find((c) => c.driverId === driverId);
  const mine = waiting.filter((l) => l.riderId === riderId);
  const riderNeeds = mine.some((l) => !l.isGuest);
  const unplacedGuests = mine.filter((l) => l.isGuest).length;
  const room = car?.open ?? 0;
  const need = (riderNeeds ? 1 : 0) + unplacedGuests;
  return { fitsAll: room >= need, guests: Math.max(0, Math.min(unplacedGuests, room - (riderNeeds ? 1 : 0))) };
};

/** Request body that moves just this line's person (a rider, or one guest) to a car, or out (null). */
export const assignmentBodyFor = (line: PersonLine, driverId: string | null): RideAssignmentBody =>
  line.isGuest
    ? { riderId: line.riderId, driverId, rider: false, guests: 1, fromDriverId: line.carId }
    : { riderId: line.riderId, driverId, rider: true, guests: 0, fromDriverId: null };

export const canAutoAssign = (meetup: Meetup, isManager: boolean) => {
  if (!isManager) return false;
  const { cars, waiting } = buildCars(meetup, '');
  return waiting.length > 0 && cars.some((c) => c.open > 0);
};

/** Choices in the picker for one person line: each car they may go to, then "Take out of car". */
export const pickerOptionsFor = (args: { meetup: Meetup; me: string; isManager: boolean; line: PersonLine }) => {
  const { targets, canRemove } = lineActions(args);
  return [
    ...targets.map((t) => ({ key: `to:${t.driverId}`, label: `Ride with ${t.driverId === args.me ? 'you' : t.name} (${t.open} open)` })),
    ...(canRemove ? [{ key: 'remove', label: 'Take out of car' }] : []),
  ];
};

export type PickResult =
  | { kind: 'send'; body: RideAssignmentBody }
  | { kind: 'confirm'; title: string; message: string; body: RideAssignmentBody };

/**
 * What a picker choice does. A rider who isn't in a car brings their unplaced guests along; when
 * they don't all fit, ask first (Join anyway / Don't join). A guest line moves just that guest.
 */
export const resolvePick = ({ meetup, me, line, key }: { meetup: Meetup; me: string; line: PersonLine; key: string }): PickResult => {
  if (key === 'remove') return { kind: 'send', body: assignmentBodyFor(line, null) };
  const driverId = key.slice('to:'.length);
  if (line.isGuest || line.carId !== null) return { kind: 'send', body: assignmentBodyFor(line, driverId) };

  const plan = planJoin(meetup, line.riderId, driverId);
  const body: RideAssignmentBody = { riderId: line.riderId, driverId, rider: true, guests: plan.guests, fromDriverId: null };
  if (plan.fitsAll) return { kind: 'send', body };
  const mine = line.riderId === me;
  const driverName = driverId === me ? 'you' : firstName(meetup, driverId);
  const who = mine ? 'you and your guests' : `${firstName(meetup, line.riderId)} and their guests`;
  return {
    kind: 'confirm',
    title: 'Not enough space',
    message: `Not enough space for ${who} with ${driverName}. ${mine ? 'Your' : 'Their'} remaining guests will need to ride with another driver.`,
    body,
  };
};

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** Toast after auto-assign. */
export const autoAssignMessage = (placed: number, unplaced: number) => {
  const left = unplaced > 0 ? ` ${people(unplaced)} still ${unplaced === 1 ? 'needs' : 'need'} a ride.` : '';
  return placed > 0 ? `Placed ${people(placed)}.${left}` : `Nobody could be placed.${left}`;
};

/**
 * Notification wording before the meetup name, matching the push (backend utils/rideNotify.js):
 * "You are riding with Sam to", "2 guests of yours no longer have a ride to", "Ana is riding with you to".
 */
export const rideNoticeLead = (
  type: 'ride-assigned' | 'ride-removed',
  meta: { role?: 'rider' | 'driver'; otherName?: string; self?: boolean; guests?: number } = {},
) => {
  const other = meta.otherName || 'Someone';
  const guests = meta.guests ?? 0;
  const self = meta.self ?? guests === 0;
  const guestWord = (n: number) => `${n} guest${n === 1 ? '' : 's'}`;
  if (meta.role === 'driver') {
    const party = self ? (guests ? `${other} and ${guestWord(guests)}` : other) : `${guestWord(guests)} of ${other}`;
    const many = self ? guests > 0 : guests !== 1;
    return type === 'ride-assigned'
      ? `${party} ${many ? 'are' : 'is'} riding with you to`
      : `${party} ${many ? 'are' : 'is'} no longer riding with you to`;
  }
  const who = self ? (guests ? `You and ${guestWord(guests)}` : 'You') : `${guestWord(guests)} of yours`;
  const one = !self && guests === 1;
  return type === 'ride-assigned'
    ? `${who} ${one ? 'is' : 'are'} riding with ${other} to`
    : `${who} no longer ${one ? 'has' : 'have'} a ride to`;
};

export type { RideEntry };
