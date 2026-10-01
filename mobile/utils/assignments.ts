import type { Meetup, User } from '@/utils/api';

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
