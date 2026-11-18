import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ScheduleDetailsModal } from '../ScheduleDetailsModal';

jest.mock('@/contexts/AppearanceContext', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#123456' }),
  useAppearance: () => ({ scheme: 'light' }),
}));

const group = (schedules: any[]) => ({ _id: 'g1', name: 'Hiking Crew', timezone: 'America/Denver', schedules } as any);

describe('ScheduleDetailsModal', () => {
  it('says so when there is no schedule', () => {
    render(<ScheduleDetailsModal visible onClose={() => {}} groupDetails={group([])} />);
    expect(screen.getByText('No schedule defined')).toBeTruthy();
  });

  it('shows each active schedule with its location', () => {
    render(<ScheduleDetailsModal visible onClose={() => {}} groupDetails={group([
      { _id: 's1', name: 'Tuesday Hikes', defaultLocation: 'Red Rocks', defaultCapacity: 0,
        routines: [{ frequency: 'weekly', dayTimes: [{ day: 2, time: '18:00' }] }] },
      { _id: 's2', name: 'Paused', active: false, routines: [] },
    ])} />);
    expect(screen.getByText('Tuesday Hikes')).toBeTruthy();
    expect(screen.getByText('Red Rocks')).toBeTruthy();
    expect(screen.getByText('Unlimited Attendees')).toBeTruthy();
    expect(screen.queryByText('Paused')).toBeNull();
  });

  it('closes from the close button', () => {
    const onClose = jest.fn();
    render(<ScheduleDetailsModal visible onClose={onClose} groupDetails={group([])} />);
    fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
