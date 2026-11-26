import { cardAssignmentLines } from '../assignments';

const members = [
  { _id: 'd1', firstName: 'Sam', clerkId: 'cd1' },
  { _id: 'a', firstName: 'Ana', clerkId: 'ca' },
  { _id: 'b', firstName: 'Bo', clerkId: 'cb' },
  { _id: 'c', firstName: 'Cy', clerkId: 'cc' },
];

const meetup = (over: any = {}) =>
  ({
    members,
    in: ['d1', 'a', 'b', 'c'],
    guests: [],
    ridesEnabled: true,
    bringItems: [
      { _id: 'chips', name: 'Chips', max: 1 },
      { _id: 'cones', name: 'Cones', max: 2 },
      { _id: 'snacks', name: 'Snacks' },
    ],
    bringClaims: [],
    rides: [],
    group: { _id: 'g', isPremium: true },
    ...over,
  } as any);

describe('cardAssignmentLines — group overview', () => {
  it('shows items needed and hides seats until someone picks a role', () => {
    expect(cardAssignmentLines(meetup(), 'c')).toEqual([{ icon: 'clipboard', text: '2 items needed' }]);
  });
  it('shows seats open / needed and singular item', () => {
    const m = meetup({
      bringClaims: [{ user: 'a', item: 'chips' }],
      rides: [{ user: 'd1', role: 'driver', seats: 3 }, { user: 'a', role: 'passenger', seats: 0, driver: null, guestRides: [] }],
    });
    expect(cardAssignmentLines(m, 'c')).toEqual([{ icon: 'clipboard', text: '2 seats open · 1 item needed' }]);
    const short = meetup({
      bringItems: [],
      rides: [{ user: 'd1', role: 'driver', seats: 1 }, { user: 'a', role: 'passenger', seats: 0 }, { user: 'b', role: 'passenger', seats: 0 }],
    });
    expect(cardAssignmentLines(short, 'c')).toEqual([{ icon: 'clipboard', text: '1 seat needed' }]);
  });
  it('is null when there is nothing to say', () => {
    expect(cardAssignmentLines(meetup({ ridesEnabled: false, bringItems: [{ _id: 's', name: 'Snacks' }] }), 'c')).toEqual([]);
  });
  it('shows the overview to someone not In even if they had picks', () => {
    const m = meetup({ in: ['d1', 'a'], bringClaims: [{ user: 'c', item: 'chips' }] });
    expect(cardAssignmentLines(m, 'c')[0].icon).toBe('clipboard');
  });
  it('is null when assignments are inactive', () => {
    expect(cardAssignmentLines(meetup({ group: { isPremium: false } }), 'c')).toEqual([]);
  });
});

describe('cardAssignmentLines — your selections', () => {
  it('driver with no riders', () => {
    const m = meetup({ rides: [{ user: 'd1', role: 'driver', seats: 3 }] });
    expect(cardAssignmentLines(m, 'd1')).toEqual([{ icon: 'truck', text: 'Driving (Select riders)' }]);
  });
  it('driver with 1 and 2 riders (guests count)', () => {
    const one = meetup({ rides: [{ user: 'd1', role: 'driver', seats: 3 }, { user: 'a', role: 'passenger', seats: 0, driver: 'd1', guestRides: [] }] });
    expect(cardAssignmentLines(one, 'd1')[0].text).toBe('Driving (1 rider)');
    const two = meetup({
      guests: [{ userId: 'ca', count: 1 }],
      rides: [{ user: 'd1', role: 'driver', seats: 3 }, { user: 'a', role: 'passenger', seats: 0, driver: 'd1', guestRides: [{ driver: 'd1', count: 1 }] }],
    });
    expect(cardAssignmentLines(two, 'd1')[0].text).toBe('Driving (2 riders)');
  });
  it('passenger placed / waiting', () => {
    const placed = meetup({ rides: [{ user: 'd1', role: 'driver', seats: 3 }, { user: 'a', role: 'passenger', seats: 0, driver: 'd1', guestRides: [] }] });
    expect(cardAssignmentLines(placed, 'a')).toEqual([{ icon: 'truck', text: 'Riding with Sam' }]);
    const waiting = meetup({ rides: [{ user: 'a', role: 'passenger', seats: 0, driver: null, guestRides: [] }] });
    expect(cardAssignmentLines(waiting, 'a')).toEqual([{ icon: 'truck', text: 'Needs ride' }]);
  });
  it('items only', () => {
    const m = meetup({ bringClaims: [{ user: 'b', item: 'chips' }, { user: 'b', item: 'cones' }] });
    expect(cardAssignmentLines(m, 'b')).toEqual([{ icon: 'shopping-bag', text: 'Chips, Cones' }]);
  });
  it('ride and items go on two lines, ride first', () => {
    const m = meetup({ bringClaims: [{ user: 'd1', item: 'snacks' }], rides: [{ user: 'd1', role: 'driver', seats: 2 }] });
    expect(cardAssignmentLines(m, 'd1')).toEqual([
      { icon: 'truck', text: 'Driving (Select riders)' },
      { icon: 'shopping-bag', text: 'Snacks' },
    ]);
  });
});
