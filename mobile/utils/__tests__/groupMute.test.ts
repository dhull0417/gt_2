import { MUTE_KINDS, muteStateFor, applyMuteLocally, describeMute, restoreRequest } from '../groupMute';

const G = 'g1';
const ALL = MUTE_KINDS.map((k) => k.key);

describe('groupMute', () => {
  it('lists the seven kinds in order', () => {
    expect(ALL).toEqual(['chat', 'rsvps', 'changes', 'cancellations', 'reminders', 'polls', 'groupUpdates']);
    expect(MUTE_KINDS.map((k) => k.label)).toEqual([
      'Chat messages', "Who's coming", 'Meetup changes', 'Cancellations', 'Reminders', 'Polls', 'Group updates',
    ]);
  });

  it('muteStateFor: none without data', () => {
    expect(muteStateFor(undefined, G)).toEqual({ state: 'none', until: null, mutedTypes: [] });
    expect(muteStateFor({ groupMutes: [], mutedGroups: [], mutedUntilNextMeetup: [] }, G).state).toBe('none');
  });

  it('muteStateFor: full and partial entries', () => {
    expect(muteStateFor({ groupMutes: [{ group: G, until: 'nextMeetup', mutedTypes: ALL }] }, G))
      .toEqual({ state: 'full', until: 'nextMeetup', mutedTypes: ALL });
    expect(muteStateFor({ groupMutes: [{ group: G, until: 'indefinite', mutedTypes: ['polls', 'chat'] }] }, G))
      .toEqual({ state: 'partial', until: 'indefinite', mutedTypes: ['chat', 'polls'] });
  });

  it('muteStateFor: legacy lists are a full mute; an entry wins', () => {
    expect(muteStateFor({ mutedGroups: [G] }, G)).toEqual({ state: 'full', until: 'indefinite', mutedTypes: ALL });
    expect(muteStateFor({ mutedUntilNextMeetup: [G] }, G)).toEqual({ state: 'full', until: 'nextMeetup', mutedTypes: ALL });
    expect(muteStateFor({ mutedGroups: [G], groupMutes: [{ group: G, until: 'indefinite', mutedTypes: ['chat'] }] }, G).state)
      .toBe('partial');
  });

  it('applyMuteLocally mirrors the server', () => {
    const base = { groupMutes: [{ group: 'other', until: 'indefinite' as const, mutedTypes: ['chat' as const] }], mutedGroups: [], mutedUntilNextMeetup: [] };
    const full = applyMuteLocally(base, G, 'untilNext', ALL);
    expect(full.mutedUntilNextMeetup).toEqual([G]);
    expect(full.mutedGroups).toEqual([]);
    expect(full.groupMutes.map((m) => m.group)).toEqual(['other', G]);

    const partial = applyMuteLocally(full, G, 'indefinite', ['chat']);
    expect(partial.mutedUntilNextMeetup).toEqual([]);
    expect(partial.mutedGroups).toEqual([]);
    expect(muteStateFor(partial, G)).toEqual({ state: 'partial', until: 'indefinite', mutedTypes: ['chat'] });

    for (const off of [applyMuteLocally(full, G, 'none', []), applyMuteLocally(full, G, 'indefinite', [])]) {
      expect(muteStateFor(off, G).state).toBe('none');
      expect(off.groupMutes.map((m) => m.group)).toEqual(['other']);
    }
  });

  it('describeMute gives the toast text', () => {
    expect(describeMute('untilNext', ALL)).toBe('Muted until the next meetup');
    expect(describeMute('indefinite', ALL)).toBe('Muted');
    expect(describeMute('indefinite', ['chat'])).toBe('Muted chat messages');
    expect(describeMute('untilNext', ['chat', 'polls', 'rsvps'])).toBe('Muted 3 kinds until the next meetup');
  });
  it('restoreRequest puts a group back the way it was (for Undo)', () => {
    expect(restoreRequest({ state: 'none', until: null, mutedTypes: [] })).toEqual({ muteType: 'none', kinds: [] });
    expect(restoreRequest({ state: 'partial', until: 'indefinite', mutedTypes: ['chat'] })).toEqual({ muteType: 'indefinite', kinds: ['chat'] });
    expect(restoreRequest({ state: 'full', until: 'nextMeetup', mutedTypes: ALL })).toEqual({ muteType: 'untilNext', kinds: ALL });
  });
});
