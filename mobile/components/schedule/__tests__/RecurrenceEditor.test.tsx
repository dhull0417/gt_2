import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import RecurrenceEditor from '../RecurrenceEditor';
import { defaultSchedule, type ScheduleData } from '@/utils/createGroupDraft';
import { scheduleIssues } from '@/utils/formIssues';
import { SettingSheet } from '@/components/ui/form';
import { DateTime } from 'luxon';

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
  it('weekly: pick frequency, add a day, choose Tuesday', async () => {
    await render(<Host />);
    await fireEvent.press(screen.getByText('Weekly'));
    expect(latest.frequency).toBe('weekly');
    await fireEvent.press(screen.getByText('Add a day'));
    expect(latest.weekdayRows).toHaveLength(1);
    const id = latest.weekdayRows[0].id;
    await fireEvent.press(screen.getByTestId(`day-${id}-2`));
    expect(latest.weekdayRows[0].day).toBe(2);
  });

  it('a row missing its day is red after a submit attempt', async () => {
    const row = { id: 'r1', day: null, time: '05:00 PM', startDate: '2026-12-01', showTimePicker: false };
    await render(<Host initial={{ frequency: 'weekly', weekdayRows: [row] }} attempted />);
    expect(screen.getByText('Pick a day for each row')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('day-r1-4'));
    expect(screen.queryByText('Pick a day for each row')).toBeNull();
  });

  it('no frequency: the instruction shows only after an attempt', async () => {
    const { unmount } = await render(<Host />);
    expect(screen.queryByText('Pick how often')).toBeNull();
    await unmount();
    await render(<Host attempted />);
    expect(screen.getByText('Pick how often')).toBeTruthy();
  });

  it('opening a time picker draws it over the sheet, not as another Modal', async () => {
    await render(<Host initial={{ frequency: 'daily', dailySameTime: true }} />);
    await fireEvent.press(screen.getByLabelText('Time 5:00 PM'));
    expect(screen.getByTestId('sheet-overlay')).toBeTruthy();
  });

  it('monthly by date: add a date and pick the 15th', async () => {
    await render(<Host />);
    await fireEvent.press(screen.getByText('Monthly'));
    await fireEvent.press(screen.getByTestId('monthly-date'));
    await fireEvent.press(screen.getByText('Add a date'));
    await fireEvent.press(screen.getByText('15'));
    expect(latest.monthlyDates[0].date).toBe(15);
  });

  it('custom: build a weekly rule', async () => {
    await render(<Host />);
    await fireEvent.press(screen.getByText('Custom'));
    await fireEvent.press(screen.getByText('Add a rule'));
    await fireEvent.press(screen.getByText('Weekly'));
    await fireEvent.press(screen.getByText('Add a day'));
    const id = latest.weekdayRows[0].id;
    await fireEvent.press(screen.getByTestId(`day-${id}-5`));
    await fireEvent.press(screen.getByText('Add rule'));
    expect(latest.builtRoutines).toHaveLength(1);
    expect(latest.builtRoutines[0].frequency).toBe('weekly');
    expect(latest.customBuilding).toBe(false);
  });

  it('reselecting the current frequency keeps what was entered', async () => {
    const row = { id: 'r1', day: 2, time: '05:00 PM', startDate: '2026-12-01', showTimePicker: false };
    await render(<Host initial={{ frequency: 'weekly', weekdayRows: [row] }} />);
    await fireEvent.press(screen.getByLabelText('Change from Weekly'));
    await fireEvent.press(screen.getByText('Weekly'));
    expect(latest.weekdayRows).toHaveLength(1);
  });

  it('once a frequency is picked the other choices collapse, and Change brings them back', async () => {
    await render(<Host />);
    expect(screen.getByText('Daily')).toBeTruthy();
    await fireEvent.press(screen.getByText('Weekly'));
    expect(screen.queryByText('Daily')).toBeNull();
    expect(screen.queryByText('Monthly')).toBeNull();
    expect(screen.getByText('Weekly')).toBeTruthy();
    await fireEvent.press(screen.getByText('Change'));
    expect(screen.getByText('Daily')).toBeTruthy();
    await fireEvent.press(screen.getByText('Monthly'));
    expect(latest.frequency).toBe('monthly');
    expect(screen.queryByText('Daily')).toBeNull();
  });

  it("a custom rule's type list collapses the same way", async () => {
    await render(<Host />);
    await fireEvent.press(screen.getByText('Custom'));
    await fireEvent.press(screen.getByText('Add a rule'));
    await fireEvent.press(screen.getByText('Monthly'));
    expect(screen.queryByText('Daily')).toBeNull();
    expect(screen.getAllByText('Change')).toHaveLength(2);
  });

  it('a weekday row collapses to the picked day, and Change reopens it', async () => {
    const row = { id: 'r1', day: null, time: '05:00 PM', startDate: '2026-12-01', showTimePicker: false };
    await render(<Host initial={{ frequency: 'weekly', weekdayRows: [row] }} />);
    await fireEvent.press(screen.getByTestId('day-r1-2'));
    expect(screen.queryByTestId('day-r1-1')).toBeNull();
    expect(screen.getByText('Tuesday')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Change Tuesday'));
    expect(screen.getByTestId('day-r1-1')).toBeTruthy();
  });

  it('a monthly date collapses after picking, from the 31-day grid', async () => {
    await render(<Host />);
    await fireEvent.press(screen.getByText('Monthly'));
    await fireEvent.press(screen.getByTestId('monthly-date'));
    await fireEvent.press(screen.getByText('Add a date'));
    await fireEvent.press(screen.getByText('15'));
    expect(screen.queryByText('16')).toBeNull();
    expect(screen.getByText('The 15th')).toBeTruthy();
  });

  it('a saved monthly date starts collapsed', async () => {
    const e = { id: 'm1', date: 3, time: '05:00 PM', expanded: false, showTimePicker: false };
    await render(<Host initial={{ frequency: 'monthly', monthlyMode: 'date', monthlyDates: [e] }} />);
    expect(screen.queryByText('20')).toBeNull();
    expect(screen.getByText('The 3rd')).toBeTruthy();
  });

  it('quarterly repeat-on collapses after picking', async () => {
    await render(<Host initial={{ frequency: 'quarterly', longFirstDate: '2026-12-05' }} />);
    await fireEvent.press(screen.getByText('Same weekday'));
    expect(latest.longRepeatBy).toBe('weekday');
    expect(screen.queryByText('Same date')).toBeNull();
  });
});

