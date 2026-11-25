import { TOURS } from '@/utils/screenTours';

// First run (spec: docs/specs/2026-11-25-first-run-intro-before-setup-design.md): a new account
// lands on Meetups and sees its tour, then account setup. app/_layout.tsx routes by this.

/** The tour a new account sees before account setup. */
export const INTRO_TOUR_KEY = TOURS.meetupsEmpty;
/** If the intro tour hasn't started this long after reaching the tabs, go to setup anyway. */
export const INTRO_FALLBACK_MS = 6000;

type State = {
  /** The server user exists (useUserSync creates it at sign-in). */
  hasUser: boolean;
  profileIncomplete: boolean;
  /** INTRO_TOUR_KEY is in seenTours. It's added when the tour starts, not when it ends. */
  seenIntro: boolean;
  introRunning: boolean;
  introEnded: boolean;
  fallbackElapsed: boolean;
};

// 'setup': account setup. 'intro': stay in the tabs for the tour. 'app': nothing to do.
export function decideFirstRun({ hasUser, profileIncomplete, seenIntro, introRunning, introEnded, fallbackElapsed }: State): 'setup' | 'intro' | 'app' {
  if (!hasUser) return 'setup';
  if (!profileIncomplete) return 'app';
  const introDone = introEnded || fallbackElapsed || (seenIntro && !introRunning);
  return introDone ? 'setup' : 'intro';
}
