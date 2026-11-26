// Lives under components/__tests__ so expo-router never sees a test file inside app/.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { DateTime } from 'luxon';
import EditScheduleScreen from '../../app/group-edit-schedule/[id]';

const mockCreateSchedule = jest.fn();
const mockUpdateSchedule = jest.fn();
const mockCountAfter = jest.fn();
let mockSchedules: any[] = [];
let mockParams: Record<string, string> = { id: 'g1', scheduleId: 'new' };
let mockGroupPremium = true;
let mockOwner = true;
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ back: jest.fn(), push: mockPush }) }));
jest.mock('@/hooks/useIsGroupOwner', () => ({ useIsGroupOwner: () => mockOwner }));
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ getToken: jest.fn() }) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock('../../hooks/useGetGroupDetails', () => ({
  useGetGroupDetails: () => ({ isLoading: false, data: { _id: 'g1', name: 'Dinner Club', timezone: 'America/Denver', isPremium: mockGroupPremium, owner: 'u1', schedules: mockSchedules } }),
}));
jest.mock('../../utils/api', () => ({ useApiClient: () => ({}), groupApi: {
  createSchedule: (...a: any[]) => mockCreateSchedule(...a), updateSchedule: (...a: any[]) => mockUpdateSchedule(...a),
  countMeetupsAfter: (...a: any[]) => mockCountAfter(...a), deleteSchedule: jest.fn(),
} }));
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

  it('a fresh form shows no problems', async () => {
    await render(<EditScheduleScreen />);
    expect(screen.getByText('New Schedule')).toBeTruthy();
    expect(screen.queryByText(/Fix \d/)).toBeNull();
  });

  it('Create with nothing filled in says exactly what is missing and does not save', async () => {
    await render(<EditScheduleScreen />);
    await fireEvent.changeText(screen.getByLabelText('Schedule name'), '');
    await fireEvent.press(screen.getByLabelText('Create Schedule'));
    expect(mockCreateSchedule).not.toHaveBeenCalled();
    expect(screen.getByText('Give this schedule a name')).toBeTruthy();
    expect(screen.getByText('Pick how often')).toBeTruthy();
    expect(screen.getByText('Fix 2 things above')).toBeTruthy();
  });

  it('fixing the problems clears them', async () => {
    await render(<EditScheduleScreen />);
    await fireEvent.changeText(screen.getByLabelText('Schedule name'), '');
    await fireEvent.press(screen.getByLabelText('Create Schedule'));
    await fireEvent.changeText(screen.getByLabelText('Schedule name'), 'Sunday Dinner');
    expect(screen.queryByText('Give this schedule a name')).toBeNull();
    expect(screen.getByText('Fix 1 thing above')).toBeTruthy();
  });
});

describe('Edit Schedule: end date', () => {
  const today = DateTime.now().toISODate()!;
  beforeEach(() => {
    mockParams = { id: 'g1', scheduleId: 's1' };
    mockSchedules = [{ _id: 's1', name: 'League', active: true, defaultLocation: '', defaultCapacity: 0, startDate: today,
      routines: [{ frequency: 'weekly', dayTimes: [{ day: 2, time: '06:00 PM' }] }] }];
    mockUpdateSchedule.mockReset().mockResolvedValue({});
    mockCountAfter.mockReset();
  });
  afterEach(() => jest.restoreAllMocks());

  const setEndToToday = async () => {
    await fireEvent.press(screen.getByTestId('row-when'));
    await fireEvent.press(screen.getByTestId('end-date-field'));
    await fireEvent.press(screen.getByText(String(DateTime.now().day)));
  };
  const answer = (label: string) =>
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find(b => b.text === label)?.onPress?.(); });

  it('Delete sends removeAfterEnd: true', async () => {
    mockCountAfter.mockResolvedValue(3);
    answer('Delete');
    await render(<EditScheduleScreen />);
    await setEndToToday();
    await fireEvent.press(screen.getByLabelText('Save Changes'));
    await waitFor(() => expect(mockUpdateSchedule).toHaveBeenCalled());
    expect(mockCountAfter).toHaveBeenCalledWith({}, 'g1', 's1', today);
    expect(mockUpdateSchedule.mock.calls[0][3]).toMatchObject({ endDate: today, removeAfterEnd: true });
  });

  it('Cancel does not save', async () => {
    mockCountAfter.mockResolvedValue(3);
    const alert = answer('Cancel');
    await render(<EditScheduleScreen />);
    await setEndToToday();
    await fireEvent.press(screen.getByLabelText('Save Changes'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(mockUpdateSchedule).not.toHaveBeenCalled();
  });

  it('nothing after the date: saves with removeAfterEnd: false and no dialog', async () => {
    mockCountAfter.mockResolvedValue(0);
    const alert = jest.spyOn(Alert, 'alert');
    await render(<EditScheduleScreen />);
    await setEndToToday();
    await fireEvent.press(screen.getByLabelText('Save Changes'));
    await waitFor(() => expect(mockUpdateSchedule).toHaveBeenCalled());
    expect(mockUpdateSchedule.mock.calls[0][3]).toMatchObject({ endDate: today, removeAfterEnd: false });
    expect(alert).not.toHaveBeenCalled();
  });
});

