// Past Meetups: a group's finished meetups, from the archive (AttendanceRecord) plus any expired
// meetups not cleaned up yet. See docs/specs/2026-11-18-past-meetups-design.md.
import Meetup from "../models/meetup.model.js";
import User from "../models/user.model.js";
import AttendanceRecord from "../models/attendanceRecord.model.js";
import Tournament from "../models/tournament.model.js";
import { ARCHIVE_FIELDS, toRecord, guestHostIds } from "./groupStats.js";
import { teamLabel, loadNames } from "./tournamentNotify.js";

const str = (v) => String(v);
const PERSON_FIELDS = "_id firstName lastName profilePicture";
export const PAST_LIMIT_DEFAULT = 20;
export const PAST_LIMIT_MAX = 50;

const minus = (list, ...without) => {
  const drop = new Set(without.flat().map(str));
  return (list || []).filter((x) => !drop.has(str(x)));
};
const undecidedOf = (r) => minus(r.members, r.in || [], r.out || [], r.waitlist || []);

/** Archived records plus live expired meetups (converted), one per meetup; the archive wins. */
const allRecords = async (groupId) => {
  const [records, live] = await Promise.all([
    AttendanceRecord.find({ group: groupId }).lean(),
    Meetup.find({ group: groupId, status: "expired" }).select(ARCHIVE_FIELDS).lean(),
  ]);
  const byId = new Map(records.map((r) => [str(r.meetupId), r]));
  const pending = live.filter((m) => !byId.has(str(m._id)));
  if (pending.length) {
    const hosts = await guestHostIds(pending);
    for (const m of pending) byId.set(str(m._id), toRecord(m, hosts));
  }
  return [...byId.values()];
};

/** Newest first. `before` pages: only meetups that started strictly earlier. */
export const listPastMeetups = async (groupId, { before, limit } = {}) => {
  const n = Math.min(Math.max(Number(limit) || PAST_LIMIT_DEFAULT, 1), PAST_LIMIT_MAX);
  const [all, tournaments] = await Promise.all([
    allRecords(groupId),
    Tournament.find({ group: groupId }).select("meetup").lean(),
  ]);
  const withTournament = new Set(tournaments.map((t) => str(t.meetup)));
  const sorted = all
    .filter((r) => !before || new Date(r.startsAt) < before)
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  const page = sorted.slice(0, n);
  return {
    meetups: page.map((r) => ({
      id: str(r.meetupId),
      name: r.name,
      date: r.startsAt,
      location: r.location || null,
      inCount: (r.in || []).length,
      outCount: (r.out || []).length,
      undecidedCount: undecidedOf(r).length,
      hasTournament: withTournament.has(str(r.meetupId)),
    })),
    nextBefore: sorted.length > n ? new Date(page[page.length - 1].startsAt).toISOString() : null,
  };
};

const tournamentSummary = async (t) => {
  if (!t) return null;
  let champion = null;
  const team = t.champion ? (t.teams || []).find((tm) => tm.key === t.champion) : null;
  if (team) champion = teamLabel(team, await loadNames(t));
  return { id: str(t._id), format: t.format, mode: t.mode, status: t.status, champion };
};

/** Everything recorded about one past meetup, people filled in; null if it isn't this group's. */
export const getPastMeetup = async (groupId, meetupId) => {
  let r = await AttendanceRecord.findOne({ group: groupId, meetupId }).lean();
  if (!r) {
    const m = await Meetup.findOne({ _id: meetupId, group: groupId, status: "expired" }).select(ARCHIVE_FIELDS).lean();
    if (!m) return null;
    r = toRecord(m, await guestHostIds([m]));
  }

  const ids = new Set([
    ...(r.members || []), ...(r.in || []), ...(r.out || []), ...(r.waitlist || []), ...(r.needsRide || []),
    ...(r.items || []).flatMap((i) => i.by || []),
    ...(r.cars || []).flatMap((c) => [c.driver, ...(c.riders || [])]),
  ].map(str));
  const [found, tournament] = await Promise.all([
    ids.size ? User.find({ _id: { $in: [...ids] } }).select(PERSON_FIELDS).lean() : [],
    Tournament.findOne({ meetup: r.meetupId }).lean(),
  ]);
  const byId = new Map(found.map((u) => [str(u._id), u]));
  const person = (uid) => {
    const u = byId.get(str(uid));
    return u
      ? { _id: str(u._id), firstName: u.firstName, lastName: u.lastName, profilePicture: u.profilePicture }
      : { _id: str(uid), firstName: "Former member", former: true };
  };
  const people = (list) => (list || []).map(person);

  return {
    id: str(r.meetupId),
    name: r.name,
    date: r.startsAt,
    location: r.location || null,
    in: people(r.in),
    out: people(r.out),
    undecided: people(undecidedOf(r)),
    waitlist: people(r.waitlist),
    guestsBy: (r.guestsBy || []).map((g) => ({ userId: str(g.user), count: g.count })),
    // undefined = archived before these were kept, so the app hides the section.
    items: r.items === undefined ? null : r.items.map((i) => ({ name: i.name, by: people(i.by) })),
    cars: r.cars === undefined
      ? null
      : r.cars.map((c) => ({ driver: person(c.driver), seats: c.seats || 0, riders: people(c.riders), guests: c.guests || 0 })),
    needsRide: r.needsRide === undefined ? null : people(r.needsRide),
    tournament: await tournamentSummary(tournament),
  };
};
