import { decideFirstRun, INTRO_TOUR_KEY, INTRO_FALLBACK_MS } from '../firstRun';
import { TOURS } from '../screenTours';

const base = { hasUser: true, profileIncomplete: true, seenIntro: false, introRunning: false, introEnded: false, fallbackElapsed: false };

describe('where a signed-in person belongs on first run', () => {
  it('a brand-new account waits in the tabs for the Meetups tour', () => {
    expect(decideFirstRun(base)).toBe('intro');
  });
  it('stays in the tour while it runs, even though starting it already marked it seen', () => {
    expect(decideFirstRun({ ...base, seenIntro: true, introRunning: true })).toBe('intro');
  });
  it('goes to account setup once the tour ends (finished or skipped)', () => {
    expect(decideFirstRun({ ...base, seenIntro: true, introEnded: true })).toBe('setup');
  });
  it('goes straight to setup when the tour was already seen (another device, or reopened mid-setup)', () => {
    expect(decideFirstRun({ ...base, seenIntro: true })).toBe('setup');
  });
  it('goes to setup if the tour never started in time (offline, error, already has meetups)', () => {
    expect(decideFirstRun({ ...base, fallbackElapsed: true })).toBe('setup');
  });
  it('goes to setup when there is no server user yet (its Save creates one)', () => {
    expect(decideFirstRun({ ...base, hasUser: false })).toBe('setup');
  });
  it('a complete profile is just the app', () => {
    expect(decideFirstRun({ ...base, profileIncomplete: false })).toBe('app');
    expect(decideFirstRun({ ...base, profileIncomplete: false, introRunning: true })).toBe('app');
  });
});

it('the intro is the Meetups tour, with a 6-second fallback', () => {
  expect(INTRO_TOUR_KEY).toBe(TOURS.meetupsEmpty);
  expect(INTRO_FALLBACK_MS).toBe(6000);
});
