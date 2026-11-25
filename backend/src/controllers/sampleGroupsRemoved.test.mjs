// Sample groups are gone (2026-11-25). Older app builds still offer "look around a sample group";
// the endpoint now tells them so and creates nothing.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('@clerk/express', {
  namedExports: {
    getAuth: (req) => ({ userId: req.clerkId }), clerkClient: {}, createClerkClient: () => ({}),
    clerkMiddleware: () => (req, res, next) => next(),
  },
});
mock.module(new URL('../utils/push.notifications.js', import.meta.url).href, {
  namedExports: {
    notifyAndPersist: async () => {}, notifyUsers: async () => {}, sendPushNotifications: async () => {},
    tokensOf: () => [], inQuietHours: () => false, userWantsPush: () => true, isGroupMuted: () => false,
  },
});

const { default: Group } = await import('../models/group.model.js');
const { default: Meetup } = await import('../models/meetup.model.js');
const ctrl = await import('./group.controller.js');

const call = async (fn, req) => {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await new Promise((resolve, reject) => { Promise.resolve(fn(req, res, (e) => (e ? reject(e) : resolve()))).then(resolve, reject); });
  return res;
};

test('POST /api/groups/demo answers 410 with a message older apps show, and creates nothing', async () => {
  Group.create = async () => { throw new Error('must not create a group'); };
  Meetup.create = async () => { throw new Error('must not create a meetup'); };
  const res = await call(ctrl.sampleGroupsRemoved, { clerkId: 'c1', body: {} });
  assert.equal(res.statusCode, 410);
  assert.deepEqual(res.body, { error: 'Sample groups are no longer available. Create a group or use an invite code.' });
});

test('the old createDemoGroup handler is gone', () => {
  assert.equal('createDemoGroup' in ctrl, false);
});

test('groups no longer have an isDemo flag', () => {
  assert.equal(Group.schema.path('isDemo'), undefined);
});
