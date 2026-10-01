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
