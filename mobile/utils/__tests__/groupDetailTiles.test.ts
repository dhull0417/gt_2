import {
  buildDetailTiles, isGroupManager, sortMembersByName, upcomingMeetupCount, scheduleSummary,
} from '../groupDetailTiles';

describe('buildDetailTiles', () => {
  it('shows all six tiles, in order, to owners and moderators', () => {
    expect(buildDetailTiles({ isDM: false, canManage: true }))
      .toEqual(['invite', 'calendar', 'meetups', 'members', 'schedule', 'settings']);
  });
  it('hides Settings from regular members', () => {
    expect(buildDetailTiles({ isDM: false, canManage: false }))
      .toEqual(['invite', 'calendar', 'meetups', 'members', 'schedule']);
  });
  it('shows no tiles for DMs', () => {
    expect(buildDetailTiles({ isDM: true, canManage: true })).toEqual([]);
  });
});

describe('isGroupManager', () => {
  it('is true for the owner, stored as an id or as a populated user', () => {
    expect(isGroupManager({ owner: 'u1' }, 'u1')).toBe(true);
    expect(isGroupManager({ owner: { _id: 'u1' } }, 'u1')).toBe(true);
  });
  it('is true for a moderator, stored either way', () => {
    expect(isGroupManager({ owner: 'x', moderators: ['u1'] }, 'u1')).toBe(true);
    expect(isGroupManager({ owner: 'x', moderators: [{ _id: 'u1' }] }, 'u1')).toBe(true);
  });
  it('is false for everyone else, and with no user', () => {
    expect(isGroupManager({ owner: 'x', moderators: ['y'] }, 'u1')).toBe(false);
    expect(isGroupManager({ owner: 'x' }, undefined)).toBe(false);
  });
});

describe('sortMembersByName', () => {
  it('sorts A to Z ignoring case, without changing the input', () => {
    const input = [{ _id: '1', firstName: 'bob' }, { _id: '2', firstName: 'Alice' }, { _id: '3', firstName: 'carl' }];
    const out = sortMembersByName(input as any);
    expect(out.map((m) => m.firstName)).toEqual(['Alice', 'bob', 'carl']);
    expect(input.map((m) => m.firstName)).toEqual(['bob', 'Alice', 'carl']);
  });
  it('sorts nameless members by the "New Member" fallback, then by id so the order is stable', () => {
    const out = sortMembersByName([
      { _id: 'b' }, { _id: 'z', firstName: 'Zed' }, { _id: 'a' }, { _id: 'm', firstName: 'Mia' },
    ] as any);
    expect(out.map((m) => m._id)).toEqual(['m', 'a', 'b', 'z']);
  });
});

describe('upcomingMeetupCount', () => {
  const NOW = Date.parse('2026-11-18T12:00:00Z');
  const m = (over: any) => ({
    _id: Math.random().toString(), group: { _id: 'g1' }, status: 'scheduled',
    date: '2026-11-20T00:00:00.000Z', time: '19:00', timezone: 'UTC', ...over,
  });
  it('counts only this group’s scheduled, future meetups', () => {
    const meetups = [
      m({}),
      m({ date: '2026-11-25T00:00:00.000Z' }),
      m({ group: { _id: 'other' } }),
      m({ status: 'cancelled' }),
      m({ date: '2026-11-10T00:00:00.000Z' }),
    ];
    expect(upcomingMeetupCount(meetups as any, 'g1', NOW)).toBe(2);
  });
  it('is 0 with no data', () => {
    expect(upcomingMeetupCount(undefined, 'g1', NOW)).toBe(0);
  });
});

describe('scheduleSummary', () => {
  const sch = (over: any = {}) => ({ _id: 's', name: 'S', routines: [{ frequency: 'weekly', dayTimes: [] }], ...over });
  it('says "Not set" with no active schedules', () => {
    expect(scheduleSummary([])).toBe('Not set');
    expect(scheduleSummary(undefined as any)).toBe('Not set');
    expect(scheduleSummary([sch({ active: false })] as any)).toBe('Not set');
  });
  it('names the frequency for one schedule with one routine', () => {
    expect(scheduleSummary([sch()] as any)).toBe('Weekly');
    expect(scheduleSummary([sch({ routines: [{ frequency: 'biweekly', dayTimes: [] }] })] as any)).toBe('Every 2 Weeks');
    expect(scheduleSummary([sch({ routines: [{ frequency: 'monthly', dayTimes: [] }] })] as any)).toBe('Monthly');
  });
  it('says "Multiple times" for one schedule with several routines', () => {
    expect(scheduleSummary([sch({ routines: [{ frequency: 'weekly' }, { frequency: 'monthly' }] })] as any)).toBe('Multiple times');
  });
  it('counts active schedules when there are several', () => {
    expect(scheduleSummary([sch(), sch({ _id: 't' }), sch({ _id: 'u', active: false })] as any)).toBe('2 schedules');
  });
});
