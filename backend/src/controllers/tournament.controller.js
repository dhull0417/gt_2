// Teams & tournaments (Premium). Rules live in utils/tournament/ (pure functions); this file
// loads documents, checks who may do what, saves with a version check, and sends pushes.
// Spec: docs/specs/2026-11-10-team-tournaments-design.md
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import { getAuth } from "@clerk/express";
import Tournament from "../models/tournament.model.js";
import Meetup from "../models/meetup.model.js";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { canManageGroup } from "./group.controller.js";
import { groupHasPremium } from "../utils/premium.js";
import { loadClerkIds } from "../utils/waitlist.js";
import { TournamentError, collectPlayers, playersKey } from "../utils/tournament/players.js";
import { buildEvent } from "../utils/tournament/build.js";
import { applyResult, standings } from "../utils/tournament/results.js";
import { buildTournamentStats } from "../utils/tournament/stats.js";
import { notifyTournament } from "../utils/tournamentNotify.js";

const PREMIUM_REQUIRED = { error: "premium_required", message: "Teams & tournaments require GroupThat Premium." };
const MAX_LISTS = 10;
const MAX_LIST_NAME = 30;
const MAX_RETRIES = 3;

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const isMemberOf = (group, userId) => (group.members || []).some((m) => sameId(m, userId));
const fail = (res, status, error, message) => res.status(status).json({ error, message: message || error });
const sendTournamentError = (res, err) => {
  if (err instanceof TournamentError) return fail(res, 400, err.code, err.message);
  throw err;
};
const hasResults = (t) => (t.matches || []).some((m) => m.results?.length);
const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

const requesterOf = async (req) => {
  const { userId: clerkId } = getAuth(req);
  return User.findOne({ clerkId }).lean();
};

/** Names for everyone in an event, the standings, and whether the viewer can manage it. */
const serialize = async (doc, { canManage }) => {
  const t = plain(doc);
  const ids = [...new Set(t.teams.flatMap((tm) => tm.players.filter((p) => p.user).map((p) => String(p.user))))];
  const hostIds = [...new Set(t.teams.flatMap((tm) => tm.players.filter((p) => p.guestOf).map((p) => p.guestOf)))];
  const [users, hostUsers] = await Promise.all([
    ids.length ? User.find({ _id: { $in: ids } }).select('firstName lastName profilePicture clerkId').lean() : [],
    hostIds.length ? User.find({ clerkId: { $in: hostIds } }).select('firstName lastName clerkId').lean() : [],
  ]);
  const out = {
    ...t,
    people: Object.fromEntries(users.map((u) => [String(u._id), { firstName: u.firstName, lastName: u.lastName, profilePicture: u.profilePicture, clerkId: u.clerkId }])),
    hosts: Object.fromEntries(hostUsers.map((u) => [u.clerkId, { firstName: u.firstName, lastName: u.lastName }])),
    standings: t.format === 'roundRobin' ? standings(t) : null,
    canManage,
  };
  if (!canManage && out.weighting) out.weighting = { ...out.weighting, order: [], listId: null };
  return out;
};

/** Everyone who should play now, from the meetup's RSVPs plus the ticked Undecided members. */
const currentPlayers = async (meetup, group, extraPlayers = []) => {
  const extras = extraPlayers.map(String).filter((id) => isMemberOf(group, id));
  const clerkIds = await loadClerkIds((meetup.in || []).map(String));
  return { players: collectPlayers(meetup, { extraPlayers: extras, clerkIdOf: (id) => clerkIds.get(String(id)) }), extras };
};

/** Ranking to use: an explicit order, else a saved list, else nothing. Only group members count. */
const rankingFor = (group, { ranking, rankingListId }) => {
  let order = [];
  if (Array.isArray(ranking)) order = ranking.map(String);
  else if (rankingListId) order = ((group.rankingLists || []).find((l) => sameId(l._id, rankingListId))?.order || []).map(String);
  return order.filter((id) => isMemberOf(group, id));
};

const configFrom = (body = {}) => ({
  mode: body.mode,
  teamSize: Number.isInteger(body.teamSize) ? body.teamSize : undefined,
  teamCount: Number.isInteger(body.teamCount) ? body.teamCount : undefined,
  format: body.format,
  teamsPerMatch: Number(body.teamsPerMatch) || 2,
  resultType: body.resultType,
  balanceTeams: !!body.balanceTeams,
  buildToFinale: !!body.buildToFinale,
});
const storedConfig = (t) => ({
  mode: t.mode, teamSize: t.teamSize ?? undefined, teamCount: t.teamCount ?? undefined, format: t.format,
  teamsPerMatch: t.teamsPerMatch, resultType: t.resultType,
  balanceTeams: !!t.weighting?.balanceTeams, buildToFinale: !!t.weighting?.buildToFinale,
});

