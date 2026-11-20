import { oneOffWhenSummary, recurrenceSummary, rsvpSummary, capacitySummary, bringSummary, clock } from '../formSummaries';
import { defaultSchedule } from '../createGroupDraft';

const sch = (over: any = {}) => ({ ...defaultSchedule('Dinner'), ...over });
const row = (id: string, day: number | null, time = '07:00 PM') => ({ id, day, time, startDate: '2026-12-01', showTimePicker: false });

describe('clock', () => {
  it('drops the leading zero', () => {
    expect(clock('07:00 PM')).toBe('7:00 PM');
    expect(clock('11:30 AM')).toBe('11:30 AM');
  });
});

describe('oneOffWhenSummary', () => {
  it('date and time, with an optional end', () => {
    expect(oneOffWhenSummary('2026-12-05', '07:00 PM', null)).toBe('Sat, Dec 5 · 7:00 PM');
    expect(oneOffWhenSummary('2026-12-05', '07:00 PM', '09:00 PM')).toBe('Sat, Dec 5 · 7:00–9:00 PM');
    expect(oneOffWhenSummary('2026-12-05', '11:00 AM', '01:00 PM')).toBe('Sat, Dec 5 · 11:00 AM–1:00 PM');
  });
});

describe('recurrenceSummary', () => {
  it('not set', () => expect(recurrenceSummary(sch())).toBe('Not set'));
  it('daily', () => {
    expect(recurrenceSummary(sch({ frequency: 'daily' }))).toBe('Daily');
    expect(recurrenceSummary(sch({ frequency: 'daily', dailySameTime: true, dailySharedTime: '07:00 PM' }))).toBe('Daily · 7:00 PM');
    expect(recurrenceSummary(sch({ frequency: 'daily', dailySameTime: false }))).toBe('Daily · Times vary');
  });
  it('weekly and every two weeks', () => {
    expect(recurrenceSummary(sch({ frequency: 'weekly', weekdayRows: [row('a', 4), row('b', 2)] }))).toBe('Weekly · Tue, Thu · 7:00 PM');
    expect(recurrenceSummary(sch({ frequency: 'weekly', weekdayRows: [row('a', 2), row('b', 4, '06:00 PM')] }))).toBe('Weekly · Tue, Thu · Times vary');
    expect(recurrenceSummary(sch({ frequency: 'biweekly', weekdayRows: [row('a', 6)] }))).toBe('Every 2 weeks · Sat · 7:00 PM');
    expect(recurrenceSummary(sch({ frequency: 'weekly' }))).toBe('Weekly');
  });
  it('monthly', () => {
    const md = (date: number) => ({ id: String(date), date, time: '05:00 PM', expanded: false, showTimePicker: false });
    expect(recurrenceSummary(sch({ frequency: 'monthly', monthlyMode: 'date', monthlyDates: [md(15), md(1)] }))).toBe('Monthly · 1st, 15th');
    const oe = { id: 'o', occurrence: '1st', day: 6, time: '05:00 PM', expanded: false, showTimePicker: false, showOccurrencePicker: false, showDayOfWeekPicker: false };
    expect(recurrenceSummary(sch({ frequency: 'monthly', monthlyMode: 'ordinal', ordinalEntries: [oe] }))).toBe('Monthly · 1st Sat');
    expect(recurrenceSummary(sch({ frequency: 'monthly' }))).toBe('Monthly');
  });
  it('long intervals and custom', () => {
    expect(recurrenceSummary(sch({ frequency: 'quarterly' }))).toBe('Quarterly');
    expect(recurrenceSummary(sch({ frequency: 'quarterly', longFirstDate: '2026-12-05', longRepeatBy: 'date' }))).toMatch(/^Quarterly · /);
    expect(recurrenceSummary(sch({ frequency: 'custom', builtRoutines: [{}, {}] }))).toBe('Custom · 2 rules');
    expect(recurrenceSummary(sch({ frequency: 'custom', builtRoutines: [{}] }))).toBe('Custom · 1 rule');
    expect(recurrenceSummary(sch({ frequency: 'custom' }))).toBe('Custom');
  });
});

describe('rsvpSummary', () => {
  const r = (over: any) => ({ rsvpRestricted: true, leadEnabled: false, leadDays: 5, deadlineEnabled: false, deadlineDays: 2, minAttendeesInput: '', ...over });
  it('anytime', () => {
    expect(rsvpSummary(r({ rsvpRestricted: false, leadEnabled: true }))).toBe('Anytime');
    expect(rsvpSummary(r({}))).toBe('Anytime');
  });
  it('opens and closes', () => {
    expect(rsvpSummary(r({ leadEnabled: true, deadlineEnabled: true }))).toBe('Opens 5 days before · Closes 2 days before');
    expect(rsvpSummary(r({ leadEnabled: true, leadDays: 1 }))).toBe('Opens 1 day before');
    expect(rsvpSummary(r({ deadlineEnabled: true, deadlineDays: 0 }))).toBe('Closes the day of');
  });
  it('minimum shows only with a deadline', () => {
    expect(rsvpSummary(r({ deadlineEnabled: true, minAttendeesInput: '4' }))).toBe('Closes 2 days before · Min 4');
    expect(rsvpSummary(r({ leadEnabled: true, minAttendeesInput: '4' }))).toBe('Opens 5 days before');
  });
});

describe('capacity and items', () => {
  it('capacity', () => {
    expect(capacitySummary('unlimited', '')).toBe('Unlimited');
    expect(capacitySummary('limited', '12')).toBe('Up to 12');
    expect(capacitySummary('limited', '')).toBe('Limited');
  });
  it('items', () => {
    expect(bringSummary([])).toBe('None');
    expect(bringSummary([{ key: 'a', name: 'Chips', max: '' }])).toBe('Chips');
    expect(bringSummary([{ key: 'a', name: 'Chips', max: '' }, { key: 'b', name: 'Ice', max: '' }, { key: 'c', name: '', max: '' }])).toBe('3 items');
  });
});
