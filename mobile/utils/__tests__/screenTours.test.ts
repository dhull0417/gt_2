import { hasSeenTour, withTourSeen, TOURS, alwaysShows } from '../screenTours';
import { groupDetailsTourSteps } from '../groupDetailsTour';
import { buildDetailTiles } from '../groupDetailTiles';

describe('hasSeenTour', () => {
  it('is false for a user from before tours existed (no seenTours at all)', () => {
    expect(hasSeenTour({} as any, TOURS.groupDetails)).toBe(false);
  });
  it('is false when other tours are seen but not this one', () => {
    expect(hasSeenTour({ seenTours: ['home'] } as any, TOURS.groupDetails)).toBe(false);
  });
  it('is true once the key is recorded', () => {
    expect(hasSeenTour({ seenTours: [TOURS.groupDetails] } as any, TOURS.groupDetails)).toBe(true);
  });
  it('treats a user that has not loaded yet as seen, so nothing starts early', () => {
    expect(hasSeenTour(undefined, TOURS.groupDetails)).toBe(true);
  });
});

describe('withTourSeen', () => {
  it('adds the key once and keeps the rest of the user', () => {
    const u = withTourSeen({ _id: 'u1', seenTours: ['a'] } as any, 'b');
    expect(u).toEqual({ _id: 'u1', seenTours: ['a', 'b'] });
    expect(withTourSeen(u, 'b').seenTours).toEqual(['a', 'b']);
  });
  it('leaves a missing user missing', () => {
    expect(withTourSeen(undefined, 'b')).toBeUndefined();
  });
});

describe('TOURS', () => {
  it('uses keys the server accepts: short lowercase slugs', () => {
    for (const key of Object.values(TOURS)) {
      expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(key.length).toBeLessThanOrEqual(40);
    }
  });
});

describe('groupDetailsTourSteps', () => {
  it('has one step per tile, in the order the tiles appear', () => {
    const tiles = buildDetailTiles({ isDM: false, canManage: true });
    expect(groupDetailsTourSteps(tiles, true).map((s) => s.tile)).toEqual(tiles);
  });
  it('gives every step a title and a short description', () => {
    for (const s of groupDetailsTourSteps(buildDetailTiles({ isDM: false, canManage: true }), true)) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
      expect(s.body.length).toBeLessThanOrEqual(90);
    }
  });
  it('describes the schedule tile as editable only for owners and moderators', () => {
    const forManager = groupDetailsTourSteps(['schedule'], true)[0];
    const forMember = groupDetailsTourSteps(['schedule'], false)[0];
    expect(forManager.title).toBe('Edit Meetup Details');
    expect(forMember.title).toBe('Meetup Details');
  });
  it('has no steps for a DM', () => {
    expect(groupDetailsTourSteps(buildDetailTiles({ isDM: true, canManage: false }), false)).toEqual([]);
  });
});

describe('which tours replay on every visit (testing)', () => {
  it('the empty-screen tours show only the first time', () => {
    expect(alwaysShows(TOURS.meetupsEmpty)).toBe(false);
    expect(alwaysShows(TOURS.groupsEmpty)).toBe(false);
  });
});