/** Write a freshly built event onto a tournament document. */
const assignEvent = (doc, event, config, { order, listId, extras }) => {
  doc.mode = config.mode;
  doc.format = config.format;
  doc.teamsPerMatch = config.teamsPerMatch;
  doc.resultType = config.resultType;
  doc.teamSize = config.teamSize ?? null;
  doc.teamCount = config.teamCount ?? null;
  doc.weighting = { listId: listId || null, order, balanceTeams: config.balanceTeams, buildToFinale: config.buildToFinale };
  doc.extraPlayers = extras;
  doc.teams = event.teams;
  doc.matches = event.matches;
  doc.playersKey = event.playersKey;
  doc.status = 'active';
  doc.champion = null;
};

/** Load, change and save with optimistic concurrency; on a version clash, reload and redo. */
const withRetry = async (id, change) => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const doc = await Tournament.findById(id);
    if (!doc) return { status: 404, body: { error: 'not_found', message: 'That event no longer exists.' } };
    const outcome = await change(doc);
    if (outcome?.status) return outcome;
    try {
      await doc.save();
      return { doc, ...outcome };
    } catch (err) {
      if (err instanceof mongoose.Error.VersionError && attempt < MAX_RETRIES) continue;
      throw err;
    }
  }
  return { status: 409, body: { error: 'busy', message: 'Someone else just changed this. Try again.' } };
};

/** The tournament, its meetup and group, and the requester's rights. */
const loadForManager = async (req, res) => {
  const requester = await requesterOf(req);
  if (!requester) return fail(res, 404, 'not_found', 'User not found.');
  const t = await Tournament.findById(req.params.id).lean();
  if (!t) return fail(res, 404, 'not_found', 'That event no longer exists.');
  const group = await Group.findById(t.group);
  if (!group || !canManageGroup(requester._id, group)) return fail(res, 403, 'forbidden', 'Permission denied.');
  if (!(await groupHasPremium(group))) return res.status(403).json(PREMIUM_REQUIRED);
  return { requester, t, group };
};

// --- GET /api/tournaments/by-meetup/:meetupId ---
export const getTournamentForMeetup = asyncHandler(async (req, res) => {
  const requester = await requesterOf(req);
  if (!requester) return fail(res, 404, 'not_found', 'User not found.');
  const meetup = await Meetup.findById(req.params.meetupId).lean();
  if (!meetup) return fail(res, 404, 'not_found', 'Meetup not found.');
  const group = await Group.findById(meetup.group);
  if (!group || !isMemberOf(group, requester._id)) return fail(res, 403, 'forbidden', 'Permission denied.');
  const t = await Tournament.findOne({ meetup: meetup._id });
  res.status(200).json({ tournament: t ? await serialize(t, { canManage: canManageGroup(requester._id, group) }) : null });
});

// --- GET /api/tournaments/:id ---
export const getTournament = asyncHandler(async (req, res) => {
  const requester = await requesterOf(req);
  if (!requester) return fail(res, 404, 'not_found', 'User not found.');
  const t = await Tournament.findById(req.params.id);
  if (!t) return fail(res, 404, 'not_found', 'That event no longer exists.');
  const group = await Group.findById(t.group);
  if (!group || !isMemberOf(group, requester._id)) return fail(res, 403, 'forbidden', 'Permission denied.');
  res.status(200).json({ tournament: await serialize(t, { canManage: canManageGroup(requester._id, group) }) });
});

