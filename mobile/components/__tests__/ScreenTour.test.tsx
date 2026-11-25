import React from 'react';
import { Text, View } from 'react-native';
import { render, screen, act, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScreenTour, TourTarget } from '../tour/ScreenTour';
import { TOUR_START_DELAY_MS } from '@/hooks/useScreenTour';
import type { EmptyTourStep } from '@/utils/emptyScreenTours';

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]) };
});
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('@/contexts/AppearanceContext', () => ({
  useThemeColors: () => ({ surface: '#fff', textPrimary: '#111', textMuted: '#666', border: '#eee', brand: '#4A90E2' }),
  useAppearance: () => ({ scheme: 'light' }),
}));
const mockMarkTourSeen = jest.fn(async () => ({ seenTours: ['groups-empty'] }));
jest.mock('@/utils/api', () => ({
  useApiClient: () => ({}),
  userApi: { markTourSeen: (...a: any[]) => (mockMarkTourSeen as any)(...a) },
}));

const steps: EmptyTourStep[] = [
  { target: 'create-group', title: 'Create a group', body: 'Start here.', icon: 'users', radius: 14 },
  { target: 'add', title: 'New group', body: 'Any time.', icon: 'plus-circle', radius: 18, circle: true },
];

const setup = async (enabled = true) => {
  const qc = new QueryClient();
  const user = { _id: 'u1' } as any;
  qc.setQueryData(['currentUser'], user);
  await render(
    <QueryClientProvider client={qc}>
      <ScreenTour tourKey="groups-empty" steps={steps} enabled={enabled} user={user} alwaysShow={false}>
        <TourTarget target="create-group"><View><Text>Create a group button</Text></View></TourTarget>
        <TourTarget target="add"><View><Text>plus</Text></View></TourTarget>
        <TourTarget target="not-a-step"><View><Text>plain</Text></View></TourTarget>
      </ScreenTour>
    </QueryClientProvider>,
  );
  return qc;
};

beforeEach(() => {
  jest.useFakeTimers();
  mockMarkTourSeen.mockClear();
  // Under Jest, views don't measure; report a fixed spot like a device would.
  jest.spyOn(View.prototype as any, 'measureInWindow').mockImplementation(function (cb: any) { cb(20, 100, 200, 48); });
});
afterEach(() => jest.useRealTimers());

it('wraps only elements that are tour steps', async () => {
  await setup();
  expect(screen.getAllByTestId('attach-wrapper-view')).toHaveLength(2);
  expect(screen.getByText('plain')).toBeTruthy();
});

it('starts on an empty screen, walks the steps, and records the tour as seen when done', async () => {
  const qc = await setup();
  await act(async () => { await jest.advanceTimersByTimeAsync(TOUR_START_DELAY_MS + 1500); });
  expect(screen.getByText('Start here.')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText('Next')); await jest.advanceTimersByTimeAsync(1500); });
  expect(screen.getByText('Any time.')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText('Done')); await jest.advanceTimersByTimeAsync(500); });
  expect(mockMarkTourSeen).toHaveBeenCalledWith({}, 'groups-empty');
  expect((qc.getQueryData(['currentUser']) as any).seenTours).toEqual(['groups-empty']);
});

it('does not start when the screen is not empty', async () => {
  await setup(false);
  await act(async () => { await jest.advanceTimersByTimeAsync(TOUR_START_DELAY_MS * 4); });
  expect(screen.queryByText('Start here.')).toBeNull();
});
