// Characterisation tests: these pin down what both schedule screens' inline handlers did before
// they were merged into one editor (create-group ScheduleScreen and group-edit-schedule).
// Differences found between the two copies (all UI-only, not part of the result):
//  - Edit's new weekday row set showDayPicker: true / showStartDatePicker: false (create-group
//    tracked the open day picker in screen state instead). Picker state now lives in the editor.
//  - Edit's routine snapshot also reset showDayPicker/showStartDatePicker on weekday rows.
//  - create-group defined its own buildLabel; it is identical to editScheduleDraft's.
import * as R from '../recurrenceDraft';
import { defaultSchedule } from '../createGroupDraft';
import { buildRoutines } from '../scheduleRoutines';

const base = () => ({ ...defaultSchedule('Dinner'), startDate: '2026-12-01' });

describe('selectFrequency', () => {
  it('sets the frequency and clears every per-frequency field', () => {
    const d = { ...base(), frequency: 'weekly' as const, dailySameTime: true, weekdayRows: [{ id: 'r', day: 1, time: '05:00 PM', startDate: '2026-12-01', showTimePicker: false }],
      monthlyMode: 'date' as const, monthlyDates: [{ id: 'm', date: 3, time: '05:00 PM', expanded: true, showTimePicker: false }], longFirstDate: '2026-12-01', longRepeatBy: 'date' as const,
      builtRoutines: [{ id: 'x' } as any], customBuilding: true, customFreq: 'weekly' as const };
    const n = R.selectFrequency(d, 'monthly');
    expect(n).toMatchObject({ frequency: 'monthly', dailySameTime: null, weekdayRows: [], monthlyMode: null, monthlyDates: [], ordinalEntries: [],
      longFirstDate: null, longRepeatBy: null, longTime: '05:00 PM', longEndTime: null, builtRoutines: [], customBuilding: false, customFreq: null });
    expect(n.name).toBe('Dinner');
  });
});

describe('rows and entries', () => {
  it('adds a weekday row with today as its start', () => {
    const n = R.addWeekdayRow(base(), 'r1', '2026-12-02');
    expect(n.weekdayRows).toEqual([{ id: 'r1', day: null, time: '05:00 PM', startDate: '2026-12-02', showTimePicker: false }]);
    expect(R.updateWeekdayRow(n, 'r1', { day: 4 }).weekdayRows[0].day).toBe(4);
    expect(R.removeWeekdayRow(n, 'r1').weekdayRows).toEqual([]);
  });
  it('updates a daily row', () => {
    const d = base();
    const id = d.dailyRows[2].id;
    expect(R.updateDailyRow(d, id, { time: '07:00 PM' }).dailyRows[2].time).toBe('07:00 PM');
  });
  it('monthly dates and ordinal entries', () => {
    const m = R.addMonthlyDate(base(), 'm1');
    expect(m.monthlyDates).toEqual([{ id: 'm1', date: 1, time: '05:00 PM', expanded: true, showTimePicker: false }]);
    expect(R.updateMonthlyDate(m, 'm1', { date: 15 }).monthlyDates[0].date).toBe(15);
    expect(R.removeMonthlyDate(m, 'm1').monthlyDates).toEqual([]);
    const o = R.addOrdinal(base(), 'o1');
    expect(o.ordinalEntries).toEqual([{ id: 'o1', occurrence: '1st', day: 1, time: '05:00 PM', expanded: true, showTimePicker: false, showOccurrencePicker: false, showDayOfWeekPicker: false }]);
    expect(R.updateOrdinal(o, 'o1', { day: 6 }).ordinalEntries[0].day).toBe(6);
    expect(R.removeOrdinal(o, 'o1').ordinalEntries).toEqual([]);
  });
});