// --- POST /api/tournaments  { meetupId, config, extraPlayers, ranking?, rankingListId?, teams?, seedOrder?, preview? } ---
export const createTournament = asyncHandler(async (req, res) => {
  const { meetupId, config: rawConfig, extraPlayers = [], ranking, rankingListId, teams, seedOrder, preview } = req.body || {};
  const requester = await requesterOf(req);
  if (!requester) return fail(res, 404, 'not_found', 'User not found.');
  const meetup = await Meetup.findById(meetupId).lean();
  if (!meetup) return fail(res, 404, 'not_found', 'Meetup not found.');
  const group = await Group.findById(meetup.group);
  if (!group || !canManageGroup(requester._id, group)) return fail(res, 403, 'forbidden', 'Permission denied.');
  if (meetup.status !== 'scheduled') return fail(res, 400, 'closed', 'This meetup is closed for changes.');
  if (!(await groupHasPremium(group))) return res.status(403).json(PREMIUM_REQUIRED);
  if (!preview && (await Tournament.findOne({ meetup: meetup._id }).lean())) return fail(res, 409, 'exists', 'This meetup already has an event.');

  const config = { ...configFrom(rawConfig), teams, seedOrder };
  const { players, extras } = await currentPlayers(meetup, group, extraPlayers);
  const order = rankingFor(group, { ranking, rankingListId });
  let event;
  try {
    event = buildEvent({ players, config, rankingOrder: order });
  } catch (err) {
    return sendTournamentError(res, err);
  }
  const doc = new Tournament({ group: group._id, meetup: meetup._id, meetupStartsAt: meetup.startsAt || meetup.date || null, createdBy: requester._id, mode: config.mode, format: config.format });
  assignEvent(doc, event, config, { order, listId: rankingListId, extras });
  if (preview) return res.status(200).json({ tournament: await serialize(doc, { canManage: true }) });
  try {
    await doc.save();
  } catch (err) {
    if (err?.code === 11000) return fail(res, 409, 'exists', 'This meetup already has an event.');
    throw err;
  }
  await notifyTournament('set', { tournament: doc, group, actorId: requester._id });
  res.status(201).json({ tournament: await serialize(doc, { canManage: true }) });
});

/** Shared by Update, Randomize and Edit: regenerate with a results check. */
const regenerate = async (req, res, { requester, t, group }, makeEvent) => {
  const meetup = await Meetup.findById(t.meetup).lean();
  if (!meetup) return fail(res, 400, 'meetup_gone', 'The meetup for this event is gone.');
  if (meetup.status !== 'scheduled') return fail(res, 400, 'closed', 'This meetup is closed for changes.');
  let playersChanged = false;
  const out = await withRetry(t._id, async (doc) => {
    const made = await makeEvent(doc, meetup);
    if (made.status) return made;
    if (made.unchanged) return { status: 200, body: { unchanged: true, tournament: await serialize(doc, { canManage: true }) } };
    if (hasResults(doc) && !req.body?.confirm) {
      return { status: 409, body: { error: 'results_exist', message: 'This clears the recorded results.' } };
    }
    playersChanged = doc.playersKey !== made.event.playersKey;
    assignEvent(doc, made.event, made.config, made.meta);
    return null;
  });
  if (out.status) return res.status(out.status).json(out.body);
  if (playersChanged || req.notifyAlways) await notifyTournament('set', { tournament: out.doc, group, actorId: requester._id });
  res.status(200).json({ tournament: await serialize(out.doc, { canManage: true }) });
};

const tryBuild = (args) => {
  try {
    return { event: buildEvent(args) };
  } catch (err) {
    if (err instanceof TournamentError) return { status: 400, body: { error: err.code, message: err.message } };
    throw err;
  }
};

// --- POST /api/tournaments/:id/update  { confirm? } ---
// Rebuilds everything from scratch from who's playing now. No change in players → no change.
export const updateTournament = asyncHandler(async (req, res) => {
  const ctx = await loadForManager(req, res);
  if (!ctx?.t) return;
  await regenerate(req, res, ctx, async (doc, meetup) => {
    const { players, extras } = await currentPlayers(meetup, ctx.group, (doc.extraPlayers || []).map(String));
    if (playersKey(players) === doc.playersKey) return { unchanged: true };
    const config = storedConfig(doc);
    const order = (doc.weighting?.order || []).map(String).filter((id) => isMemberOf(ctx.group, id));
    const built = tryBuild({ players, config, rankingOrder: order });
    if (built.status) return built;
    return { event: built.event, config, meta: { order, listId: doc.weighting?.listId, extras } };
  });
});

