import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApiClient, userApi, type User } from '@/utils/api';
import { hasSeenTour, withTourSeen } from '@/utils/screenTours';

// Long enough for the screen to finish its slide-in and lay out, so the highlight lands in the right place.
export const TOUR_START_DELAY_MS = 600;

type Options = {
  key: string;
  user: Pick<User, 'seenTours'> | undefined;
  /** False when the screen has nothing to show (e.g. a DM has no tiles). */
  enabled: boolean;
  start: () => void;
};

// Starts a screen's first-visit tour once, the first time the screen is focused, unless the
// person has already finished or skipped it (see utils/screenTours.ts). Call markSeen when the
// tour stops; finishing and skipping both count.
export function useScreenTour({ key, user, enabled, start }: Options) {
  const queryClient = useQueryClient();
  const api = useApiClient();
  const started = useRef(false);
  const seen = hasSeenTour(user, key);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || seen || started.current) return;
      const t = setTimeout(() => {
        started.current = true;
        start();
      }, TOUR_START_DELAY_MS);
      return () => clearTimeout(t);
    }, [enabled, seen, start]),
  );

  const markSeen = useCallback(() => {
    // Update the cached user first so the tour can't restart, even if the request fails or the
    // person is offline. If it never reaches the server, the tour shows once more on a later visit.
    queryClient.setQueryData<User>(['currentUser'], (old) => withTourSeen(old, key));
    userApi.markTourSeen(api, key).catch((e) => console.warn('Saving tour as seen failed:', e?.message || e));
  }, [api, key, queryClient]);

  return { markSeen };
}
