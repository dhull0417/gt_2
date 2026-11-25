import { useCallback, useEffect, useRef, useState } from 'react';
import { INTRO_FALLBACK_MS, INTRO_TOUR_KEY } from '@/utils/firstRun';

type IntroState = { userId?: string; running: boolean; ended: boolean; fallback: boolean };
const fresh = (userId?: string): IntroState => ({ userId, running: false, ended: false, fallback: false });

// Tracks the first-run intro (the Meetups tour) for app/_layout.tsx: whether it's running or has
// ended this session, and a fallback that fires if it hasn't started within INTRO_FALLBACK_MS of
// reaching the tabs with an incomplete profile (offline, an error, or meetups already there), so
// account setup still opens. Starts over when a different account signs in.
export function useFirstRunIntro({ userId, profileIncomplete, inTabs }: {
  userId?: string;
  profileIncomplete: boolean;
  inTabs: boolean;
}) {
  const [stored, setStored] = useState<IntroState>(() => fresh(userId));
  const state = stored.userId === userId ? stored : fresh(userId);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const update = useCallback((patch: Partial<IntroState>) => {
    setStored((prev) => {
      const uid = userIdRef.current;
      return { ...(prev.userId === uid ? prev : fresh(uid)), ...patch };
    });
  }, []);

  const waiting = !!userId && profileIncomplete && inTabs && !state.running && !state.ended && !state.fallback;
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => update({ fallback: true }), INTRO_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [waiting, update]);

  const onTourEvent = useCallback((key: string, event: 'started' | 'ended') => {
    if (key !== INTRO_TOUR_KEY) return;
    update(event === 'started' ? { running: true } : { running: false, ended: true });
  }, [update]);

  return { introRunning: state.running, introEnded: state.ended, fallbackElapsed: state.fallback, onTourEvent };
}
