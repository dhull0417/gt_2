// Chat timeouts: owners/moderators stop someone from chatting in one group for a while.
// Mongo (Group.chatTimeouts) is the source of truth; Supabase public.chat_timeouts holds a copy the
// database checks. Spec: docs/specs/2026-11-16-chat-moderation-design.md

export const TIMEOUT_DURATIONS = Object.freeze({
  '5m': { minutes: 5, label: '5 minutes' },
  '15m': { minutes: 15, label: '15 minutes' },
  '30m': { minutes: 30, label: '30 minutes' },
  '1h': { minutes: 60, label: '1 hour' },
  '2h': { minutes: 120, label: '2 hours' },
  '12h': { minutes: 720, label: '12 hours' },
  '1d': { minutes: 1440, label: '1 day' },
  '1w': { minutes: 10080, label: '1 week' },
  indefinite: { minutes: null, label: null },
});

const durationOf = (key) => {
  if (typeof key !== 'string' || !Object.hasOwn(TIMEOUT_DURATIONS, key)) {
    throw new RangeError(`Unknown timeout duration: ${key}`);
  }
  return TIMEOUT_DURATIONS[key];
};

export const isTimeoutDuration = (key) => typeof key === 'string' && Object.hasOwn(TIMEOUT_DURATIONS, key);

/** When a timeout of `key` starting at `now` ends; null = indefinite. */
export const timeoutUntil = (key, now = new Date()) => {
  const { minutes } = durationOf(key);
  return minutes == null ? null : new Date(now.getTime() + minutes * 60_000);
};

const isActive = (entry, now) => entry && (entry.until == null || new Date(entry.until).getTime() > now.getTime());

/** The still-running timeout for `userId` in `entries`, or null. */
export const activeTimeout = (entries, userId, now = new Date()) => {
  const entry = (entries || []).find((e) => String(e.user) === String(userId));
  return isActive(entry, now) ? { until: entry.until ?? null } : null;
};

/** Entries that are still running (indefinite or ending after `now`). */
export const pruneExpired = (entries, now = new Date()) => (entries || []).filter((e) => isActive(e, now));

export const timeoutPushBody = (key) => {
  const { label } = durationOf(key);
  return label
    ? `You've been timed out of the chat for ${label}.`
    : "You've been timed out of the chat until a moderator lifts it.";
};
