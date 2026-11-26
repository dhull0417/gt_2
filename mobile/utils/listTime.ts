import { DateTime } from 'luxon';

/** Compact time for list rows: "now", "5m", "2h", "Yesterday", "Mon", "Oct 3", "Oct 3, 2025". */
export function formatListTime(iso: string | undefined | null, now: DateTime = DateTime.local()): string {
  if (!iso) return '';
  const t = DateTime.fromISO(iso);
  if (!t.isValid) return '';
  const diffMin = Math.floor(now.diff(t, 'minutes').minutes);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (now.hasSame(t, 'day')) return `${Math.floor(diffMin / 60)}h`;
  const days = Math.floor(now.startOf('day').diff(t.startOf('day'), 'days').days);
  if (days === 1) return 'Yesterday';
  if (days < 7) return t.toFormat('ccc');
  return t.toFormat(t.hasSame(now, 'year') ? 'LLL d' : 'LLL d, yyyy');
}

/** "1 spot" / "3 spots" - plural-aware copy helper. */
export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Relative time for sentences: "just now", "5m ago", "3h ago", "2d ago", else "Oct 3". */
export function formatAgo(iso: string | undefined | null, now: DateTime = DateTime.local()): string {
  if (!iso) return '';
  const t = DateTime.fromISO(iso);
  if (!t.isValid) return '';
  const min = Math.floor(now.diff(t, 'minutes').minutes);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return t.toFormat(t.hasSame(now, 'year') ? 'LLL d' : 'LLL d, yyyy');
}
