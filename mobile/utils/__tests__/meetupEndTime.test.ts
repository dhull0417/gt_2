import { formatTimeRange, endTimeError, addHour } from '../timeString';
import { meetupEndInstant, formatMeetupTimeRange } from '../meetupTime';
import { getMeetupStatus } from '../meetupStatus';

const DENVER = 'America/Denver';
// Tue Oct 6 2026, 5:00 PM MDT
const base = { date: '2026-10-06T23:00:00.000Z', time: '05:00 PM', timezone: DENVER, status: 'scheduled' } as any;

describe('formatTimeRange (schedule rows, group clock)', () => {
  it('shows a range or just the start', () => {
    expect(formatTimeRange('05:00 PM', '08:00 PM')).toBe('05:00 PM – 08:00 PM');
    expect(formatTimeRange('09:00 PM', '01:00 AM')).toBe('09:00 PM – 01:00 AM');
    expect(formatTimeRange('05:00 PM', null)).toBe('05:00 PM');
    expect(formatTimeRange('05:00 PM')).toBe('05:00 PM');
  });
});

describe('endTimeError', () => {
  it('matches the server rules', () => {
    expect(endTimeError('05:00 PM', null)).toBeNull();
    expect(endTimeError('05:00 PM', '08:00 PM')).toBeNull();
    expect(endTimeError('05:00 PM', '05:00 PM')).toBe("End time can't be the same as the start time.");
  });
});

describe('addHour', () => {
  it('adds an hour, wrapping past midnight', () => {
    expect(addHour('05:00 PM')).toBe('06:00 PM');
    expect(addHour('11:30 PM')).toBe('12:30 AM');
    expect(addHour('11:00 AM')).toBe('12:00 PM');
  });
});

describe('meetupEndInstant', () => {
  it('uses endsAt, else start + 1 hour', () => {
    expect(meetupEndInstant({ ...base, endsAt: '2026-10-07T02:00:00.000Z' }).toISOString()).toBe('2026-10-07T02:00:00.000Z');
    expect(meetupEndInstant(base).toISOString()).toBe('2026-10-07T00:00:00.000Z');
  });
  it('falls back to the end clock time (next day when earlier) if endsAt is missing', () => {
    expect(meetupEndInstant({ ...base, time: '09:00 PM', date: '2026-10-07T03:00:00.000Z', endTime: '01:00 AM' }).toISOString())
      .toBe('2026-10-07T07:00:00.000Z');
  });
});

describe('formatMeetupTimeRange (meetups, viewer clock)', () => {
  const ranged = { ...base, endTime: '08:00 PM', endsAt: '2026-10-07T02:00:00.000Z' };
  it('in the group zone shows plain times', () => {
    expect(formatMeetupTimeRange(ranged, DENVER)).toBe('5:00 PM – 8:00 PM');
    expect(formatMeetupTimeRange(base, DENVER)).toBe('5:00 PM');
  });
  it('in another zone converts both ends and labels once', () => {
    expect(formatMeetupTimeRange(ranged, 'America/New_York')).toBe('7:00 PM – 10:00 PM ET');
  });
});

describe('getMeetupStatus with an end time', () => {
  const start = new Date('2026-10-06T23:00:00.000Z').getTime();
  const twoHoursIn = new Date(start + 2 * 3600000);
  it('is happening until the end time', () => {
    const s = getMeetupStatus({ ...base, endTime: '08:00 PM', endsAt: '2026-10-07T02:00:00.000Z' }, twoHoursIn);
    expect(s.isHappeningNow).toBe(true);
    expect(s.isPast).toBe(false);
  });
  it('without an end time is past after 1 hour', () => {
    const s = getMeetupStatus(base, twoHoursIn);
    expect(s.isHappeningNow).toBe(false);
    expect(s.isPast).toBe(true);
  });
});
