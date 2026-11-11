// Per-group, per-kind mutes. A member mutes chosen kinds of a group's pushes "until next
// meetup" or "indefinitely". New apps store the choice in `user.groupMutes`; mutes set by
// 1.3.x apps exist only in the legacy `mutedGroups` / `mutedUntilNextMeetup` lists.
// See docs/specs/2026-11-07-per-type-group-mute-design.md.
import { flags } from './featureFlags.js';

/** The kinds a member can mute, in the order the app shows them. */
export const MUTE_KINDS = ['chat', 'rsvps', 'changes', 'cancellations', 'reminders', 'polls', 'groupUpdates'];

// Notification type -> kind. Types not listed are personal events and are never muted
// (invites, removals, ownership, waitlist promotion/bumps, organizer overrides).
const KIND_FOR_TYPE = {
  chat: 'chat',
  'meetup-rsvp-in': 'rsvps',
  'meetup-rsvp-out': 'rsvps',
  'meetup-waitlist-join': 'rsvps',
  'meetup-created': 'changes',
  'meetup-updated': 'changes',
  'meetup-restored': 'changes',
  'schedule-removed': 'changes',
  'schedule-updated': 'changes',
  'meetup-cancelled': 'cancellations',
  'meetup-rsvp-reminder': 'reminders',
  'meetup-rsvp-open': 'reminders',
  'meetup-starting-soon': 'reminders',
  'poll-created': 'polls',
  'poll-closed': 'polls',
  'group-updated': 'groupUpdates',
  'group-member-joined': 'groupUpdates',
  'tournament-set': 'changes',
  'tournament-match-ready': 'changes',
  'tournament-finished': 'changes',
};

// Kinds that a 1.3.x mute always silenced (they were filtered in the database query).
const LEGACY_ALWAYS_MUTED = new Set(['chat', 'reminders']);

export const kindOf = (pushType) => (pushType && KIND_FOR_TYPE[pushType]) || null;

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

export const muteEntryFor = (user, groupId) =>
  (user?.groupMutes || []).find((m) => sameId(m?.group, groupId)) || null;

const inLegacyList = (user, groupId) =>
  (user?.mutedGroups || []).some((id) => sameId(id, groupId)) ||
  (user?.mutedUntilNextMeetup || []).some((id) => sameId(id, groupId));

/**
 * Should this push about `groupId` be held back from `user` because of a group mute?
 * aboutNextMeetup: the push is about the group's next meetup (only matters for 1.3.x mutes
 * while MUTE_ALL_PUSHES_ENABLED is off).
 */
export const isMutedFor = (user, groupId, pushType, { aboutNextMeetup = false, muteAll = flags.muteAllPushes() } = {}) => {
  if (!user || groupId == null) return false;
  const kind = kindOf(pushType);
  if (!kind) return false;

  const entry = muteEntryFor(user, groupId);
  if (entry) return (entry.mutedTypes || []).includes(kind);

  if (!inLegacyList(user, groupId)) return false;
  if (LEGACY_ALWAYS_MUTED.has(kind)) return true;
  return muteAll || aboutNextMeetup;
};

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

/**
 * Applies a mute change from PATCH /api/users/mute-group to `user` (a Mongoose doc or a
 * plain object). muteType: 'indefinite' | 'untilNext' | 'none'. mutedTypes omitted = every
 * kind (old apps and the "I'm Out + mute" button). An empty list removes the mute.
 * Keeps the legacy lists in step: a full mute is mirrored there, a partial one is not,
 * so 1.3.x apps only show a group as muted when everything is muted.
 */
export const applyMuteChange = (user, groupId, muteType, mutedTypes) => {
  let kinds = MUTE_KINDS;
  if (mutedTypes !== undefined && mutedTypes !== null) {
    if (!Array.isArray(mutedTypes) || mutedTypes.some((k) => !MUTE_KINDS.includes(k))) {
      throw badRequest('Invalid notification kinds.');
    }
    kinds = MUTE_KINDS.filter((k) => mutedTypes.includes(k));
  }

  const gid = String(groupId);
  user.groupMutes = (user.groupMutes || []).filter((m) => !sameId(m?.group, gid));
  user.mutedGroups = (user.mutedGroups || []).filter((id) => !sameId(id, gid));
  user.mutedUntilNextMeetup = (user.mutedUntilNextMeetup || []).filter((id) => !sameId(id, gid));

  if (muteType === 'none' || kinds.length === 0) return user;

  const until = muteType === 'untilNext' ? 'nextMeetup' : 'indefinite';
  user.groupMutes.push({ group: groupId, until, mutedTypes: kinds, updatedAt: new Date() });
  if (kinds.length === MUTE_KINDS.length) {
    (until === 'nextMeetup' ? user.mutedUntilNextMeetup : user.mutedGroups).push(groupId);
  }
  return user;
};

/**
 * The User.updateMany({ filter, update }) the expire job runs once a group's meetup has
 * passed: clears "until next meetup" mutes (all kinds) for those groups, in both the new
 * and the legacy fields. Indefinite mutes are left alone.
 */
export const clearNextMeetupMutesUpdate = (groupIds) => ({
  filter: {
    $or: [
      { mutedUntilNextMeetup: { $in: groupIds } },
      { groupMutes: { $elemMatch: { group: { $in: groupIds }, until: 'nextMeetup' } } },
    ],
  },
  update: {
    $pull: {
      mutedUntilNextMeetup: { $in: groupIds },
      groupMutes: { group: { $in: groupIds }, until: 'nextMeetup' },
    },
  },
});
