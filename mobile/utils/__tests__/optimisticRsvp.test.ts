import { applyOptimisticRsvp } from '../offlineMutations';

const meetup = (over: any = {}) => ({
  _id: 'm1', capacity: 0, guests: [], in: [], out: [], waitlist: [], undecided: ['me', 'you'], ...over,
}) as any;

describe('applyOptimisticRsvp', () => {
  it('moves me from undecided to In', () => {
    const next = applyOptimisticRsvp(meetup(), 'me', 'in')!;
    expect(next.in).toEqual(['me']);
    expect(next.undecided).toEqual(['you']);
  });

  it('moves me from In to Out and drops any waitlist spot', () => {
    const next = applyOptimisticRsvp(meetup({ in: ['me'], waitlist: ['me'], undecided: [] }), 'me', 'out')!;
    expect(next.in).toEqual([]);
    expect(next.out).toEqual(['me']);
    expect(next.waitlist).toEqual([]);
  });

  it('does not guess when the meetup is full (the server decides waitlist or bump)', () => {
    expect(applyOptimisticRsvp(meetup({ capacity: 1, in: ['you'] }), 'me', 'in')).toBeNull();
  });

  it('counts guests toward capacity', () => {
    expect(applyOptimisticRsvp(meetup({ capacity: 3, in: ['you'], guests: [{ count: 2 }] }), 'me', 'in')).toBeNull();
  });

  it('lets someone already In stay In on a full meetup', () => {
    const next = applyOptimisticRsvp(meetup({ capacity: 1, in: ['me'], undecided: [] }), 'me', 'in');
    expect(next?.in).toEqual(['me']);
  });

  it('is not duplicated when applied twice', () => {
    const once = applyOptimisticRsvp(meetup(), 'me', 'in')!;
    expect(applyOptimisticRsvp(once, 'me', 'in')!.in).toEqual(['me']);
  });
});
