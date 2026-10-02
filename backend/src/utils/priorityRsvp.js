import { DateTime } from "luxon";
import Meetup from "../models/meetup.model.js";
import User from "../models/user.model.js";
import { notifyAndPersist } from "./push.notifications.js";
import { parseTimeString } from "./date.utils.js";
import { groupHasPremium } from "./premium.js";

/**
 * Priority RSVP (Premium): a series can give some members a head start. Members are
 * ranked in an ordered list; consecutive slices of that list form "groups" (tiers).
 *
 * The series' "earliest time to RSVP" is when the FIRST group opens. Each group then has
 * an exclusive window (`windowMinutes`) before the next group opens, and the last group's
 * window ends when RSVPs open for everyone else (Meetup.rsvpOpenDate). Windows count only
 * "awake" time when quiet hours are on, so nobody's turn passes while they sleep. A group
 * also opens early the moment every group before it has answered, and everyone else opens
 * early once all groups have answered.
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
 * Adds `minutes` of awake time to `start`. With quiet hours on, the interval
 * [quiet.start, quiet.end) (which may cross midnight) doesn't count.
 */
export const addAwakeMinutes = (start, minutes, quiet, timezone) => {
  let cursor = DateTime.fromJSDate(new Date(start)).setZone(timezone);
  const startMin = quiet?.enabled ? minutesOfDay(quiet.start || "10:00 PM") : null;
  const endMin = quiet?.enabled ? minutesOfDay(quiet.end || "08:00 AM") : null;
  if (startMin === null || startMin === endMin) {
    return cursor.plus({ minutes }).toJSDate();
  }

  // End of the quiet interval containing `dt`, or null if `dt` is awake time.
  const quietEndContaining = (dt) => {
    for (const dayOffset of [-1, 0]) {
      const s = atMinutes(dt.plus({ days: dayOffset }), startMin);
      let e = atMinutes(s, endMin);
      if (e <= s) e = atMinutes(s.plus({ days: 1 }), endMin);
      if (dt >= s && dt < e) return e;
    }
    return null;
  };
  const nextQuietStart = (dt) => {
    let s = atMinutes(dt, startMin);
    if (s <= dt) s = atMinutes(dt.plus({ days: 1 }), startMin);
    return s;
  };

  let remaining = minutes;
  for (let i = 0; i < 2000; i++) {
    const quietEnd = quietEndContaining(cursor);
    if (quietEnd) cursor = quietEnd;
    const qStart = nextQuietStart(cursor);
    const available = qStart.diff(cursor, "minutes").minutes;
    if (available >= remaining) return cursor.plus({ minutes: remaining }).toJSDate();
    remaining -= available;
    cursor = qStart;
  }
  return cursor.toJSDate();
};

/**
 * Works out a meetup's RSVP schedule from the series' "earliest time to RSVP" (`baseOpen`).
 * Without priority: { rsvpOpenDate: baseOpen, priorityTiers: [] }. With it: the first
 * group opens at baseOpen, later groups cascade, and rsvpOpenDate becomes the time
 * RSVPs open for everyone else.
 *
 * `active` = the series has priority on AND the owner has Premium.
 * `priorityOpened` lists groups already past their time while everyone else is still
 * locked out (counted as announced, so edits never re-send "your turn" pings).
 */
export const resolveRsvpOpen = ({ schedule, group, baseOpen, active, now = new Date() }) => {
  const plain = { rsvpOpenDate: baseOpen ?? null, priorityTiers: [], priorityOpened: [] };
  if (!active || !baseOpen) return plain;

  const tierDefs = schedule.priorityTiers || [];
  if (tierDefs.length === 0) return plain;

  const groupMemberIds = new Set((group.members || []).map((m) => (m?._id ?? m).toString()));
  const ordered = (schedule.priorityOrder || [])
    .map((id) => id.toString())
    .filter((id) => groupMemberIds.has(id));

  let pos = 0;
  let cursor = new Date(baseOpen);
  const priorityTiers = [];
  for (const def of tierDefs) {
    const members = ordered.slice(pos, pos + def.size);
    pos += def.size;
    if (members.length === 0) continue;
    priorityTiers.push({ members, opensAt: cursor });
    cursor = addAwakeMinutes(cursor, def.windowMinutes, schedule.priorityQuiet, group.timezone);
  }
  if (priorityTiers.length === 0) return plain;

  const everyoneStillClosed = cursor > now;
  const priorityOpened = everyoneStillClosed
    ? priorityTiers.map((t, i) => (new Date(t.opensAt) <= now ? i : null)).filter((i) => i !== null)
    : [];
  return { rsvpOpenDate: cursor, priorityTiers, priorityOpened };
};

const idStr = (v) => (v?._id ?? v).toString();
const includesId = (list, id) => (list || []).some((x) => idStr(x) === id);

/** Index of the tier a user belongs to, or -1 (everyone else). */
export const userTierIndex = (meetup, userId) => {
  const id = idStr(userId);
  return (meetup.priorityTiers || []).findIndex((t) => (t.members || []).some((m) => idStr(m) === id));
};

