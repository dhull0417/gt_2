import Meetup from "../models/meetup.model.js";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { notifyAndPersist } from "./push.notifications.js";
import { groupHasPremium } from "./premium.js";

/**
 * Meetups past their RSVP deadline whose minimum headcount hasn't been
 * evaluated yet. Optional `extra` narrows the query (e.g. to one user's meetups).
 */
export const dueForMinimumCheck = (extra = {}, now = new Date()) => ({
  ...extra,
  status: 'scheduled',
  minAttendees: { $gt: 0 },
  minimumChecked: false,
  rsvpCloseDate: { $lte: now },
  startsAt: { $gte: now },
});

/**
 * Evaluates one meetup's minimum headcount. Safe to call from the cron job,
 * from reads, and from RSVP — the claim below guarantees one evaluator wins.
 * Cancels (and notifies) when short; otherwise just marks it checked so RSVPs
 * close normally. Returns 'cancelled' | 'ok' | 'skipped'.
 */
export const evaluateMinimumHeadcount = async (meetupId) => {
  const meetup = await Meetup.findOneAndUpdate(
    { _id: meetupId, status: 'scheduled', minimumChecked: false },
    { $set: { minimumChecked: true } },
    { new: true }
  ).lean();
  if (!meetup) return 'skipped';

  const group = await Group.findById(meetup.group).select('owner').lean();
  if (!(await groupHasPremium(group))) return 'ok';

  const inUsers = await User.find({ _id: { $in: meetup.in } }).select('clerkId').lean();
  const guestsByClerkId = new Map((meetup.guests || []).map((g) => [g.userId, g.count || 0]));
  const headcount = inUsers.reduce((sum, u) => sum + 1 + (guestsByClerkId.get(u.clerkId) || 0), 0);
  if (headcount >= meetup.minAttendees) return 'ok';

  // Cancel first so the cancellation is the first state anyone sees.
  await Meetup.updateOne(
    { _id: meetupId, status: 'scheduled' },
    { $set: { status: 'cancelled', isOverride: true, cancelReason: 'minimum-headcount' } }
  );

  try {
    const members = await User.find({ _id: { $in: meetup.members } });
    if (members.length > 0) {
      const dateStr = new Date(meetup.date).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: meetup.timezone,
      });
      const withToken = members.filter((u) => u.expoPushToken).length;
      await notifyAndPersist(members, {
        title: "Meetup Cancelled",
        body: `"${meetup.name}" on ${dateStr} was cancelled: only ${headcount} of the ${meetup.minAttendees} needed signed up.`,
        data: { meetupId: meetup._id.toString(), type: 'meetup_cancellation', groupId: meetup.group.toString() },
        type: 'meetup-cancelled',
        meetup: meetup._id,
        group: meetup.group,
        meta: { reason: 'minimum-headcount', needed: meetup.minAttendees, count: headcount },
      });
      console.log(`[MinHeadcount] cancelled ${meetup._id}; notified ${members.length} member(s), ${withToken} with push tokens`);
    }
  } catch (err) {
    console.error("[MinHeadcount] cancelled but notification failed for", meetupId.toString(), err);
  }
  return 'cancelled';
};

/** Evaluate every due meetup matching `extra`; returns how many were cancelled. */
export const evaluateDueMeetups = async (extra = {}) => {
  const due = await Meetup.find(dueForMinimumCheck(extra)).select('_id').lean();
  let cancelled = 0;
  for (const { _id } of due) {
    try {
      if ((await evaluateMinimumHeadcount(_id)) === 'cancelled') cancelled++;
    } catch (err) {
      console.error("[MinHeadcount] failed for meetup", _id.toString(), err);
    }
  }
  return { checked: due.length, cancelled };
};
