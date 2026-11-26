// Chat timeouts (owners/moderators stop someone chatting in one group for a while).
// Spec: docs/specs/2026-11-16-chat-moderation-design.md. The backend checks permissions too;
// these helpers only decide what the app shows.

export type TimeoutKey = '5m' | '15m' | '30m' | '1h' | '2h' | '12h' | '1d' | '1w' | 'indefinite';

export interface ChatTimeoutInfo {
  /** ISO time it ends; null = until a moderator lifts it. */
  until: string | null;
}

export const TIMEOUT_OPTIONS: readonly { key: TimeoutKey; label: string }[] = [
  { key: '5m', label: '5 minutes' },
  { key: '15m', label: '15 minutes' },
  { key: '30m', label: '30 minutes' },
  { key: '1h', label: '1 hour' },
  { key: '2h', label: '2 hours' },
  { key: '12h', label: '12 hours' },
  { key: '1d', label: '1 day' },
  { key: '1w', label: '1 week' },
  { key: 'indefinite', label: 'Indefinitely' },
];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function isTimeoutActive(t: ChatTimeoutInfo | null | undefined, now: number): boolean {
  if (!t) return false;
  if (t.until == null) return true;
  return Date.parse(t.until) > now;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "You are timed out for 3 days" — only the largest unit; "You are timed out Indefinitely". */
export function formatTimeoutRemaining(until: string | null, now: number): string {
  if (until == null) return 'You are timed out Indefinitely';
  const left = Math.max(0, Date.parse(until) - now);
  if (left >= DAY) return `You are timed out for ${plural(Math.floor(left / DAY), 'day')}`;
  if (left >= HOUR) return `You are timed out for ${plural(Math.floor(left / HOUR), 'hour')}`;
  const minutes = Math.min(59, Math.max(1, Math.ceil(left / MINUTE)));
  return `You are timed out for ${plural(minutes, 'minute')}`;
}

const dayKey = (d: Date, timeZone?: string) =>
  d.toLocaleDateString('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });

/** For moderators' member list: "until 3:15 PM" (today), "until Tue 3:15 PM" (this week), "until Nov 30". */
export function formatTimeoutEnd(until: string | null, now: Date, timeZone?: string): string {
  if (until == null) return 'Indefinitely';
  const end = new Date(until);
  const time = end.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  if (dayKey(end, timeZone) === dayKey(now, timeZone)) return `until ${time}`;
  if (end.getTime() - now.getTime() < 6 * DAY) {
    const weekday = end.toLocaleDateString('en-US', { timeZone, weekday: 'short' });
    return `until ${weekday} ${time}`;
  }
  return `until ${end.toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric' })}`;
}

/** The database refuses chat actions from a timed-out person with exactly this message. */
export function isTimedOutError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { message?: unknown }).message === 'timed out';
}

type IdLike = string | { _id: string } | null | undefined;
const idOf = (v: IdLike) => (v && typeof v === 'object' ? v._id : v) ?? undefined;

/** Mirrors the backend rule: owner → anyone else; moderator → regular members only; never self; never in DMs. */
export function canTimeOut(
  meId: string | undefined,
  targetId: string | undefined,
  group: { owner: IdLike; moderators?: IdLike[]; isDM?: boolean } | null | undefined,
): boolean {
  if (!meId || !targetId || !group || group.isDM || meId === targetId) return false;
  const ownerId = idOf(group.owner);
  const modIds = (group.moderators ?? []).map(idOf);
  if (meId === ownerId) return true;
  if (!modIds.includes(meId)) return false;
  return targetId !== ownerId && !modIds.includes(targetId);
}

/**
 * Whether I may delete someone else's message as owner/moderator. Mirrors the backend rule: owner →
 * anyone's; moderator → regular members' only. senderId undefined = the sender is no longer in the
 * group, which counts as a regular member.
 */
export function canModDeleteFrom(
  meId: string | undefined,
  senderId: string | undefined,
  group: { owner: IdLike; moderators?: IdLike[]; isDM?: boolean } | null | undefined,
): boolean {
  if (!meId || !group || group.isDM) return false;
  const ownerId = idOf(group.owner);
  const modIds = (group.moderators ?? []).map(idOf);
  if (meId === ownerId) return true;
  if (!modIds.includes(meId)) return false;
  return !senderId || (senderId !== ownerId && !modIds.includes(senderId));
}

/** "for 1 hour" / "until a moderator lifts it", for the Notifications screen entry. */
export function timeoutNoticeLength(duration: string | undefined): string {
  if (duration === 'indefinite') return 'until a moderator lifts it';
  const opt = TIMEOUT_OPTIONS.find((o) => o.key === duration);
  return opt ? `for ${opt.label}` : 'for a while';
}
