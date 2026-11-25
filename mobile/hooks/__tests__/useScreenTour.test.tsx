import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useScreenTour, TOUR_START_DELAY_MS } from '../useScreenTour';

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]) };
});
const mockMarkTourSeen = jest.fn(async () => ({ seenTours: ['group-details'] }));
jest.mock('@/utils/api', () => ({
  useApiClient: () => ({}),
  userApi: { markTourSeen: (...a: any[]) => (mockMarkTourSeen as any)(...a) },
}));

const setup = async (user: any, enabled = true) => {
  const qc = new QueryClient();
  qc.setQueryData(['currentUser'], user);
  const start = jest.fn();
  const wrapper = ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook = await renderHook(() => useScreenTour({ key: 'group-details', user, enabled, start }), { wrapper });
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
