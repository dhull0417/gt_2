// Who learns about chat timeouts (group details), and cleanup when ownership moves or a group goes.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const sbCalls = [];
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
    notifyAndPersist: async () => {}, notifyUsers: async () => {}, sendPushNotifications: async () => {},
    tokensOf: () => [], inQuietHours: () => false, userWantsPush: () => true, isGroupMuted: () => false,
  },
});
mock.module(new URL('../utils/premium.js', import.meta.url).href, {
  namedExports: {
    hasPremium: () => false, groupHasPremium: async () => false, groupHasWaitlist: async () => false,
    serializeUser: (u) => u, withGroupPremium: async (m) => m,
  },
});
mock.module(new URL('../utils/systemMessage.js', import.meta.url).href, { namedExports: { postSystemMessage: async () => {} } });
const realSb = await import(new URL('../utils/supabaseAdmin.js?real', import.meta.url).href);
const rec = (name) => async (...a) => { sbCalls.push([name, ...a.map(String)]); return true; };
mock.module(new URL('../utils/supabaseAdmin.js', import.meta.url).href, {
  namedExports: {
    ...realSb,
    purgeGroupChat: rec('purgeGroupChat'),
    removeAllChatMembers: rec('removeAllChatMembers'),
    deleteGroupChatTimeouts: rec('deleteGroupChatTimeouts'),
    clearOwnerChatTimeout: rec('clearOwnerChatTimeout'),
  },
});

const { default: User } = await import('../models/user.model.js');
const { default: Group } = await import('../models/group.model.js');
const { default: Meetup } = await import('../models/meetup.model.js');
const { default: Poll } = await import('../models/poll.model.js');
const { default: Notification } = await import('../models/notification.model.js');
const { default: InviteToken } = await import('../models/inviteToken.model.js');
const { default: PendingInvite } = await import('../models/pendingInvite.model.js');
const { default: InviteEvent } = await import('../models/inviteEvent.model.js');
const { default: AttendanceRecord } = await import('../models/attendanceRecord.model.js');
const ctrl = await import('./group.controller.js');

const q = (v) => { const c = { select: () => c, lean: () => c, populate: () => c, sort: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const person = (name) => ({ _id: new mongoose.Types.ObjectId(), clerkId: `c-${name}`, firstName: name });
const call = async (fn, req) => {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await new Promise((resolve, reject) => { Promise.resolve(fn(req, res, (e) => (e ? reject(e) : resolve()))).then(resolve, reject); });
  return res;
};

let P, users, group, updates;
beforeEach(() => {
  sbCalls.length = 0;
  updates = [];
  P = { owner: person('Olive'), mod: person('Mo'), a: person('Ana'), b: person('Bo') };
  users = Object.values(P);
  const soon = new Date(Date.now() + 3600_000);
  group = {
    _id: new mongoose.Types.ObjectId(), name: 'Hikers', isDM: false, schedules: [],
    owner: P.owner._id, moderators: [P.mod._id], members: users.map((u) => u._id),
    chatTimeouts: [
      { user: P.a._id, until: soon, by: P.owner._id },
      { user: P.b._id, until: new Date(Date.now() - 60_000), by: P.owner._id },
    ],
  };
  User.findOne = (f) => q(users.find((u) => u.clerkId === f.clerkId) ?? null);
  User.findById = (id) => q(users.find((u) => String(u._id) === String(id)) ?? null);
  User.find = () => q([]);
  User.updateMany = async () => {};
  Group.exists = async () => true;
  Group.findById = () => q(group);
  Group.findOneAndUpdate = async (f, u) => { updates.push(u); return { ...group }; };
  Group.findByIdAndDelete = async () => {};
  for (const M of [Meetup, Poll, Notification, InviteToken, PendingInvite, InviteEvent, AttendanceRecord]) M.deleteMany = async () => {};
  Meetup.updateMany = async () => {};
  Meetup.find = () => q([]);
});

const details = (as) => call(ctrl.getGroupDetails, { clerkId: as.clerkId, params: { groupId: String(group._id) } });

test('chatTimeouts is hidden from every query unless asked for', () => {
  assert.equal(Group.schema.path('chatTimeouts').options.select, false);
});

test('a timed-out member sees their own timeout and nobody else\'s', async () => {
  const res = await details(P.a);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.myChatTimeout, { until: group.chatTimeouts[0].until.toISOString() });
  assert.equal('chatTimeouts' in res.body, false);
});

test('an expired timeout counts as none', async () => {
  const res = await details(P.b);
  assert.equal(res.body.myChatTimeout, null);
  assert.equal('chatTimeouts' in res.body, false);
});

test('owners and moderators see every active timeout', async () => {
  for (const who of [P.mod, P.owner]) {
    const res = await details(who);
    assert.equal(res.body.myChatTimeout, null);
    assert.deepEqual(res.body.chatTimeouts, [{ userId: String(P.a._id), until: group.chatTimeouts[0].until.toISOString() }]);
  }
});

test('indefinite timeouts come through as until null', async () => {
  group.chatTimeouts = [{ user: P.a._id, until: null, by: P.owner._id }];
  assert.deepEqual((await details(P.a)).body.myChatTimeout, { until: null });
});

test('making a timed-out member the owner ends their timeout', async () => {
  const res = await call(ctrl.transferOwnership, { clerkId: P.owner.clerkId, params: { groupId: String(group._id) }, body: { newOwnerId: String(P.a._id) } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(updates[0].$pull, { chatTimeouts: { user: P.a._id } });
  assert.deepEqual(sbCalls.find((c) => c[0] === 'clearOwnerChatTimeout'), ['clearOwnerChatTimeout', String(group._id), P.a.clerkId]);
});

test('deleting the group removes its timeouts from Supabase', async () => {
  const res = await call(ctrl.deleteGroup, { clerkId: P.owner.clerkId, params: { groupId: String(group._id) } });
  assert.equal(res.statusCode, 200);
  assert.ok(sbCalls.some((c) => c[0] === 'deleteGroupChatTimeouts' && c[1] === String(group._id)));
});

test('group details include members\' Clerk ids (chat links messages to members by them)', async () => {
  const populated = [];
  Group.findById = () => { const c = { select: () => c, lean: () => c, populate: (path, fields) => { populated.push([path, fields]); return c; }, then: (r, j) => Promise.resolve(group).then(r, j) }; return c; };
  await details(P.a);
  for (const [path, fields] of populated) assert.match(fields, /\bclerkId\b/, `${path} is missing clerkId`);
  assert.deepEqual(populated.map((p) => p[0]), ['members', 'moderators']);
});
