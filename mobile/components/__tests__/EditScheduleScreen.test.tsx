// Lives under components/__tests__ so expo-router never sees a test file inside app/.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import EditScheduleScreen from '../../app/group-edit-schedule/[id]';

const mockCreateSchedule = jest.fn();
let mockParams: Record<string, string> = { id: 'g1', scheduleId: 'new' };
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ getToken: jest.fn() }) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock('../../hooks/useGetGroupDetails', () => ({
  useGetGroupDetails: () => ({ isLoading: false, data: { _id: 'g1', name: 'Dinner Club', timezone: 'America/Denver', isPremium: true, owner: 'u1', schedules: [] } }),
}));
jest.mock('../../utils/api', () => ({ useApiClient: () => ({}), groupApi: { createSchedule: (...a: any[]) => mockCreateSchedule(...a), updateSchedule: jest.fn(), deleteSchedule: jest.fn() } }));
jest.mock('../../utils/groupRealtime', () => ({ broadcastGroupUpdate: jest.fn(), broadcastMeetupUpdate: jest.fn() }));
jest.mock('@/contexts/ToastContext', () => ({ toast: { success: jest.fn() } }));
jest.mock('@/utils/haptics', () => ({ haptic: new Proxy({}, { get: () => () => {} }) }));
jest.mock('@/components/LoadingAnimation', () => ({ LoadingAnimation: () => null }));
jest.mock('@/components/LocationSearchModal', () => () => null);
jest.mock('@/components/UpgradeButton', () => ({ UpgradeButton: () => null }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('@/contexts/AppearanceContext', () => {
  const { lightColors } = jest.requireActual('@/constants/theme');
  return { useThemeColors: () => lightColors, useAppearance: () => ({ scheme: 'light' }) };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

describe('New Schedule', () => {
  beforeEach(() => mockCreateSchedule.mockReset());

  it('a fresh form shows no problems', () => {
    render(<EditScheduleScreen />);
    expect(screen.getByText('New Schedule')).toBeTruthy();
    expect(screen.queryByText(/Fix \d/)).toBeNull();
  });

  it('Create with nothing filled in says exactly what is missing and does not save', () => {
    render(<EditScheduleScreen />);
    fireEvent.changeText(screen.getByLabelText('Schedule name'), '');
    fireEvent.press(screen.getByLabelText('Create Schedule'));
    expect(mockCreateSchedule).not.toHaveBeenCalled();
    expect(screen.getByText('Give this schedule a name')).toBeTruthy();
    expect(screen.getByText('Pick how often')).toBeTruthy();
    expect(screen.getByText('Fix 2 things above')).toBeTruthy();
  });

  it('fixing the problems clears them', () => {
    render(<EditScheduleScreen />);
    fireEvent.changeText(screen.getByLabelText('Schedule name'), '');
    fireEvent.press(screen.getByLabelText('Create Schedule'));
    fireEvent.changeText(screen.getByLabelText('Schedule name'), 'Sunday Dinner');
    expect(screen.queryByText('Give this schedule a name')).toBeNull();
    expect(screen.getByText('Fix 1 thing above')).toBeTruthy();
  });
});
