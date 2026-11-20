import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ScheduleScreen } from '../create-group/ScheduleScreen';
import { defaultSchedule } from '@/utils/createGroupDraft';

jest.mock('@/contexts/AppearanceContext', () => {
  const { lightColors } = jest.requireActual('@/constants/theme');
  return { useThemeColors: () => lightColors, useAppearance: () => ({ scheme: 'light' }) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/usePremium', () => ({ usePremium: () => ({ isPremium: true, userId: 'u1' }) }));
jest.mock('@/components/UpgradeButton', () => ({ UpgradeButton: () => null }));
jest.mock('@/components/LocationSearchModal', () => () => null);
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const props = (over = {}) => ({ groupName: 'Dinner', onNext: jest.fn(), onBack: jest.fn(), onSkip: jest.fn(), ...over });

describe('Create group — schedule step', () => {
  it('an untouched series goes straight to Review with nothing to create', () => {
    const p = props();
    render(<ScheduleScreen {...p} />);
    fireEvent.press(screen.getByLabelText('Review'));
    expect(p.onNext).toHaveBeenCalledWith([], expect.any(String));
  });

  it('an unfinished series blocks Review and says what to fix on the When row', () => {
    const started = { ...defaultSchedule('Dinner'), frequency: 'weekly' as const, weekdayRows: [{ id: 'r1', day: null, time: '05:00 PM', startDate: '2026-12-01', showTimePicker: false }] };
    const p = props({ initialSchedules: [started] });
    render(<ScheduleScreen {...p} />);
    expect(screen.queryByText('Pick a day for each row')).toBeNull();
    fireEvent.press(screen.getByLabelText('Review'));
    expect(p.onNext).not.toHaveBeenCalled();
    expect(screen.getByText('Fix 1 thing above')).toBeTruthy();
    expect(screen.getByText('Pick a day for each row')).toBeTruthy();
  });

  it('a finished weekly series goes to Review', () => {
    const done = { ...defaultSchedule('Dinner'), frequency: 'weekly' as const, weekdayRows: [{ id: 'r1', day: 2, time: '05:00 PM', startDate: '2026-12-01', showTimePicker: false }] };
    const p = props({ initialSchedules: [done] });
    render(<ScheduleScreen {...p} />);
    expect(screen.getByText('Weekly · Tue · 5:00 PM')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Review'));
    expect(p.onNext).toHaveBeenCalledWith([done], expect.any(String));
  });

  it('the When row opens the recurrence editor', () => {
    render(<ScheduleScreen {...props()} />);
    fireEvent.press(screen.getByTestId('row-when'));
    expect(screen.getByText('How often?')).toBeTruthy();
  });
});
