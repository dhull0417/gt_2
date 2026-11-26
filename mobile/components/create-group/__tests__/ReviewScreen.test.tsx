import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ReviewScreen } from '../ReviewScreen';
import { defaultSchedule } from '@/utils/createGroupDraft';

jest.mock('@/contexts/AppearanceContext', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#123456' }),
  useAppearance: () => ({ scheme: 'light' }),
}));

const weekly = (over: any = {}) => ({
  ...defaultSchedule('League'), frequency: 'weekly' as const,
  weekdayRows: [{ id: 'r1', day: 2, time: '06:00 PM', startDate: null, showTimePicker: false }], ...over,
});
const show = (schedules: any[]) => render(
  <ReviewScreen groupName="League" members={[]} schedules={schedules} timezone="America/Denver"
    onConfirm={() => {}} onBack={() => {}} isPending={false} />,
);

describe('ReviewScreen: end date', () => {
  it('shows when the schedule ends', async () => {
    await show([weekly({ endDate: '2027-05-31' })]);
    expect(screen.getByText('Ends May 31, 2027')).toBeTruthy();
  });
  it('shows nothing when the schedule runs forever', async () => {
    await show([weekly()]);
    expect(screen.queryByText(/^Ends /)).toBeNull();
  });
});
