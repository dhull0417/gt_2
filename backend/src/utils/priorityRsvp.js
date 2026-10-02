import { DateTime } from "luxon";
import Meetup from "../models/meetup.model.js";
import User from "../models/user.model.js";
import { notifyAndPersist } from "./push.notifications.js";
import { parseTimeString } from "./date.utils.js";

/**
 * Priority RSVP (Premium): a series can give some members a head start. Members are
 * ranked in an ordered list; consecutive slices of that list form "groups" (tiers).
 * Each group has a `windowMinutes` exclusive window before the next group opens, and
 * the last group's window ends when RSVPs open for everyone (rsvpOpenDate). Windows
 * are counted in "awake" time when quiet hours are on, so nobody's turn passes while
 * they sleep. A group also opens as soon as the group before it has fully responded.
 */

export const MAX_PRIORITY_TIERS = 20;
export const MAX_WINDOW_MINUTES = 7 * 24 * 60;

const minutesOfDay = (timeString) => {
  const { hours, minutes } = parseTimeString(timeString);
  return hours * 60 + minutes;
};

const atMinutes = (dt, mins) =>
  dt.startOf("day").set({ hour: Math.floor(mins / 60), minute: mins % 60, second: 0, millisecond: 0 });

/**
 * Walks back `minutes` of awake time from `end`. With quiet hours on, the interval
 * [quiet.start, quiet.end) (which may cross midnight) doesn't count.
 */
export const subtractAwakeMinutes = (end, minutes, quiet, timezone) => {
  let cursor = DateTime.fromJSDate(new Date(end)).setZone(timezone);
  const startMin = quiet?.enabled ? minutesOfDay(quiet.start || "10:00 PM") : null;
  const endMin = quiet?.enabled ? minutesOfDay(quiet.end || "08:00 AM") : null;
  if (startMin === null || startMin === endMin) {
    return cursor.minus({ minutes }).toJSDate();
  }

  // Start of the quiet interval that ends at `endDt` (an instant at quiet.end's time of day).
  const quietStartFor = (endDt) => {
    let s = atMinutes(endDt, startMin);
    if (s >= endDt) s = atMinutes(endDt.minus({ days: 1 }), startMin);
    return s;
  };
  // Latest quiet end at or before `dt`.
  const latestQuietEnd = (dt) => {
    let e = atMinutes(dt, endMin);
    if (e > dt) e = atMinutes(dt.minus({ days: 1 }), endMin);
    return e;
  };

  // If `cursor` sits inside a quiet interval, the awake time before it ends where that interval began.
  const nextEnd = (() => {
    // quiet interval containing cursor: starts at some S <= cursor and ends at the next quiet end after S
    let e = atMinutes(cursor, endMin);
    if (e <= cursor) e = atMinutes(cursor.plus({ days: 1 }), endMin);
    return e;
  })();
  const nextStart = quietStartFor(nextEnd);
  if (nextStart <= cursor) cursor = nextStart;

  let remaining = minutes;
  for (let i = 0; i < 2000 && remaining > 0; i++) {
    const segStart = latestQuietEnd(cursor);
    const avail = Math.max(0, cursor.diff(segStart, "minutes").minutes);
    if (avail >= remaining) return cursor.minus({ minutes: remaining }).toJSDate();
    remaining -= avail;
    cursor = quietStartFor(segStart);
  }
  return cursor.toJSDate();
};

/**
 * Builds the per-meetup snapshot: [{ members: [userId], opensAt }] in priority order.
 * Returns [] when there's nothing to do (disabled, no general open time, no one ranked).
 */
export const computePriorityTiers = ({ schedule, group, generalOpen }) => {
  if (!schedule?.priorityEnabled || !generalOpen) return [];
  const tierDefs = schedule.priorityTiers || [];
  if (tierDefs.length === 0) return [];

  const groupMemberIds = new Set((group.members || []).map((m) => (m?._id ?? m).toString()));
  const ordered = (schedule.priorityOrder || [])
    .map((id) => id.toString())
    .filter((id) => groupMemberIds.has(id));

  const slices = [];
  let cursor = 0;
  for (const def of tierDefs) {
    const members = ordered.slice(cursor, cursor + def.size);
    cursor += def.size;
    if (members.length > 0) slices.push({ members, windowMinutes: def.windowMinutes });
  }
  if (slices.length === 0) return [];

  const tiers = new Array(slices.length);
  let end = new Date(generalOpen);
  for (let i = slices.length - 1; i >= 0; i--) {
    const opensAt = subtractAwakeMinutes(end, slices[i].windowMinutes, schedule.priorityQuiet, group.timezone);
    tiers[i] = { members: slices[i].members, opensAt };
    end = opensAt;
  }
  return tiers;
};

const idStr = (v) => (v?._id ?? v).toString();
const includesId = (list, id) => (list || []).some((x) => idStr(x) === id);

/** Index of the tier a user belongs to, or -1 (everyone else). */
export const userTierIndex = (meetup, userId) => {
  const id = idStr(userId);
  return (meetup.priorityTiers || []).findIndex((t) => (t.members || []).some((m) => idStr(m) === id));
};

const hasResponded = (meetup, id) =>
  includesId(meetup.in, id) || includesId(meetup.out, id) || includesId(meetup.waitlist, id);

