// Schedule end dates through the real create/update/count handlers. Models are stubbed per
// test; meetup generation is replaced with recorders so we can see what the handlers ask for.
// Run with: npm test (from backend/) -- needs --experimental-test-module-mocks.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const reconciles = [];
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
    notifyAndPersist: async () => {},
    notifyUsers: async () => {},
    sendPushNotifications: async () => {},
    tokensOf: () => [],
    inQuietHours: () => false,
    userWantsPush: () => true,
    isGroupMuted: () => false,
  },
});
mock.module(new URL('../utils/meetupGeneration.js', import.meta.url).href, {
  namedExports: {
    generateMeetupsForGroup: async () => ({ generatedCount: 0 }),
    generateMeetupsForSchedule: async () => ({ generatedCount: 0 }),
    reconcileScheduleMeetups: async (group, schedule, opts) => { reconciles.push(opts); return { removed: 0, kept: 0 }; },
    rememberSkippedSlot: async () => true,
  },
});
const noop = async () => {};
mock.module(new URL('../utils/supabaseAdmin.js', import.meta.url).href, {
  namedExports: Object.fromEntries([
    'storagePathFromUrl', 'purgeGroupChat', 'scrubUserChat', 'addChatMembers', 'removeChatMember', 'removeAllChatMembers',
    'removeChatMemberEverywhere', 'chatMessageCounts', 'setChatTimeoutRow', 'deleteChatTimeoutRow', 'deleteGroupChatTimeouts',
    'deleteUserChatTimeouts', 'getChatMessage', 'modDeleteChatMessage', 'latestChatMessageId', 'clearOwnerChatTimeout',
  ].map((n) => [n, noop]).concat([['isConfigured', () => false]])),
});
mock.module(new URL('../utils/email/lifecycle.js', import.meta.url).href, {
  namedExports: { resolveZone: () => 'America/Denver', onGroupCreated: async () => {}, onInviteRedeemed: async () => {} },
});
mock.module(new URL('../utils/systemMessage.js', import.meta.url).href, {
  namedExports: { postSystemMessage: async () => {} },
});