describe('Edit Schedule without Premium', () => {
  beforeEach(() => {
    mockGroupPremium = false; mockOwner = true; mockPush.mockClear();
    mockParams = { id: 'g1', scheduleId: 'new' }; mockSchedules = [];
    mockCreateSchedule.mockReset(); mockUpdateSchedule.mockReset().mockResolvedValue({});
  });
  afterAll(() => { mockGroupPremium = true; mockOwner = true; });

  it('new schedule: Premium rows, including Priority RSVP, are open to set up', async () => {
    await render(<EditScheduleScreen />);
    expect(screen.queryAllByTestId('row-lock')).toHaveLength(0);
    await fireEvent.press(screen.getByText('RSVP Questions'));
    expect(screen.getByText('Add question')).toBeTruthy();
    expect(screen.getByText('Set these up now. Premium is needed to save them.')).toBeTruthy();
  });

  it('new schedule with nothing Premium: still Create Schedule', async () => {
    await render(<EditScheduleScreen />);
    expect(screen.getByLabelText('Create Schedule')).toBeTruthy();
    expect(screen.queryByLabelText('Premium')).toBeNull();
  });

  it('owner: a Premium feature in use turns Create Schedule into Premium, which opens the paywall', async () => {
    await render(<EditScheduleScreen />);
    await fireEvent(screen.getByLabelText('Coordinate rides'), 'valueChange', true);
    expect(screen.queryByLabelText('Create Schedule')).toBeNull();
    expect(screen.getByText('Premium is needed to save these settings.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Premium'));
    expect(mockPush).toHaveBeenCalledWith('/paywall');
    expect(mockCreateSchedule).not.toHaveBeenCalled();
  });

  it('non-owner: the button is a disabled Owner needs Premium', async () => {
    mockOwner = false;
    await render(<EditScheduleScreen />);
    await fireEvent(screen.getByLabelText('Coordinate rides'), 'valueChange', true);
    expect(screen.getByText('The group owner needs Premium to save these settings.')).toBeTruthy();
    const btn = screen.getByLabelText('Owner needs Premium');
    expect(btn.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(btn);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('existing schedule that already has Premium settings (lapsed group): an unrelated edit still saves', async () => {
    const today = DateTime.now().toISODate()!;
    mockParams = { id: 'g1', scheduleId: 's1' };
    mockSchedules = [{ _id: 's1', name: 'League', active: true, defaultLocation: '', defaultCapacity: 0, startDate: today, defaultRidesEnabled: true,
      routines: [{ frequency: 'weekly', dayTimes: [{ day: 2, time: '06:00 PM' }] }] }];
    await render(<EditScheduleScreen />);
    await fireEvent.changeText(screen.getByLabelText('Schedule name'), 'League 2');
    expect(screen.queryByLabelText('Premium')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Save Changes'));
    await waitFor(() => expect(mockUpdateSchedule).toHaveBeenCalled());
  });

  it('existing schedule: RSVP Questions stays locked', async () => {
    const today = DateTime.now().toISODate()!;
    mockParams = { id: 'g1', scheduleId: 's1' };
    mockSchedules = [{ _id: 's1', name: 'League', active: true, defaultLocation: '', defaultCapacity: 0, startDate: today,
      routines: [{ frequency: 'weekly', dayTimes: [{ day: 2, time: '06:00 PM' }] }] }];
    await render(<EditScheduleScreen />);
    expect(screen.getAllByTestId('row-lock')).toHaveLength(1);
    expect(screen.getByLabelText('RSVP Questions: Premium')).toBeTruthy();
  });
});
