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
