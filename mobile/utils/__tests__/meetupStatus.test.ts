import { describeRsvpOpensFor } from '../meetupStatus';
import type { Meetup } from '../api';

// RSVPs open 9:00 AM Mountain (16:00Z on 2026-11-09) for a priority group the user is in.
const meetup = {
  timezone: 'America/Denver',
  group: { isPremium: true },
  members: ['me'],
  in: [], out: [], waitlist: [],
  rsvpOpenDate: '2026-11-09T17:00:00.000Z',
  priorityTiers: [{ members: ['me'], opensAt: '2026-11-09T16:00:00.000Z' }],
} as unknown as Meetup;

describe('describeRsvpOpensFor', () => {
  it("shows when RSVPs open in the viewer's timezone", () => {
    expect(describeRsvpOpensFor(meetup, 'me', 'America/New_York')).toBe('Mon, Nov 9 at 11:00 AM ET');
    expect(describeRsvpOpensFor(meetup, 'me', 'America/Denver')).toBe('Mon, Nov 9 at 9:00 AM');
  });
});
