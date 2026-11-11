import Meetup from "../models/meetup.model.js";
import User from "../models/user.model.js";
import AttendanceRecord from "../models/attendanceRecord.model.js";
import Poll from "../models/poll.model.js";
import { memberMetrics, computeAwards, countEventsWith } from "./statsAwards.js";
import { chatMessageCounts } from "./supabaseAdmin.js";

const str = (v) => v.toString();

/** Meetup fields toRecord reads (used by loadEvents and the cleanup job). */
export const ARCHIVE_FIELDS = "group schedule name startsAt date members in out capacity guests "
  + "waitlist rsvpLog rsvpLogPartial rsvpOpenDate rsvpCloseDate priorityTiers bringClaims rides";

const countBy = (list, key) => {
  const counts = new Map();
  for (const x of list) {
    const k = str(x[key]);
    counts.set(k, { user: x[key], count: (counts.get(k)?.count || 0) + 1 });
  }
  return [...counts.values()];
};

/**
 * Turns a finished Meetup document into the shape stored in AttendanceRecord.
 * clerkToUserId maps the clerkIds in meetup.guests to user ids (guests are keyed by clerkId).
 */
export const toRecord = (m, clerkToUserId = new Map()) => ({
  group: m.group,
  meetupId: m._id,
  schedule: m.schedule ?? null,
  name: m.name,
  startsAt: m.startsAt || m.date,
  members: m.members || [],
  in: m.in || [],
  out: m.out || [],
  waitlist: m.waitlist || [],
  capacity: m.capacity || 0,
  guests: (m.guests || []).reduce((n, g) => n + (g.count || 0), 0),
  // Stats awards (2026-11-10). Old meetups have no rsvpLog, and a partial one (started after
  // people had answered) can't be trusted, so either is left out, not [].
  rsvpLog: Array.isArray(m.rsvpLog) && !m.rsvpLogPartial ? m.rsvpLog.map((e) => ({ user: e.user, status: e.status, at: e.at })) : undefined,
  rsvpOpenDate: m.rsvpOpenDate ?? null,
  rsvpCloseDate: m.rsvpCloseDate ?? null,
  tierOpens: (m.priorityTiers || []).flatMap((t) => (t.members || []).map((user) => ({ user, opensAt: t.opensAt }))),
  guestsBy: (m.guests || [])
    .filter((g) => g.count > 0 && clerkToUserId.has(g.userId))
    .map((g) => ({ user: clerkToUserId.get(g.userId), count: g.count })),
  itemsBy: countBy(m.bringClaims || [], 'user'),
  seatsBy: (m.rides || []).filter((r) => r.role === 'driver' && r.seats > 0).map((r) => ({ user: r.user, seats: r.seats })),
});

/** clerkId -> user id for everyone who brought guests to these meetups. */
const guestHostIds = async (meetups) => {
  const clerkIds = [...new Set(meetups.flatMap((m) => (m.guests || []).map((g) => g.userId)).filter(Boolean))];
  if (clerkIds.length === 0) return new Map();
  const users = await User.find({ clerkId: { $in: clerkIds } }).select("_id clerkId").lean();
  return new Map(users.map((u) => [u.clerkId, u._id]));
};

/** Saves expired meetups into AttendanceRecord (safe to repeat). Returns how many were new. */
export const archiveMeetups = async (meetups) => {
  if (meetups.length === 0) return 0;
  const hosts = await guestHostIds(meetups);
  const res = await AttendanceRecord.bulkWrite(
    meetups.map((m) => {
      const rec = toRecord(m, hosts);
      if (rec.rsvpLog === undefined) delete rec.rsvpLog;
      return { updateOne: { filter: { meetupId: rec.meetupId }, update: { $setOnInsert: rec }, upsert: true } };
    }),
    { ordered: false }
  );
  return res.upsertedCount || 0;
};

