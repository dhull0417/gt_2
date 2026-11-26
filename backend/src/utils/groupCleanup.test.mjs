// deleteGroupAndData: everything a deleted group leaves behind goes with it. Shared by the
// "Delete group" endpoint and scripts/deleteSampleGroups.js.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const calls = [];
const rec = (name) => async (...a) => { calls.push([name, ...a]); return true; };
mock.module('@clerk/express', {
  namedExports: {
    getAuth: (req) => ({ userId: req.clerkId }), clerkClient: {}, createClerkClient: () => ({}),
    clerkMiddleware: () => (req, res, next) => next(),
  },
});
const notified = [];
mock.module(new URL('./push.notifications.js', import.meta.url).href, {
  namedExports: {
    notifyAndPersist: async (users, payload) => { notified.push({ users, payload }); }, notifyUsers: async () => {},
    sendPushNotifications: async () => {}, tokensOf: () => [], inQuietHours: () => false, userWantsPush: () => true,
    isGroupMuted: () => false,
  },
});
mock.module(new URL('./premium.js', import.meta.url).href, {
  namedExports: {
    hasPremium: () => false, groupHasPremium: async () => false, groupHasWaitlist: async () => false,
    serializeUser: (u) => u, withGroupPremium: async (m) => m,
  },
});
mock.module(new URL('./systemMessage.js', import.meta.url).href, { namedExports: { postSystemMessage: async () => {} } });
const realCleanup = await import(new URL('./tournament/cleanup.js?real', import.meta.url).href);
mock.module(new URL('./tournament/cleanup.js', import.meta.url).href, { namedExports: { ...realCleanup, deleteTournamentsForGroup: rec('deleteTournamentsForGroup') } });
const realSb = await import(new URL('./supabaseAdmin.js?real', import.meta.url).href);
mock.module(new URL('./supabaseAdmin.js', import.meta.url).href, {
  namedExports: {
    ...realSb,
    purgeGroupChat: rec('purgeGroupChat'),
    removeAllChatMembers: rec('removeAllChatMembers'),
    deleteGroupChatTimeouts: rec('deleteGroupChatTimeouts'),
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
const { deleteGroupAndData } = await import('./groupCleanup.js');
const ctrl = await import('../controllers/group.controller.js');

const q = (v) => { const c = { select: () => c, lean: () => c, populate: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const person = (name) => ({ _id: new mongoose.Types.ObjectId(), clerkId: `c-${name}`, firstName: name });
const call = async (fn, req) => {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await new Promise((resolve, reject) => { Promise.resolve(fn(req, res, (e) => (e ? reject(e) : resolve()))).then(resolve, reject); });
  return res;
};

let owner, member, group;
beforeEach(() => {
  calls.length = 0; notified.length = 0;
  owner = person('Olive'); member = person('Mo');
  group = { _id: new mongoose.Types.ObjectId(), name: 'Hikers', isDM: false, owner: owner._id, members: [owner._id, member._id] };
  const models = { Meetup, Poll, Notification, InviteToken, PendingInvite, InviteEvent, AttendanceRecord };
  for (const [name, M] of Object.entries(models)) M.deleteMany = async (f) => { calls.push([`${name}.deleteMany`, f]); };
  User.updateMany = async (f, u) => { calls.push(['User.updateMany', f, u]); };
  User.findOne = (f) => q([owner, member].find((u) => u.clerkId === f.clerkId) ?? null);
  User.find = () => q([member]);
  Group.findById = () => q(group);
  Group.findByIdAndDelete = async (id) => { calls.push(['Group.findByIdAndDelete', id]); };
});

const called = (name) => calls.filter((c) => c[0] === name);

test('deleteGroupAndData removes everything that belongs to the group, then the group and its chat', async () => {
  await deleteGroupAndData(group);
  const id = group._id;
  for (const name of ['Meetup', 'Poll', 'AttendanceRecord', 'Notification']) {
    assert.deepEqual(called(`${name}.deleteMany`)[0]?.[1], { group: id }, name);
  }
  for (const name of ['InviteToken', 'PendingInvite', 'InviteEvent']) {
    assert.deepEqual(called(`${name}.deleteMany`)[0]?.[1], { groupId: id }, name);
  }
  assert.equal(called('deleteTournamentsForGroup')[0]?.[1], id);
  const [, filter, update] = called('User.updateMany')[0];
  assert.deepEqual(filter, { _id: { $in: group.members } });
  assert.equal(update.$pull.groups, id);
  assert.deepEqual(called('Group.findByIdAndDelete')[0]?.[1], id);
  for (const name of ['purgeGroupChat', 'removeAllChatMembers', 'deleteGroupChatTimeouts']) {
    assert.equal(called(name)[0]?.[1], id, name);
  }
});

test('deleteGroupAndData sends no notifications', async () => {
  await deleteGroupAndData(group);
  assert.equal(notified.length, 0);
});

test('"Delete group" still tells the other members, and still cleans up', async () => {
  const res = await call(ctrl.deleteGroup, { clerkId: owner.clerkId, params: { groupId: String(group._id) } });
  assert.equal(res.statusCode, 200);
  assert.equal(notified.length, 1);
  assert.equal(notified[0].payload.type, 'group-deleted');
  assert.deepEqual(notified[0].users, [member]);
  assert.equal(called('Group.findByIdAndDelete').length, 1);
  assert.equal(called('purgeGroupChat').length, 1);
});

test('"Delete group" is still owner-only', async () => {
  const res = await call(ctrl.deleteGroup, { clerkId: member.clerkId, params: { groupId: String(group._id) } });
  assert.equal(res.statusCode, 403);
  assert.equal(called('Group.findByIdAndDelete').length, 0);
});
