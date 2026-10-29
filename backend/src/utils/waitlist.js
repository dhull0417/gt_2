import mongoose from "mongoose";
import Meetup from "../models/meetup.model.js";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { groupHasWaitlist } from "./premium.js";
import { pickWaitlistIndex } from "./priorityRsvp.js";
import { notifyAndPersist } from "./push.notifications.js";

/**
 * Spots taken: everyone who is In plus the guests they're bringing. Guests are
 * stored by Clerk id, so the caller supplies a Map(userId -> clerkId) for the
 * people who are In (see loadClerkIds).
 */
export const headcountOf = (meetup, clerkIdByUserId) => {
  const guestsByClerk = new Map((meetup.guests || []).map((g) => [g.userId, g.count || 0]));
  let total = 0;
  for (const id of meetup.in || []) {
    total += 1 + (guestsByClerk.get(clerkIdByUserId.get(String(id))) || 0);
  }
  return total;
};

export const loadClerkIds = async (userIds) => {
  if (!userIds?.length) return new Map();
  const users = await User.find({ _id: { $in: userIds } }).select("clerkId").lean();
  return new Map(users.map((u) => [String(u._id), u.clerkId]));
};

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

    const clerkIds = await loadClerkIds([...meetup.in, ...meetup.waitlist]);
    const guestsByClerk = new Map((meetup.guests || []).map((g) => [g.userId, g.count || 0]));
    let used = headcountOf(meetup, clerkIds);

    while (meetup.waitlist.length > 0) {
      if (meetup.capacity > 0 && used >= meetup.capacity) break;
      const idx = pickWaitlistIndex(meetup, (meetup.priorityTiers?.length ?? 0) > 0);
      const id = meetup.waitlist[idx];
      const need = 1 + (guestsByClerk.get(clerkIds.get(String(id))) || 0);
      // The next person in line (with their guests) doesn't fit: stop rather than skip ahead.
      if (meetup.capacity > 0 && used + need > meetup.capacity) break;
      meetup.waitlist.splice(idx, 1);
      meetup.in.push(id);
      used += need;
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
