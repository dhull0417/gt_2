import { ordSfx, timeToMinutes, getMaxAttendeesError, uid, DAYS_OF_WEEK, TZ_ABBR, USA_TIMEZONES } from '../scheduleConstants';
import { buildRoutines, type RoutineDraft } from '../scheduleRoutines';
import { defaultSchedule as createDefault, isScheduleTabValid, buildSchedulePayload as createPayload } from '../createGroupDraft';
import {
  defaultSchedule as editDefault,
  buildSchedulePayload as editPayload,
  buildLabel,
  getBringItemsError,
  getMinAttendeesError,
  apiRoutineToBuiltRoutine,
  scheduleFromNamedSchedule,
} from '../editScheduleDraft';
import { premiumSectionSummary } from '../premiumSection';

const draft = (over: Partial<RoutineDraft> = {}): RoutineDraft => ({
  frequency: null,
  builtRoutines: [],
  dailySameTime: null,
  dailySharedTime: '05:00 PM',
  dailyRows: [],
  weekdayRows: [],
  monthlyMode: null,
  monthlyDates: [],
  ordinalEntries: [],
  ...over,
});

describe('scheduleConstants', () => {
  it('ordSfx handles 1-3, teens, and 21+ correctly', () => {
    const out = (n: number) => `${n}${ordSfx(n)}`;
    expect([1, 2, 3, 4, 10, 11, 12, 13, 14, 20, 21, 22, 23, 24, 30, 31].map(out)).toEqual([
      '1st', '2nd', '3rd', '4th', '10th', '11th', '12th', '13th', '14th', '20th', '21st', '22nd', '23rd', '24th', '30th', '31st',
    ]);
  });

  it('timeToMinutes converts "hh:mm AM/PM"', () => {
    expect(timeToMinutes('12:00 AM')).toBe(0);
    expect(timeToMinutes('09:30 AM')).toBe(9 * 60 + 30);
    expect(timeToMinutes('12:15 PM')).toBe(12 * 60 + 15);
    expect(timeToMinutes('05:00 PM')).toBe(17 * 60);
    expect(timeToMinutes('11:59 PM')).toBe(23 * 60 + 59);
  });

  it('getMaxAttendeesError: only validates when limited, 1-200 whole numbers', () => {
    expect(getMaxAttendeesError('unlimited', 'abc')).toBeNull();
    expect(getMaxAttendeesError('limited', '')).toBeNull(); // not yet answered
    expect(getMaxAttendeesError('limited', '12')).toBeNull();
    expect(getMaxAttendeesError('limited', '1.5')).toMatch(/Numbers only/);
    expect(getMaxAttendeesError('limited', '0')).toMatch(/between 1 and 200/);
    expect(getMaxAttendeesError('limited', '201')).toMatch(/between 1 and 200/);
  });

  it('has a weekday list, and every timezone has an abbreviation', () => {
    expect(DAYS_OF_WEEK.map(d => d.value)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const tz of USA_TIMEZONES) expect(TZ_ABBR[tz.value]).toBeTruthy();
    expect(uid()).not.toEqual(uid());
  });
});