describe('custom routines', () => {
  const custom = () => ({ ...base(), frequency: 'custom' as const });
  it('start, pick a frequency, build and finish a weekly rule', () => {
    let d = R.startCustom(custom());
    expect(d).toMatchObject({ customBuilding: true, customFreq: null });
    d = R.pickCustomFrequency(d, 'weekly');
    d = R.addWeekdayRow(d, 'r1', '2026-12-01');
    d = R.updateWeekdayRow(d, 'r1', { day: 2, time: '07:00 PM' });
    const done = R.finishCustomRoutine(d, 'c1');
    expect(done.builtRoutines).toHaveLength(1);
    expect(done.builtRoutines[0]).toMatchObject({ id: 'c1', frequency: 'weekly', label: 'Weekly · Tue @ 07:00 PM', editing: false,
      dayTimes: [{ day: 2, time: '07:00 PM', startDate: '2026-12-01' }] });
    expect(done).toMatchObject({ customBuilding: false, customFreq: null, weekdayRows: [], dailySameTime: null });
  });
  it('finishing with nothing filled in does nothing', () => {
    const d = R.pickCustomFrequency(R.startCustom(custom()), 'weekly');
    expect(R.finishCustomRoutine(d, 'c1')).toBe(d);
  });
  it('monthly by weekday becomes an ordinal routine with rules', () => {
    let d = R.pickCustomFrequency(R.startCustom(custom()), 'monthly');
    d = { ...d, monthlyMode: 'ordinal' };
    d = R.updateOrdinal(R.addOrdinal(d, 'o1'), 'o1', { occurrence: '2nd', day: 6 });
    const r = R.finishCustomRoutine(d, 'c1').builtRoutines[0];
    expect(r).toMatchObject({ frequency: 'ordinal', rules: [{ type: 'byDay', occurrence: '2nd', day: 6 }], dayTimes: [{ day: 6, time: '05:00 PM' }] });
  });
  it('edit a built rule and save it back under the same id', () => {
    let d = R.pickCustomFrequency(R.startCustom(custom()), 'weekly');
    d = R.updateWeekdayRow(R.addWeekdayRow(d, 'r1', '2026-12-01'), 'r1', { day: 1 });
    d = R.finishCustomRoutine(d, 'c1');
    d = R.startEditingRoutine(d, 'c1');
    expect(d).toMatchObject({ customBuilding: true, customFreq: 'weekly' });
    expect(d.builtRoutines[0].editing).toBe(true);
    d = R.updateWeekdayRow(d, 'r1', { day: 3 });
    d = R.saveEditedRoutine(d, 'c1');
    expect(d.builtRoutines).toHaveLength(1);
    expect(d.builtRoutines[0]).toMatchObject({ id: 'c1', editing: false, dayTimes: [{ day: 3, time: '05:00 PM', startDate: '2026-12-01' }] });
    expect(R.removeBuiltRoutine(d, 'c1').builtRoutines).toEqual([]);
  });
  it('cancel stops building and clears editing marks', () => {
    let d = R.pickCustomFrequency(R.startCustom(custom()), 'weekly');
    d = R.updateWeekdayRow(R.addWeekdayRow(d, 'r1', '2026-12-01'), 'r1', { day: 1 });
    d = R.startEditingRoutine(R.finishCustomRoutine(d, 'c1'), 'c1');
    const c = R.cancelCustom(d);
    expect(c).toMatchObject({ customBuilding: false, customFreq: null });
    expect(c.builtRoutines[0].editing).toBe(false);
  });
});

describe('routines sent to the server (unchanged by the merge)', () => {
  it('weekly', () => {
    let d = R.selectFrequency(base(), 'weekly');
    d = R.updateWeekdayRow(R.addWeekdayRow(d, 'r1', '2026-12-01'), 'r1', { day: 2, time: '07:00 PM', endTime: '09:00 PM' });
    expect(buildRoutines(d)).toEqual([{ frequency: 'weekly', dayTimes: [{ day: 2, time: '07:00 PM', endTime: '09:00 PM', startDate: '2026-12-01' }] }]);
  });
  it('monthly by date', () => {
    let d = { ...R.selectFrequency(base(), 'monthly'), monthlyMode: 'date' as const };
    d = R.updateMonthlyDate(R.addMonthlyDate(d, 'm1'), 'm1', { date: 15 });
    expect(buildRoutines(d)).toEqual([{ frequency: 'monthly', dayTimes: [{ date: 15, time: '05:00 PM' }] }]);
  });
  it('custom passes built routines through', () => {
    let d = R.pickCustomFrequency(R.startCustom(R.selectFrequency(base(), 'custom')), 'weekly');
    d = R.finishCustomRoutine(R.updateWeekdayRow(R.addWeekdayRow(d, 'r1', '2026-12-01'), 'r1', { day: 5 }), 'c1');
    expect(buildRoutines(d)).toEqual([{ frequency: 'weekly', dayTimes: [{ day: 5, time: '05:00 PM', startDate: '2026-12-01' }], rules: undefined }]);
  });
});
