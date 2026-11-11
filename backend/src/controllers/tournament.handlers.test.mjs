// Teams & tournaments through the real handlers. Models are stubbed per test; pushes are captured.
// Run with: npm test (from backend/) -- needs --experimental-test-module-mocks.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const pushes = [];
const premium = { on: true };
mock.module('@clerk/express', {
  namedExports: {
    getAuth: (req) => ({ userId: req.clerkId }),
    clerkClient: {},
    createClerkClient: () => ({}),
    clerkMiddleware: () => (req, res, next) => next(),
  },
});
mock.module(new URL('../utils/push.notifications.js', import.meta.url).href, {
  namedExports: {
    notifyAndPersist: async (users, payload) => {
      const to = users.map((u) => String(u._id)).filter((id) => !payload.sender || id !== String(payload.sender));
      if (to.length) pushes.push({ to, ...payload });
    },
    notifyUsers: async () => {},
    sendPushNotifications: async () => {},
    tokensOf: () => [],
    inQuietHours: () => false,
    userWantsPush: () => true,
    isGroupMuted: () => false,
  },
});
mock.module(new URL('../utils/premium.js', import.meta.url).href, {
  namedExports: {
    hasPremium: () => premium.on,
    groupHasPremium: async () => premium.on,
    groupHasWaitlist: async () => true,
    serializeUser: (u) => u,
    withGroupPremium: async (m) => m,
  },
});

