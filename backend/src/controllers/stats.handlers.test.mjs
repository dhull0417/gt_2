// Stats awards through the real handlers: RSVP log capture, the stats response per viewer,
// the reveal setting and account-deletion cleanup. Models are stubbed per test.
// Run with: npm test (from backend/) -- needs --experimental-test-module-mocks.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const premium = { on: true };
mock.module('@clerk/express', {
  namedExports: {
    getAuth: (req) => ({ userId: req.clerkId }),
    clerkClient: { users: { deleteUser: async () => {} } },
    createClerkClient: () => ({}),
    clerkMiddleware: () => (req, res, next) => next(),
  },
});
mock.module(new URL('../utils/push.notifications.js', import.meta.url).href, {
  namedExports: {
    notifyAndPersist: async () => {},
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

const { default: Meetup } = await import('../models/meetup.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: Group } = await import('../models/group.model.js');
const { default: AttendanceRecord } = await import('../models/attendanceRecord.model.js');
const { default: Poll } = await import('../models/poll.model.js');
const ctrl = await import('./meetup.controller.js');
const groupCtrl = await import('./group.controller.js');
delete process.env.SUPABASE_URL; // chat counts off: Chatty Cathy is simply left out

const q = (v) => { const c = { select: () => c, lean: () => c, populate: () => c, sort: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const person = (name) => ({ _id: new mongoose.Types.ObjectId(), clerkId: `c-${name}`, firstName: name });
let P, users, group, doc;

const makeMeetup = (over = {}) => {
  const m = new Meetup({
    group: group._id, name: 'Hike', date: new Date(Date.now() + 7 * 864e5), time: '9:00 AM', timezone: 'America/Denver',
    members: users.map((u) => u._id), in: [], capacity: 0, ...over,
  });
  m.save = async function save() { return this; };
  return m;
};

beforeEach(() => {
  premium.on = true;
  P = { owner: person('Olive'), a: person('Ana'), b: person('Bo') };
  users = Object.values(P);
  group = { _id: new mongoose.Types.ObjectId(), owner: P.owner._id, moderators: [], members: users.map((u) => u._id), name: 'Hikers' };
  User.findOne = (f) => q(users.find((u) => u.clerkId === f.clerkId) ?? null);
  User.findById = (id) => q(users.find((u) => String(u._id) === String(id)) ?? null);
  User.find = (f = {}) => q(f._id?.$in ? users.filter((u) => f._id.$in.map(String).includes(String(u._id))) : users);
  Group.findById = () => q(group);
  Group.updateMany = async () => {};
  Meetup.findById = () => q(doc);
  Meetup.find = () => q([]);
  Meetup.updateMany = async () => {};
});

const call = async (handler, { as, params = {}, body = {} }) => {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let failure;
  await handler({ clerkId: as.clerkId, params: { meetupId: String(doc?._id), ...params }, body, query: {}, headers: {} }, res, (e) => { failure = e; });
  if (failure) throw failure;
  return res;
};
const log = () => doc.rsvpLog.map((e) => [String(e.user), e.status]);

// --- RSVP log (Task 4) ---

test('self RSVP in then out logs two entries', async () => {
  doc = makeMeetup();
  await call(ctrl.rsvpMeetup, { as: P.a, body: { status: 'in' } });
  await call(ctrl.rsvpMeetup, { as: P.a, body: { status: 'out' } });
  assert.deepEqual(log(), [[String(P.a._id), 'in'], [String(P.a._id), 'out']]);
  assert.ok(doc.rsvpLog[0].at instanceof Date);
});

test('repeat tap logs nothing', async () => {
  doc = makeMeetup();
  await call(ctrl.rsvpMeetup, { as: P.a, body: { status: 'in' } });
  await call(ctrl.rsvpMeetup, { as: P.a, body: { status: 'in' } });
  assert.equal(doc.rsvpLog.length, 1);
});

test('full meetup logs waitlist', async () => {
  doc = makeMeetup({ capacity: 1, in: [P.b._id] });
  await call(ctrl.rsvpMeetup, { as: P.a, body: { status: 'in' } });
  assert.deepEqual(log(), [[String(P.a._id), 'waitlist']]);
});

test('admin override is not logged', async () => {
  doc = makeMeetup();
  // The permission check loads the meetup with its group populated.
  Meetup.findById = () => { const c = q(doc); c.populate = () => q({ members: doc.members, group }); return c; };
  const res = await call(ctrl.rsvpMeetup, { as: P.owner, body: { status: 'in', targetUserId: String(P.a._id) } });
  assert.equal(res.code, 200);
  assert.ok(doc.in.some((id) => id.equals(P.a._id)));
  assert.equal(doc.rsvpLog.length, 0);
});

test('promoted waitlister is not logged', async () => {
  doc = makeMeetup({ capacity: 1, in: [P.b._id], waitlist: [P.a._id] });
  await call(ctrl.rsvpMeetup, { as: P.b, body: { status: 'out' } });
  assert.ok(doc.in.some((id) => id.equals(P.a._id)));
  assert.deepEqual(log(), [[String(P.b._id), 'out']]);
});

// --- Stats response (Task 7) ---

// Finished meetups as archive records, oldest first: n meetups where `inn` were In and `out` were Out.
const records = (list) => list.map(({ inn = [], out = [], members }, i) => ({
  meetupId: new mongoose.Types.ObjectId(), group: group._id, name: `M${i}`, startsAt: new Date(Date.UTC(2026, 0, i + 1)),
  members: (members ?? users).map((u) => u._id), in: inn.map((u) => u._id), out: out.map((u) => u._id), capacity: 0, guests: 0,
}));
const stubHistory = (recs, polls = []) => {
  AttendanceRecord.find = () => q(recs);
  Meetup.find = () => q([]);
  Poll.find = () => q(polls);
};
const getStats = (as) => call(groupCtrl.getGroupStats, { as, params: { groupId: String(group._id) } });

test('member response hides joke data through the endpoint', async () => {
  stubHistory(records([{ inn: [P.a], out: [P.b] }, { inn: [P.a], out: [P.b] }, { inn: [P.a, P.b] }]));
  const member = await getStats(P.a);
  assert.equal(member.code, 200);
  assert.deepEqual(member.body.awards.map((a) => a.key), ['reliable', 'streak', 'responder']);
  assert.equal(member.body.members.find((m) => m._id === String(P.b._id)).declined, null);
  assert.equal(member.body.viewer.jokesVisible, false);
  const owner = await getStats(P.owner);
  assert.ok(owner.body.awards.some((a) => a.key === 'decliner' && a.winners[0]._id === String(P.b._id)));
  assert.equal(owner.body.awards.find((a) => a.key === 'decliner').winners[0].firstName, 'Bo');
});

test('revealed group shows joke awards to members through the endpoint', async () => {
  group.statsRevealJokes = true;
  stubHistory(records([{ out: [P.b] }, { out: [P.b] }, { out: [P.b] }]));
  const res = await getStats(P.a);
  assert.ok(res.body.awards.some((a) => a.key === 'decliner'));
  assert.equal(res.body.viewer.revealJokes, true);
});

test('former members are not ranked', async () => {
  const gone = person('Gone');
  const everyone = [...users, gone];
  stubHistory(records([1, 2, 3, 4].map(() => ({ members: everyone, inn: [gone, P.a] }))));
  const res = await getStats(P.owner);
  const reliable = res.body.awards.find((a) => a.key === 'reliable');
  assert.deepEqual(reliable.leaderboard.map((p) => p._id), [String(P.a._id)]);
  assert.ok(!JSON.stringify(res.body).includes(String(gone._id)));
});

test('voice of the people counts polls voted in', async () => {
  stubHistory([], [1, 2, 3].map(() => ({ options: [{ voters: [P.a._id] }, { voters: [P.a._id, P.b._id] }] })));
  const res = await getStats(P.owner);
  assert.deepEqual(res.body.awards.find((a) => a.key === 'voice').leaderboard.map((p) => [p.firstName, p.value]), [['Ana', 3], ['Bo', 3]]);
});

// --- Reveal setting (Task 8) ---

const saveable = () => { Group.updateOne = async (f, u) => { Object.assign(group, u.$set); return { acknowledged: true }; }; };
const setReveal = (as, body) => call(groupCtrl.updateStatsSettings, { as, params: { groupId: String(group._id) }, body });

test('moderator can reveal', async () => {
  group.moderators = [P.a._id]; saveable();
  const res = await setReveal(P.a, { revealJokes: true });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { revealJokes: true });
  assert.equal(group.statsRevealJokes, true);
});

test('member gets 403', async () => {
  saveable();
  const res = await setReveal(P.b, { revealJokes: true });
  assert.equal(res.code, 403);
  assert.notEqual(group.statsRevealJokes, true);
});

test('non-boolean gets 400', async () => {
  saveable();
  const res = await setReveal(P.owner, { revealJokes: 'yes' });
  assert.equal(res.code, 400);
});

test('unknown group gets 404', async () => {
  Group.findById = () => q(null);
  const res = await setReveal(P.owner, { revealJokes: true });
  assert.equal(res.code, 404);
});

test('the route is registered', async () => {
  const { default: router } = await import('../routes/group.route.js');
  assert.ok(router.stack.some((l) => l.route?.path === '/:groupId/stats-settings' && l.route.methods.patch));
});

test('a self RSVP on a meetup people already answered marks the log partial', async () => {
  doc = makeMeetup({ in: [P.b._id] });
  await call(ctrl.rsvpMeetup, { as: P.a, body: { status: 'in' } });
  assert.equal(doc.rsvpLogPartial, true);
});