const rankOf = (meetup, id) => {
  const t = userTierIndex(meetup, id);
  return t < 0 ? Infinity : t;
};

/**
 * Which waitlisted person gets the next open spot: the highest-priority group first
 * (unlisted members last), then whoever has waited longest. Without active priority
 * it's simply the front of the line. Returns an index into meetup.waitlist, or -1.
 */
export const pickWaitlistIndex = (meetup, tiersActive = true) => {
  const list = meetup.waitlist || [];
  if (list.length === 0) return -1;
  if (!tiersActive || (meetup.priorityTiers?.length ?? 0) === 0) return 0;
  let best = 0;
  for (let i = 1; i < list.length; i++) {
    if (rankOf(meetup, list[i]) < rankOf(meetup, list[best])) best = i;
  }
  return best;
};

/**
 * Bring a full-or-filling meetup in line with the current priority ranking: open spots go
 * to the best waitlisted people, and a waitlisted person who outranks someone who's In
 * swaps places with them (the displaced person goes to the front of the waitlist).
 * Used after priority settings change. Notifies everyone who moved.
 */
export const rebalanceMeetup = async (meetupId) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const meetup = await Meetup.findById(meetupId);
    if (!meetup || meetup.status !== "scheduled" || !(meetup.capacity > 0)) return null;
    if ((meetup.priorityTiers?.length ?? 0) === 0 || (meetup.waitlist?.length ?? 0) === 0) return null;

    const before = new Set(meetup.in.map(idStr));
    for (let guard = 0; guard < 500 && meetup.waitlist.length > 0; guard++) {
      const wi = pickWaitlistIndex(meetup, true);
      const w = meetup.waitlist[wi];
      if (meetup.in.length < meetup.capacity) {
        meetup.waitlist.splice(wi, 1);
        meetup.in.push(w);
        continue;
      }
      let vi = -1;
      for (let i = 0; i < meetup.in.length; i++) {
        if (vi < 0 || rankOf(meetup, meetup.in[i]) >= rankOf(meetup, meetup.in[vi])) vi = i;
      }
      if (vi < 0 || rankOf(meetup, w) >= rankOf(meetup, meetup.in[vi])) break;
      const v = meetup.in[vi];
      meetup.in.splice(vi, 1);
      meetup.waitlist.splice(wi, 1);
      meetup.waitlist.unshift(v);
      meetup.in.push(w);
    }

    const after = new Set(meetup.in.map(idStr));
    const promoted = [...after].filter((id) => !before.has(id));
    const bumped = [...before].filter((id) => !after.has(id));
    if (promoted.length === 0 && bumped.length === 0) return null;

    if (bumped.length) {
      if (meetup.bringClaims?.length) meetup.bringClaims = meetup.bringClaims.filter((c) => !bumped.includes(idStr(c.user)));
      if (meetup.rides?.length) meetup.rides = meetup.rides.filter((r) => !bumped.includes(idStr(r.user)));
      if (meetup.answers?.length) meetup.answers = meetup.answers.filter((a) => !bumped.includes(idStr(a.user)));
      for (const t of meetup.teams || []) t.members = t.members.filter((id) => !bumped.includes(idStr(id)));
    }
    try {
      await meetup.save();
    } catch (err) {
      if (err.name === "VersionError" && attempt < 2) continue;
      throw err;
    }

    const data = { meetupId: meetup._id.toString(), groupId: meetup.group.toString() };
    if (promoted.length) {
      await notifyAndPersist(await User.find({ _id: { $in: promoted } }), {
        title: "You're In! 🎉",
        body: `You've been moved off the waitlist for "${meetup.name}" because of RSVP priority.`,
        data: { ...data, type: "meetup_waitlist_promoted" },
        type: "waitlist-promotion",
        meetup: meetup._id,
        group: meetup.group,
      });
    }
    if (bumped.length) {
      await notifyAndPersist(await User.find({ _id: { $in: bumped } }), {
        title: "Moved to the waitlist",
        body: `RSVP priority changed, and your spot in "${meetup.name}" went to a higher-priority member. You're first on the waitlist.`,
        data: { ...data, type: "meetup_waitlist_bumped" },
        type: "priority-bumped",
        meetup: meetup._id,
        group: meetup.group,
      });
    }
    return { promoted, bumped };
  }
  return null;
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
    if (i === 0) return false;
    if (!isTierComplete(meetup, i - 1)) return false;
  }
  return false;
};

/** Every priority group has opened and answered, so everyone else may RSVP early. */
export const allTiersAnswered = (meetup, now = new Date()) => {
  const tiers = meetup.priorityTiers || [];
  if (tiers.length === 0) return false;
  const last = tiers.length - 1;
  return isTierOpen(meetup, last, now) && tiers.every((_, k) => isTierComplete(meetup, k));
};

/**
 * When RSVPs open for people outside every priority group. If priority isn't active
 * (e.g. the owner's Premium lapsed) there's no head start, so it's the first group's
 * time — the series' own "earliest time to RSVP".
 */
