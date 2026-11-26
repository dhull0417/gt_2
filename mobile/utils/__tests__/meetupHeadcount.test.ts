import { meetupHeadcount, isMeetupFull, canPriorityBump } from '../meetupStatus';
import type { Meetup } from '../api';

// Guests hold their spot whatever their host does, so they count toward the limit
// even when the host went Out and kept them (backend/src/utils/waitlist.js headcountOf).
const base = {
  capacity: 4,
  in: ['a', 'b'],
  out: ['host'],
  waitlist: [],
  undecided: [],
  guests: [{ userId: 'c-host', count: 2 }],
} as unknown as Meetup;

test('meetupHeadcount counts people In plus every guest', () => {
  expect(meetupHeadcount(base)).toBe(4);
  expect(meetupHeadcount({ ...base, guests: undefined } as unknown as Meetup)).toBe(2);
});

test('isMeetupFull counts guests, and capacity 0 is never full', () => {
  expect(isMeetupFull(base)).toBe(true);
  expect(isMeetupFull({ ...base, guests: [] } as unknown as Meetup)).toBe(false);
  expect(isMeetupFull({ ...base, capacity: 0 } as unknown as Meetup)).toBe(false);
});

test('canPriorityBump sees a meetup filled by guests as full', () => {
  const tiers = { ...base, group: { isPremium: true }, priorityTiers: [{ members: ['top'] }] } as unknown as Meetup;
  expect(canPriorityBump(tiers, 'top')).toBe(true);
});
