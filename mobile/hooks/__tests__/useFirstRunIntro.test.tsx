import { renderHook, act } from '@testing-library/react-native';
import { useFirstRunIntro } from '../useFirstRunIntro';
import { INTRO_FALLBACK_MS, INTRO_TOUR_KEY } from '@/utils/firstRun';

jest.mock('expo-video', () => ({ useVideoPlayer: () => ({}), VideoView: () => null }));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

type P = { userId?: string; profileIncomplete: boolean; inTabs: boolean };
const mount = (initial: P) => renderHook((p: P) => useFirstRunIntro(p), { initialProps: initial });

it('goes to setup after the fallback time if the tour never starts', async () => {
  const h = await mount({ userId: 'u1', profileIncomplete: true, inTabs: true });
  await act(async () => { jest.advanceTimersByTime(INTRO_FALLBACK_MS - 1); });
  expect(h.result.current.fallbackElapsed).toBe(false);
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(h.result.current.fallbackElapsed).toBe(true);
});

it('a tour that starts in time cancels the fallback, and its end is recorded', async () => {
  const h = await mount({ userId: 'u1', profileIncomplete: true, inTabs: true });
  await act(async () => { jest.advanceTimersByTime(1000); h.result.current.onTourEvent(INTRO_TOUR_KEY, 'started'); });
  expect(h.result.current.introRunning).toBe(true);
  await act(async () => { jest.advanceTimersByTime(INTRO_FALLBACK_MS * 2); });
  expect(h.result.current.fallbackElapsed).toBe(false);
  await act(async () => { h.result.current.onTourEvent(INTRO_TOUR_KEY, 'ended'); });
  expect(h.result.current.introRunning).toBe(false);
  expect(h.result.current.introEnded).toBe(true);
});

it('ignores other tours', async () => {
  const h = await mount({ userId: 'u1', profileIncomplete: true, inTabs: true });
  await act(async () => { h.result.current.onTourEvent('groups-empty', 'ended'); });
  expect(h.result.current.introEnded).toBe(false);
});

it('no fallback clock outside the tabs or once the profile is complete', async () => {
  const h = await mount({ userId: 'u1', profileIncomplete: true, inTabs: false });
  await act(async () => { jest.advanceTimersByTime(INTRO_FALLBACK_MS * 2); });
  expect(h.result.current.fallbackElapsed).toBe(false);
  await h.rerender({ userId: 'u1', profileIncomplete: false, inTabs: true });
  await act(async () => { jest.advanceTimersByTime(INTRO_FALLBACK_MS * 2); });
  expect(h.result.current.fallbackElapsed).toBe(false);
});

it('starts over for a different account (sign-out, then a new sign-up)', async () => {
  const h = await mount({ userId: 'u1', profileIncomplete: true, inTabs: true });
  await act(async () => { h.result.current.onTourEvent(INTRO_TOUR_KEY, 'started'); h.result.current.onTourEvent(INTRO_TOUR_KEY, 'ended'); });
  expect(h.result.current.introEnded).toBe(true);
  await h.rerender({ userId: 'u2', profileIncomplete: true, inTabs: true });
  expect(h.result.current.introEnded).toBe(false);
  expect(h.result.current.introRunning).toBe(false);
});

it('the welcome video is switched off', () => {
  expect(require('@/components/WelcomeModal').WELCOME_VIDEO_ENABLED).toBe(false);
});
