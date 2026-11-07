import { buildRoutines, type RoutineDraft } from '../scheduleRoutines';
import { defaultSchedule as createDefault, isScheduleTabValid } from '../createGroupDraft';
import { buildLabel, apiRoutineToBuiltRoutine, scheduleFromNamedSchedule, scheduleEndTimeError } from '../editScheduleDraft';

const draft = (over: Partial<RoutineDraft> = {}): RoutineDraft => ({
  frequency: null, builtRoutines: [], dailySameTime: null, dailySharedTime: '05:00 PM',
  dailyRows: [], weekdayRows: [], monthlyMode: null, monthlyDates: [], ordinalEntries: [], ...over,
});

describe('buildRoutines with end times', () => {
  it('sends endTime only on rows that have one', () => {
    const [r] = buildRoutines(draft({
      frequency: 'weekly',
      weekdayRows: [
        { day: 1, time: '06:00 PM', endTime: '09:00 PM', startDate: null },
        { day: 3, time: '06:00 PM', endTime: null, startDate: null },
      ],
    }));
    expect(r.dayTimes[0]).toEqual({ day: 1, time: '06:00 PM', endTime: '09:00 PM' });
    expect(r.dayTimes[1]).toEqual({ day: 3, time: '06:00 PM' });
  });
  it('applies the shared daily end time to every day', () => {
    const [r] = buildRoutines(draft({ frequency: 'daily', dailySameTime: true, dailySharedEndTime: '07:00 PM' }));
    expect(r.dayTimes).toHaveLength(7);
    expect(r.dayTimes.every((dt: any) => dt.endTime === '07:00 PM')).toBe(true);
  });
  it('per-day daily rows, monthly dates and ordinal entries carry their own end', () => {
    const daily = buildRoutines(draft({ frequency: 'daily', dailySameTime: false, dailyRows: [{ day: 0, time: '08:00 AM', endTime: '09:00 AM' }] }));
    expect(daily[0].dayTimes[0].endTime).toBe('09:00 AM');
    const monthly = buildRoutines(draft({ frequency: 'monthly', monthlyMode: 'date', monthlyDates: [{ date: 15, time: '06:00 PM', endTime: '08:00 PM' }] }));
    expect(monthly[0].dayTimes[0]).toEqual({ date: 15, time: '06:00 PM', endTime: '08:00 PM' });
    const ordinal = buildRoutines(draft({ frequency: 'monthly', monthlyMode: 'ordinal', ordinalEntries: [{ occurrence: 'Last', day: 5, time: '09:00 PM', endTime: '01:00 AM' }] }));
    expect(ordinal[0].dayTimes[0]).toEqual({ day: 5, time: '09:00 PM', endTime: '01:00 AM' });
  });
});

describe('loading end times back into the editor', () => {
  const group: any = { timezone: 'America/Denver' };
  const named = (routines: any[]): any => ({ name: 'Pickup', defaultCapacity: 0, routines, startDate: '2026-10-05' });

  it('weekly, monthly and ordinal rows keep their end times', () => {
    expect(scheduleFromNamedSchedule(group, named([{ frequency: 'weekly', dayTimes: [{ day: 2, time: '06:00 PM', endTime: '09:00 PM' }] }])).weekdayRows[0].endTime).toBe('09:00 PM');
    expect(scheduleFromNamedSchedule(group, named([{ frequency: 'monthly', dayTimes: [{ date: 1, time: '06:00 PM', endTime: '08:00 PM' }] }])).monthlyDates[0].endTime).toBe('08:00 PM');
    expect(scheduleFromNamedSchedule(group, named([{ frequency: 'ordinal', dayTimes: [{ day: 0, time: '09:00 AM', endTime: '10:00 AM' }], rules: [{ type: 'byDay', occurrence: '1st', day: 0 }] }])).ordinalEntries[0].endTime).toBe('10:00 AM');
  });

  it('daily: same start and end every day becomes the shared end time', () => {
    const days = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, time: '06:00 AM', endTime: '07:00 AM' }));
    const d = scheduleFromNamedSchedule(group, named([{ frequency: 'daily', dayTimes: days }]));
    expect(d.dailySameTime).toBe(true);
    expect(d.dailySharedEndTime).toBe('07:00 AM');
  });

  it('daily: same start but different ends is per-day', () => {
    const days = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, time: '06:00 AM', endTime: day === 0 ? '08:00 AM' : '07:00 AM' }));
    const d = scheduleFromNamedSchedule(group, named([{ frequency: 'daily', dayTimes: days }]));
    expect(d.dailySameTime).toBe(false);
    expect(d.dailyRows.find((r) => r.day === 0)?.endTime).toBe('08:00 AM');
  });

  it('custom routines keep end times in their snapshot and label', () => {
    const b = apiRoutineToBuiltRoutine({ frequency: 'weekly', dayTimes: [{ day: 2, time: '07:00 PM', endTime: '10:00 PM' }] } as any);
    expect(b.snapshot.weekdayRows?.[0].endTime).toBe('10:00 PM');
    expect(b.label).toBe('Weekly · Tue @ 07:00 PM – 10:00 PM');
    expect(buildLabel('weekly', [{ day: 2, time: '07:00 PM' }])).toBe('Weekly · Tue @ 07:00 PM');
  });
});

describe('end equal to start is blocked', () => {
  it('create-group tab is invalid', () => {
    const s = { ...createDefault('Pickup'), frequency: 'weekly' as const, weekdayRows: [{ id: 'a', day: 1, time: '06:00 PM', endTime: '06:00 PM', startDate: null, showTimePicker: false }] };
    expect(isScheduleTabValid(s)).toBe(false);
    expect(isScheduleTabValid({ ...s, weekdayRows: [{ ...s.weekdayRows[0], endTime: '07:00 PM' }] })).toBe(true);
  });
  it('edit screen gets the message', () => {
    expect(scheduleEndTimeError({ frequency: 'daily', dailySameTime: true, dailySharedTime: '06:00 PM', dailySharedEndTime: '06:00 PM' } as any))
      .toBe("End time can't be the same as the start time.");
    expect(scheduleEndTimeError({ frequency: 'weekly', weekdayRows: [{ day: 1, time: '06:00 PM', endTime: null }] } as any)).toBeNull();
  });
});
