// The chat stays hidden behind its loader until the group, your profile and the first page of
// messages have all arrived. If one never does (a failed request, a group that won't load), the
// screen used to stay blank forever; after the limit it shows an error with Retry instead.

export const CHAT_LOAD_LIMIT_MS = 8000;

export type ChatMissing = 'group' | 'your profile' | 'messages';

export function chatLoadState({
  hasGroup,
  hasUser,
  messagesReady,
  messagesPaused = false,
  elapsedMs,
  limitMs = CHAT_LOAD_LIMIT_MS,
}: {
  hasGroup: boolean;
  hasUser: boolean;
  messagesReady: boolean;
  /** The messages request is waiting for a connection (offline). */
  messagesPaused?: boolean;
  elapsedMs: number;
  limitMs?: number;
}): { state: 'loading' | 'ready' | 'failed' | 'offline'; missing: ChatMissing[] } {
  const missing: ChatMissing[] = [];
  if (!hasGroup) missing.push('group');
  if (!hasUser) missing.push('your profile');
  if (!messagesReady) missing.push('messages');
  if (missing.length === 0) return { state: 'ready', missing };
  // Offline with no saved messages: no point making them wait 8 seconds to be told.
  if (!messagesReady && messagesPaused) return { state: 'offline', missing };
  return { state: elapsedMs >= limitMs ? 'failed' : 'loading', missing };
}
