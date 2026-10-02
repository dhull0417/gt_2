import { Meetup } from '@/utils/api';

/** A meetup stays "happening now" for this long after its start time before it's treated as past. */
export const MEETUP_ACTIVE_DURATION_MS = 60 * 60 * 1000;

export interface MeetupStatusFlags {
  isCancelled: boolean;
  /** True once the meetup's active window (start -> start + 1hr) has elapsed. */
  isPast: boolean;
  isExpired: boolean;
  /** True while now is within the meetup's start time and start time + 1hr. */
  isHappeningNow: boolean;
  isReadOnly: boolean;
}

export const getMeetupStatus = (meetup: Meetup, now: Date = new Date()): MeetupStatusFlags => {
  const start = new Date(meetup.date);
  const end = new Date(start.getTime() + MEETUP_ACTIVE_DURATION_MS);

  const isCancelled = meetup.status === 'cancelled';
  // Time-based, not server `status` — the backend only flips to 'expired' via a
  // periodic cron hit, so trusting that field here could end a meetup early
  // (or late) depending on when that job last ran.
  const isPast = now >= end;
  const isExpired = isPast;
  const isHappeningNow = !isCancelled && !isExpired && now >= start && now < end;
  const isReadOnly = isCancelled || isExpired;

  return { isCancelled, isPast, isExpired, isHappeningNow, isReadOnly };
};

// Grace for meetups with a minimum headcount: until the server has evaluated
// the minimum, the deadline isn't treated as passed, so users never see
// "RSVPs closed" and then a cancellation. Capped so a stalled check can't
// leave RSVPs looking open.
const MIN_CHECK_GRACE_MS = 5 * 60 * 1000;

export const isRsvpDeadlinePassed = (meetup: Meetup, now: Date = new Date()): boolean => {
  if (!meetup.rsvpCloseDate) return false;
  const closeMs = new Date(meetup.rsvpCloseDate).getTime();
  if (closeMs >= now.getTime()) return false;
  const awaitingMinimumCheck = (meetup.minAttendees ?? 0) > 0 && meetup.minimumChecked === false;
  if (awaitingMinimumCheck && now.getTime() - closeMs < MIN_CHECK_GRACE_MS) return false;
  return true;
};

// ─── Priority RSVP (Premium) ────────────────────────────────────────────────
// Mirrors backend/src/utils/priorityRsvp.js so the app shows the same lock state
// the server will enforce.

const idOf = (u: { _id: string } | string) => (typeof u === 'string' ? u : u._id);
const hasId = (list: ({ _id: string } | string)[] | undefined, id: string) => (list ?? []).some((x) => idOf(x) === id);

const tiersActive = (meetup: Meetup) =>
  (meetup.priorityTiers?.length ?? 0) > 0 && meetup.group?.isPremium !== false;

const tierIndexOf = (meetup: Meetup, userId: string) =>
  (meetup.priorityTiers ?? []).findIndex((t) => t.members.some((m) => m === userId));

const isTierComplete = (meetup: Meetup, k: number): boolean => {
  const tier = meetup.priorityTiers?.[k];
  if (!tier) return true;
  return tier.members.every((id) => {
    if (!hasId(meetup.members, id)) return true;
    return hasId(meetup.in, id) || hasId(meetup.out, id) || hasId(meetup.waitlist, id);
  });
};

// Open by its own time, or early once every earlier group has answered.
const isTierOpen = (meetup: Meetup, k: number, now: Date): boolean => {
  const tiers = meetup.priorityTiers ?? [];
  for (let i = k; i >= 0; i--) {
    if (now >= new Date(tiers[i].opensAt)) return true;
    if (i === 0 || !isTierComplete(meetup, i - 1)) return false;
  }
  return false;
};

// When RSVPs open for people outside every priority group. Without active priority
// (e.g. the owner's Premium lapsed) that's the first group's time, the series' own
// "earliest time to RSVP".
const everyoneOpensAt = (meetup: Meetup): string | undefined => {
  const tiers = meetup.priorityTiers ?? [];
  if (tiers.length > 0 && !tiersActive(meetup)) return tiers[0].opensAt;
  return meetup.rsvpOpenDate;
};

// Every group has opened and answered, so everyone else may RSVP early.
const allTiersAnswered = (meetup: Meetup, now: Date): boolean => {
  const tiers = meetup.priorityTiers ?? [];
  if (tiers.length === 0) return false;
  return isTierOpen(meetup, tiers.length - 1, now) && tiers.every((_, k) => isTierComplete(meetup, k));
};

/** True while this user can't RSVP yet (their priority group, or the general time, hasn't opened). */
export const isRsvpLockedFor = (meetup: Meetup, userId: string | undefined, now: Date = new Date()): boolean => {
  const open = everyoneOpensAt(meetup);
  if (!open || new Date(open) <= now) return false;
  if (!tiersActive(meetup)) return true;
  if (allTiersAnswered(meetup, now)) return false;
  if (!userId) return true;
  const k = tierIndexOf(meetup, userId);
  return k < 0 || !isTierOpen(meetup, k, now);
};

/** When RSVPs open for this user, as text: a date for everyone else, date + time for a priority group. */
export const describeRsvpOpensFor = (meetup: Meetup, userId: string | undefined): string => {
  const tierK = userId && tiersActive(meetup) ? tierIndexOf(meetup, userId) : -1;
  const when = new Date(tierK >= 0 ? meetup.priorityTiers![tierK].opensAt : everyoneOpensAt(meetup)!);
  const date = when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: meetup.timezone });
  // Priority groups open at specific times; so can everyone else (a head-start series).
  if (tierK < 0 && !tiersActive(meetup)) return date;
  const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: meetup.timezone });
  return `${date} at ${time}`;
};

/** Which priority group (1-based) this user is in for the meetup, or null. */
export const priorityGroupNumber = (meetup: Meetup, userId: string | undefined): number | null => {
  if (!userId || !tiersActive(meetup)) return null;
  const k = tierIndexOf(meetup, userId);
  return k >= 0 ? k + 1 : null;
};

/**
 * True when the meetup is full and tapping In would bump a lower-priority
 * person out to make room for this user (mirrors the server's victim rule:
 * someone In from a strictly lower group, unlisted members counting lowest).
 */
export const canPriorityBump = (meetup: Meetup, userId: string | undefined): boolean => {
  if (!userId || !tiersActive(meetup)) return false;
  if (!(meetup.capacity > 0 && meetup.in.length >= meetup.capacity)) return false;
  if (hasId(meetup.in, userId) || hasId(meetup.waitlist, userId)) return false;
  const k = tierIndexOf(meetup, userId);
  if (k < 0) return false;
  return meetup.in.some((u) => {
    const id = idOf(u);
    if (id === userId) return false;
    const j = tierIndexOf(meetup, id);
    return j < 0 || j > k;
  });
};
