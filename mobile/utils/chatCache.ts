import type { ChatMessage, ReactionResult } from '@/types/chat';

// Pure helpers for keeping the ['messages', groupId] cache correct when the same
// message can reach it from several places: the fetch, the realtime INSERT event,
// and the send result. Everything here merges by id and never replaces the list
// wholesale, so a stale response can't wipe out newer data.

const time = (m: ChatMessage) => Date.parse(m.created_at) || 0;

// Array.prototype.sort is stable, so messages with equal timestamps keep arrival order.
const sortByTime = (list: ChatMessage[]) => [...list].sort((a, b) => time(a) - time(b));

/** Insert or update one server message (realtime event or send result). Never duplicates an id; keeps time order. */
export function upsertMessage(prev: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const i = prev.findIndex((m) => m.id === incoming.id);
  if (i !== -1) {
    const next = prev.slice();
    next[i] = { ...prev[i], ...incoming };
    return next;
  }
  const last = prev[prev.length - 1];
  if (!last || time(incoming) >= time(last)) return [...prev, incoming];
  return sortByTime([...prev, incoming]);
}

/**
 * Merge the newest page from the server into the cached thread.
 * - Keeps anything newer than the page (a realtime message that landed while the request was in flight).
 * - Server fields win for messages in both, so missed edits/reactions/deletes are picked up.
 * - If a full page shares nothing with the cache, more than a page of messages arrived since the last
 *   sync; the older cached rows are dropped so the thread never shows a silent hole in the middle.
 */
export function mergeLatestPage(
  prev: ChatMessage[] | undefined,
  page: ChatMessage[],
  pageSize: number
): ChatMessage[] {
  if (!prev || prev.length === 0) return page;
  if (page.length === 0) return prev;

  const pageIds = new Set(page.map((m) => m.id));
  const overlaps = prev.some((m) => pageIds.has(m.id));

  let base = prev;
  if (page.length >= pageSize && !overlaps) {
    const newestInPage = Math.max(...page.map(time));
    base = prev.filter((m) => time(m) > newestInPage);
  }

  const byId = new Map(base.map((m) => [m.id, m] as const));
  for (const m of page) byId.set(m.id, { ...byId.get(m.id), ...m });
  return sortByTime([...byId.values()]);
}

/**
 * Prepend an older page (scrolling back through history). Rows already in the cache win on
 * conflict so a fresher realtime copy (new reactions, an edit) isn't replaced by the older fetch.
 */
export function mergeOlderPage(prev: ChatMessage[] | undefined, older: ChatMessage[]): ChatMessage[] {
  if (!prev || prev.length === 0) return older;
  if (older.length === 0) return prev;
  const byId = new Map(older.map((m) => [m.id, m] as const));
  for (const m of prev) byId.set(m.id, m);
  return sortByTime([...byId.values()]);
}

/**
 * My reaction tap applied to the thread: add, change (one reaction per person) or remove.
 * Returns the new list (untouched messages keep their identity) and what happened, for the push.
 */
export function applyReactionToggle(
  messages: ChatMessage[],
  messageId: string,
  emoji: string,
  userId: string,
): { messages: ChatMessage[]; result: ReactionResult } {
  const target = messages.find((m) => m.id === messageId);
  const existing = target?.reactions ?? {};
  let previousEmoji: string | undefined;
  for (const [e, users] of Object.entries(existing)) {
    if (users.includes(userId)) { previousEmoji = e; break; }
  }
  const next: Record<string, string[]> = { ...existing };
  if (previousEmoji) {
    const left = (next[previousEmoji] ?? []).filter((id) => id !== userId);
    if (left.length === 0) delete next[previousEmoji];
    else next[previousEmoji] = left;
  }
  let action: ReactionResult['action'];
  if (previousEmoji === emoji) {
    action = 'removed';
  } else {
    action = previousEmoji ? 'changed' : 'added';
    next[emoji] = [...(next[emoji] ?? []), userId];
  }
  return {
    messages: messages.map((m) => (m.id === messageId ? { ...m, reactions: next } : m)),
    result: {
      action,
      emoji: action === 'removed' ? previousEmoji! : emoji,
      previousEmoji: action === 'changed' ? previousEmoji : undefined,
      messageId,
      senderId: target?.sender_id ?? '',
      senderName: target?.sender_name ?? '',
    },
  };
}

/**
 * Takes back just my change (when the server refuses it), leaving any reactions from other people
 * that arrived in the meantime. Restoring a whole earlier snapshot would wipe those out.
 */
export function undoReactionToggle(messages: ChatMessage[], result: ReactionResult, userId: string): ChatMessage[] {
  const emojiToTap = result.action === 'changed' ? result.previousEmoji! : result.emoji;
  return applyReactionToggle(messages, result.messageId, emojiToTap, userId).messages;
}
