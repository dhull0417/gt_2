import type { DefaultOptions } from '@tanstack/react-query';

export const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Shared by app/_layout.tsx's QueryClient and the unit tests, so the tests exercise the real config.
export const QUERY_CLIENT_DEFAULT_OPTIONS: DefaultOptions = {
  queries: {
    // Avoids refetching on every tab-switch/nav-back focus
    staleTime: 5 * 60 * 1000,
    // Keeps cached data around as a useful offline fallback for days, not minutes
    gcTime: ONE_WEEK_MS,
  },
  mutations: {
    // Ordinary mutations send right away and fail offline (their onError alerts explain why).
    // Only the queued set (utils/queuedMutations.ts) opts back into 'online', which pauses
    // them until the connection is back; those are the ones persisted and replayed.
    networkMode: 'always',
  },
};
