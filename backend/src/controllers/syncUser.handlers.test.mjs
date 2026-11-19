// syncUser through the real handler. The User model is stubbed per test.
// Regression: Sign in with Apple hands over the name once. useUserSync often creates the
// user (blank or "New Member") a moment before useAppleAuth sends the real name, and the
// second call used to be thrown away as "User already exists".
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let clerkUser;
mock.module('@clerk/express', {
  namedExports: {
    getAuth: (req) => ({ userId: req.clerkId }),
    clerkClient: { users: { getUser: async () => clerkUser } },
    createClerkClient: () => ({}),
    clerkMiddleware: () => (req, res, next) => next(),
  },
});
mock.module(new URL('../utils/push.notifications.js', import.meta.url).href, {
  namedExports: { notifyAndPersist: async () => {}, notifyUsers: async () => {} },
});
mock.module(new URL('../utils/pendingInvites.js', import.meta.url).href, {
  namedExports: { claimPendingInvites: async () => {} },
});

const { default: User } = await import('../models/user.model.js');
const C = await import('./user.controller.js');

const q = (v) => { const c = { select: () => c, lean: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const call = async (fn, { clerkId, body = {} }) => {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await new Promise((resolve, reject) => {
    const r = fn({ clerkId, body }, res, (e) => (e ? reject(e) : resolve()));
    Promise.resolve(r).then(resolve, reject);
  });
  return res;
};

let stored, updates;
const appleClerkUser = { firstName: null, lastName: null, emailAddresses: [{ emailAddress: 'x@privaterelay.appleid.com' }], phoneNumbers: [], imageUrl: '', externalAccounts: [{ provider: 'oauth_apple' }] };
beforeEach(() => {
  updates = [];
  clerkUser = appleClerkUser;
  stored = null;
  User.findOne = () => q(stored);
  User.create = async (d) => { stored = { _id: 'u1', ...d }; return stored; };
  User.updateOne = async (f, u) => { updates.push(u); if (u.$set) Object.assign(stored, u.$set); return {}; };
});

test('Apple name sent after a nameless create is saved over the "New Member" placeholder', async () => {
  await call(C.syncUser, { clerkId: 'c1', body: { firstName: '', lastName: '' } });
  assert.equal(stored.firstName, 'New Member');
  await call(C.syncUser, { clerkId: 'c1', body: { firstName: 'Sam', lastName: 'Lee' } });
  assert.equal(stored.firstName, 'Sam');
  assert.equal(stored.lastName, 'Lee');
});

test('a name sent later fills a blank stored name', async () => {
  stored = { _id: 'u1', clerkId: 'c1', firstName: '', lastName: '' };
  await call(C.syncUser, { clerkId: 'c1', body: { firstName: 'Sam', lastName: '' } });
  assert.equal(stored.firstName, 'Sam');
});

test('a real stored name is never overwritten by sync', async () => {
  stored = { _id: 'u1', clerkId: 'c1', firstName: 'Samantha', lastName: 'Lee' };
  await call(C.syncUser, { clerkId: 'c1', body: { firstName: 'Sam', lastName: 'L' } });
  assert.equal(stored.firstName, 'Samantha');
  assert.equal(stored.lastName, 'Lee');
});

test('an empty sync leaves the placeholder alone', async () => {
  stored = { _id: 'u1', clerkId: 'c1', firstName: 'New Member', lastName: '' };
  await call(C.syncUser, { clerkId: 'c1', body: { firstName: '', lastName: '' } });
  assert.equal(stored.firstName, 'New Member');
  assert.equal(updates.length, 0);
});