const { default: Meetup } = await import('../models/meetup.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: Group } = await import('../models/group.model.js');
const groupCtrl = await import('./group.controller.js');

const TZ = 'America/Denver';
const MSG = "End date can't be before the start date.";
const q = (v) => { const c = { select: () => c, lean: () => c, populate: () => c, sort: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const person = (name) => ({ _id: new mongoose.Types.ObjectId(), clerkId: `c-${name}`, firstName: name });
const weekly = [{ frequency: 'weekly', dayTimes: [{ day: 2, time: '06:00 PM' }], rules: [] }];
const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

let owner, member, users, group, created, counted;

const makeGroup = (scheduleOver = {}) => {
  const g = new Group({
    name: 'League', timezone: TZ, owner: owner._id, members: users.map((u) => u._id),
    schedules: [{ name: 'Tuesdays', startDate: new Date('2027-01-05T00:00:00Z'), routines: weekly, ...scheduleOver }],
  });
  g.save = async function save() { return this; };
  return g;
};

beforeEach(() => {
  reconciles.length = 0;
  owner = person('Olive');
  member = person('Max');
  users = [owner, member];
  group = makeGroup();
  created = null;
  counted = null;
  User.findOne = (f) => q(users.find((u) => u.clerkId === f.clerkId) ?? null);
  User.find = () => q(users);
  User.updateMany = async () => ({});
  Group.findById = () => q(group);
  Group.create = async (data) => { created = makeGroupFrom(data); return created; };
  Meetup.updateMany = async () => ({});
  Meetup.find = () => q([]);
  Meetup.countDocuments = (filter) => { counted = filter; return q(7); };
});
const makeGroupFrom = (data) => { const g = new Group(data); g.save = async function save() { return this; }; return g; };

const call = async (handler, { as, params = {}, body = {}, query = {} }) => {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let failure;
  await handler({ clerkId: as.clerkId, params, body, query, headers: {} }, res, (e) => { failure = e; });
  if (failure) throw failure;
  return res;
};
const target = () => group.schedules[0];
const update = (body, as = owner) =>
  call(groupCtrl.updateSchedule, { as, params: { groupId: String(group._id), scheduleId: String(target()._id) }, body });

// --- createSchedule ---

test('creating a schedule stores its end date', async () => {
  const res = await call(groupCtrl.createSchedule, {
    as: owner, params: { groupId: String(group._id) },
    body: { name: 'Spring league', startDate: '2027-03-01', endDate: '2027-05-31', routines: weekly },
  });
  assert.equal(res.code, 201);
  assert.equal(isoDay(group.schedules.at(-1).endDate), '2027-05-31');
});

test('creating a schedule that ends before it starts is rejected', async () => {
  const res = await call(groupCtrl.createSchedule, {
    as: owner, params: { groupId: String(group._id) },
    body: { name: 'Spring league', startDate: '2027-03-01', endDate: '2027-02-01', routines: weekly },
  });
  assert.equal(res.code, 400);
  assert.equal(res.body.error, MSG);
});

// --- updateSchedule ---

test('an end date before the start date is rejected and nothing changes', async () => {
  const res = await update({ endDate: '2027-01-01' });
  assert.equal(res.code, 400);
  assert.equal(res.body.error, MSG);
  assert.equal(target().endDate ?? null, null);
});

test('setting an end date saves it; Keep is the default answer', async () => {
  const res = await update({ endDate: '2027-04-27' });
  assert.equal(res.code, 200);
  assert.equal(isoDay(target().endDate), '2027-04-27');
  assert.equal(reconciles.at(-1).removeAfterEnd, false);
});

test('Delete is passed to the cleanup', async () => {
  await update({ endDate: '2027-04-27', removeAfterEnd: true });
  assert.equal(reconciles.at(-1).removeAfterEnd, true);
});

test('null clears the end date', async () => {
  group = makeGroup({ endDate: new Date('2027-04-27T00:00:00Z') });
  await update({ endDate: null });
  assert.equal(target().endDate, null);
});

test('an old app build that never sends endDate keeps it and never deletes', async () => {
  group = makeGroup({ endDate: new Date('2027-04-27T00:00:00Z') });
  await update({ name: 'Tuesdays', defaultLocation: 'Gym' });
  assert.equal(isoDay(target().endDate), '2027-04-27');
  assert.equal(reconciles.at(-1).removeAfterEnd, false);
});

test('moving the start date past a saved end date is rejected', async () => {
  group = makeGroup({ endDate: new Date('2027-04-27T00:00:00Z') });
  const res = await update({ startDate: '2027-05-01' });
  assert.equal(res.code, 400);
  assert.equal(res.body.error, MSG);
});

// --- createGroup ---

test('a new group stores its schedule end date', async () => {
  const res = await call(groupCtrl.createGroup, {
    as: owner,
    body: { name: 'League', timezone: TZ, schedules: [{ name: 'League', startDate: '2027-03-01', endDate: '2027-05-31', routines: weekly }] },
  });
  assert.equal(res.code, 201);
  assert.equal(isoDay(created.schedules[0].endDate), '2027-05-31');
});

test('a new group whose schedule ends before it starts is rejected', async () => {
  const res = await call(groupCtrl.createGroup, {
    as: owner,
    body: { name: 'League', timezone: TZ, schedules: [{ name: 'League', startDate: '2027-03-01', endDate: '2027-02-01', routines: weekly }] },
  });
  assert.equal(res.code, 400);
  assert.equal(res.body.error, MSG);
  assert.equal(created, null);
});

// --- countMeetupsAfter ---

const count = (query, as = owner) =>
  call(groupCtrl.countMeetupsAfter, { as, params: { groupId: String(group._id), scheduleId: String(target()._id) }, query });

test('counts only this schedule\'s regular, scheduled meetups after the end of that day (group timezone)', async () => {
  const res = await count({ date: '2027-04-27' });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { count: 7 });
  assert.equal(String(counted.group), String(group._id));
  assert.equal(String(counted.schedule), String(target()._id));
  assert.equal(counted.isOverride, false);
  assert.equal(counted.status, 'scheduled');
  // End of Apr 27 in Denver (MDT, UTC-6) is Apr 28 05:59:59.999Z.
  assert.equal(counted.date.$gt.toISOString(), '2027-04-28T05:59:59.999Z');
});

test('members who cannot manage the group get 403', async () => {
  const res = await count({ date: '2027-04-27' }, member);
  assert.equal(res.code, 403);
  assert.equal(counted, null);
});

test('a missing or malformed date is a 400', async () => {
  assert.equal((await count({})).code, 400);
  assert.equal((await count({ date: 'April 27' })).code, 400);
  assert.equal(counted, null);
});