// --- POST /api/tournaments/:id/randomize  { confirm? } ---
// Same teams, new random order / bracket positions. Only when weighting is off.
export const randomizeTournament = asyncHandler(async (req, res) => {
  const ctx = await loadForManager(req, res);
  if (!ctx?.t) return;
  if (ctx.t.weighting?.balanceTeams || ctx.t.weighting?.buildToFinale) {
    return fail(res, 400, 'weighted', 'Turn weighting off to randomize.');
  }
  await regenerate(req, res, ctx, async (doc) => {
    const players = doc.teams.flatMap((tm) => plain(tm).players);
    const config = { ...storedConfig(doc), teams: doc.teams.map((tm) => ({ name: tm.name, players: tm.players.map((p) => p.key) })) };
    const built = tryBuild({ players, config, rankingOrder: [] });
    if (built.status) return built;
    built.event.playersKey = doc.playersKey;
    return { event: built.event, config: storedConfig(doc), meta: { order: [], listId: null, extras: (doc.extraPlayers || []).map(String) } };
  });
});

// --- PUT /api/tournaments/:id  { config, extraPlayers, ranking?, rankingListId?, teams?, seedOrder?, confirm? } ---
// Edit: new settings, players, ranking, or hand-set teams.
export const editTournament = asyncHandler(async (req, res) => {
  const ctx = await loadForManager(req, res);
  if (!ctx?.t) return;
  const { config: rawConfig, extraPlayers = [], ranking, rankingListId, teams, seedOrder } = req.body || {};
  req.notifyAlways = Array.isArray(teams) && teams.length > 0;
  await regenerate(req, res, ctx, async (_doc, meetup) => {
    const config = { ...configFrom(rawConfig), teams, seedOrder };
    const { players, extras } = await currentPlayers(meetup, ctx.group, extraPlayers);
    const order = rankingFor(ctx.group, { ranking, rankingListId });
    const built = tryBuild({ players, config, rankingOrder: order });
    if (built.status) return built;
    return { event: built.event, config: configFrom(rawConfig), meta: { order, listId: rankingListId, extras } };
  });
});

// --- PUT /api/tournaments/:id/matches/:matchId/result  { scores } | { winner } | { order } ---
export const reportResult = asyncHandler(async (req, res) => {
  const requester = await requesterOf(req);
  if (!requester) return fail(res, 404, 'not_found', 'User not found.');
  const first = await Tournament.findById(req.params.id).lean();
  if (!first) return fail(res, 404, 'not_found', 'That event no longer exists.');
  const group = await Group.findById(first.group);
  if (!group || !isMemberOf(group, requester._id)) return fail(res, 403, 'forbidden', 'Permission denied.');
  const isManager = canManageGroup(requester._id, group);
  let effect;
  const out = await withRetry(first._id, async (doc) => {
    const t = plain(doc);
    const match = t.matches.find((m) => m.id === req.params.matchId);
    if (!match) return { status: 404, body: { error: 'match_not_found', message: 'That match no longer exists.' } };
    const inMatch = match.slots.some((s) => {
      const team = t.teams.find((tm) => tm.key === s.team);
      return team?.players.some((p) => sameId(p.user, requester._id));
    });
    if (!inMatch && !isManager) return { status: 403, body: { error: 'not_in_match', message: 'Only players in this match can enter its result.' } };
    try {
      effect = applyResult(t, match.id, req.body || {}, { isManager });
    } catch (err) {
      if (err instanceof TournamentError) return { status: err.code === 'locked' ? 403 : 400, body: { error: err.code, message: err.message } };
      throw err;
    }
    const m = t.matches.find((x) => x.id === match.id);
    m.reportedBy = requester._id;
    m.reportedAt = new Date();
    doc.matches = t.matches;
    doc.status = t.status;
    doc.champion = t.champion;
    return null;
  });
  if (out.status) return res.status(out.status).json(out.body);
  if (effect.newlyReady.length) await notifyTournament('ready', { tournament: out.doc, group, actorId: requester._id, newlyReady: effect.newlyReady });
  if (effect.finished && effect.championChanged) await notifyTournament('finished', { tournament: out.doc, group, actorId: null });
  res.status(200).json({ tournament: await serialize(out.doc, { canManage: isManager }) });
});

// --- DELETE /api/tournaments/:id ---
export const deleteTournament = asyncHandler(async (req, res) => {
  const requester = await requesterOf(req);
  if (!requester) return fail(res, 404, 'not_found', 'User not found.');
  const t = await Tournament.findById(req.params.id).lean();
  if (!t) return fail(res, 404, 'not_found', 'That event no longer exists.');
  const group = await Group.findById(t.group);
  if (!group || !canManageGroup(requester._id, group)) return fail(res, 403, 'forbidden', 'Permission denied.');
  await Tournament.deleteOne({ _id: t._id });
  res.status(200).json({ message: 'Event deleted.' });
});

