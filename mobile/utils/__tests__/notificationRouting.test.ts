import { resolveNotificationTarget, routeInputFromPush } from '../notificationRouting';

describe('resolveNotificationTarget', () => {
  it('sends chat and poll events to the group chat', () => {
    expect(resolveNotificationTarget({ type: 'poll-created', groupId: 'g1' })).toEqual({ kind: 'chat', groupId: 'g1' });
    expect(resolveNotificationTarget({ legacyType: 'chat', groupId: 'g1' })).toEqual({ kind: 'chat', groupId: 'g1' });
  });

  it('prefers the meetup for anything about a meetup', () => {
    expect(resolveNotificationTarget({ type: 'meetup-updated', groupId: 'g1', meetupId: 'm1' })).toEqual({ kind: 'meetup', meetupId: 'm1' });
    expect(resolveNotificationTarget({ type: 'ride-assigned', groupId: 'g1', meetupId: 'm1' })).toEqual({ kind: 'meetup', meetupId: 'm1' });
    expect(resolveNotificationTarget({ type: 'ride-removed', groupId: 'g1', meetupId: 'm1' })).toEqual({ kind: 'meetup', meetupId: 'm1' });
  });

  it('opens group details for group events', () => {
    expect(resolveNotificationTarget({ type: 'group-updated', groupId: 'g1' })).toEqual({ kind: 'group', groupId: 'g1' });
    expect(resolveNotificationTarget({ type: 'schedule-removed', groupId: 'g1' })).toEqual({ kind: 'group', groupId: 'g1' });
  });

  it('never opens a group that is gone', () => {
    expect(resolveNotificationTarget({ type: 'group-removed', groupId: 'g1' })).toEqual({ kind: 'groups' });
    expect(resolveNotificationTarget({ type: 'group-deleted' })).toEqual({ kind: 'groups' });
  });

  it('sends invites to the notifications list, where Accept and Decline live', () => {
    expect(resolveNotificationTarget({ type: 'group-invite', groupId: 'g1' })).toEqual({ kind: 'notifications' });
  });

  it('falls back to the notifications list instead of a dead end', () => {
    expect(resolveNotificationTarget({})).toEqual({ kind: 'notifications' });
    expect(resolveNotificationTarget({ type: 'mystery' })).toEqual({ kind: 'notifications' });
  });
});

describe('tournament notifications', () => {
  it('open the event when its id is known, else the meetup', () => {
    for (const type of ['tournament-set', 'tournament-match-ready', 'tournament-finished']) {
      expect(resolveNotificationTarget({ type, groupId: 'g1', meetupId: 'm1', tournamentId: 't1' })).toEqual({ kind: 'tournament', tournamentId: 't1' });
      expect(resolveNotificationTarget({ type, groupId: 'g1', meetupId: 'm1' })).toEqual({ kind: 'meetup', meetupId: 'm1' });
    }
  });
  it('reads the event id from a push', () => {
    expect(routeInputFromPush({ pushType: 'tournament-finished', tournamentId: 't1', meetupId: 'm1' }).tournamentId).toBe('t1');
  });
});

describe('routeInputFromPush', () => {
  it('maps a push payload onto the same input', () => {
    expect(routeInputFromPush({ type: 'chat', groupId: 'g1', pushType: undefined })).toMatchObject({ legacyType: 'chat', groupId: 'g1' });
    expect(routeInputFromPush(null)).toEqual({ type: undefined, legacyType: undefined, groupId: undefined, meetupId: undefined, pollId: undefined });
  });
});
