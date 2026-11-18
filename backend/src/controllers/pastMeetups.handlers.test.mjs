// Past Meetups endpoints through the real handlers: membership checks, paging cap, detail.
// Models are stubbed per test.
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
const { default: Tournament } = await import('../models/tournament.model.js');
const groupCtrl = await import('./group.controller.js');

const q = (v) => { const c = { select: () => c, lean: () => c, sort: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const person = (name) => ({ _id: new mongoose.Types.ObjectId(), clerkId: `c-${name}`, firstName: name });
let users, group, outsider, recs;

beforeEach(() => {
  premium.on = false; // not premium-gated
  users = [person('Ana'), person('Bo')];
  outsider = person('Zed');
  group = { _id: new mongoose.Types.ObjectId(), owner: users[0]._id, moderators: [], members: users.map((u) => u._id), name: 'Hikers' };
  recs = Array.from({ length: 60 }, (_, i) => ({
    meetupId: new mongoose.Types.ObjectId(), group: group._id, name: `M${i}`, startsAt: new Date(Date.UTC(2026, 0, i + 1)),
    members: group.members, in: [users[0]._id], out: [], capacity: 0, guests: 0,
  }));
  const all = [...users, outsider];
  User.findOne = (f) => q(all.find((u) => u.clerkId === f.clerkId) ?? null);
  User.find = (f = {}) => q(f._id?.$in ? all.filter((u) => f._id.$in.map(String).includes(String(u._id))) : []);
  Group.findById = (gid) => q(String(gid) === String(group._id) ? group : null);
  AttendanceRecord.find = () => q(recs);
  AttendanceRecord.findOne = (f) => q(recs.find((r) => String(r.meetupId) === String(f.meetupId) && String(r.group) === String(f.group)) ?? null);
  Meetup.find = () => q([]);
  Meetup.findOne = () => q(null);
  Tournament.find = () => q([]);
  Tournament.findOne = () => q(null);
});

const call = async (handler, { as, params = {}, query = {} }) => {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let failure;
  await handler({ clerkId: as.clerkId, params, body: {}, query, headers: {} }, res, (e) => { failure = e; });
  if (failure) throw failure;
  return res;
};
const list = (as, query = {}, gid = group._id) => call(groupCtrl.getPastMeetups, { as, params: { groupId: String(gid) }, query });
const detail = (as, meetupId, gid = group._id) => call(groupCtrl.getPastMeetupDetail, { as, params: { groupId: String(gid), meetupId: String(meetupId) } });

test('a member gets the list, newest first, 20 by default, without premium', async () => {
  const res = await list(users[1]);
  assert.equal(res.code, 200);
  assert.equal(res.body.meetups.length, 20);
  assert.equal(res.body.meetups[0].name, 'M59');
  assert.ok(res.body.nextBefore);
});

test('limit is capped at 50 and before pages', async () => {
  const res = await list(users[0], { limit: '500' });
  assert.equal(res.body.meetups.length, 50);
  const next = await list(users[0], { limit: '50', before: res.body.nextBefore });
  assert.deepEqual(next.body.meetups.map((m) => m.name).slice(0, 2), ['M9', 'M8']);
});

test('a bad before date is rejected', async () => {
  assert.equal((await list(users[0], { before: 'nope' })).code, 400);
});

test('non-members get 403 and unknown groups 404', async () => {
  assert.equal((await list(outsider)).code, 403);
  assert.equal((await list(users[0], {}, new mongoose.Types.ObjectId())).code, 404);
  assert.equal((await detail(outsider, recs[0].meetupId)).code, 403);
});

test('a member gets one past meetup; an unknown one is 404', async () => {
  const res = await detail(users[1], recs[3].meetupId);
  assert.equal(res.code, 200);
  assert.equal(res.body.name, 'M3');
  assert.deepEqual(res.body.in.map((p) => p.firstName), ['Ana']);
  assert.equal((await detail(users[1], new mongoose.Types.ObjectId())).code, 404);
  assert.equal((await detail(users[1], 'not-an-id')).code, 404);
});
