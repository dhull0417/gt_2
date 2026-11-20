import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import RecurrenceEditor from '../RecurrenceEditor';
import { defaultSchedule, type ScheduleData } from '@/utils/createGroupDraft';
import { scheduleIssues } from '@/utils/formIssues';
import { SettingSheet } from '@/components/ui/form';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@/contexts/AppearanceContext', () => {
  const c = new Proxy({}, { get: (_t, k) => (k === 'danger' ? '#DC2626' : '#888888') });
  return { useThemeColors: () => c, useAppearance: () => ({ scheme: 'light' }) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

let latest: ScheduleData;
function Host({ initial, attempted = false }: { initial?: Partial<ScheduleData>; attempted?: boolean }) {
  const [d, setD] = useState<ScheduleData>({ ...defaultSchedule('Dinner'), ...initial });
  latest = d;
  const issues = scheduleIssues(d, { requireName: true, emptyIsValid: false }).filter(i => attempted || i.kind === 'invalid');
  return (
    <SettingSheet visible title="When" onClose={() => {}}>
      <RecurrenceEditor value={d} update={fn => setD(p => fn(p))} issues={issues} />
    </SettingSheet>
  );
}

describe('RecurrenceEditor', () => {
  it('weekly: pick frequency, add a day, choose Tuesday', () => {
    render(<Host />);
    fireEvent.press(screen.getByText('Weekly'));
    expect(latest.frequency).toBe('weekly');
    fireEvent.press(screen.getByText('Add a day'));
    expect(latest.weekdayRows).toHaveLength(1);
    const id = latest.weekdayRows[0].id;
    fireEvent.press(screen.getByTestId(`day-${id}-2`));
    expect(latest.weekdayRows[0].day).toBe(2);
  });

  it('a row missing its day is red after a submit attempt', () => {
    const row = { id: 'r1', day: null, time: '05:00 PM', startDate: '2026-12-01', showTimePicker: false };
    render(<Host initial={{ frequency: 'weekly', weekdayRows: [row] }} attempted />);
    expect(screen.getByText('Pick a day for each row')).toBeTruthy();
    fireEvent.press(screen.getByTestId('day-r1-4'));
    expect(screen.queryByText('Pick a day for each row')).toBeNull();
  });

  it('no frequency: the instruction shows only after an attempt', () => {
    const { unmount } = render(<Host />);
    expect(screen.queryByText('Pick how often')).toBeNull();
    unmount();
    render(<Host attempted />);
    expect(screen.getByText('Pick how often')).toBeTruthy();
  });

  it('opening a time picker draws it over the sheet, not as another Modal', () => {
    render(<Host initial={{ frequency: 'daily', dailySameTime: true }} />);
    fireEvent.press(screen.getByLabelText('Time 5:00 PM'));
    expect(screen.getByTestId('sheet-overlay')).toBeTruthy();
  });

  it('monthly by date: add a date and pick the 15th', () => {
    render(<Host />);
    fireEvent.press(screen.getByText('Monthly'));
    fireEvent.press(screen.getByTestId('monthly-date'));
    fireEvent.press(screen.getByText('Add a date'));
    fireEvent.press(screen.getByText('15'));
    expect(latest.monthlyDates[0].date).toBe(15);
  });

  it('custom: build a weekly rule', () => {
    render(<Host />);
    fireEvent.press(screen.getByText('Custom'));
    fireEvent.press(screen.getByText('Add a rule'));
    fireEvent.press(screen.getByText('Weekly'));
    fireEvent.press(screen.getByText('Add a day'));
    const id = latest.weekdayRows[0].id;
    fireEvent.press(screen.getByTestId(`day-${id}-5`));
    fireEvent.press(screen.getByText('Add rule'));
    expect(latest.builtRoutines).toHaveLength(1);
    expect(latest.builtRoutines[0].frequency).toBe('weekly');
    expect(latest.customBuilding).toBe(false);
  });

  it('reselecting the current frequency keeps what was entered', () => {
    const row = { id: 'r1', day: 2, time: '05:00 PM', startDate: '2026-12-01', showTimePicker: false };
    render(<Host initial={{ frequency: 'weekly', weekdayRows: [row] }} />);
    fireEvent.press(screen.getByLabelText('Change from Weekly'));
    fireEvent.press(screen.getByText('Weekly'));
    expect(latest.weekdayRows).toHaveLength(1);
  });

  it('once a frequency is picked the other choices collapse, and Change brings them back', () => {
    render(<Host />);
    expect(screen.getByText('Daily')).toBeTruthy();
    fireEvent.press(screen.getByText('Weekly'));
    expect(screen.queryByText('Daily')).toBeNull();
    expect(screen.queryByText('Monthly')).toBeNull();
    expect(screen.getByText('Weekly')).toBeTruthy();
    fireEvent.press(screen.getByText('Change'));
    expect(screen.getByText('Daily')).toBeTruthy();
    fireEvent.press(screen.getByText('Monthly'));
    expect(latest.frequency).toBe('monthly');
    expect(screen.queryByText('Daily')).toBeNull();
  });

  it("a custom rule's type list collapses the same way", () => {
    render(<Host />);
    fireEvent.press(screen.getByText('Custom'));
    fireEvent.press(screen.getByText('Add a rule'));
    fireEvent.press(screen.getByText('Monthly'));
    expect(screen.queryByText('Daily')).toBeNull();
    expect(screen.getAllByText('Change')).toHaveLength(2);
  });

  it('a weekday row collapses to the picked day, and Change reopens it', () => {
    const row = { id: 'r1', day: null, time: '05:00 PM', startDate: '2026-12-01', showTimePicker: false };
    render(<Host initial={{ frequency: 'weekly', weekdayRows: [row] }} />);
    fireEvent.press(screen.getByTestId('day-r1-2'));
    expect(screen.queryByTestId('day-r1-1')).toBeNull();
    expect(screen.getByText('Tuesday')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Change Tuesday'));
    expect(screen.getByTestId('day-r1-1')).toBeTruthy();
  });

  it('a monthly date collapses after picking, from the 31-day grid', () => {
    render(<Host />);
    fireEvent.press(screen.getByText('Monthly'));
    fireEvent.press(screen.getByTestId('monthly-date'));
    fireEvent.press(screen.getByText('Add a date'));
    fireEvent.press(screen.getByText('15'));
    expect(screen.queryByText('16')).toBeNull();
    expect(screen.getByText('The 15th')).toBeTruthy();
  });

  it('a saved monthly date starts collapsed', () => {
    const e = { id: 'm1', date: 3, time: '05:00 PM', expanded: false, showTimePicker: false };
    render(<Host initial={{ frequency: 'monthly', monthlyMode: 'date', monthlyDates: [e] }} />);
    expect(screen.queryByText('20')).toBeNull();
    expect(screen.getByText('The 3rd')).toBeTruthy();
  });

  it('quarterly repeat-on collapses after picking', () => {
    render(<Host initial={{ frequency: 'quarterly', longFirstDate: '2026-12-05' }} />);
    fireEvent.press(screen.getByText('Same weekday'));
    expect(latest.longRepeatBy).toBe('weekday');
    expect(screen.queryByText('Same date')).toBeNull();
  });
});
