import { DateTime } from 'luxon';

/**
 * Label for the sticky day bubble in group chat, based on the viewer's device timezone.
 * 0 days ago -> "Today", 1 -> "Yesterday", 2-7 -> weekday name, 8+ -> date
 * (year included only once the message is over a year old).
 */
export function getDayBucketLabel(isoDate: string, now: DateTime = DateTime.local()): string {
  const messageDay = DateTime.fromISO(isoDate).startOf('day');
  const today = now.startOf('day');
  const diffDays = today.diff(messageDay, 'days').days;

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays >= 2 && diffDays <= 7) return messageDay.toFormat('cccc');

  const overOneYearOld = today.diff(messageDay, 'years').years >= 1;
  return messageDay.toFormat(overOneYearOld ? 'LLL d, yyyy' : 'LLL d');
}

/** Stable per-day grouping key (device-local calendar day) used to bucket messages into sections. */
export function getDayBucketKey(isoDate: string): string {
  return DateTime.fromISO(isoDate).toFormat('yyyy-LL-dd');
}
