// Deciding what to do next when jumping to a message (from search or the pinned list):
// the thread only holds the newest pages, so older history is paged in until the message
// shows up, the start of the chat is reached, or the cap is hit.

export const JUMP_MAX_PAGES = 20; // 20 x 50 = the last 1,000 messages

export type JumpStep = 'found' | 'loadMore' | 'tooFar' | 'notFound';

export function nextJumpStep({
  messages,
  targetId,
  pagesLoaded,
  reachedStart,
  maxPages = JUMP_MAX_PAGES,
}: {
  messages: { id: string }[];
  targetId: string;
  pagesLoaded: number;
  reachedStart: boolean;
  maxPages?: number;
}): JumpStep {
  if (messages.some((m) => m.id === targetId)) return 'found';
  if (reachedStart) return 'notFound';
  if (pagesLoaded >= maxPages) return 'tooFar';
  return 'loadMore';
}

// The search screen sits on top of the chat; it leaves the jump here and goes back, and the chat
// picks it up when it regains focus (no reliance on how the router treats params on an existing screen).
let pending: { groupId: string; messageId: string } | null = null;

export function requestJump(groupId: string, messageId: string) {
  pending = { groupId, messageId };
}

export function takeJumpRequest(groupId: string): string | null {
  if (!pending || pending.groupId !== groupId) return null;
  const id = pending.messageId;
  pending = null;
  return id;
}
