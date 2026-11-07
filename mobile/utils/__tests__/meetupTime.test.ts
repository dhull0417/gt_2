import { formatMeetupTime, formatMeetupDate, meetupViewerDayKey } from '../meetupTime';

// Meetup dates are stored as midnight of the meetup's day in the group's timezone.
// 2026-11-10 00:00 in Denver (MST, UTC-7) = 07:00Z.
const denver = (time: string) => ({ date: '2026-11-10T07:00:00.000Z', time, timezone: 'America/Denver' });

describe('meetup times in the viewer\'s timezone', () => {
  it('converts to the viewer\'s zone and labels it when it differs from the group\'s', () => {
    expect(formatMeetupTime(denver('7:00 PM'), 'America/New_York')).toBe('9:00 PM ET');
    expect(meetupViewerDayKey(denver('7:00 PM'), 'America/New_York')).toBe('2026-11-10');
  });

  it('shows the plain time when the viewer is in the group\'s zone', () => {
    expect(formatMeetupTime(denver('7:00 PM'), 'America/Denver')).toBe('7:00 PM');
  });

  it('moves a late meetup onto the viewer\'s next day', () => {
    expect(formatMeetupTime(denver('11:30 PM'), 'America/New_York')).toBe('1:30 AM ET');
    expect(meetupViewerDayKey(denver('11:30 PM'), 'America/New_York')).toBe('2026-11-11');
    expect(formatMeetupDate(denver('11:30 PM'), { weekday: 'short', month: 'short', day: 'numeric' }, 'America/New_York'))
      .toBe('Wed, Nov 11');
  });

  it('treats zones with the same offset as the same (no label)', () => {
    // Phoenix has no daylight saving; in November it matches Denver's offset.
    expect(formatMeetupTime(denver('7:00 PM'), 'America/Phoenix')).toBe('7:00 PM');
  });

  it('falls back to the viewer\'s zone without a label when the meetup has no timezone', () => {
    expect(formatMeetupTime({ date: '2026-11-10T07:00:00.000Z', time: '7:00 PM' }, 'America/New_York')).toBe('7:00 PM');
  });
});