/** Everyone in the tier who's still part of this meetup has answered. */
export const isTierComplete = (meetup, k) => {
  const tier = meetup.priorityTiers?.[k];
  if (!tier) return true;
  return tier.members.every((m) => {
    const id = idStr(m);
    return !includesId(meetup.members, id) || hasResponded(meetup, id);
  });
};

/**
 * Is tier `k` open for RSVPs at `now`? By its scheduled time, or early once every
 * earlier group has answered. (Tier 0 only ever opens by time.)
 */
export const isTierOpen = (meetup, k, now = new Date()) => {
  const tiers = meetup.priorityTiers || [];
  for (let i = k; i >= 0; i--) {
    if (now >= new Date(tiers[i].opensAt)) return true;
    // not open by time: only continues opening if the previous tier is open AND complete
    if (i === 0) return false;
    if (!isTierComplete(meetup, i - 1)) return false;
  }
  return false;
};

/**
 * Can this user RSVP right now? Everyone can once the general window opens;
 * before that, only members of a group that's currently open.
 * `tiersActive` is false when the owner's Premium has lapsed (priority ignored).
 */
export const canRsvpNow = (meetup, userId, tiersActive = true, now = new Date()) => {
  if (!meetup.rsvpOpenDate || new Date(meetup.rsvpOpenDate) <= now) return true;
  if (!tiersActive || !(meetup.priorityTiers || []).length) return false;
  const k = userTierIndex(meetup, userId);
  return k >= 0 && isTierOpen(meetup, k, now);
};

/** When this user's group opens (or null if they're not in a group). Used for messages. */
export const userOpensAt = (meetup, userId) => {
  const k = userTierIndex(meetup, userId);
  if (k < 0) return meetup.rsvpOpenDate || null;
  return meetup.priorityTiers[k].opensAt;
};

/**
 * Sends "RSVPs are open" to each priority group the moment it opens (on schedule or
 * early) — once per group. Only people who haven't answered yet are pinged.
 * Returns how many groups were announced.
 */
export const notifyOpenTiers = async (meetupId) => {
  let announced = 0;
  for (let guard = 0; guard < 25; guard++) {
    const meetup = await Meetup.findById(meetupId).lean();
    if (!meetup || meetup.status !== "scheduled" || !(meetup.priorityTiers || []).length) return announced;
    if (meetup.rsvpOpenDate && new Date(meetup.rsvpOpenDate) <= new Date()) return announced; // general open covers it
    const opened = new Set(meetup.priorityOpened || []);
    const now = new Date();
    const k = meetup.priorityTiers.findIndex((_, i) => !opened.has(i) && isTierOpen(meetup, i, now));
    if (k < 0) return announced;

    // claim the tier so concurrent callers don't double-announce
    const claimed = await Meetup.updateOne(
      { _id: meetup._id, priorityOpened: { $ne: k } },
      { $addToSet: { priorityOpened: k } }
    );
    if (claimed.modifiedCount === 0) continue;

    const targets = meetup.priorityTiers[k].members.filter(
      (m) => includesId(meetup.members, idStr(m)) && !hasResponded(meetup, idStr(m))
    );
    if (targets.length > 0) {
      const users = await User.find({ _id: { $in: targets } });
      const dateStr = new Date(meetup.date).toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", timeZone: meetup.timezone,
      });
      await notifyAndPersist(users, {
        title: "It's your turn to RSVP!",
        body: `You can now RSVP to "${meetup.name}" on ${dateStr}.`,
        data: { meetupId: meetup._id.toString(), type: "rsvp_open", groupId: meetup.group.toString() },
        type: "meetup-rsvp-open",
        meetup: meetup._id,
        group: meetup.group,
      });
    }
    announced++;
  }
  return announced;
};

/**
 * Recomputes the priority snapshot on a schedule's upcoming meetups in place (RSVPs
 * untouched). While the general window is still closed, groups whose time has already
 * passed are marked announced so editing the order later never re-sends "your turn" pings.
 */
export const refreshPriorityTiers = async (group, schedule) => {
  const now = new Date();
  const meetups = await Meetup.find({
    group: group._id,
    schedule: schedule._id,
    status: "scheduled",
    date: { $gte: now },
  })
    .select("rsvpOpenDate priorityTiers priorityOpened")
    .lean();

  const ops = [];
  for (const m of meetups) {
    // Groups are kept even after the general window opens: the ranking still decides
    // who keeps a spot when a meetup fills up.
    const tiers = m.rsvpOpenDate ? computePriorityTiers({ schedule, group, generalOpen: m.rsvpOpenDate }) : [];
    const generalStillClosed = !!m.rsvpOpenDate && new Date(m.rsvpOpenDate) > now;
    const priorityOpened = generalStillClosed
      ? tiers.map((t, i) => (new Date(t.opensAt) <= now ? i : null)).filter((i) => i !== null)
      : [];
    ops.push({ updateOne: { filter: { _id: m._id, status: "scheduled" }, update: { $set: { priorityTiers: tiers, priorityOpened } } } });
  }
  if (ops.length > 0) await Meetup.bulkWrite(ops);
  return ops.length;
};
