import { meetupIssues, scheduleIssues, seriesStartDay, visibleIssues, fixMessage, firstArea, issueFor, type Issue } from '../formIssues';
import { draftForNew, type MeetupDraft } from '../meetupFormDraft';
import { defaultSchedule } from '../createGroupDraft';

const m = (over: Partial<MeetupDraft> = {}): MeetupDraft => ({ ...draftForNew(undefined, '2026-12-06'), ...over });
const sch = (over: any = {}) => ({ ...defaultSchedule('Sunday Dinner'), ...over });
const row = (id: string, day: number | null, over: any = {}) => ({ id, day, time: '05:00 PM', startDate: '2026-12-01', showTimePicker: false, ...over });

describe('meetupIssues', () => {
  it('a fresh draft has none', () => expect(meetupIssues(m())).toEqual([]));
  it('limited capacity left blank is missing', () => {
    expect(meetupIssues(m({ maxAttendeesMode: 'limited', maxAttendeesInput: '' }))).toEqual([
      { area: 'capacity', field: 'capacityInput', kind: 'missing', message: 'Enter how many people can come' },
    ]);
  });
  it('a bad capacity is invalid with the existing text', () => {
    expect(meetupIssues(m({ maxAttendeesMode: 'limited', maxAttendeesInput: '0' }))[0])
      .toEqual({ area: 'capacity', field: 'capacityInput', kind: 'invalid', message: 'Enter a number between 1 and 200.' });
  });
  it('end time equal to start', () => {
    expect(meetupIssues(m({ endTime: '05:00 PM' }))[0]).toMatchObject({ area: 'when', field: 'endTime', kind: 'invalid' });
  });
  it('minimum above capacity only when RSVP limited with a deadline', () => {
    const over = { maxAttendeesMode: 'limited' as const, maxAttendeesInput: '4', rsvpRestricted: true, minAttendeesInput: '6' };
    expect(meetupIssues(m({ ...over, deadlineEnabled: true }))).toEqual([
      { area: 'rsvp', field: 'minAttendees', kind: 'invalid', message: "Can't be more than the max attendees." },
    ]);
    expect(meetupIssues(m({ ...over, deadlineEnabled: false }))).toEqual([]);
  });
  it('points at the offending item, and waits for a confirm before showing it', () => {
    const items = [{ key: 'a', name: 'Chips', max: '' }, { key: 'b', name: 'chips', max: '' }];
    expect(meetupIssues(m({ bringItems: items }))).toEqual([
      { area: 'bring', field: 'item:b', kind: 'missing', message: '"chips" is listed twice.' },
    ]);
    expect(meetupIssues(m({ bringItems: [{ key: 'x', name: '', max: '' }] }))[0].field).toBe('item:x');
  });
  it('an unfinished RSVP question waits for Save, then points at that question', () => {
    const q = { key: 'k1', prompt: '', type: 'text' as const, options: ['', ''], required: false };
    expect(meetupIssues(m({ questions: [q] }))).toEqual([
      { area: 'questions', field: 'question:k1', kind: 'missing', message: 'Type the question, or remove it' },
    ]);
    expect(scheduleIssues(sch({ frequency: 'daily', dailySameTime: true, questions: [q] }), { requireName: true, emptyIsValid: true })[0])
      .toMatchObject({ area: 'questions', field: 'question:k1' });
  });
  it('a missing group', () => {
    expect(meetupIssues(m(), 'Pick a group')).toEqual([{ area: 'group', field: 'group', kind: 'missing', message: 'Pick a group' }]);
  });
});

