import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApiClient, userApi, type User } from '@/utils/api';
import { hasSeenTour, withTourSeen, alwaysShows } from '@/utils/screenTours';
import { useTourGate } from '@/contexts/TourGateContext';

// Long enough for the screen to finish its slide-in and lay out, so the highlight lands in the right place.
export const TOUR_START_DELAY_MS = 600;

type Options = {
  key: string;
  user: Pick<User, 'seenTours'> | undefined;
  /** False when the screen has nothing to show (e.g. a DM has no tiles). */
  enabled: boolean;
  start: () => void;
  /** Show on every visit, seen or not (testing). Defaults to whether TOURS_ALWAYS_SHOW lists the key. */
  alwaysShow?: boolean;
};

// Starts a screen's first-visit tour the first time the screen is focused (and enabled), unless
// the person has already seen it (see utils/screenTours.ts). It's recorded as seen the moment it
// starts, so it shows once per person whether they finish it, skip it or close the app.
export function useScreenTour({ key, user, enabled, start, alwaysShow = alwaysShows(key) }: Options) {
  const queryClient = useQueryClient();
  const api = useApiClient();
  const started = useRef(false);
  // Wait while the welcome video or the name prompt is up; start once it closes.
  const { blocked } = useTourGate();
  const ready = enabled && !blocked;
  // Even when always showing, wait for the user to load (hasSeenTour treats a missing user as seen).
  const seen = alwaysShow ? !user : hasSeenTour(user, key);

  const markSeen = useCallback(() => {
    // Update the cached user first so the tour can't restart, even if the request fails or the
    // person is offline. If it never reaches the server, the tour shows once more on a later visit.
    queryClient.setQueryData<User>(['currentUser'], (old) => withTourSeen(old, key));
    userApi.markTourSeen(api, key).catch((e) => console.warn('Saving tour as seen failed:', e?.message || e));
  }, [api, key, queryClient]);

  useFocusEffect(
    useCallback(() => {
      if (!ready || seen || started.current) return;
      const t = setTimeout(() => {
        started.current = true;
        start();
        // Seen from the moment it starts: closing the app mid-tour doesn't bring it back.
        markSeen();
      }, TOUR_START_DELAY_MS);
      return () => {
        clearTimeout(t);
        // Leaving the screen: in always-show mode the tour plays again on the next visit.
        if (alwaysShow) started.current = false;
      };
    }, [ready, seen, start, alwaysShow, markSeen]),
  );

  return { markSeen };
}