export const everyoneOpensAt = (meetup, tiersActive = true) => {
  const tiers = meetup.priorityTiers || [];
  if (tiers.length > 0 && !tiersActive) return tiers[0].opensAt;
  return meetup.rsvpOpenDate || null;
};

/**
 * Can this user RSVP right now? Priority members once their group has opened; everyone
 * else once the general time arrives (or early, after every group has answered).
 * `tiersActive` is false when the owner's Premium has lapsed (priority ignored).
 */
export const canRsvpNow = (meetup, userId, tiersActive = true, now = new Date()) => {
  const open = everyoneOpensAt(meetup, tiersActive);
  if (!open || new Date(open) <= now) return true;
  if (!tiersActive || !(meetup.priorityTiers || []).length) return false;
  if (allTiersAnswered(meetup, now)) return true;
  const k = userTierIndex(meetup, userId);
  return k >= 0 && isTierOpen(meetup, k, now);
};

/** When this user's turn starts (for messages): their group's time, or the general time. */
export const userOpensAt = (meetup, userId, tiersActive = true) => {
  const k = tiersActive ? userTierIndex(meetup, userId) : -1;
  if (k >= 0) return meetup.priorityTiers[k].opensAt;
  return everyoneOpensAt(meetup, tiersActive);
};

const dateLabel = (meetup) =>
  new Date(meetup.date).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: meetup.timezone,
  });

/**
 * Sends "RSVPs are open" to each priority group the moment it opens (on schedule or
 * early), once per group, and to everyone else if they open early because every group
 * has answered. Only people who haven't answered yet are pinged.
 * Returns how many announcements were made.
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

    if (k < 0) {
      // Every group answered: everyone else opens early (once).
      if (meetup.rsvpNotified || !allTiersAnswered(meetup, now)) return announced;
      const claimed = await Meetup.updateOne({ _id: meetup._id, rsvpNotified: false }, { $set: { rsvpNotified: true } });
      if (claimed.modifiedCount === 0) return announced;
      const inTier = new Set(meetup.priorityTiers.flatMap((t) => t.members.map(idStr)));
      const targets = (meetup.members || []).filter((m) => !inTier.has(idStr(m)) && !hasResponded(meetup, idStr(m)));
      if (targets.length > 0) {
        const users = await User.find({ _id: { $in: targets } });
        await notifyAndPersist(users, {
          title: "RSVPs Are Open!",
          body: `You can now RSVP to "${meetup.name}" on ${dateLabel(meetup)}.`,
          data: { meetupId: meetup._id.toString(), type: "rsvp_open", groupId: meetup.group.toString() },
          type: "meetup-rsvp-open",
          meetup: meetup._id,
          group: meetup.group,
        });
      }
      return announced + 1;
    }

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
      await notifyAndPersist(users, {
        title: "It's your turn to RSVP!",
        body: `You can now RSVP to "${meetup.name}" on ${dateLabel(meetup)}.`,
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
 * Recomputes RSVP open times and the priority snapshot on a schedule's upcoming meetups
 * in place (RSVPs untouched), from the series' current settings.
 */
export const refreshPriorityTiers = async (group, schedule) => {
  const now = new Date();
  const meetups = await Meetup.find({
    group: group._id,
    schedule: schedule._id,
    status: "scheduled",
    date: { $gte: now },
  })
    .select("startsAt date rsvpOpenDate rsvpNotified")
    .lean();
  if (meetups.length === 0) return 0;

  const active = !!schedule.priorityEnabled && (await groupHasPremium(group));
  const { hours: leadH, minutes: leadM } = parseTimeString(schedule.generationLeadTime || "09:00 AM");

  const ops = [];
  for (const m of meetups) {
    const startsAtDT = DateTime.fromJSDate(new Date(m.startsAt || m.date)).setZone(group.timezone);
    const baseOpen = schedule.generationLeadDays != null
      ? startsAtDT.minus({ days: schedule.generationLeadDays }).set({ hour: leadH, minute: leadM, second: 0, millisecond: 0 }).toJSDate()
      : null;
    const { rsvpOpenDate, priorityTiers, priorityOpened } = resolveRsvpOpen({ schedule, group, baseOpen, active, now });
    // already-open (or no gate) skips the "RSVPs are open" ping; a future open time re-arms it
    const rsvpNotified = !rsvpOpenDate || rsvpOpenDate <= now;
    ops.push({
      updateOne: {
        filter: { _id: m._id, status: "scheduled" },
        update: { $set: { rsvpOpenDate, priorityTiers, priorityOpened, rsvpNotified } },
      },
    });
  }
  await Meetup.bulkWrite(ops);
  // The ranking may have changed: shuffle full meetups so higher-priority waitlisted
  // members take the place of lower-priority people who are In.
  if (active) {
    for (const m of meetups) {
      try {
        await rebalanceMeetup(m._id);
      } catch (err) {
        console.error("Priority rebalance failed:", err);
      }
    }
  }
  return ops.length;
};
