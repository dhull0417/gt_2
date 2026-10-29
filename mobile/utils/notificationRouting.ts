import { Platform } from 'react-native';

/**
 * One place that decides where a notification leads, so a push tap and a tap
 * in the in-app notification list always agree, and nothing is a dead end.
 *
 *  - chat / poll events     -> the group's chat (polls are posted there)
 *  - anything about a meetup -> that meetup's detail
 *  - group events            -> the group's details
 *  - group gone / removed    -> the Groups tab
 *  - invites                 -> the notifications list (that's where Accept/Decline live)
 *  - anything unknown        -> the notifications list
 */
export type NotificationTarget =
  | { kind: 'chat'; groupId: string }
  | { kind: 'meetup'; meetupId: string }
  | { kind: 'group'; groupId: string }
  | { kind: 'groups' }
  | { kind: 'notifications' };

export interface NotificationRouteInput {
  /** In-app type (e.g. "meetup-updated") or the push's `pushType`. */
  type?: string;
  /** Legacy push `data.type` values ("chat", "meetup_cancellation", "rsvp_open"). */
  legacyType?: string;
  groupId?: string | null;
  meetupId?: string | null;
  pollId?: string | null;
}

const GROUP_GONE = new Set(['group-removed', 'group-deleted']);
const CHAT_TYPES = new Set(['chat', 'poll-created', 'poll-closed']);

export function resolveNotificationTarget(input: NotificationRouteInput): NotificationTarget {
  const type = input.type || '';
  const groupId = input.groupId ? String(input.groupId) : undefined;
  const meetupId = input.meetupId ? String(input.meetupId) : undefined;

  if (GROUP_GONE.has(type)) return { kind: 'groups' };
  if (type === 'group-invite') return { kind: 'notifications' };

  if ((CHAT_TYPES.has(type) || input.legacyType === 'chat') && groupId) return { kind: 'chat', groupId };
  if (meetupId) return { kind: 'meetup', meetupId };
  if (groupId) return { kind: 'group', groupId };
  return { kind: 'notifications' };
}

/** Builds the input from a push payload (see backend utils/push.notifications.js). */
export function routeInputFromPush(data: Record<string, any> | undefined | null): NotificationRouteInput {
  return {
    type: data?.pushType,
    legacyType: data?.type,
    groupId: data?.groupId,
    meetupId: data?.meetupId,
    pollId: data?.pollId,
  };
}

interface RouterLike {
  push: (href: any) => void;
  navigate: (href: any) => void;
}

export function goToTarget(router: RouterLike, target: NotificationTarget) {
  switch (target.kind) {
    case 'chat':
      router.push({ pathname: '/group-chat/[id]', params: { id: target.groupId } });
      return;
    case 'meetup':
      router.push({ pathname: '/(tabs)', params: { openMeetupId: target.meetupId } });
      return;
    case 'group':
      // iOS uses its own root-level copy of Group Details; Android lands on the
      // Groups list first so Details has something to go back to.
      if (Platform.OS === 'ios') {
        router.push({ pathname: '/group-details/[id]', params: { id: target.groupId } });
      } else {
        router.navigate('/(tabs)/groups');
        router.push({ pathname: '/groups/[id]', params: { id: target.groupId } });
      }
      return;
    case 'groups':
      router.navigate('/(tabs)/groups');
      return;
    case 'notifications':
      router.push('/notifications');
      return;
  }
}
