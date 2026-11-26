// What's saved to the phone for offline use (app/_layout.tsx's persister). Saving everything made
// every write re-serialize every chat's history, link previews, stats and more, and on Android a
// blob over AsyncStorage's 6 MB limit fails silently, leaving NO offline data at all.

// Enough for every screen to open offline. Anything else just reloads when online.
const PERSISTED_ROOTS = new Set(['currentUser', 'groups', 'meetups', 'notifications', 'groupDetails', 'polls', 'pins', 'messages']);

/** Newest messages kept per chat on disk (one page; older history reloads when online). */
export const PERSISTED_MESSAGES = 50;

export function shouldPersistQuery(query: { queryKey: readonly unknown[]; state: { status: string } }): boolean {
  return query.state.status === 'success' && PERSISTED_ROOTS.has(String(query.queryKey[0]));
}

/** Shrinks a query's data on its way to disk. Chat threads are stored oldest-first. */
export function trimForPersist(queryKey: readonly unknown[], data: unknown): unknown {
  if (queryKey[0] === 'messages' && Array.isArray(data) && data.length > PERSISTED_MESSAGES) {
    return data.slice(-PERSISTED_MESSAGES);
  }
  return data;
}
