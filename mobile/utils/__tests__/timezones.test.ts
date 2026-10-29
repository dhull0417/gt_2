import { timezoneLabel, timezoneOptions, tzAbbr, isValidTimeZone, deviceTimeZone } from '../timezones';
import { meetupDayKey, meetupStartInstant, localDateToDayKey, dayKeyToLocalDate } from '../meetupTime';

describe('timezones', () => {
  it('keeps the labels people already know for US zones', () => {
    expect(tzAbbr('America/Denver')).toBe('MT');
    expect(timezoneLabel('America/New_York')).toBe('Eastern (ET)');
  });

  it('lists US zones first and includes the current value once', () => {
    const opts = timezoneOptions('Europe/Paris');
    expect(opts.slice(0, 7).map((o) => o.key)).toContain('America/Los_Angeles');
    expect(opts.filter((o) => o.key === 'Europe/Paris')).toHaveLength(1);
    expect(new Set(opts.map((o) => o.key)).size).toBe(opts.length);
  });

  it('validates zone names and always returns a usable device zone', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone(deviceTimeZone())).toBe(true);
  });
});

describe('meetupTime', () => {
  it('uses the group timezone for the calendar day and start moment', () => {
    // 2026-10-08T01:00Z is still Oct 7 in Denver
    const m = { date: '2026-10-08T01:00:00Z', time: '7:00 PM', timezone: 'America/Denver' };
    expect(meetupDayKey(m)).toBe('2026-10-07');
    expect(meetupStartInstant(m).toISOString()).toBe('2026-10-08T01:00:00.000Z');
  });

  it('round-trips a picker date without shifting the day', () => {
    expect(localDateToDayKey(dayKeyToLocalDate('2026-03-08'))).toBe('2026-03-08');
  });
});