describe('buildRoutines', () => {
  it('no frequency => nothing', () => {
    expect(buildRoutines(draft())).toEqual([]);
  });

  it('daily with one shared time fills all seven days', () => {
    const [r] = buildRoutines(draft({ frequency: 'daily', dailySameTime: true, dailySharedTime: '06:30 PM' }));
    expect(r.frequency).toBe('daily');
    expect(r.dayTimes).toHaveLength(7);
    expect(r.dayTimes.every((d: any) => d.time === '06:30 PM')).toBe(true);
    expect(r.dayTimes.map((d: any) => d.day)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('daily with per-day times uses the rows as given', () => {
    const [r] = buildRoutines(
      draft({ frequency: 'daily', dailySameTime: false, dailyRows: [{ day: 1, time: '07:00 AM' }, { day: 5, time: '08:00 PM' }] })
    );
    expect(r.dayTimes).toEqual([{ day: 1, time: '07:00 AM' }, { day: 5, time: '08:00 PM' }]);
  });

  it('weekly/biweekly skip rows with no day and only include startDate when set', () => {
    const [w] = buildRoutines(
      draft({
        frequency: 'biweekly',
        weekdayRows: [
          { day: 3, time: '07:00 PM', startDate: '2026-10-07' },
          { day: null, time: '07:00 PM', startDate: null },
          { day: 6, time: '09:00 AM', startDate: null },
        ],
      })
    );
    expect(w.frequency).toBe('biweekly');
    expect(w.dayTimes).toEqual([
      { day: 3, time: '07:00 PM', startDate: '2026-10-07' },
      { day: 6, time: '09:00 AM' },
    ]);
  });

  it('monthly by date', () => {
    expect(
      buildRoutines(draft({ frequency: 'monthly', monthlyMode: 'date', monthlyDates: [{ date: 1, time: '06:00 PM' }, { date: 15, time: '06:00 PM' }] }))
    ).toEqual([{ frequency: 'monthly', dayTimes: [{ date: 1, time: '06:00 PM' }, { date: 15, time: '06:00 PM' }] }]);
  });

  it('monthly by ordinal becomes an "ordinal" routine with byDay rules', () => {
    const [r] = buildRoutines(
      draft({ frequency: 'monthly', monthlyMode: 'ordinal', ordinalEntries: [{ occurrence: '2nd', day: 3, time: '07:00 PM' }, { occurrence: 'Last', day: 0, time: '09:00 AM' }] })
    );
    expect(r.frequency).toBe('ordinal');
    expect(r.rules).toEqual([
      { type: 'byDay', occurrence: '2nd', day: 3 },
      { type: 'byDay', occurrence: 'Last', day: 0 },
    ]);
    expect(r.dayTimes).toEqual([{ day: 3, time: '07:00 PM' }, { day: 0, time: '09:00 AM' }]);
  });

  it('monthly with no mode chosen yields nothing; custom passes built routines through', () => {
    expect(buildRoutines(draft({ frequency: 'monthly' }))).toEqual([]);
    const built = [{ frequency: 'weekly' as const, dayTimes: [{ day: 1, time: 'x' }], rules: undefined }];
    expect(buildRoutines(draft({ frequency: 'custom', builtRoutines: built }))).toEqual(built);
  });
});

describe('create-group draft', () => {
  const base = () => createDefault('Pickup');

  it('defaults', () => {
    const d = base();
    expect(d.name).toBe('Pickup');
    expect(d.frequency).toBeNull();
    expect(d.dailyRows).toHaveLength(7);
    expect(d.maxAttendeesMode).toBe('unlimited');
  });

  it('a tab with no frequency is always valid; a started one needs a name and its details', () => {
    expect(isScheduleTabValid(base())).toBe(true);
    expect(isScheduleTabValid({ ...base(), frequency: 'weekly', weekdayRows: [] })).toBe(false);
    expect(isScheduleTabValid({ ...base(), frequency: 'weekly', name: '  ', weekdayRows: [{ id: 'a', day: 1, time: 'x', startDate: null, showTimePicker: false }] })).toBe(false);
    expect(isScheduleTabValid({ ...base(), frequency: 'weekly', weekdayRows: [{ id: 'a', day: 1, time: 'x', startDate: null, showTimePicker: false }] })).toBe(true);
    expect(isScheduleTabValid({ ...base(), frequency: 'weekly', weekdayRows: [{ id: 'a', day: null, time: 'x', startDate: null, showTimePicker: false }] })).toBe(false);
    expect(isScheduleTabValid({ ...base(), frequency: 'daily', dailySameTime: null })).toBe(false);
    expect(isScheduleTabValid({ ...base(), frequency: 'daily', dailySameTime: false })).toBe(true);
    expect(isScheduleTabValid({ ...base(), frequency: 'monthly', monthlyMode: null })).toBe(false);
    expect(isScheduleTabValid({ ...base(), frequency: 'custom', builtRoutines: [] })).toBe(false);
  });

  it('a limited max must be filled in and valid', () => {
    const ok = { ...base(), frequency: 'daily' as const, dailySameTime: true };
    expect(isScheduleTabValid({ ...ok, maxAttendeesMode: 'limited', maxAttendeesInput: '' })).toBe(false);
    expect(isScheduleTabValid({ ...ok, maxAttendeesMode: 'limited', maxAttendeesInput: '0' })).toBe(false);
    expect(isScheduleTabValid({ ...ok, maxAttendeesMode: 'limited', maxAttendeesInput: '8' })).toBe(true);
  });

  it('payload is null without a frequency or routines, otherwise carries RSVP window settings', () => {
    expect(createPayload(base())).toBeNull();
    expect(createPayload({ ...base(), frequency: 'monthly', monthlyMode: null })).toBeNull();
    const p = createPayload({
      ...base(), frequency: 'daily', dailySameTime: true, location: 'Park', description: 'hi',
      maxAttendeesMode: 'limited', maxAttendeesInput: '10',
      rsvpRestricted: true, leadEnabled: true, leadDays: 4, deadlineEnabled: false,
    })!;
    expect(p.routines).toHaveLength(1);
    expect(p.defaultLocation).toBe('Park');
    expect(p.defaultCapacity).toBe(10);
    expect(p.generationLeadDays).toBe(4);
    expect(p.generationDeadlineDays).toBeNull();
  });

  it('RSVP window days are ignored unless "restrict RSVP" is on', () => {
    const p = createPayload({ ...base(), frequency: 'daily', dailySameTime: true, rsvpRestricted: false, leadEnabled: true, deadlineEnabled: true })!;
    expect(p.generationLeadDays).toBeNull();
    expect(p.generationDeadlineDays).toBeNull();
    expect(p.defaultCapacity).toBe(0);
  });
});

describe('create-group draft: Premium settings', () => {
  const ready = () => ({ ...createDefault('Pickup'), frequency: 'daily' as const, dailySameTime: true });
  const withDeadline = () => ({ ...ready(), rsvpRestricted: true, deadlineEnabled: true, deadlineDays: 1 });

  it('defaults to no minimum, no items and no rides', () => {
    const d = createDefault('Pickup');
    expect(d.minAttendeesInput).toBe('');
    expect(d.bringItems).toEqual([]);
    expect(d.ridesEnabled).toBe(false);
  });

  it('payload sends the minimum only when an RSVP deadline is set', () => {
    expect(createPayload({ ...withDeadline(), minAttendeesInput: '4' })!.defaultMinAttendees).toBe(4);
    expect(createPayload({ ...ready(), minAttendeesInput: '4' })!.defaultMinAttendees).toBe(0);
    expect(createPayload({ ...withDeadline(), deadlineEnabled: false, minAttendeesInput: '4' })!.defaultMinAttendees).toBe(0);
    expect(createPayload({ ...withDeadline(), minAttendeesInput: '' })!.defaultMinAttendees).toBe(0);
  });

  it('payload carries items to bring (trimmed, blank max = no limit) and rides', () => {
    const p = createPayload({
      ...ready(), ridesEnabled: true,
      bringItems: [{ key: 'a', name: ' Chips ', max: '' }, { key: 'b', name: 'Drinks', max: '3' }],
    })!;
    expect(p.defaultBringItems).toEqual([{ name: 'Chips', max: null }, { name: 'Drinks', max: 3 }]);
    expect(p.defaultRidesEnabled).toBe(true);
  });

  it('a bad minimum blocks the tab only when it applies', () => {
    expect(isScheduleTabValid({ ...withDeadline(), minAttendeesInput: '0' })).toBe(false);
    expect(isScheduleTabValid({ ...withDeadline(), maxAttendeesMode: 'limited', maxAttendeesInput: '5', minAttendeesInput: '6' })).toBe(false);
    expect(isScheduleTabValid({ ...withDeadline(), minAttendeesInput: '3' })).toBe(true);
    expect(isScheduleTabValid({ ...ready(), minAttendeesInput: '0' })).toBe(true);
  });

  it('an unnamed or duplicate item blocks the tab', () => {
    expect(isScheduleTabValid({ ...ready(), bringItems: [{ key: 'a', name: '', max: '' }] })).toBe(false);
    expect(isScheduleTabValid({ ...ready(), bringItems: [{ key: 'a', name: 'Ball', max: '' }, { key: 'b', name: 'ball', max: '' }] })).toBe(false);
    expect(isScheduleTabValid({ ...ready(), bringItems: [{ key: 'a', name: 'Ball', max: '2' }] })).toBe(true);
  });
});

describe('premiumSectionSummary', () => {
  it('describes what is set up, for the collapsed header', () => {
    expect(premiumSectionSummary([], false)).toBe('Things to bring, rides and more');
    expect(premiumSectionSummary([{ key: 'a', name: 'Chips', max: '' }], false)).toBe('1 item to bring');
    expect(premiumSectionSummary([{ key: 'a', name: 'Chips', max: '' }, { key: 'b', name: 'Ice', max: '' }], true)).toBe('2 items to bring · Rides on');
    expect(premiumSectionSummary([], true)).toBe('Rides on');
  });
});

describe('edit-schedule draft', () => {
  it('getMinAttendeesError', () => {
    expect(getMinAttendeesError('', 'limited', '10')).toBeNull();
    expect(getMinAttendeesError('x', 'unlimited', '')).toMatch(/Numbers only/);
    expect(getMinAttendeesError('0', 'unlimited', '')).toMatch(/1 or more/);
    expect(getMinAttendeesError('11', 'limited', '10')).toMatch(/more than the max/);
    expect(getMinAttendeesError('10', 'limited', '10')).toBeNull();
    expect(getMinAttendeesError('50', 'unlimited', '')).toBeNull();
  });

  it('getBringItemsError', () => {
    const item = (name: string, max = '') => ({ key: name, name, max });
    expect(getBringItemsError([])).toBeNull();
    expect(getBringItemsError([item('Chips', '3'), item('Ice')])).toBeNull();
    expect(getBringItemsError([item('  ')])).toMatch(/name/);
    expect(getBringItemsError([item('a'.repeat(41))])).toMatch(/40 characters/);
    expect(getBringItemsError([item('Chips'), item('chips')])).toMatch(/listed twice/);
    expect(getBringItemsError([item('Chips', 'two')])).toMatch(/whole number/);
    expect(getBringItemsError([item('Chips', '0')])).toMatch(/1 to 99/);
    expect(getBringItemsError([item('Chips', '100')])).toMatch(/1 to 99/);
  });

  it('buildLabel summarizes the first two entries', () => {
    expect(buildLabel('weekly', [{ day: 1, time: '07:00 PM' }, { day: 3, time: '07:00 PM' }, { day: 5, time: '07:00 PM' }])).toBe('Weekly · Mon @ 07:00 PM, Wed @ 07:00 PM +1');
    expect(buildLabel('monthly', [{ date: 21, time: '06:00 PM' }, { date: 22, time: '06:00 PM' }])).toBe('Monthly · 21st @ 06:00 PM, 22nd @ 06:00 PM');
    const ord: any = [{ id: 'a', occurrence: '2nd', day: 3, time: '07:00 PM' }];
    expect(buildLabel('ordinal', [], ord)).toBe('Ordinal · 2nd Wed @ 07:00 PM');
  });

  it('payload trims text and sends minimum/bring items/timezone', () => {
    const d = {
      ...editDefault(), name: '  Pickup ', location: ' Park ', description: ' hi ', frequency: 'daily' as const, dailySameTime: true,
      rsvpRestricted: true, deadlineEnabled: true, deadlineDays: 1, minAttendeesInput: '4',
      bringItems: [{ key: 'k', _id: 'b1', name: ' Chips ', max: '3' }, { key: 'k2', name: 'Ice', max: '' }],
      ridesEnabled: true, timezone: 'America/Chicago',
    };
    const p = editPayload(d)!;
    expect(p.name).toBe('Pickup');
    expect(p.defaultLocation).toBe('Park');
    expect(p.defaultDescription).toBe('hi');
    expect(p.defaultMinAttendees).toBe(4);
    expect(p.defaultBringItems).toEqual([{ _id: 'b1', name: 'Chips', max: 3 }, { name: 'Ice', max: null }]);
    expect(p.defaultRidesEnabled).toBe(true);
    expect(p.timezone).toBe('America/Chicago');
  });

  it('the minimum is only sent when RSVP deadline is on', () => {
    const d = { ...editDefault(), frequency: 'daily' as const, dailySameTime: true, minAttendeesInput: '4', rsvpRestricted: true, deadlineEnabled: false };
    expect(editPayload(d)!.defaultMinAttendees).toBe(0);
  });

  it('apiRoutineToBuiltRoutine rebuilds an editable routine with a label', () => {
    const b = apiRoutineToBuiltRoutine({ frequency: 'weekly', dayTimes: [{ day: 2, time: '07:00 PM' }] } as any);
    expect(b.frequency).toBe('weekly');
    expect(b.label).toBe('Weekly · Tue @ 07:00 PM');
    expect(b.snapshot.weekdayRows).toHaveLength(1);
    expect(b.editing).toBe(false);
    const o = apiRoutineToBuiltRoutine({ frequency: 'ordinal', dayTimes: [{ day: 0, time: '09:00 AM' }], rules: [{ type: 'byDay', occurrence: 'Last', day: 0 }] } as any);
    expect(o.label).toBe('Ordinal · Last Sun @ 09:00 AM');
    expect(o.snapshot.ordinalEntries?.[0].occurrence).toBe('Last');
  });

  const group: any = { timezone: 'America/Chicago' };
  const named = (over: any): any => ({ name: 'Pickup', defaultCapacity: 0, routines: [], ...over });

  it('scheduleFromNamedSchedule: no schedule => defaults in the group timezone', () => {
    const d = scheduleFromNamedSchedule(group, null);
    expect(d.frequency).toBeNull();
    expect(d.timezone).toBe('America/Chicago');
    expect(scheduleFromNamedSchedule({} as any, null).timezone).toBe('America/Denver');
  });

  it('scheduleFromNamedSchedule: infers frequency from the routines and restores RSVP settings', () => {
    const weekly = scheduleFromNamedSchedule(group, named({
      defaultCapacity: 12, defaultMinAttendees: 4, generationLeadDays: 5, generationDeadlineDays: 1,
      routines: [{ frequency: 'weekly', dayTimes: [{ day: 3, time: '07:00 PM' }] }], startDate: '2026-10-05',
    }));
    expect(weekly.frequency).toBe('weekly');
    expect(weekly.weekdayRows[0].day).toBe(3);
    expect(weekly.maxAttendeesMode).toBe('limited');
    expect(weekly.maxAttendeesInput).toBe('12');
    expect(weekly.minAttendeesInput).toBe('4');
    expect(weekly.rsvpRestricted).toBe(true);
    expect(weekly.leadEnabled).toBe(true);
    expect(weekly.deadlineEnabled).toBe(true);
    expect(weekly.startDate).toBe('2026-10-05');

    const multi = scheduleFromNamedSchedule(group, named({
      routines: [
        { frequency: 'weekly', dayTimes: [{ day: 1, time: 'x' }] },
        { frequency: 'monthly', dayTimes: [{ date: 15, time: 'x' }] },
      ],
    }));
    expect(multi.frequency).toBe('custom');
    expect(multi.builtRoutines).toHaveLength(2);

    const daily = scheduleFromNamedSchedule(group, named({ routines: [{ frequency: 'daily', dayTimes: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, time: '06:00 PM' })) }] }));
    expect(daily.frequency).toBe('daily');
    expect(daily.dailySameTime).toBe(true);
    expect(daily.dailySharedTime).toBe('06:00 PM');
  });

  it('round trip: a draft survives payload -> named schedule -> draft', () => {
    const original = {
      ...editDefault(), name: 'Pickup', frequency: 'weekly' as const, startDate: '2026-10-05',
      weekdayRows: [{ id: 'a', day: 1, time: '07:00 PM', startDate: null, showTimePicker: false, showDayPicker: false, showStartDatePicker: false }],
    };
    const payload = editPayload(original)!;
    const restored = scheduleFromNamedSchedule(group, { ...payload, defaultCapacity: payload.defaultCapacity } as any);
    expect(restored.name).toBe('Pickup');
    expect(restored.frequency).toBe('weekly');
    expect(restored.weekdayRows.map(r => [r.day, r.time])).toEqual([[1, '07:00 PM']]);
    expect(buildRoutines(restored)).toEqual(buildRoutines(original));
  });
});

