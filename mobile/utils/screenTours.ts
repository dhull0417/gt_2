import type { User } from '@/utils/api';

// First-visit screen tours. A tour plays until its key is in user.seenTours on the server
// (PATCH /api/users/tours/:key), so it follows the person across devices and reinstalls.
// Users from before tours have no seenTours at all, so they see each tour once too.
// Keys must be short lowercase slugs (the server refuses anything else). To replay a tour
// after redesigning its screen, bump the key: 'group-details' -> 'group-details-v2'.
export const TOURS = {
  groupDetails: 'group-details',
  meetupsEmpty: 'meetups-empty',
  groupsEmpty: 'groups-empty',
} as const;

// TESTING ONLY: tours listed here show every time their screen is opened, ignoring seenTours.
// Empty this list before a release. Tours not listed show once per person.
export const TOURS_ALWAYS_SHOW: readonly string[] = [];
export const alwaysShows = (key: string) => TOURS_ALWAYS_SHOW.includes(key);

export type TourKey = (typeof TOURS)[keyof typeof TOURS];

// A user who hasn't loaded yet counts as having seen it, so a tour never starts early.
export function hasSeenTour(user: Pick<User, 'seenTours'> | undefined | null, key: string): boolean {
  if (!user) return true;
  return (user.seenTours ?? []).includes(key);
}

export function withTourSeen<T extends Pick<User, 'seenTours'>>(user: T | undefined, key: string): T | undefined {
  if (!user) return user;
  const seen = user.seenTours ?? [];
  return seen.includes(key) ? user : { ...user, seenTours: [...seen, key] };
}