/** Every finished meetup for a group: archived ones plus those not yet cleaned up. */
export const loadEvents = async (groupId, { scheduleId } = {}) => {
  const filter = { group: groupId };
  if (scheduleId) filter.schedule = scheduleId;
  const [records, live] = await Promise.all([
    AttendanceRecord.find(filter).lean(),
    Meetup.find({ ...filter, status: "expired" }).select(ARCHIVE_FIELDS).lean(),
  ]);
  const byId = new Map();
  for (const r of records) byId.set(str(r.meetupId), r);
  const pending = live.filter((m) => !byId.has(str(m._id)));
  const hosts = await guestHostIds(pending);
  for (const m of pending) byId.set(str(m._id), { ...toRecord(m, hosts), _live: true });
  const people = (list, field) => (Array.isArray(list) ? list.map((x) => ({ user: str(x.user), [field]: x[field] })) : null);
  return [...byId.values()]
    .map((r) => ({
      id: str(r.meetupId),
      name: r.name,
      date: r.startsAt,
      members: (r.members || []).map(str),
      in: (r.in || []).map(str),
      out: (r.out || []).map(str),
      waitlist: (r.waitlist || []).map(str),
      capacity: r.capacity || 0,
      guests: r.guests || 0,
      rsvpLog: Array.isArray(r.rsvpLog) ? r.rsvpLog.map((e) => ({ user: str(e.user), status: e.status, at: e.at })) : null,
      rsvpOpenDate: r.rsvpOpenDate ?? null,
      rsvpCloseDate: r.rsvpCloseDate ?? null,
      tierOpens: (r.tierOpens || []).map((t) => ({ user: str(t.user), opensAt: t.opensAt })),
      guestsBy: people(r.guestsBy, 'count'),
      itemsBy: people(r.itemsBy, 'count'),
      seatsBy: people(r.seatsBy, 'seats'),
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
};

/**
 * Attendance = "I'm In" on a meetup that has happened. A member is only counted for
 * meetups they belonged to; cancelled meetups are ignored. Also builds the all-time awards
 * (utils/statsAwards.js) with full rankings; shape it per viewer with statsVisibility.js.
 */
export const buildGroupStats = async (group, opts = {}) => {
  const events = await loadEvents(group._id, opts);
  const [users, polls, chatByClerk] = await Promise.all([
    User.find({ _id: { $in: group.members } }).select("firstName lastName profilePicture clerkId").lean(),
    Poll.find({ group: group._id, status: { $ne: "cancelled" } }).select("options.voters").lean(),
    chatMessageCounts(group._id),
  ]);
  const ids = users.map((u) => str(u._id));
  const metrics = memberMetrics(events, ids);
  const userById = new Map(users.map((u) => [str(u._id), u]));

  const members = users.map((u) => {
    const id = str(u._id);
    const m = metrics.get(id);
    return {
      _id: id,
      firstName: u.firstName,
      lastName: u.lastName,
      profilePicture: u.profilePicture,
      eligible: m.eligible, attended: m.attended, declined: m.declined,
      noResponse: m.noResponse,
      rate: m.rate,
      streak: m.currentStreak,
      bestStreak: m.bestStreak,
    };
  }).sort((a, b) => b.rate - a.rate || b.attended - a.attended);

  const pollsVoted = new Map();
  for (const p of polls) {
    const voters = new Set((p.options || []).flatMap((o) => (o.voters || []).map(str)));
    for (const v of voters) pollsVoted.set(v, (pollsVoted.get(v) || 0) + 1);
  }
  let chat = null;
  if (chatByClerk) {
    chat = new Map();
    for (const u of users) if (u.clerkId && chatByClerk.has(u.clerkId)) chat.set(str(u._id), chatByClerk.get(u.clerkId));
  }

  const awards = computeAwards(metrics, { chat, polls: pollsVoted, eventsWith: countEventsWith(events) })
    .map((a) => ({
      ...a,
      ranking: a.ranking.map((r) => {
        const u = userById.get(r.id);
        return { _id: r.id, firstName: u.firstName, lastName: u.lastName, profilePicture: u.profilePicture, value: r.value, rank: r.rank };
      }),
    }));

  const headcounts = events.map((e) => e.in.length + e.guests);
  const filled = events.filter((e) => e.capacity > 0).map((e) => Math.min((e.in.length + e.guests) / e.capacity, 1));
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  return {
    summary: {
      totalMeetups: events.length,
      averageHeadcount: Math.round(avg(headcounts) * 10) / 10,
      averageFill: filled.length ? Math.round(avg(filled) * 100) / 100 : null,
    },
    members,
    meetups: events.slice(0, 100).map((e) => ({
      id: e.id, name: e.name, date: e.date,
      in: e.in.length, out: e.out.length, guests: e.guests, capacity: e.capacity,
    })),
    awards,
  };
};

/** Account deletion: removes the person's RSVP times and per-person history used by the awards. */
export const removeUserStatsData = async (userId) => {
  await Meetup.updateMany({ "rsvpLog.user": userId }, { $pull: { rsvpLog: { user: userId } } });
  const fields = ["rsvpLog", "tierOpens", "guestsBy", "itemsBy", "seatsBy"];
  await AttendanceRecord.updateMany(
    { $or: fields.map((f) => ({ [`${f}.user`]: userId })) },
    { $pull: Object.fromEntries(fields.map((f) => [f, { user: userId }])) },
  );
};

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per member per meetup: Date, Meetup, Member, Response, Guests. */
export const buildAttendanceCsv = async (group, opts = {}) => {
  const events = await loadEvents(group._id, opts);
  const ids = new Set();
  events.forEach((e) => [...e.members, ...e.in, ...e.out].forEach((i) => ids.add(i)));
  const users = await User.find({ _id: { $in: [...ids] } }).select("firstName lastName email").lean();
  const nameOf = new Map(users.map((u) => [str(u._id), `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "Member"]));

  const rows = [["Date", "Meetup", "Member", "Response", "Guests"]];
  for (const e of [...events].reverse()) {
    const date = new Date(e.date).toISOString().slice(0, 10);
    const everyone = new Set([...e.members, ...e.in, ...e.out]);
    for (const id of everyone) {
      const response = e.in.includes(id) ? "Attended" : e.out.includes(id) ? "Declined" : "No response";
      rows.push([date, e.name, nameOf.get(id) || "Former member", response, ""]);
    }
    if (e.guests > 0) rows.push([date, e.name, "(guests)", "Attended", e.guests]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
};
