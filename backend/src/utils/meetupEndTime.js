// Optional meetup end time. A meetup stores the clock time people chose (`endTime`,
// "08:00 PM") plus the exact moment it ends (`endsAt`). An end clock time that is not
// after the start means the next day (9:00 PM - 1:00 AM). Meetups without an end time
// are treated as lasting DEFAULT_DURATION_MS.
import { DateTime } from "luxon";
import { parseTimeString } from "./date.utils.js";

export const DEFAULT_DURATION_MS = 60 * 60 * 1000;

const TIME_RE = /^(0?[1-9]|1[0-2]):[0-5]\d (AM|PM)$/;

const minutesOf = (time) => {
  const { hours, minutes } = parseTimeString(time);
  return hours * 60 + minutes;
};

/** null when fine (or no end time); otherwise the error message to show. */
export const validateEndTime = (time, endTime) => {
  if (endTime === null || endTime === undefined || endTime === "") return null;
  if (typeof endTime !== "string" || !TIME_RE.test(endTime.trim())) return "Invalid end time.";
  if (time && minutesOf(time) === minutesOf(endTime.trim())) return "End time can't be the same as the start time.";
  return null;
};

/** The exact end moment for a meetup starting at `startsAt`, or null without an end time. */
export const computeEndsAt = (startsAt, endTime, timezone) => {
  if (!endTime || !startsAt) return null;
  const start = DateTime.fromJSDate(new Date(startsAt)).setZone(timezone || "UTC");
  const { hours, minutes } = parseTimeString(endTime);
  let end = start.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
  if (end <= start) end = end.plus({ days: 1 });
  return end.toJSDate();
};

/** When the meetup ends: its endsAt, or start + 1 hour. */
export const effectiveEnd = ({ startsAt, endsAt }) =>
  endsAt ? new Date(endsAt) : new Date(new Date(startsAt).getTime() + DEFAULT_DURATION_MS);

/** End fields for a meetup generated from a schedule row (`dayTimes[i]`). */
export const slotEndFields = (dtEntry, startsAt, timezone) => {
  const endTime = dtEntry?.endTime || null;
  return { endTime, endsAt: computeEndsAt(startsAt, endTime, timezone) };
};

const slotKey = (date, time) => `${new Date(date).toISOString()}|${time}`;

/**
 * bulkWrite ops that bring kept series meetups' end times in line with their schedule
 * rows. `upcoming`: { _id, date, time, endTime, isOverride }; `candidates` from
 * computeScheduleCandidates. Overrides keep their own end time; meetups whose slot is
 * gone are handled (removed) by the reconcile step itself.
 */
export const buildEndTimeUpdates = (upcoming, candidates, timezone) => {
  const bySlot = new Map(candidates.map(({ nextDate, dtEntry }) => [slotKey(nextDate, dtEntry.time), { nextDate, dtEntry }]));
  const ops = [];
  for (const m of upcoming) {
    if (m.isOverride) continue;
    const slot = bySlot.get(slotKey(m.date, m.time));
    if (!slot) continue;
    const { endTime, endsAt } = slotEndFields(slot.dtEntry, slot.nextDate, timezone);
    if ((m.endTime || null) === endTime) continue;
    ops.push({ updateOne: { filter: { _id: m._id }, update: { $set: { endTime, endsAt } } } });
  }
  return ops;
};

/** First end-time problem across a schedule's routines, or null. */
export const validateRoutineEndTimes = (routines) => {
  for (const routine of routines || []) {
    for (const dt of routine?.dayTimes || []) {
      const error = validateEndTime(dt?.time, dt?.endTime);
      if (error) return error;
    }
  }
  return null;
};

const toPlain = (v) => (v && typeof v.toObject === "function" ? v.toObject() : v);

/**
 * Old app builds (1.3.x) don't know about end times and send schedule rows without the
 * field. A row with no `endTime` key keeps the end time of the existing row with the same
 * frequency, day/date and start time, so saving from an old app doesn't erase it.
 */
export const preserveLegacyEndTimes = (incoming, existing) => {
  const ends = new Map();
  for (const routine of existing || []) {
    for (const dt of routine?.dayTimes || []) {
      if (dt?.endTime) ends.set(`${routine.frequency}|${dt.day ?? ""}|${dt.date ?? ""}|${dt.time}`, dt.endTime);
    }
  }
  if (!Array.isArray(incoming)) return incoming;
  return incoming.map((routine) => {
    const r = toPlain(routine);
    if (!r || !Array.isArray(r.dayTimes)) return r;
    return {
      ...r,
      dayTimes: r.dayTimes.map((dt) => {
        if (!dt || "endTime" in dt) return dt;
        const end = ends.get(`${r.frequency}|${dt.day ?? ""}|${dt.date ?? ""}|${dt.time}`);
        return end ? { ...dt, endTime: end } : dt;
      }),
    };
  });
};

/**
 * Applies an edit-meetup request's `endTime` to a meetup (after its time/startsAt are
 * final). undefined = keep the current end time; null or "" = clear; a string = set.
 * Always recomputes endsAt so it follows a moved start. Leaves the meetup untouched on error.
 */
export const applyEndTimeEdit = (meetup, bodyEndTime) => {
  const next = bodyEndTime === undefined
    ? (meetup.endTime || null)
    : (bodyEndTime === null || String(bodyEndTime).trim() === "" ? null : String(bodyEndTime).trim());
  const error = validateEndTime(meetup.time, next);
  if (error) return { error, changed: false };
  const changed = (meetup.endTime || null) !== next;
  meetup.endTime = next;
  meetup.endsAt = computeEndsAt(meetup.startsAt, next, meetup.timezone);
  return { error: null, changed };
};

/** Mongo filter for scheduled meetups that are over (missing endsAt also matches `null`). */
export const expiryFilter = (now) => ({
  status: "scheduled",
  $or: [
    { endsAt: { $lte: now } },
    { endsAt: null, startsAt: { $lte: new Date(now.getTime() - DEFAULT_DURATION_MS) } },
  ],
});

/** True once the meetup has ended (its end time, or 1 hour after start without one). */
export const isMeetupOver = (meetup, now = new Date()) =>
  effectiveEnd({ startsAt: meetup.startsAt || meetup.date, endsAt: meetup.endsAt }) <= now;
