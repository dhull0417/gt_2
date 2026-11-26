import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const reconciles = [];
const pushes = [];
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
    notifyAndPersist: async (users, payload) => { pushes.push(payload); },
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
    hasPremium: () => true,
    groupHasPremium: async () => true,
    groupHasWaitlist: async () => true,
    serializeUser: (u) => u,
    withGroupPremium: async (m) => m,
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

// Priority RSVP screen: the series' RSVP open time is saved with the priority setup.
// Run with: npm test (from backend/) -- needs --experimental-test-module-mocks.
const q = (v) => { const c = { select: () => c, lean: () => c, populate: () => c, sort: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const person = (name) => ({ _id: new mongoose.Types.ObjectId(), clerkId: `c-${name}`, firstName: name });
const weekly = [{ frequency: 'weekly', dayTimes: [{ day: 2, time: '06:00 PM' }], rules: [] }];

let owner, users, group;
const makeGroup = (scheduleOver = {}) => {
  const g = new Group({
    name: 'League', timezone: 'America/Denver', owner: owner._id, members: users.map((u) => u._id),
    schedules: [{ name: 'Tuesdays', startDate: new Date('2027-01-05T00:00:00Z'), routines: weekly, ...scheduleOver }],
  });
  g.save = async function save() { return this; };
  return g;
};

beforeEach(() => {
  pushes.length = 0;
  owner = person('Olive');
  users = [owner, person('Max')];
  group = makeGroup();
  User.findOne = (f) => q(users.find((u) => u.clerkId === f.clerkId) ?? null);
  User.find = () => q(users);
  Group.findById = () => q(group);
  Meetup.find = () => q([]);
  Meetup.bulkWrite = async () => ({});
});

const target = () => group.schedules[0];
const tiers = [{ size: 1, windowMinutes: 60 }];
const save = async (body) => {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let failure;
  await groupCtrl.updateSchedulePriority(
    { clerkId: owner.clerkId, params: { groupId: String(group._id), scheduleId: String(target()._id) }, body, query: {}, headers: {} },
    res, (e) => { failure = e; });
  if (failure) throw failure;
  return res;
};
const on = (extra) => save({ enabled: true, order: users.map((u) => String(u._id)), tiers, ...extra });

test('saves the open time with the priority setup', async () => {
  group = makeGroup({ generationLeadDays: null });
  const res = await on({ openDays: 2, openTime: '7:00 PM' });
  assert.equal(res.code, 200);
  assert.equal(target().generationLeadDays, 2);
  assert.equal(target().generationLeadTime, '7:00 PM');
  assert.equal(target().priorityEnabled, true);
});

test('rejects an open time after the deadline on the same day', async () => {
  group = makeGroup({ generationLeadDays: 3, generationLeadTime: '08:00 AM', generationDeadlineDays: 1, generationDeadlineTime: '09:00 AM' });
  const res = await on({ openDays: 1, openTime: '10:00 AM' });
  assert.equal(res.code, 400);
  assert.equal(target().generationLeadDays, 3);
});

test('rejects an open day before the deadline day', async () => {
  group = makeGroup({ generationLeadDays: 3, generationDeadlineDays: 2, generationDeadlineTime: '09:00 AM' });
  const res = await on({ openDays: 1, openTime: '08:00 AM' });
  assert.equal(res.code, 400);
});

test('allows the open time equal to the deadline', async () => {
  group = makeGroup({ generationLeadDays: 3, generationDeadlineDays: 1, generationDeadlineTime: '09:00 AM' });
  const res = await on({ openDays: 1, openTime: '09:00 AM' });
  assert.equal(res.code, 200);
  assert.equal(target().generationLeadDays, 1);
});

for (const [openDays, openTime] of [[-1, '9:00 AM'], [366, '9:00 AM'], [1.5, '9:00 AM'], ['2', '9:00 AM'], [1, '25:00'], [1, undefined]]) {
  test(`rejects a bad open time (${openDays}, ${openTime})`, async () => {
    group = makeGroup({ generationLeadDays: 4 });
    const res = await on({ openDays, openTime });
    assert.equal(res.code, 400);
    assert.equal(target().generationLeadDays, 4);
  });
}

test('turning priority off leaves the open time alone', async () => {
  group = makeGroup({ generationLeadDays: 4, generationLeadTime: '08:00 AM', priorityEnabled: true });
  const res = await save({ enabled: false, openDays: 2, openTime: '7:00 PM' });
  assert.equal(res.code, 200);
  assert.equal(target().generationLeadDays, 4);
  assert.equal(target().priorityEnabled, false);
});

test('older app builds without an open time still need one set first', async () => {
  group = makeGroup({ generationLeadDays: null });
  const res = await on({});
  assert.equal(res.code, 400);
  assert.match(res.body.error, /Set when RSVPs open/);
});

test('older app builds keep the saved open time', async () => {
  group = makeGroup({ generationLeadDays: 4, generationLeadTime: '08:00 AM' });
  const res = await on({});
  assert.equal(res.code, 200);
  assert.equal(target().generationLeadDays, 4);
  assert.equal(pushes.length, 0);
});

test('tells the group when the open time changes', async () => {
  group = makeGroup({ generationLeadDays: 2, generationLeadTime: '08:00 AM' });
  await on({ openDays: 3, openTime: '08:00 AM' });
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].type, 'schedule-updated');
});

test('no notice when the open time is re-saved unchanged', async () => {
  group = makeGroup({ generationLeadDays: 2, generationLeadTime: '08:00 AM' });
  await on({ openDays: 2, openTime: '08:00 AM' });
  assert.equal(pushes.length, 0);
});
