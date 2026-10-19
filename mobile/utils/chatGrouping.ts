import type { ChatMessage } from '@/types/chat';

// Consecutive messages from the same person close together read as one cluster, like
// GroupMe/iMessage: the name shows once at the top, spacing tightens, and only the last
// bubble carries the timestamp and the "tail" corner.

export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface BubbleGrouping {
  isFirst: boolean;
  isLast: boolean;
}

const time = (m: ChatMessage) => Date.parse(m.created_at) || 0;

const continues = (prev: ChatMessage, cur: ChatMessage) =>
  prev.kind !== 'system' &&
  cur.kind !== 'system' &&
  prev.sender_id === cur.sender_id &&
  Math.abs(time(cur) - time(prev)) <= GROUP_WINDOW_MS;

/**
 * Cluster info for one run of messages (pass one day's section at a time so a new day always
 * starts a new cluster). Keyed by message id. System lines never join a cluster.
 */
export function computeGrouping(messages: ChatMessage[]): Map<string, BubbleGrouping> {
  const out = new Map<string, BubbleGrouping>();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const prev = messages[i - 1];
    const next = messages[i + 1];
    out.set(m.id, {
      isFirst: !prev || !continues(prev, m),
      isLast: !next || !continues(m, next),
    });
  }
  return out;
}
