import Meetup from "../models/meetup.model.js";
import User from "../models/user.model.js";
import AttendanceRecord from "../models/attendanceRecord.model.js";

const str = (v) => v.toString();

/** Turns a finished Meetup document into the shape stored in AttendanceRecord. */
export const toRecord = (m) => ({
  group: m.group,
  meetupId: m._id,
  schedule: m.schedule ?? null,
  name: m.name,
  startsAt: m.startsAt || m.date,
  members: m.members || [],
  in: m.in || [],
  out: m.out || [],
  capacity: m.capacity || 0,
  guests: (m.guests || []).reduce((n, g) => n + (g.count || 0), 0),
});

/** Saves expired meetups into AttendanceRecord (safe to repeat). Returns how many were new. */
export const archiveMeetups = async (meetups) => {
  if (meetups.length === 0) return 0;
  const res = await AttendanceRecord.bulkWrite(
    meetups.map((m) => {
      const rec = toRecord(m);
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
    Meetup.find({ ...filter, status: "expired" }).select("group schedule name startsAt date members in out capacity guests").lean(),
  ]);
  const byId = new Map();
  for (const r of records) byId.set(str(r.meetupId), r);
  for (const m of live) if (!byId.has(str(m._id))) byId.set(str(m._id), { ...toRecord(m), _live: true });
  return [...byId.values()]
    .map((r) => ({
      id: str(r.meetupId),
      name: r.name,
      date: r.startsAt,
      members: (r.members || []).map(str),
      in: (r.in || []).map(str),
      out: (r.out || []).map(str),
      capacity: r.capacity || 0,
      guests: r.guests || 0,
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
};

/**
 * Attendance = "I'm In" on a meetup that has happened. A member is only counted for
 * meetups they belonged to; cancelled meetups are ignored.
 */
export const buildGroupStats = async (group, opts = {}) => {
  const events = await loadEvents(group._id, opts);
  const users = await User.find({ _id: { $in: group.members } }).select("firstName lastName profilePicture").lean();

  const members = users.map((u) => {
    const id = str(u._id);
    let eligible = 0, attended = 0, declined = 0, streak = 0, streakOpen = true;
    for (const e of events) { // newest first
      const was = e.members.includes(id) || e.in.includes(id) || e.out.includes(id);
      if (!was) continue;
      eligible++;
      if (e.in.includes(id)) { attended++; if (streakOpen) streak++; }
      else { streakOpen = false; if (e.out.includes(id)) declined++; }
    }
    return {
      _id: id,
      firstName: u.firstName,
      lastName: u.lastName,
      profilePicture: u.profilePicture,
      eligible, attended, declined,
      noResponse: eligible - attended - declined,
      rate: eligible ? attended / eligible : 0,
      streak,
    };
  }).sort((a, b) => b.rate - a.rate || b.attended - a.attended);

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
  };
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
