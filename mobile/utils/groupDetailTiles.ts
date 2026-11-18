import type { GroupDetails, Meetup, User } from '@/utils/api';
import { getUserDisplayName } from '@/utils/groupDisplay';
import { meetupStartInstant } from '@/utils/meetupTime';
import { FREQ_LABELS } from '@/utils/scheduleConstants';

// The squircle tiles on Group Details, in display order.
export type DetailTileKey = 'invite' | 'calendar' | 'meetups' | 'past' | 'members' | 'schedule' | 'settings';

// DMs get no tiles (no invites, meetups or schedule). Settings is for owners and moderators only.
export function buildDetailTiles({ isDM, canManage }: { isDM: boolean; canManage: boolean }): DetailTileKey[] {
  if (isDM) return [];
  const tiles: DetailTileKey[] = ['invite', 'members', 'meetups', 'calendar', 'schedule', 'past'];
  if (canManage) tiles.push('settings');
  return tiles;
}

const idOf = (v: any): string | undefined => (typeof v === 'string' ? v : v?._id);

// Owner and moderators can arrive as plain ids or as populated users, depending on the endpoint.
export function isGroupManager(group: { owner: any; moderators?: any[] }, userId?: string): boolean {
  if (!userId) return false;
  if (idOf(group.owner) === userId) return true;
  return (group.moderators ?? []).some((m) => idOf(m) === userId);
}

// A to Z by display name, ignoring case; ties (e.g. several "New Member"s) fall back to id so the
// order doesn't shuffle between renders.
export function sortMembersByName<T extends Pick<User, '_id' | 'firstName' | 'lastName'>>(members: T[]): T[] {
  return [...members].sort((a, b) =>
    getUserDisplayName(a).localeCompare(getUserDisplayName(b), undefined, { sensitivity: 'base' })
    || a._id.localeCompare(b._id));
}

// Members page search: case-insensitive match on first, last or full display name.
export function filterMembersByQuery<T extends Pick<User, 'firstName' | 'lastName'>>(members: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  return members.filter((m) => getUserDisplayName(m).toLowerCase().includes(q));
}

export function upcomingMeetupCount(meetups: Meetup[] | undefined, groupId: string, now: number): number {
  return (meetups ?? []).filter((m) =>
    m.group?._id === groupId && m.status === 'scheduled' && meetupStartInstant(m).getTime() >= now).length;
}

const frequencyLabel = (f: string) =>
  f === 'biweekly' ? 'Every 2 Weeks' : FREQ_LABELS[f] ?? f.charAt(0).toUpperCase() + f.slice(1);

// One short line for the Schedule tile.
export function scheduleSummary(schedules: GroupDetails['schedules'] | undefined): string {
  const active = (schedules ?? []).filter((s) => s.active !== false);
  if (active.length === 0) return 'Not set';
  if (active.length > 1) return `${active.length} schedules`;
  const routines = active[0].routines ?? [];
  if (routines.length === 0) return 'Not set';
  if (routines.length > 1) return 'Multiple times';
  return frequencyLabel(routines[0].frequency);
}
