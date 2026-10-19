import { formatSchedule } from '../schedule';

const sched = (routines: any[]) => ({ frequency: 'weekly', routines } as any);

describe('formatSchedule', () => {
  it('daily', () => {
    expect(formatSchedule(sched([{ frequency: 'daily', dayTimes: [] }]))).toBe('Daily');
  });

  it('weekly lists unique days in week order with an ampersand', () => {
    const dayTimes = [
      { day: 3, time: '7:00 PM' },
      { day: 1, time: '7:00 PM' },
      { day: 3, time: '9:00 PM' }, // duplicate day, different time
    ];
    expect(formatSchedule(sched([{ frequency: 'weekly', dayTimes }]))).toBe('Weekly on Mondays & Wednesdays');
  });

  it('weekly with one day, three days, and none', () => {
    expect(formatSchedule(sched([{ frequency: 'weekly', dayTimes: [{ day: 0, time: '9:00 AM' }] }]))).toBe('Weekly on Sundays');
    expect(
      formatSchedule(sched([{ frequency: 'weekly', dayTimes: [{ day: 5, time: 'x' }, { day: 1, time: 'x' }, { day: 3, time: 'x' }] }]))
    ).toBe('Weekly on Mondays, Wednesdays & Fridays');
    expect(formatSchedule(sched([{ frequency: 'weekly', dayTimes: [] }]))).toBe('Weekly');
  });

  it('biweekly uses its own prefix and fallback', () => {
    expect(formatSchedule(sched([{ frequency: 'biweekly', dayTimes: [{ day: 6, time: 'x' }] }]))).toBe('Every 2 weeks on Saturdays');
    expect(formatSchedule(sched([{ frequency: 'biweekly', dayTimes: [] }]))).toBe('Every 2 weeks');
  });

  it('monthly formats ordinal suffixes, including the teens', () => {
    const f = (dates: number[]) =>
      formatSchedule(sched([{ frequency: 'monthly', dayTimes: dates.map((date) => ({ date, time: 'x' })) }]));
    expect(f([1])).toBe('Monthly on the 1st');
    expect(f([2, 22])).toBe('Monthly on the 2nd & 22nd');
    expect(f([3, 23])).toBe('Monthly on the 3rd & 23rd');
    expect(f([11, 12, 13])).toBe('Monthly on the 11th, 12th & 13th');
    expect(f([30, 31, 4])).toBe('Monthly on the 4th, 30th & 31st');
    expect(formatSchedule(sched([{ frequency: 'monthly', dayTimes: [] }]))).toBe('Monthly');
  });

  it('ordinal rules are joined, ignoring non-byDay rules', () => {
    const rules = [
      { type: 'byDay', occurrence: '2nd', day: 3 },
      { type: 'byDay', occurrence: 'Last', day: 0 },
      { type: 'byDate', occurrence: '1st', day: 1 },
    ];
    expect(formatSchedule(sched([{ frequency: 'ordinal', dayTimes: [], rules }]))).toBe('2nd Wednesday & Last Sunday');
  });

  it('ordinal with no usable rules falls back to a generic label', () => {
    expect(formatSchedule(sched([{ frequency: 'ordinal', dayTimes: [], rules: [] }]))).toBe('Recurring Schedule');
  });

  it('multiple routines are joined with " & "', () => {
    const out = formatSchedule(
      sched([
        { frequency: 'weekly', dayTimes: [{ day: 1, time: 'x' }] },
        { frequency: 'monthly', dayTimes: [{ date: 15, time: 'x' }] },
      ])
    );
    expect(out).toBe('Weekly on Mondays & Monthly on the 15th');
  });

  it('supports the legacy shape with no routines array', () => {
    expect(formatSchedule({ frequency: 'weekly', days: [2, 4] } as any)).toBe('Weekly on Tuesdays & Thursdays');
    expect(formatSchedule({ frequency: 'monthly', days: [1] } as any)).toBe('Monthly on the 1st');
  });
});