// --- Ranking lists: /api/tournaments/rankings/:groupId[/:listId] (owners & moderators, Premium) ---
const loadGroupForLists = async (req, res) => {
  const requester = await requesterOf(req);
  if (!requester) return fail(res, 404, 'not_found', 'User not found.');
  const group = await Group.findById(req.params.groupId);
  if (!group || !canManageGroup(requester._id, group)) return fail(res, 403, 'forbidden', 'Permission denied.');
  if (!(await groupHasPremium(group))) return res.status(403).json(PREMIUM_REQUIRED);
  return { group };
};
const cleanName = (name) => (typeof name === 'string' ? name.trim() : '');
const cleanOrder = (group, order) => [...new Set((Array.isArray(order) ? order : []).map(String))].filter((id) => isMemberOf(group, id));
const listsOut = (group) => (group.rankingLists || []).map((l) => ({ _id: String(l._id), name: l.name, order: (l.order || []).map(String), updatedAt: l.updatedAt }));

export const getRankingLists = asyncHandler(async (req, res) => {
  const ctx = await loadGroupForLists(req, res);
  if (!ctx?.group) return;
  res.status(200).json({ lists: listsOut(ctx.group) });
});

export const createRankingList = asyncHandler(async (req, res) => {
  const ctx = await loadGroupForLists(req, res);
  if (!ctx?.group) return;
  const { group } = ctx;
  const name = cleanName(req.body?.name);
  if (!name || name.length > MAX_LIST_NAME) return fail(res, 400, 'invalid_name', `List names are 1–${MAX_LIST_NAME} characters.`);
  if ((group.rankingLists || []).length >= MAX_LISTS) return fail(res, 400, 'too_many_lists', `A group can save up to ${MAX_LISTS} rankings.`);
  group.rankingLists.push({ name, order: cleanOrder(group, req.body?.order), updatedAt: new Date() });
  await group.save();
  res.status(201).json({ lists: listsOut(group), list: listsOut(group).at(-1) });
});

export const updateRankingList = asyncHandler(async (req, res) => {
  const ctx = await loadGroupForLists(req, res);
  if (!ctx?.group) return;
  const { group } = ctx;
  const list = (group.rankingLists || []).find((l) => sameId(l._id, req.params.listId));
  if (!list) return fail(res, 404, 'not_found', 'That ranking no longer exists.');
  if (req.body?.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name || name.length > MAX_LIST_NAME) return fail(res, 400, 'invalid_name', `List names are 1–${MAX_LIST_NAME} characters.`);
    list.name = name;
  }
  if (req.body?.order !== undefined) list.order = cleanOrder(group, req.body.order);
  list.updatedAt = new Date();
  await group.save();
  res.status(200).json({ lists: listsOut(group) });
});

export const deleteRankingList = asyncHandler(async (req, res) => {
  const ctx = await loadGroupForLists(req, res);
  if (!ctx?.group) return;
  const { group } = ctx;
  group.rankingLists = (group.rankingLists || []).filter((l) => !sameId(l._id, req.params.listId));
  await group.save();
  res.status(200).json({ lists: listsOut(group) });
});

// --- GET /api/tournaments/stats/:groupId (members, Premium) ---
export const getTournamentStats = asyncHandler(async (req, res) => {
  const requester = await requesterOf(req);
  if (!requester) return fail(res, 404, 'not_found', 'User not found.');
  const group = await Group.findById(req.params.groupId);
  if (!group || !isMemberOf(group, requester._id)) return fail(res, 403, 'forbidden', 'Permission denied.');
  if (!(await groupHasPremium(group))) return res.status(403).json(PREMIUM_REQUIRED);
  const finished = await Tournament.find({ group: group._id, status: 'finished' }).sort({ meetupStartsAt: -1 }).limit(200).lean();
  const stats = buildTournamentStats(finished);
  const ids = [...new Set([
    ...stats.people.map((p) => p.user),
    ...stats.events.flatMap((e) => e.champion?.users || []),
  ])];
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select('firstName lastName profilePicture').lean() : [];
  res.status(200).json({
    ...stats,
    people: stats.people,
    names: Object.fromEntries(users.map((u) => [String(u._id), { firstName: u.firstName, lastName: u.lastName, profilePicture: u.profilePicture }])),
  });
});
