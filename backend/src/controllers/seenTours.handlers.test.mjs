// markTourSeen through the real handler. The User model is stubbed per test.
// First-visit tours (app 1.5+): the app shows a screen's tour until its key is in user.seenTours.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

mock.module('@clerk/express', {
  namedExports: {
    getAuth: (req) => ({ userId: req.clerkId }),
    clerkClient: { users: { getUser: async () => ({}) } },
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
const call = async (fn, { clerkId, params = {} }) => {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await new Promise((resolve, reject) => {
    const r = fn({ clerkId, params, body: {} }, res, (e) => (e ? reject(e) : resolve()));
    Promise.resolve(r).then(resolve, reject);
  });
  return res;
};

let stored, calls;
beforeEach(() => {
  calls = [];
  stored = { _id: 'u1', clerkId: 'c1' }; // an existing user from before tours: no seenTours key
  User.findOneAndUpdate = (filter, update) => {
    calls.push({ filter, update });
    if (filter.clerkId !== stored.clerkId) return q(null);
    const key = update.$addToSet?.seenTours;
    const list = stored.seenTours ?? [];
    if (key && !list.includes(key)) stored.seenTours = [...list, key];
    return q({ seenTours: stored.seenTours });
  };
});

test('the schema gives users an empty seenTours list by default', () => {
  const u = new User({ clerkId: 'x' });
  assert.deepEqual([...u.seenTours], []);
});

test('marking a tour seen adds its key for a user who had none', async () => {
  const res = await call(C.markTourSeen, { clerkId: 'c1', params: { key: 'group-details' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { seenTours: ['group-details'] });
  assert.deepEqual(calls[0].update, { $addToSet: { seenTours: 'group-details' } });
});

test('marking the same tour twice keeps one entry', async () => {
  await call(C.markTourSeen, { clerkId: 'c1', params: { key: 'group-details' } });
  const res = await call(C.markTourSeen, { clerkId: 'c1', params: { key: 'group-details' } });
  assert.deepEqual(res.body.seenTours, ['group-details']);
});

test('keys that are not short lowercase slugs are refused', async () => {
  for (const key of ['', 'Group Details', '$where', 'a'.repeat(41), 'x.y']) {
    const res = await call(C.markTourSeen, { clerkId: 'c1', params: { key } });
    assert.equal(res.statusCode, 400, `key ${JSON.stringify(key)}`);
  }
  assert.equal(calls.length, 0);
});

test('a versioned key such as group-details-v2 is accepted', async () => {
  const res = await call(C.markTourSeen, { clerkId: 'c1', params: { key: 'group-details-v2' } });
  assert.equal(res.statusCode, 200);
});

test('an unknown user gets 404', async () => {
  const res = await call(C.markTourSeen, { clerkId: 'nobody', params: { key: 'group-details' } });
  assert.equal(res.statusCode, 404);
});
