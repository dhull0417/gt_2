import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ScheduleScreen } from '../create-group/ScheduleScreen';
import { defaultSchedule } from '@/utils/createGroupDraft';

jest.mock('@/contexts/AppearanceContext', () => {
  const { lightColors } = jest.requireActual('@/constants/theme');
  return { useThemeColors: () => lightColors, useAppearance: () => ({ scheme: 'light' }) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
let mockPremium = true;
const mockPush = jest.fn();
jest.mock('@/hooks/usePremium', () => ({ usePremium: () => ({ isPremium: mockPremium, userId: 'u1' }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/components/UpgradeButton', () => ({ UpgradeButton: () => null }));
jest.mock('@/components/LocationSearchModal', () => () => null);
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const props = (over = {}) => ({ groupName: 'Dinner', onNext: jest.fn(), onBack: jest.fn(), onSkip: jest.fn(), ...over });

describe('Create group — schedule step', () => {
  it('an untouched series goes straight to Review with nothing to create', async () => {
    const p = props();
    await render(<ScheduleScreen {...p} />);
    await fireEvent.press(screen.getByLabelText('Review'));
    expect(p.onNext).toHaveBeenCalledWith([], expect.any(String));
  });

  it('an unfinished series blocks Review and says what to fix on the When row', async () => {
    const started = { ...defaultSchedule('Dinner'), frequency: 'weekly' as const, weekdayRows: [{ id: 'r1', day: null, time: '05:00 PM', startDate: '2026-12-01', showTimePicker: false }] };
    const p = props({ initialSchedules: [started] });
    await render(<ScheduleScreen {...p} />);
    expect(screen.queryByText('Pick a day for each row')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Review'));
    expect(p.onNext).not.toHaveBeenCalled();
    expect(screen.getByText('Fix 1 thing above')).toBeTruthy();
    expect(screen.getByText('Pick a day for each row')).toBeTruthy();
  });

  it('a finished weekly series goes to Review', async () => {
    const done = { ...defaultSchedule('Dinner'), frequency: 'weekly' as const, weekdayRows: [{ id: 'r1', day: 2, time: '05:00 PM', startDate: '2026-12-01', showTimePicker: false }] };
    const p = props({ initialSchedules: [done] });
    await render(<ScheduleScreen {...p} />);
    expect(screen.getByText('Weekly · Tue · 5:00 PM')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Review'));
    expect(p.onNext).toHaveBeenCalledWith([done], expect.any(String));
  });

  it('the When row opens the recurrence editor', async () => {
    await render(<ScheduleScreen {...props()} />);
    await fireEvent.press(screen.getByTestId('row-when'));
    expect(screen.getByText('How often?')).toBeTruthy();
  });
});

describe('Create group — schedule step without Premium', () => {
  beforeEach(() => { mockPremium = false; mockPush.mockClear(); });
  afterAll(() => { mockPremium = true; });

  it('the Premium rows are open to set up, not locked', async () => {
    await render(<ScheduleScreen {...props()} />);
    expect(screen.queryAllByTestId('row-lock').length).toBe(0);
    await fireEvent.press(screen.getByText('Food/Things to bring'));
    expect(screen.getByText('Add item to bring')).toBeTruthy();
    expect(screen.getByText('Set these up now. Premium is needed to save them.')).toBeTruthy();
  });

  it('with nothing Premium set up, Review works as normal', async () => {
    const p = props();
    await render(<ScheduleScreen {...p} />);
    expect(screen.queryByLabelText('Premium')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Review'));
    expect(p.onNext).toHaveBeenCalled();
  });

  it('once a Premium feature is in use, Review becomes Premium and opens the paywall', async () => {
    const p = props();
    await render(<ScheduleScreen {...p} />);
    await fireEvent(screen.getByLabelText('Coordinate rides'), 'valueChange', true);
    expect(screen.queryByLabelText('Review')).toBeNull();
    expect(screen.getByText('Premium is needed to save these settings.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Premium'));
    expect(mockPush).toHaveBeenCalledWith('/paywall');
    expect(p.onNext).not.toHaveBeenCalled();
  });

  it('turning the feature off again brings Review back', async () => {
    await render(<ScheduleScreen {...props()} />);
    await fireEvent(screen.getByLabelText('Coordinate rides'), 'valueChange', true);
    await fireEvent(screen.getByLabelText('Coordinate rides'), 'valueChange', false);
    expect(screen.getByLabelText('Review')).toBeTruthy();
  });
});
