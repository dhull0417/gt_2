import { hasAssignments, assignmentsActive, memberName, summarizeAssignments } from '../assignments';

const base = (over: any = {}) =>
  ({
    members: [
      { _id: 'u1', firstName: 'Ann', clerkId: 'c1' },
      { _id: 'u2', firstName: '  ', clerkId: 'c2' },
      { _id: 'u3', firstName: 'Cy', clerkId: 'c3' },
      { _id: 'u4', firstName: 'Di', clerkId: 'c4' },
    ],
    in: ['u1', 'u2', 'u3'],
    group: { _id: 'g', isPremium: true },
    ...over,
  } as any);

describe('hasAssignments / assignmentsActive', () => {
  it('needs bring items or rides enabled', () => {
    expect(hasAssignments(base())).toBe(false);
    expect(hasAssignments(base({ bringItems: [{ _id: 'i', name: 'Chips' }] }))).toBe(true);
    expect(hasAssignments(base({ ridesEnabled: true }))).toBe(true);
  });

  it('is inactive when the owner lost Premium, active when unknown', () => {
    const m = { ridesEnabled: true };
    expect(assignmentsActive(base({ ...m, group: { isPremium: false } }))).toBe(false);
    expect(assignmentsActive(base({ ...m, group: {} }))).toBe(true);
    expect(assignmentsActive(base({ ...m }))).toBe(true);
    expect(assignmentsActive(base({ group: { isPremium: true } }))).toBe(false); // nothing to assign
  });
});

describe('memberName', () => {
  it('uses the trimmed first name, else "Someone"', () => {
    const m = base();
    expect(memberName(m, 'u1')).toBe('Ann');
    expect(memberName(m, 'u2')).toBe('Someone'); // blank name
    expect(memberName(m, 'nope')).toBe('Someone');
  });
});

describe('summarizeAssignments', () => {
  it('counts only people who are still in; supports populated "in" entries', () => {
    const m = base({
      in: [{ _id: 'u1' }, 'u2'],
      bringItems: [{ _id: 'i1', name: 'Chips', max: 2 }],
      bringClaims: [
        { user: 'u1', item: 'i1' },
        { user: 'u4', item: 'i1' }, // u4 is not in: ignored
      ],
    });
    const s = summarizeAssignments(m);
    expect(s.items).toEqual([{ _id: 'i1', name: 'Chips', max: 2, claimedBy: ['u1'], isFull: false }]);
  });

  it('marks an item full at its max; no max is never full', () => {
    const m = base({
      bringItems: [
        { _id: 'i1', name: 'Chips', max: 2 },
        { _id: 'i2', name: 'Ice' },
      ],
      bringClaims: [
        { user: 'u1', item: 'i1' },
        { user: 'u2', item: 'i1' },
        { user: 'u1', item: 'i2' },
        { user: 'u2', item: 'i2' },
        { user: 'u3', item: 'i2' },
      ],
    });
    const [chips, ice] = summarizeAssignments(m).items;
    expect(chips.isFull).toBe(true);
    expect(ice.max).toBeNull();
    expect(ice.isFull).toBe(false);
  });

  it('balances seats, counting each passenger and their guests', () => {
    const m = base({
      ridesEnabled: true,
      rides: [
        { user: 'u1', role: 'driver', seats: 3 },
        { user: 'u2', role: 'passenger', seats: 0 },
        { user: 'u3', role: 'passenger', seats: 0 },
        { user: 'u4', role: 'driver', seats: 4 }, // not in: ignored
      ],
      guests: [{ userId: 'c3', count: 2 }], // Cy brings 2 guests
    });
    const s = summarizeAssignments(m);
    expect(s.drivers).toEqual([{ userId: 'u1', seats: 3 }]);
    expect(s.passengers).toEqual(['u2', 'u3']);
    expect(s.seatsAvailable).toBe(3);
    expect(s.seatsNeeded).toBe(1 + (1 + 2));
    expect(s.seatBalance).toBe(-1);
  });

  it('handles a meetup with nothing set up', () => {
    const s = summarizeAssignments(base());
    expect(s).toEqual({ items: [], drivers: [], passengers: [], seatsAvailable: 0, seatsNeeded: 0, seatBalance: 0 });
  });
});