describe('scheduleIssues', () => {
  const opts = { requireName: true, emptyIsValid: true };
  it('an untouched create-group tab is valid', () => expect(scheduleIssues(sch(), opts)).toEqual([]));
  it('Edit Schedule needs a frequency', () => {
    expect(scheduleIssues(sch(), { requireName: true, emptyIsValid: false })).toEqual([
      { area: 'when', field: 'frequency', kind: 'missing', message: 'Pick how often' },
    ]);
  });
  it('name required', () => {
    expect(scheduleIssues(sch({ name: ' ', frequency: 'daily', dailySameTime: true }), opts))
      .toEqual([{ area: 'name', field: 'name', kind: 'missing', message: 'Give this schedule a name' }]);
  });
  it('daily needs same-or-varies', () => {
    expect(scheduleIssues(sch({ frequency: 'daily' }), opts)[0]).toMatchObject({ field: 'dailySameTime', message: 'Choose same time or varies' });
  });
  it('weekly with no rows, and a row with no day', () => {
    expect(scheduleIssues(sch({ frequency: 'weekly' }), opts)[0]).toMatchObject({ field: 'weekdayRows', message: 'Add a day' });
    const issues = scheduleIssues(sch({ frequency: 'biweekly', weekdayRows: [row('r1', 2), row('r2', null)] }), opts);
    expect(issues).toEqual([{ area: 'when', field: 'weekday:r2', kind: 'missing', message: 'Pick a day for each row' }]);
  });
  it('monthly', () => {
    expect(scheduleIssues(sch({ frequency: 'monthly' }), opts)[0]).toMatchObject({ field: 'monthlyMode', message: 'Choose by date or by weekday' });
    expect(scheduleIssues(sch({ frequency: 'monthly', monthlyMode: 'date' }), opts)[0]).toMatchObject({ field: 'monthlyDates', message: 'Add at least one date' });
    expect(scheduleIssues(sch({ frequency: 'monthly', monthlyMode: 'ordinal' }), opts)[0]).toMatchObject({ field: 'ordinalEntries', message: 'Add at least one day' });
  });
  it('long intervals', () => {
    expect(scheduleIssues(sch({ frequency: 'quarterly' }), opts).map((i: Issue) => i.field)).toEqual(['longFirstDate', 'longRepeatBy']);
    expect(scheduleIssues(sch({ frequency: 'quarterly', longFirstDate: '2026-12-01', longRepeatBy: 'date' }), opts)).toEqual([]);
  });
  it('custom', () => {
    expect(scheduleIssues(sch({ frequency: 'custom' }), opts)[0]).toMatchObject({ field: 'builtRoutines', message: 'Add at least one rule' });
  });
  it('end time, capacity, minimum and items like meetups', () => {
    const base = { frequency: 'weekly', weekdayRows: [row('r1', 2)] };
    expect(scheduleIssues(sch({ ...base, weekdayRows: [row('r1', 2, { endTime: '05:00 PM' })] }), opts)[0]).toMatchObject({ area: 'when', field: 'endTime', kind: 'invalid' });
    expect(scheduleIssues(sch({ ...base, maxAttendeesMode: 'limited', maxAttendeesInput: '' }), opts)[0]).toMatchObject({ area: 'capacity', kind: 'missing' });
    expect(scheduleIssues(sch({ ...base, maxAttendeesMode: 'limited', maxAttendeesInput: '4', minAttendeesInput: '6', rsvpRestricted: true, deadlineEnabled: false }), opts)).toEqual([]);
    expect(scheduleIssues(sch({ ...base, bringItems: [{ key: 'k', name: '', max: '' }] }), opts)[0]).toMatchObject({ area: 'bring', field: 'item:k' });
  });
});

describe('showing issues', () => {
  const missing: Issue = { area: 'capacity', field: 'capacityInput', kind: 'missing', message: 'Enter how many people can come' };
  const invalid: Issue = { area: 'when', field: 'endTime', kind: 'invalid', message: 'x' };
  it('missing ones wait for a submit attempt', () => {
    expect(visibleIssues([missing, invalid], false)).toEqual([invalid]);
    expect(visibleIssues([missing, invalid], true)).toEqual([missing, invalid]);
  });
  it('footer text', () => {
    expect(fixMessage(0)).toBe('');
    expect(fixMessage(1)).toBe('Fix 1 thing above');
    expect(fixMessage(3)).toBe('Fix 3 things above');
  });
  it('first area in screen order, and the message for a row', () => {
    expect(firstArea([missing, invalid], ['name', 'when', 'capacity'])).toBe('when');
    expect(firstArea([], ['when'])).toBeNull();
    expect(issueFor([missing, invalid], 'capacity')).toBe('Enter how many people can come');
    expect(issueFor([missing], 'when')).toBeNull();
  });
});

describe('scheduleIssues: end date', () => {
  const opts = { requireName: true, emptyIsValid: true };
  const MSG = "End date can't be before the start date.";
  const weekly = (over: any = {}) => sch({ frequency: 'weekly', weekdayRows: [row('r1', 2)], startDate: '2027-03-01', ...over });

  it('no end date is fine', () => expect(scheduleIssues(weekly({ endDate: null }), opts)).toEqual([]));
  it('an end date on the start date is fine', () => expect(scheduleIssues(weekly({ endDate: '2027-03-01' }), opts)).toEqual([]));
  it('an end date before the start date is flagged on the end-date field', () => {
    expect(scheduleIssues(weekly({ endDate: '2027-02-28' }), opts)).toEqual([
      { area: 'when', field: 'endDate', kind: 'invalid', message: MSG },
    ]);
  });
  it('biweekly compares against its rows’ first dates', () => {
    const d = sch({ frequency: 'biweekly', startDate: '2026-11-20', weekdayRows: [row('r1', 2, { startDate: '2027-04-06' })] });
    expect(scheduleIssues({ ...d, endDate: '2027-04-01' }, opts)).toEqual([{ area: 'when', field: 'endDate', kind: 'invalid', message: MSG }]);
    expect(scheduleIssues({ ...d, endDate: '2027-04-06' }, opts)).toEqual([]);
  });
});

describe('seriesStartDay', () => {
  it('uses the schedule start for weekly', () => expect(seriesStartDay(sch({ frequency: 'weekly', startDate: '2027-03-01', weekdayRows: [row('r1', 2)] }))).toBe('2027-03-01'));
  it('uses the earliest row first date for biweekly', () => {
    expect(seriesStartDay(sch({ frequency: 'biweekly', startDate: '2026-11-20',
      weekdayRows: [row('r1', 2, { startDate: '2027-04-13' }), row('r2', 5, { startDate: '2027-04-09' })] }))).toBe('2027-04-09');
  });
  it('uses the first date for yearly', () => {
    expect(seriesStartDay(sch({ frequency: 'yearly', startDate: '2026-11-20', longFirstDate: '2027-06-01', longTime: '06:00 PM', longRepeatBy: 'date' }))).toBe('2027-06-01');
  });
});
