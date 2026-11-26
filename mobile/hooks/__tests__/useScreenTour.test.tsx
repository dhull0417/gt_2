import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useScreenTour, TOUR_START_DELAY_MS } from '../useScreenTour';
import { TourGateProvider } from '@/contexts/TourGateContext';

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]) };
});
const mockMarkTourSeen = jest.fn(async () => ({ seenTours: ['group-details'] }));
jest.mock('@/utils/api', () => ({
  useApiClient: () => ({}),
  userApi: { markTourSeen: (...a: any[]) => (mockMarkTourSeen as any)(...a) },
}));

const setup = async (user: any, enabled = true, alwaysShow = false) => {
  const qc = new QueryClient();
  qc.setQueryData(['currentUser'], user);
  const start = jest.fn();
  const wrapper = ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook = await renderHook(() => useScreenTour({ key: 'group-details', user, enabled, start, alwaysShow }), { wrapper });
  return { qc, start, hook };
};

beforeEach(() => { jest.useFakeTimers(); mockMarkTourSeen.mockClear(); });
afterEach(() => jest.useRealTimers());

it('starts the tour after a short delay for an existing user who has never seen it', async () => {
  const { start } = await setup({ _id: 'u1' });
  expect(start).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(TOUR_START_DELAY_MS); });
  expect(start).toHaveBeenCalledTimes(1);
});

it('does not start once the tour is recorded as seen', async () => {
  const { start } = await setup({ _id: 'u1', seenTours: ['group-details'] });
  await act(async () => { jest.advanceTimersByTime(TOUR_START_DELAY_MS * 3); });
  expect(start).not.toHaveBeenCalled();
});

it('does not start when disabled (for example a DM with no tiles)', async () => {
  const { start } = await setup({ _id: 'u1' }, false);
  await act(async () => { jest.advanceTimersByTime(TOUR_START_DELAY_MS * 3); });
  expect(start).not.toHaveBeenCalled();
});

it('does not start if the screen is left before the delay ends', async () => {
  const { start, hook } = await setup({ _id: 'u1' });
  await hook.unmount();
  await act(async () => { jest.advanceTimersByTime(TOUR_START_DELAY_MS * 3); });
  expect(start).not.toHaveBeenCalled();
});

it('markSeen records it on the cached user at once and tells the server', async () => {
  const { qc, hook } = await setup({ _id: 'u1' });
  await act(async () => { hook.result.current.markSeen(); });
  expect((qc.getQueryData(['currentUser']) as any).seenTours).toEqual(['group-details']);
  expect(mockMarkTourSeen).toHaveBeenCalledWith({}, 'group-details');
});

it('in always-show testing mode, starts even when the tour was already seen', async () => {
  const { start } = await setup({ _id: 'u1', seenTours: ['group-details'] }, true, true);
  await act(async () => { jest.advanceTimersByTime(TOUR_START_DELAY_MS); });
  expect(start).toHaveBeenCalledTimes(1);
});

it('in always-show testing mode, still waits for the user to load', async () => {
  const { start } = await setup(undefined, true, true);
  await act(async () => { jest.advanceTimersByTime(TOUR_START_DELAY_MS * 3); });
  expect(start).not.toHaveBeenCalled();
});

it('waits while the welcome video or name prompt is showing, then starts once it closes', async () => {
  const qc = new QueryClient();
  const user = { _id: 'u1' } as any;
  qc.setQueryData(['currentUser'], user);
  const start = jest.fn();
  let blocked = true;
  const wrapper = ({ children }: any) => (
    <QueryClientProvider client={qc}><TourGateProvider blocked={blocked}>{children}</TourGateProvider></QueryClientProvider>
  );
  const hook = await renderHook(() => useScreenTour({ key: 'meetups-empty', user, enabled: true, start, alwaysShow: false }), { wrapper });
  await act(async () => { jest.advanceTimersByTime(TOUR_START_DELAY_MS * 3); });
  expect(start).not.toHaveBeenCalled();
  blocked = false;
  await hook.rerender({});
  await act(async () => { jest.advanceTimersByTime(TOUR_START_DELAY_MS); });
  expect(start).toHaveBeenCalledTimes(1);
});

it('records the tour as seen as soon as it starts, so closing the app mid-tour does not bring it back', async () => {
  const { qc } = await setup({ _id: 'u1' });
  await act(async () => { jest.advanceTimersByTime(TOUR_START_DELAY_MS); });
  expect((qc.getQueryData(['currentUser']) as any).seenTours).toEqual(['group-details']);
  expect(mockMarkTourSeen).toHaveBeenCalledWith({}, 'group-details');
});