describe('quarterly / semiannual / yearly drafts', () => {
  const long = { longFirstDate: '2027-01-21', longRepeatBy: 'weekday' as const, longTime: '06:00 PM', longEndTime: null };
  const expected = {
    frequency: 'semiannual', repeatBy: 'weekday', rules: [{ type: 'byDay', occurrence: '3rd', day: 4 }],
    dayTimes: [{ startDate: '2027-01-21', day: 4, time: '06:00 PM' }],
  };

  it('buildRoutines builds the routine only once a date and mode are set', () => {
    expect(buildRoutines(draft({ frequency: 'semiannual', ...long }))).toEqual([expected]);
    expect(buildRoutines(draft({ frequency: 'semiannual', ...long, longRepeatBy: null }))).toEqual([]);
  });

  it('Multiple Rules keep repeatBy', () => {
    const built = { frequency: 'semiannual' as const, dayTimes: expected.dayTimes, rules: expected.rules, repeatBy: 'weekday' as const };
    expect(buildRoutines(draft({ frequency: 'custom', builtRoutines: [built] }))).toEqual([expected]);
  });

  it('create-group: valid only with a date and mode; payload starts on the first date', () => {
    const base = { ...createDefault('Board'), frequency: 'semiannual' as const };
    expect(isScheduleTabValid(base)).toBe(false);
    expect(isScheduleTabValid({ ...base, longFirstDate: '2027-01-21' })).toBe(false);
    const full = { ...base, ...long };
    expect(isScheduleTabValid(full)).toBe(true);
    const payload = createPayload(full)!;
    expect(payload.routines).toEqual([expected]);
    expect(payload.startDate).toBe('2027-01-21');
  });

  it('edit-schedule: a stored long routine restores its draft, and Multiple Rules label it', () => {
    const group: any = { timezone: 'America/Chicago' };
    const stored = { ...expected, dayTimes: [{ ...expected.dayTimes[0], startDate: '2027-01-21T00:00:00.000Z' }] };
    const d = scheduleFromNamedSchedule(group, { name: 'Board', startDate: '2027-01-21T00:00:00.000Z', routines: [stored] } as any);
    expect(d.frequency).toBe('semiannual');
    expect({ longFirstDate: d.longFirstDate, longRepeatBy: d.longRepeatBy, longTime: d.longTime, longEndTime: d.longEndTime }).toEqual(long);
    expect(editPayload(d)!.routines).toEqual([expected]);

    const built = apiRoutineToBuiltRoutine(stored as any);
    expect(built.repeatBy).toBe('weekday');
    expect(built.label).toBe('Semi-annually · the 3rd Thursday @ 06:00 PM');
    expect(built.snapshot).toMatchObject(long);
  });
});