describe('RecurrenceEditor: end date', () => {
  const today = DateTime.now().toISODate()!;
  const weeklyRow = { id: 'r1', day: 2, time: '05:00 PM', startDate: null, showTimePicker: false };

  it.each([
    ['weekly', { frequency: 'weekly', weekdayRows: [weeklyRow] }],
    ['biweekly', { frequency: 'biweekly', weekdayRows: [{ ...weeklyRow, startDate: today }] }],
    ['yearly', { frequency: 'yearly' }],
  ])('offers an optional end date for %s', async (_name, initial) => {
    await render(<Host initial={initial as any} />);
    expect(screen.getByText('Ending (optional)')).toBeTruthy();
    expect(screen.getByText('No end date')).toBeTruthy();
  });

  it('picking a day sets the end date', async () => {
    await render(<Host initial={{ frequency: 'weekly', weekdayRows: [weeklyRow], startDate: today }} />);
    await fireEvent.press(screen.getByTestId('end-date-field'));
    await fireEvent.press(screen.getByText(String(DateTime.now().day)));
    expect(latest.endDate).toBe(today);
  });

  it('"No end date" clears it', async () => {
    await render(<Host initial={{ frequency: 'weekly', weekdayRows: [weeklyRow], endDate: '2027-05-31' }} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove end date' }));
    expect(latest.endDate).toBeNull();
  });

  it('an end date before the start shows the problem under the field', async () => {
    await render(<Host initial={{ frequency: 'weekly', weekdayRows: [weeklyRow], startDate: '2027-03-01', endDate: '2027-02-01' }} />);
    expect(screen.getByText("End date can't be before the start date.")).toBeTruthy();
  });
});
