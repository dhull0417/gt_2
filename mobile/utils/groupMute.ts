// Per-group, per-kind mutes (see docs/specs/2026-11-07-per-type-group-mute-design.md).
// The server is the source of truth; these helpers read the user record and mirror a
// change locally for the optimistic update. Kept free of React/Expo imports for tests.

export type MuteKind = 'chat' | 'rsvps' | 'changes' | 'cancellations' | 'reminders' | 'polls' | 'groupUpdates';
export type MuteUntil = 'indefinite' | 'nextMeetup';
export type MuteRequest = 'indefinite' | 'untilNext' | 'none';

export interface GroupMute {
  group: string;
  until: MuteUntil;
  mutedTypes: MuteKind[];
  updatedAt?: string;
}

/** The kinds a member can mute, in display order. `icon` is a Feather icon name. */
export const MUTE_KINDS: { key: MuteKind; label: string; hint: string; icon: string }[] = [
  { key: 'chat', label: 'Chat messages', hint: 'Messages and reactions (@mentions still come through)', icon: 'message-circle' },
  { key: 'rsvps', label: "Who's coming", hint: "Someone says they're in or out, or joins the waitlist", icon: 'users' },
  { key: 'changes', label: 'Meetup changes', hint: 'New meetups, time or place changes, restored meetups', icon: 'edit-3' },
  { key: 'cancellations', label: 'Cancellations', hint: 'A meetup is cancelled', icon: 'x-circle' },
  { key: 'reminders', label: 'Reminders', hint: 'RSVP reminders, RSVPs opening, starting soon', icon: 'clock' },
  { key: 'polls', label: 'Polls', hint: 'New polls and results', icon: 'bar-chart-2' },
  { key: 'groupUpdates', label: 'Group updates', hint: 'Group renamed, someone joined', icon: 'info' },
];

const ALL_KINDS: MuteKind[] = MUTE_KINDS.map((k) => k.key);

type MuteFields = {
  groupMutes?: GroupMute[];
  mutedGroups?: string[];
  mutedUntilNextMeetup?: string[];
};

export interface MuteState {
  state: 'none' | 'partial' | 'full';
  until: MuteUntil | null;
  mutedTypes: MuteKind[];
}

const inOrder = (kinds: readonly string[]): MuteKind[] => ALL_KINDS.filter((k) => kinds.includes(k));

/** What is muted for this group. Mutes set by an old app (legacy lists only) count as full. */
export const muteStateFor = (user: MuteFields | null | undefined, groupId: string): MuteState => {
  const entry = user?.groupMutes?.find((m) => String(m.group) === String(groupId));
  if (entry) {
    const mutedTypes = inOrder(entry.mutedTypes ?? []);
    if (mutedTypes.length === 0) return { state: 'none', until: null, mutedTypes: [] };
    return { state: mutedTypes.length === ALL_KINDS.length ? 'full' : 'partial', until: entry.until, mutedTypes };
  }
  if (user?.mutedGroups?.includes(groupId)) return { state: 'full', until: 'indefinite', mutedTypes: [...ALL_KINDS] };
  if (user?.mutedUntilNextMeetup?.includes(groupId)) return { state: 'full', until: 'nextMeetup', mutedTypes: [...ALL_KINDS] };
  return { state: 'none', until: null, mutedTypes: [] };
};

/** Same change the server makes in PATCH /api/users/mute-group, applied to a local copy. */
export const applyMuteLocally = <T extends MuteFields>(
  user: T,
  groupId: string,
  muteType: MuteRequest,
  kinds: readonly MuteKind[],
): T & Required<MuteFields> => {
  const mutedTypes = inOrder(kinds);
  const groupMutes = (user.groupMutes ?? []).filter((m) => String(m.group) !== groupId);
  const mutedGroups = (user.mutedGroups ?? []).filter((id) => id !== groupId);
  const mutedUntilNextMeetup = (user.mutedUntilNextMeetup ?? []).filter((id) => id !== groupId);
  if (muteType !== 'none' && mutedTypes.length > 0) {
    const until: MuteUntil = muteType === 'untilNext' ? 'nextMeetup' : 'indefinite';
    groupMutes.push({ group: groupId, until, mutedTypes });
    if (mutedTypes.length === ALL_KINDS.length) (until === 'nextMeetup' ? mutedUntilNextMeetup : mutedGroups).push(groupId);
  }
  return { ...user, groupMutes, mutedGroups, mutedUntilNextMeetup };
};

/** Toast text after saving a mute. */
export const describeMute = (muteType: Exclude<MuteRequest, 'none'>, kinds: readonly MuteKind[]): string => {
  const mutedTypes = inOrder(kinds);
  const suffix = muteType === 'untilNext' ? ' until the next meetup' : '';
  if (mutedTypes.length === ALL_KINDS.length) return `Muted${suffix}`;
  if (mutedTypes.length === 1) {
    const label = MUTE_KINDS.find((k) => k.key === mutedTypes[0])!.label;
    return `Muted ${label.charAt(0).toLowerCase()}${label.slice(1)}${suffix}`;
  }
  return `Muted ${mutedTypes.length} kinds${suffix}`;
};

/** The mute request that puts a group back into `state` (used by Undo). */
export const restoreRequest = (state: MuteState): { muteType: MuteRequest; kinds: MuteKind[] } =>
  state.state === 'none'
    ? { muteType: 'none', kinds: [] }
    : { muteType: state.until === 'nextMeetup' ? 'untilNext' : 'indefinite', kinds: state.mutedTypes };