const { default: Tournament } = await import('../models/tournament.model.js');
const { default: Meetup } = await import('../models/meetup.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: Group } = await import('../models/group.model.js');
const ctrl = await import('./tournament.controller.js');
const { default: meetupRouter } = await import('../routes/meetup.route.js');
const { scrubMemberFromUpcomingMeetups } = await import('../utils/memberCleanup.js');
const { deleteUnfinishedTournaments, deleteTournamentsForGroup } = await import('../utils/tournament/cleanup.js');

const q = (v) => { const c = { select: () => c, lean: () => c, populate: () => c, sort: () => c, limit: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const person = (name) => ({ _id: new mongoose.Types.ObjectId(), clerkId: `c-${name}`, firstName: name, lastName: 'X' });

let P, users, group, meetup, store, saves;

beforeEach(() => {
  pushes.length = 0;
  premium.on = true;
  saves = 0;
  P = { owner: person('Olive'), a: person('Ana'), b: person('Ben'), c: person('Cy'), d: person('Dee'), out: person('Otto') };
  users = Object.values(P);
  group = new Group({ name: 'Pickleball', timezone: 'America/Denver', owner: P.owner._id, moderators: [], members: users.map((u) => u._id) });
  group.save = async function save() { return this; };
  meetup = { _id: new mongoose.Types.ObjectId(), group: group._id, status: 'scheduled', startsAt: new Date('2026-12-01T17:00:00Z'),
    in: [P.owner._id, P.a._id, P.b._id, P.c._id], out: [P.out._id], guests: [], members: users.map((u) => u._id) };
  store = { doc: null, versionErrorOnce: false, onReload: null };
  User.findOne = (f) => q(users.find((u) => u.clerkId === f.clerkId) ?? null);
  User.find = (f = {}) => {
    if (f._id?.$in) return q(users.filter((u) => f._id.$in.map(String).includes(String(u._id))));
    if (f.clerkId?.$in) return q(users.filter((u) => f.clerkId.$in.includes(u.clerkId)));
    return q(users);
  };
  Group.findById = () => q(group);
  Group.updateMany = async () => {};
  Meetup.findById = () => q(meetup);
  Meetup.find = () => q([]);
  Meetup.updateMany = async () => {};
  Tournament.findOne = () => q(store.doc);
  Tournament.findById = () => {
    if (store.onReload) { const f = store.onReload; store.onReload = null; f(); }
    return q(store.doc);
  };
  Tournament.deleteOne = async () => { store.doc = null; };
  Tournament.find = () => q(store.doc ? [store.doc] : []);
  Tournament.prototype.save = async function save() {
    saves++;
    if (store.versionErrorOnce) {
      store.versionErrorOnce = false;
      throw new mongoose.Error.VersionError(this, 0, ['matches']);
    }
    store.doc = this;
    return this;
  };
});

const call = async (handler, { as, params = {}, body = {} }) => {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let failure;
  await handler({ clerkId: as.clerkId, params, body, headers: {} }, res, (e) => { failure = e; });
  if (failure) throw failure;
  return res;
};
const cfg = (over = {}) => ({ mode: 'singles', format: 'single', teamsPerMatch: 2, resultType: 'winLoss', ...over });
const create = (over = {}, extra = {}) => call(ctrl.createTournament, { as: P.owner, body: { meetupId: String(meetup._id), config: cfg(over), ...extra } });
const pushesTo = (u, type) => pushes.filter((p) => p.to.includes(String(u._id)) && (!type || p.type === type));
const keyOf = (u) => String(u._id);
const teamOf = (t, u) => t.teams.find((tm) => tm.players.some((p) => p.key === keyOf(u)))?.key ?? null;
const readyMatchWith = (t, u) => t.matches.find((m) => m.status === 'ready' && m.slots.some((s) => s.team === teamOf(t, u)));

// --- create ---

test('only owners and moderators can set up an event', async () => {
  const res = await call(ctrl.createTournament, { as: P.a, body: { meetupId: String(meetup._id), config: cfg() } });
  assert.equal(res.code, 403);
});

test('setting up needs Premium', async () => {
  premium.on = false;
  const res = await create();
  assert.equal(res.code, 403);
  assert.equal(res.body.error, 'premium_required');
});

test('a cancelled meetup is closed', async () => {
  meetup.status = 'cancelled';
  const res = await create();
  assert.equal(res.code, 400);
  assert.equal(res.body.error, 'closed');
});

test('create: In players plus ticked Undecided, Out never; everyone else is told', async () => {
  const res = await create({}, { extraPlayers: [String(P.d._id), String(P.out._id)] });
  assert.equal(res.code, 201);
  const keys = res.body.tournament.teams.flatMap((t) => t.players.map((p) => p.key)).sort();
  assert.deepEqual(keys, [P.owner, P.a, P.b, P.c, P.d].map(keyOf).sort());
  assert.equal(pushesTo(P.a, 'tournament-set').length, 1);
  assert.equal(pushesTo(P.d, 'tournament-set').length, 1);
  assert.equal(pushesTo(P.owner).length, 0);
  assert.equal(res.body.tournament.people[keyOf(P.a)].firstName, 'Ana');
});

test('preview does not save or notify', async () => {
  const res = await create({}, { preview: true });
  assert.equal(res.code, 200);
  assert.equal(saves, 0);
  assert.equal(pushes.length, 0);
  assert.ok(res.body.tournament.matches.length > 0);
});

test('a second event on the same meetup is refused', async () => {
  await create();
  const res = await create();
  assert.equal(res.code, 409);
  assert.equal(res.body.error, 'exists');
});

test('bad settings come back as a readable 400', async () => {
  const res = await create({ format: 'double', teamsPerMatch: 3 });
  assert.equal(res.code, 400);
  assert.equal(res.body.error, 'double_needs_pairs');
});

// --- update ---

test('update with the same players changes nothing and says so', async () => {
  await create();
  const before = JSON.stringify(store.doc.matches);
  saves = 0;
  const res = await call(ctrl.updateTournament, { as: P.owner, params: { id: String(store.doc._id) } });
  assert.equal(res.code, 200);
  assert.equal(res.body.unchanged, true);
  assert.equal(saves, 0);
  assert.equal(JSON.stringify(store.doc.matches), before);
});

test('update after someone goes Out: needs confirmation when results exist, then rebuilds and notifies', async () => {
  await create();
  const t = store.doc;
  const m = readyMatchWith(t, P.a);
  await call(ctrl.reportResult, { as: P.a, params: { id: String(t._id), matchId: m.id }, body: { winner: teamOf(t, P.a) } });
  meetup.in = meetup.in.filter((id) => !id.equals(P.c._id));
  meetup.out = [...meetup.out, P.c._id];
  pushes.length = 0;
  const blocked = await call(ctrl.updateTournament, { as: P.owner, params: { id: String(t._id) } });
  assert.equal(blocked.code, 409);
  assert.equal(blocked.body.error, 'results_exist');
  const ok = await call(ctrl.updateTournament, { as: P.owner, params: { id: String(t._id) }, body: { confirm: true } });
  assert.equal(ok.code, 200);
  const keys = ok.body.tournament.teams.flatMap((tm) => tm.players.map((p) => p.key));
  assert.ok(!keys.includes(keyOf(P.c)));
  assert.ok(ok.body.tournament.matches.every((x) => !x.results.length));
  assert.equal(pushesTo(P.a, 'tournament-set').length, 1);
});

test('a host who goes Out takes their guests out on update', async () => {
  meetup.guests = [{ userId: P.b.clerkId, count: 2 }];
  meetup.in = [...meetup.in, P.d._id];
  await create({ mode: 'teams', teamSize: 2, format: 'roundRobin', resultType: 'points' });
  assert.ok(store.doc.teams.some((tm) => tm.players.some((p) => p.guestOf === P.b.clerkId)));
  meetup.in = meetup.in.filter((id) => !id.equals(P.b._id));
  meetup.out = [...meetup.out, P.b._id];
  const res = await call(ctrl.updateTournament, { as: P.owner, params: { id: String(store.doc._id) } });
  assert.equal(res.code, 200);
  const players = res.body.tournament.teams.flatMap((tm) => tm.players);
  assert.ok(!players.some((p) => p.key === keyOf(P.b) || p.guestOf === P.b.clerkId));
});

test('randomize is refused when weighting is on', async () => {
  await create({ balanceTeams: false, buildToFinale: true }, { ranking: [keyOf(P.a), keyOf(P.b)] });
  const res = await call(ctrl.randomizeTournament, { as: P.owner, params: { id: String(store.doc._id) } });
  assert.equal(res.code, 400);
  assert.equal(res.body.error, 'weighted');
});

test('randomize keeps the same teams', async () => {
  await create({ mode: 'teams', teamSize: 2, format: 'roundRobin' });
  const teams = store.doc.teams.map((tm) => tm.players.map((p) => p.key).sort().join('+')).sort();
  const res = await call(ctrl.randomizeTournament, { as: P.owner, params: { id: String(store.doc._id) } });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.tournament.teams.map((tm) => tm.players.map((p) => p.key).sort().join('+')).sort(), teams);
});

// --- results ---

test('a member who is not in the match cannot report it; a player can', async () => {
  meetup.in = [P.a._id, P.b._id];
  await create({ format: 'roundRobin' }, { extraPlayers: [String(P.d._id)] });
  const t = store.doc;
  const m = t.matches.find((x) => x.status === 'ready' && !x.slots.some((s) => s.team === teamOf(t, P.d)));
  const outsider = await call(ctrl.reportResult, { as: P.d, params: { id: String(t._id), matchId: m.id }, body: { winner: m.slots[0].team } });
  assert.equal(outsider.code, 403);
  assert.equal(outsider.body.error, 'not_in_match');
  const player = users.find((u) => m.slots.some((s) => s.team === teamOf(t, u)));
  const ok = await call(ctrl.reportResult, { as: player, params: { id: String(t._id), matchId: m.id }, body: { winner: m.slots[0].team } });
  assert.equal(ok.code, 200);
  assert.equal(ok.body.tournament.matches.find((x) => x.id === m.id).status, 'done');
});

test('round robin standings move when a result comes in', async () => {
  await create({ format: 'roundRobin' });
  const t = store.doc;
  const m = readyMatchWith(t, P.a);
  const res = await call(ctrl.reportResult, { as: P.a, params: { id: String(t._id), matchId: m.id }, body: { winner: teamOf(t, P.a) } });
  assert.equal(res.body.tournament.standings[0].team, teamOf(t, P.a));
  assert.equal(res.body.tournament.standings[0].wins, 1);
});

test('a clash with another save is retried on fresh data and both results survive', async () => {
  await create({ format: 'roundRobin' });
  const t = store.doc;
  const [m1, m2] = t.matches.filter((m) => m.round === 1);
  // Someone else records m2 between our read and our save.
  store.versionErrorOnce = true;
  store.onReload = () => {};
  const res1 = await call(ctrl.reportResult, { as: P.owner, params: { id: String(t._id), matchId: m1.id }, body: { winner: m1.slots[0].team } });
  assert.equal(res1.code, 200);
  await call(ctrl.reportResult, { as: P.owner, params: { id: String(t._id), matchId: m2.id }, body: { winner: m2.slots[1].team } });
  const done = store.doc.matches.filter((m) => m.status === 'done').map((m) => m.id).sort();
  assert.deepEqual(done, [m1.id, m2.id].sort());
  assert.ok(saves >= 3);
});

test('bracket: correcting a played-on result is locked for players, allowed for managers; next match pushes', async () => {
  meetup.in = [P.a._id, P.b._id, P.c._id, P.d._id];
  await create({}, { ranking: [P.a, P.b, P.c, P.d].map(keyOf) });
  const t = store.doc;
  // Seeds are random without weighting; play every ready match with its first slot winning.
  const play = async (as) => {
    for (let i = 0; i < 5; i++) {
      const m = store.doc.matches.find((x) => x.status === 'ready');
      if (!m) return;
      await call(ctrl.reportResult, { as, params: { id: String(t._id), matchId: m.id }, body: { winner: m.slots[0].team } });
    }
  };
  pushes.length = 0;
  await play(P.owner);
  assert.ok(pushes.some((p) => p.type === 'tournament-match-ready'));
  assert.ok(pushes.some((p) => p.type === 'tournament-finished'));
  assert.equal(store.doc.status, 'finished');
  const first = store.doc.matches[0];
  const loserTeam = first.slots[1].team;
  const playerOfFirst = users.find((u) => first.slots.some((s) => s.team === teamOf(store.doc, u)));
  const locked = await call(ctrl.reportResult, { as: playerOfFirst, params: { id: String(t._id), matchId: first.id }, body: { winner: loserTeam } });
  assert.equal(locked.code, 403);
  assert.equal(locked.body.error, 'locked');
  const ok = await call(ctrl.reportResult, { as: P.owner, params: { id: String(t._id), matchId: first.id }, body: { winner: loserTeam } });
  assert.equal(ok.code, 200);
  assert.equal(ok.body.tournament.status, 'active');
  assert.equal(ok.body.tournament.matches.at(-1).results.length, 0);
});

test('reporting still works when Premium lapses; updating does not', async () => {
  await create({ format: 'roundRobin' });
  premium.on = false;
  const t = store.doc;
  const m = readyMatchWith(t, P.a);
  const ok = await call(ctrl.reportResult, { as: P.a, params: { id: String(t._id), matchId: m.id }, body: { winner: teamOf(t, P.a) } });
  assert.equal(ok.code, 200);
  const res = await call(ctrl.updateTournament, { as: P.owner, params: { id: String(t._id) } });
  assert.equal(res.code, 403);
});

test('members see the event but not the ranking; outsiders see nothing', async () => {
  await create({ buildToFinale: true }, { ranking: [P.a, P.b].map(keyOf) });
  const asMember = await call(ctrl.getTournamentForMeetup, { as: P.a, params: { meetupId: String(meetup._id) } });
  assert.equal(asMember.code, 200);
  assert.deepEqual(asMember.body.tournament.weighting.order, []);
  assert.equal(asMember.body.tournament.canManage, false);
  const asOwner = await call(ctrl.getTournamentForMeetup, { as: P.owner, params: { meetupId: String(meetup._id) } });
  assert.equal(asOwner.body.tournament.weighting.order.length, 2);
  const stranger = person('Zed');
  users.push(stranger);
  const res = await call(ctrl.getTournamentForMeetup, { as: stranger, params: { meetupId: String(meetup._id) } });
  assert.equal(res.code, 403);
});

// --- ranking lists ---

test('ranking lists: managers only, names checked, at most 10, non-members dropped', async () => {
  const params = { groupId: String(group._id) };
  assert.equal((await call(ctrl.createRankingList, { as: P.a, params, body: { name: 'Skill' } })).code, 403);
  assert.equal((await call(ctrl.createRankingList, { as: P.owner, params, body: { name: ' ' } })).body.error, 'invalid_name');
  const made = await call(ctrl.createRankingList, { as: P.owner, params, body: { name: 'Skill', order: [keyOf(P.a), 'nobody', keyOf(P.a), keyOf(P.b)] } });
  assert.equal(made.code, 201);
  assert.deepEqual(made.body.list.order, [keyOf(P.a), keyOf(P.b)]);
  for (let i = 2; i <= 10; i++) await call(ctrl.createRankingList, { as: P.owner, params, body: { name: `List ${i}` } });
  const eleventh = await call(ctrl.createRankingList, { as: P.owner, params, body: { name: 'One more' } });
  assert.equal(eleventh.code, 400);
  assert.equal(eleventh.body.error, 'too_many_lists');
  const listId = made.body.list._id;
  const renamed = await call(ctrl.updateRankingList, { as: P.owner, params: { ...params, listId }, body: { name: 'Doubles skill' } });
  assert.equal(renamed.body.lists[0].name, 'Doubles skill');
  const del = await call(ctrl.deleteRankingList, { as: P.owner, params: { ...params, listId } });
  assert.equal(del.body.lists.length, 9);
});

test('a saved list can drive the ranking', async () => {
  group.rankingLists.push({ name: 'Skill', order: [P.c._id, P.a._id] });
  const listId = String(group.rankingLists[0]._id);
  const res = await create({ buildToFinale: true }, { rankingListId: listId });
  assert.equal(res.code, 201);
  assert.deepEqual(res.body.tournament.weighting.order.map(String), [keyOf(P.c), keyOf(P.a)]);
  const seed1 = res.body.tournament.teams.find((tm) => tm.seed === 1);
  assert.equal(seed1.players[0].key, keyOf(P.c));
});

// --- cleanup and the old route ---

test('a member leaving drops out of the group\'s saved rankings', async () => {
  const calls = [];
  Group.updateMany = async (filter, update) => { calls.push({ filter, update }); };
  await scrubMemberFromUpcomingMeetups({ userId: P.a._id, clerkId: P.a.clerkId, groupId: group._id });
  assert.ok(calls.some((c) => c.filter['rankingLists.order'] === P.a._id && c.update.$pull['rankingLists.$[].order'] === P.a._id));
});

test('deleting meetups removes only unfinished events; deleting a group removes all', async () => {
  const calls = [];
  Tournament.deleteMany = async (f) => { calls.push(f); };
  await deleteUnfinishedTournaments([meetup._id]);
  await deleteTournamentsForGroup(group._id);
  await deleteUnfinishedTournaments([]);
  assert.deepEqual(calls, [{ meetup: { $in: [meetup._id] }, status: 'active' }, { group: group._id }]);
});

test('the old team-split route is gone', () => {
  assert.ok(!meetupRouter.stack.some((l) => l.route?.path === '/:meetupId/teams'));
});

// --- stats ---

test('stats: members with Premium get the totals and names', async () => {
  await create({ format: 'roundRobin' });
  store.doc.status = 'finished';
  store.doc.champion = store.doc.teams[0].key;
  for (const m of store.doc.matches) { m.results = m.slots.map((s, i) => ({ team: s.team, place: i + 1 })); m.status = 'done'; }
  const res = await call(ctrl.getTournamentStats, { as: P.a, params: { groupId: String(group._id) } });
  assert.equal(res.code, 200);
  assert.equal(res.body.events.length, 1);
  assert.equal(res.body.people.length, 4);
  assert.ok(res.body.names[keyOf(P.a)]);
  premium.on = false;
  assert.equal((await call(ctrl.getTournamentStats, { as: P.a, params: { groupId: String(group._id) } })).code, 403);
});
