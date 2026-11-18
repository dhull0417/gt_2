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

// Where a message sits in the day-grouped chat list, looked up fresh by id. Never reuse an old
// position: an older page added above shifts every row, so stale indexes point at the wrong message.
export function findMessageLocation(
  sections: { data: { id: string }[] }[],
  messageId: string,
): { sectionIndex: number; itemIndex: number } | null {
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const itemIndex = sections[sectionIndex].data.findIndex((m) => m.id === messageId);
    if (itemIndex >= 0) return { sectionIndex, itemIndex };
  }
  return null;
}

// Scrolling near the top pages in older history, except while a jump is scrolling to its message:
// the jump target sits in the oldest loaded page, so the jump's own scroll passes the top threshold,
// and a page added above mid-scroll knocks it onto other messages.
export const LOAD_OLDER_THRESHOLD = 400;

export function shouldLoadOlderOnScroll({
  offsetY,
  contentReady,
  jumping,
}: {
  offsetY: number;
  contentReady: boolean;
  jumping: boolean;
}): boolean {
  return !jumping && contentReady && offsetY < LOAD_OLDER_THRESHOLD;
}
