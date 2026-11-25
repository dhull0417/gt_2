// GET /api/meetups (the Meetups tab) only shows meetups from groups the person is in now:
// leaving / being removed hides that group's past and cancelled meetups, rejoining brings them back.
// Models are stubbed per test. Run with: npm test (from backend/).
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

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
    notifyAndPersist: async () => {}, notifyUsers: async () => {}, sendPushNotifications: async () => {},
    tokensOf: () => [], inQuietHours: () => false, userWantsPush: () => true, isGroupMuted: () => false,
  },
});
mock.module(new URL('../utils/premium.js', import.meta.url).href, {
  namedExports: {
    hasPremium: () => false, groupHasPremium: async () => false, groupHasWaitlist: async () => true,
    serializeUser: (u) => u, withGroupPremium: async (m) => m,
  },
});
mock.module(new URL('../utils/minimumHeadcount.js', import.meta.url).href, {
  namedExports: { evaluateMinimumHeadcount: async () => null, evaluateDueMeetups: async () => ({ checked: 0, cancelled: 0 }) },
});

const { default: Meetup } = await import('../models/meetup.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: Group } = await import('../models/group.model.js');
const meetupCtrl = await import('./meetup.controller.js');

const oid = () => new mongoose.Types.ObjectId();
const has = (arr, id) => arr.some((x) => String(x) === String(id));
// Chainable query stub: populate/sort/select/lean pass through, distinct maps, await resolves.
const q = (rows) => {
  const c = {
    populate: () => c, sort: () => c, select: () => c, lean: () => c,
    distinct: (field) => q(rows.map((r) => r[field])),
    then: (r, j) => Promise.resolve(rows).then(r, j),
  };
  return c;
};
const matchesMembers = (doc, f) => (f.members === undefined ? true : has(doc.members, f.members));
const matchesGroupIn = (doc, f) => (f.group?.$in === undefined ? true : has(f.group.$in, doc.group));
const matchesSince = (doc, f) => (f.updatedAt?.$gte === undefined ? true : doc.updatedAt >= f.updatedAt.$gte);

let ana, groupA, groupB, groups, meetups, aUpcoming, bPast, bCancelled;

beforeEach(() => {
  ana = { _id: oid(), clerkId: 'c-ana', firstName: 'Ana' };
  groupA = { _id: oid(), name: 'A', members: [ana._id] };
  groupB = { _id: oid(), name: 'B', members: [] }; // Ana left / was removed
  groups = [groupA, groupB];
  const day = 24 * 60 * 60 * 1000;
  const mk = (group, name, offsetDays, status = 'scheduled') => ({
    _id: oid(), group: group._id, name, status, members: [ana._id],
    date: new Date(Date.now() + offsetDays * day), updatedAt: new Date(Date.now() - day),
  });
  aUpcoming = mk(groupA, 'A-upcoming', 3);
  bPast = mk(groupB, 'B-past', -2);
  bCancelled = mk(groupB, 'B-cancelled', -1, 'cancelled');
  meetups = [aUpcoming, bPast, bCancelled];

  User.findOne = (f) => q(f.clerkId === ana.clerkId ? ana : null);
  Group.find = (f = {}) => q(groups.filter((g) => (f.members === undefined ? true : has(g.members, f.members))));
  Meetup.find = (f = {}) => q(meetups.filter((m) => matchesMembers(m, f) && matchesGroupIn(m, f) && matchesSince(m, f)));
});

const getFeed = async (query = {}) => {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let failure;
  await meetupCtrl.getMeetups({ clerkId: ana.clerkId, params: {}, body: {}, query, headers: {} }, res, (e) => { failure = e; });
  if (failure) throw failure;
  return res;
};
const names = (rows) => rows.map((m) => m.name).sort();

test('full fetch hides past and cancelled meetups of a left group', async () => {
  const res = await getFeed();
  assert.equal(res.code, 200);
  assert.deepEqual(names(res.body), ['A-upcoming']);
});

test('delta sync drops left group from validIds', async () => {
  const res = await getFeed({ since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.validIds, [String(aUpcoming._id)]);
  assert.deepEqual(names(res.body.changed), ['A-upcoming']);
});

test('rejoining shows the past meetups again', async () => {
  groupB.members.push(ana._id);
  const res = await getFeed();
  assert.deepEqual(names(res.body), ['A-upcoming', 'B-cancelled', 'B-past']);
});

test("deleted group's meetups are gone", async () => {
  groupB.members.push(ana._id);
  groups = [groupA];
  meetups = meetups.filter((m) => String(m.group) !== String(groupB._id));
  const res = await getFeed();
  assert.deepEqual(names(res.body), ['A-upcoming']);
});
