import type { Meetup, User } from '@/utils/api';
import { buildCars } from '@/utils/rides';

const idOf = (u: User | string) => (typeof u === 'string' ? u : u._id);

export const hasAssignments = (meetup: Meetup): boolean =>
  (meetup.bringItems?.length ?? 0) > 0 || !!meetup.ridesEnabled;

/** Assignments only apply while the group's owner has Premium (absent = unknown, treat as on). */
export const assignmentsActive = (meetup: Meetup): boolean =>
  meetup.group?.isPremium !== false && hasAssignments(meetup);

export const memberName = (meetup: Meetup, userId: string): string => {
  const m = meetup.members.find((x) => x._id === userId);
  return m?.firstName?.trim() || 'Someone';
};

export interface ItemSummary {
  _id: string;
  name: string;
  max: number | null;
  /** user ids who are bringing it */
  claimedBy: string[];
  isFull: boolean;
}

export interface AssignmentSummary {
  items: ItemSummary[];
  drivers: { userId: string; seats: number }[];
  passengers: string[];
  seatsAvailable: number;
  seatsNeeded: number;
  /** positive = spare seats, negative = seats still needed */
  seatBalance: number;
}

/** Only people still "in" count: claims/rides of anyone else are ignored. */
export const summarizeAssignments = (meetup: Meetup): AssignmentSummary => {
  const inIds = new Set((meetup.in ?? []).map(idOf));
  const claims = (meetup.bringClaims ?? []).filter((c) => inIds.has(c.user));

  const items = (meetup.bringItems ?? []).map<ItemSummary>((item) => {
    const claimedBy = claims.filter((c) => c.item === item._id).map((c) => c.user);
    const max = item.max ?? null;
    return { _id: item._id, name: item.name, max, claimedBy, isFull: max !== null && claimedBy.length >= max };
  });

  const rides = (meetup.rides ?? []).filter((r) => inIds.has(r.user));
  const drivers = rides.filter((r) => r.role === 'driver').map((r) => ({ userId: r.user, seats: r.seats }));
  const passengers = rides.filter((r) => r.role === 'passenger').map((r) => r.user);

  // A passenger's guests need seats too. Guests are keyed by the member's clerkId.
  const guestsByClerk = new Map((meetup.guests ?? []).map((g) => [g.userId, g.count]));
  const seatsNeeded = passengers.reduce((sum, uid) => {
    const clerkId = meetup.members.find((m) => m._id === uid)?.clerkId;
    return sum + 1 + (clerkId ? guestsByClerk.get(clerkId) ?? 0 : 0);
  }, 0);
  const seatsAvailable = drivers.reduce((sum, d) => sum + d.seats, 0);

  return { items, drivers, passengers, seatsAvailable, seatsNeeded, seatBalance: seatsAvailable - seatsNeeded };
};

export type RideRole = 'driver' | 'passenger';

/** Tapping the role that's already selected unselects it. */
export const nextRole = (current: RideRole | null, tapped: RideRole): RideRole | null =>
  current === tapped ? null : tapped;

/** The `ride` part of a setAssignments body; null removes the ride. */
export const rideBody = (role: RideRole | null, seats: number): { role: 'driver'; seats: number } | { role: 'passenger' } | null =>
  role === 'driver' ? { role: 'driver', seats } : role === 'passenger' ? { role: 'passenger' } : null;

/** Whether this user may open their own assignments sheet: they're In on a live meetup with assignments on. */
export const canEditOwnAssignments = (meetup: Meetup, userId: string, readOnly: boolean): boolean =>
  !readOnly && assignmentsActive(meetup) && (meetup.in ?? []).some((u) => idOf(u as any) === userId);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export type CardLine = { icon: 'truck' | 'shopping-bag' | 'clipboard'; text: string };

/**
 * The assignments glance on the meetup card. Until you've picked anything (while In), one line
 * with the group overview; after that, only your own choices: your ride on one line and what
 * you're bringing on the next. [] = show nothing.
 */
export const cardAssignmentLines = (meetup: Meetup, userId: string): CardLine[] => {
  if (!assignmentsActive(meetup)) return [];
  const summary = summarizeAssignments(meetup);
  const myItems = summary.items.filter((i) => i.claimedBy.includes(userId)).map((i) => i.name);
  const driving = summary.drivers.some((d) => d.userId === userId);
  const riding = summary.passengers.includes(userId);

  if (myItems.length > 0 || driving || riding) {
    const lines: CardLine[] = [];
    const { cars } = buildCars(meetup, userId);
    if (driving) {
      const n = cars.find((c) => c.driverId === userId)?.lines.length ?? 0;
      lines.push({ icon: 'truck', text: `Driving (${n === 0 ? 'Select riders' : plural(n, 'rider', 'riders')})` });
    } else if (riding) {
      const car = cars.find((c) => c.lines.some((l) => l.riderId === userId && !l.isGuest));
      lines.push({ icon: 'truck', text: car ? `Riding with ${car.name}` : 'Needs ride' });
    }
    if (myItems.length > 0) lines.push({ icon: 'shopping-bag', text: myItems.join(', ') });
    return lines;
  }

  const parts: string[] = [];
  if (summary.drivers.length + summary.passengers.length > 0) {
    const b = summary.seatBalance;
    parts.push(b >= 0 ? `${plural(b, 'seat', 'seats')} open` : `${plural(-b, 'seat', 'seats')} needed`);
  }
  const openItems = summary.items.filter((i) => i.max !== null && !i.isFull).length;
  if (openItems > 0) parts.push(`${plural(openItems, 'item', 'items')} needed`);
  return parts.length ? [{ icon: 'clipboard', text: parts.join(' · ') }] : [];
};
