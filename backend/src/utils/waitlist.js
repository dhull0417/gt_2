import mongoose from "mongoose";
import Meetup from "../models/meetup.model.js";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { groupHasWaitlist } from "./premium.js";
import { pickWaitlistIndex } from "./priorityRsvp.js";
import { notifyAndPersist } from "./push.notifications.js";
import { canManageMember } from "../controllers/group.controller.js";

/**
 * Spots taken: everyone who is In plus every guest on the meetup. A guest keeps their
 * spot whatever their host does (Out with "Keep Guests", waitlisted, bumped) until the
 * host or an owner/moderator removes them. The second argument is no longer needed and
 * is kept so existing callers don't change.
 */
export const headcountOf = (meetup, _clerkIdByUserId) =>
  (meetup.in || []).length + (meetup.guests || []).reduce((sum, g) => sum + (g.count || 0), 0);

export const loadClerkIds = async (userIds) => {
  if (!userIds?.length) return new Map();
  const users = await User.find({ _id: { $in: userIds } }).select("clerkId").lean();
  return new Map(users.map((u) => [String(u._id), u.clerkId]));
};

/**
 * How many guests a host may bring. Guests only ever take spots that are free: the host's
 * current guests are replaced by nextCount, and when the host isn't In their own spot counts
 * too (so guests added while Out can't over-fill the meetup once they tap In).
 * Capacity 0 means unlimited. Returns { ok, room } where room is the most guests that fit.
 */
export const guestRoom = (meetup, clerkIdByUserId, { hostId, hostClerkId, nextCount }) => {
  if (!(meetup.capacity > 0)) return { ok: true, room: Infinity };
  const hostIsIn = (meetup.in || []).some((id) => String(id) === String(hostId));
  const currentGuests = (meetup.guests || []).find((g) => g.userId === hostClerkId)?.count || 0;
  // The host's current guests are being replaced; if the host isn't In, keep their own spot free too.
  let used = headcountOf(meetup, clerkIdByUserId) - currentGuests;
  if (!hostIsIn) used += 1;
  const room = Math.max(0, meetup.capacity - used);
  return { ok: nextCount <= room, room };
};

/**
 * Who may change a member's guest count: the member themself, or someone who can manage that
 * member (the owner, or a moderator over a regular member; same rule as RSVP overrides).
 */
export const canEditGuestsOf = (requesterId, hostUserId, group) =>
  String(requesterId) === String(hostUserId) || canManageMember(requesterId, hostUserId, group);

/** Convenience: current headcount of a meetup document. */
export const headcount = async (meetup) => headcountOf(meetup, await loadClerkIds(meetup.in));

/**
 * Moves people off the waitlist while there is room (only where the group has a waitlist,
 * see groupHasWaitlist; capacity 0 = unlimited).
 * Call it after anything that can free spots: a capacity increase, a member leaving or
 * being removed, someone dropping guests. Safe to call repeatedly. Returns the ids moved.
 */
export const promoteWaitlist = async (meetupId, { silent = false } = {}) => {
  const MAX_RETRIES = 3;
  const promoted = [];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    promoted.length = 0;
    const meetup = await Meetup.findById(meetupId);
    if (!meetup || meetup.status !== "scheduled" || meetup.waitlist.length === 0) return [];

    const groupDoc = await Group.findById(meetup.group).select("owner").lean();
    if (!(await groupHasWaitlist(groupDoc))) return [];

    // Guests already hold their spots (see headcountOf), so each promotion takes exactly one.
    let used = headcountOf(meetup);

    while (meetup.waitlist.length > 0) {
      if (meetup.capacity > 0 && used >= meetup.capacity) break;
      const idx = pickWaitlistIndex(meetup, (meetup.priorityTiers?.length ?? 0) > 0);
      const id = meetup.waitlist[idx];
      meetup.waitlist.splice(idx, 1);
      meetup.in.push(id);
      used += 1;
      promoted.push(id);
    }

    if (promoted.length === 0) return [];
    try {
      await meetup.save();
      break;
    } catch (err) {
      if (err instanceof mongoose.Error.VersionError && attempt < MAX_RETRIES) continue;
      throw err;
    }
  }

  if (!silent && promoted.length > 0) {
    try {
      const meetup = await Meetup.findById(meetupId).select("name group").lean();
      const users = await User.find({ _id: { $in: promoted } });
      await notifyAndPersist(users, {
        title: "You're In! 🎉",
        body: `A spot opened up for "${meetup.name}" and you've been moved off the waitlist!`,
        data: { meetupId: String(meetupId), type: "meetup_waitlist_promoted" },
        type: "waitlist-promotion",
        meetup: meetupId,
        group: meetup.group,
      });
    } catch (err) {
      console.error("Waitlist promotion notification failed:", err);
    }
  }
  return promoted;
};
