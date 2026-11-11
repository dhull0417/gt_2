import type { MutationCache, QueryClient } from '@tanstack/react-query';

// The actions that keep working with no connection. They are queued (paused by React Query),
// persisted to disk, and sent in order once the connection is back - see utils/offlineMutations.ts
// and utils/chatMutations.ts for their registered defaults, and hooks/useResumeQueuedMutations.ts
// for the resume. Every other mutation in the app sends immediately and fails offline.
export const QUEUED_KEYS = [
  'sendMessage',
  'rsvp',
  'acceptInvite',
  'declineInvite',
  'votePoll',
  'toggleReaction',
  'markGroupRead',
] as const;

export type QueuedKey = (typeof QUEUED_KEYS)[number];

export function isQueuedKey(key: unknown): key is QueuedKey {
  return typeof key === 'string' && (QUEUED_KEYS as readonly string[]).includes(key);
}

type AnyVars = object | string | undefined;
const field = (vars: AnyVars, name: string) =>
  vars && typeof vars === 'object' ? String((vars as Record<string, unknown>)[name] ?? '') : '';

/**
 * What a queued action changes. React Query runs mutations that share a scope one at a time, in
 * the order they were queued, so two messages to one chat or two RSVPs to one meetup can never
 * land out of order after reconnecting.
 */
export function scopeFor(key: QueuedKey, vars: AnyVars): string {
  switch (key) {
    case 'sendMessage': return `chat:${field(vars, 'groupId')}`;
    // An organizer's override is about someone else, so it gets its own lane per person.
    case 'rsvp': return `rsvp:${field(vars, 'meetupId')}${field(vars, 'targetUserId') ? `:${field(vars, 'targetUserId')}` : ''}`;
    case 'acceptInvite':
    case 'declineInvite': return `invite:${typeof vars === 'string' ? vars : ''}`;
    case 'votePoll': return `poll:${field(vars, 'pollId')}`;
    case 'toggleReaction': return `reaction:${field(vars, 'messageId')}`;
    case 'markGroupRead': return `read:${field(vars, 'groupId')}`;
  }
}

// For these only the latest intent matters (In -> Out -> In offline sends just "In").
// Messages and reactions are events, so every one of them is kept.
const LAST_WRITE_WINS: readonly QueuedKey[] = ['rsvp', 'votePoll', 'markGroupRead'];

/** Removes still-waiting (paused) mutations of `key` for the same scope. Returns how many. */
export function coalesceQueued(cache: MutationCache, key: QueuedKey, scopeId: string): number {
  let removed = 0;
  for (const m of cache.getAll()) {
    if (m.options.mutationKey?.[0] !== key || !m.state.isPaused) continue;
    if (scopeFor(key, m.state.variables as AnyVars) !== scopeId) continue;
    cache.remove(m);
    removed++;
  }
  return removed;
}

/**
 * The one way to start a queued action. `useMutation` can't give each call its own scope, so
 * queued actions are built here; screens read their pending/paused state with useMutationState.
 * Resolves with the server's answer (which can be much later, after reconnecting).
 */
export function queueMutation<TData = unknown>(client: QueryClient, key: QueuedKey, variables: AnyVars): Promise<TData> {
  const scopeId = scopeFor(key, variables);
  const cache = client.getMutationCache();
  if (LAST_WRITE_WINS.includes(key)) coalesceQueued(cache, key, scopeId);
  const mutation = cache.build(client, { mutationKey: [key], scope: { id: scopeId } });
  return mutation.execute(variables) as Promise<TData>;
}

/**
 * Sends queued work restored from disk. Two kinds come back after an app restart: ones paused
 * offline (resumePausedMutations picks those up) and ones that were mid-request when the app was
 * killed - those return as "pending" but not paused, so nothing would ever retry them and they'd
 * show "Sending..." forever. Messages (client_id), RSVPs, votes, invite replies and read marks are
 * safe to send twice; reactions are not (see below).
 * Only call this once a sign-in token can be fetched (see hooks/useResumeQueuedMutations.ts).
 */
export async function resumeQueued(client: QueryClient, { afterRestore = true }: { afterRestore?: boolean } = {}): Promise<void> {
  const cache = client.getMutationCache();
  // "Pending but not paused" means interrupted by an app kill only right after the cache was
  // loaded from disk. Later (on a reconnect) it means a request that is running right now.
  const stuck = !afterRestore ? [] : cache.getAll().filter(
    (m) => isQueuedKey(m.options.mutationKey?.[0]) && m.state.status === 'pending' && !m.state.isPaused,
  );
  // Except reactions: the server toggles, so if the killed request did land, sending it again
  // would undo it. Drop it and reload that chat so it shows whatever the server has.
  for (const m of stuck.filter((x) => x.options.mutationKey?.[0] === 'toggleReaction')) {
    cache.remove(m);
    const groupId = (m.state.variables as { groupId?: string } | undefined)?.groupId;
    if (groupId) client.invalidateQueries({ queryKey: ['messages', groupId] });
  }
  await Promise.all([
    ...stuck
      .filter((m) => m.options.mutationKey?.[0] !== 'toggleReaction')
      .map((m) => m.continue().catch(() => {})),
    client.resumePausedMutations(),
  ]);
}

const FAILED: Record<QueuedKey, string | null> = {
  sendMessage: null, // the bubble turns red with Retry / Discard
  markGroupRead: null, // invisible bookkeeping; the next open marks it again
  rsvp: "Couldn't send your RSVP",
  votePoll: "Couldn't send your vote",
  toggleReaction: "Couldn't save your reaction",
  acceptInvite: "Couldn't answer the invitation",
  declineInvite: "Couldn't answer the invitation",
};

/** The toast for a queued action the server finally refused (or that ran out of retries). */
export function queuedErrorMessage(key: QueuedKey, error: unknown): string | null {
  const base = FAILED[key];
  if (!base) return null;
  const reason = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  const text = typeof reason?.error === 'string' ? reason.error : typeof reason?.message === 'string' ? reason.message : '';
  return text ? `${base}: ${text}` : `${base}.`;
}

/** A queued request that couldn't get a sign-in token yet (Clerk still loading on a cold start). */
export class NoTokenError extends Error {
  constructor() {
    super('Not signed in yet');
    this.name = 'NoTokenError';
  }
}

/**
 * Retry rule for queued actions. React Query resumes paused work by itself the moment the
 * connection returns, which can be before sign-in has loaded; those attempts fail with
 * NoTokenError and keep retrying (about 30 seconds) instead of being thrown away. Real errors
 * get two quick retries.
 */
export function queuedRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof NoTokenError) return failureCount < 20;
  return failureCount < 2;
}

export function queuedRetryDelay(_attempt: number, error: unknown): number {
  return error instanceof NoTokenError ? 1500 : 1000;
}

/** Which list to reload after a queued action finally fails, so the screen shows the truth. */
export function queuedErrorRefreshKey(key: QueuedKey, vars: AnyVars): readonly unknown[] | null {
  switch (key) {
    case 'rsvp': return ['meetups'];
    case 'votePoll': return ['polls', field(vars, 'groupId')];
    case 'toggleReaction': return ['messages', field(vars, 'groupId')];
    case 'acceptInvite':
    case 'declineInvite': return ['notifications'];
    default: return null;
  }
}
