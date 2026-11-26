import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ScheduleDetailsModal } from '../ScheduleDetailsModal';

jest.mock('@/contexts/AppearanceContext', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#123456' }),
  useAppearance: () => ({ scheme: 'light' }),
}));

const group = (schedules: any[]) => ({ _id: 'g1', name: 'Hiking Crew', timezone: 'America/Denver', schedules } as any);

describe('ScheduleDetailsModal', () => {
  it('says so when there is no schedule', async () => {
    await render(<ScheduleDetailsModal visible onClose={() => {}} groupDetails={group([])} />);
    expect(screen.getByText('No schedule defined')).toBeTruthy();
  });

  it('shows each active schedule with its location', async () => {
    await render(<ScheduleDetailsModal visible onClose={() => {}} groupDetails={group([
      { _id: 's1', name: 'Tuesday Hikes', defaultLocation: 'Red Rocks', defaultCapacity: 0,
        routines: [{ frequency: 'weekly', dayTimes: [{ day: 2, time: '18:00' }] }] },
      { _id: 's2', name: 'Paused', active: false, routines: [] },
    ])} />);
    expect(screen.getByText('Tuesday Hikes')).toBeTruthy();
    expect(screen.getByText('Red Rocks')).toBeTruthy();
    expect(screen.getByText('Unlimited Attendees')).toBeTruthy();
    expect(screen.queryByText('Paused')).toBeNull();
  });

  it('shows when a schedule ends, and nothing when it runs forever', async () => {
    await render(<ScheduleDetailsModal visible onClose={() => {}} groupDetails={group([
      { _id: 's1', name: 'Spring League', defaultCapacity: 0, endDate: '2027-05-31T00:00:00.000Z',
        routines: [{ frequency: 'weekly', dayTimes: [{ day: 2, time: '18:00' }] }] },
      { _id: 's2', name: 'Forever', defaultCapacity: 0, routines: [{ frequency: 'weekly', dayTimes: [{ day: 3, time: '18:00' }] }] },
    ])} />);
    expect(screen.getAllByText(/^Ends /)).toHaveLength(1);
    expect(screen.getByText('Ends May 31, 2027')).toBeTruthy();
  });

  it('closes from the close button', async () => {
    const onClose = jest.fn();
    await render(<ScheduleDetailsModal visible onClose={onClose} groupDetails={group([])} />);
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  describe('for owners and moderators', () => {
    const one = group([{ _id: 's1', name: 'Tuesday Hikes', routines: [] }]);
    const handlers = () => ({ onEditSchedule: jest.fn(), onScheduleNotifications: jest.fn(), onAddSchedule: jest.fn() });

    it('hides all editing for regular members', async () => {
      await render(<ScheduleDetailsModal visible onClose={() => {}} groupDetails={one} {...handlers()} />);
      expect(screen.queryByLabelText('Edit Tuesday Hikes')).toBeNull();
      expect(screen.queryByLabelText('Notifications for Tuesday Hikes')).toBeNull();
      expect(screen.queryByText('Add Schedule')).toBeNull();
    });

    it('edits a schedule and opens its notifications', async () => {
      const h = handlers();
      await render(<ScheduleDetailsModal visible onClose={() => {}} groupDetails={one} canManage {...h} />);
      await fireEvent.press(screen.getByLabelText('Edit Tuesday Hikes'));
      expect(h.onEditSchedule).toHaveBeenCalledWith('s1');
      await fireEvent.press(screen.getByLabelText('Notifications for Tuesday Hikes'));
      expect(h.onScheduleNotifications).toHaveBeenCalledWith('s1');
    });

    it('adds a schedule, including when there are none yet', async () => {
      const h = handlers();
      await render(<ScheduleDetailsModal visible onClose={() => {}} groupDetails={group([])} canManage {...h} />);
      await fireEvent.press(screen.getByText('Add Schedule'));
      expect(h.onAddSchedule).toHaveBeenCalled();
    });

    it('hides Add Schedule at the limit of 5 active schedules (paused ones do not count)', async () => {
      const five = Array.from({ length: 5 }, (_, i) => ({ _id: `s${i}`, name: `S${i}`, routines: [] }));
      const { unmount } = await render(<ScheduleDetailsModal visible onClose={() => {}} groupDetails={group(five)} canManage {...handlers()} />);
      expect(screen.queryByText('Add Schedule')).toBeNull();
      await unmount();
      await render(<ScheduleDetailsModal visible onClose={() => {}} groupDetails={group([...five.slice(0, 4), { _id: 'p', name: 'P', active: false, routines: [] }])} canManage {...handlers()} />);
      expect(screen.getByText('Add Schedule')).toBeTruthy();
    });
  });
});
