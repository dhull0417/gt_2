// Chat moderation through the real routes: moderator deletes and timeouts.
// Models are stubbed per test; Supabase calls and pushes are captured.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const pushes = [];
const sb = { configured: true, failSet: false, failDelete: false, message: null, latestId: null, calls: [] };
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
    notifyAndPersist: async (users, payload) => { pushes.push({ to: users.map((u) => String(u._id)), users, ...payload }); },
    notifyUsers: async () => {},
    sendPushNotifications: async () => {},
    tokensOf: () => [],
    inQuietHours: () => false,
    userWantsPush: () => true,
    isGroupMuted: () => false,
  },
});
const realSb = await import(new URL('../utils/supabaseAdmin.js?real', import.meta.url).href);
mock.module(new URL('../utils/supabaseAdmin.js', import.meta.url).href, {
  namedExports: {
    ...realSb,
    isConfigured: () => sb.configured,
    setChatTimeoutRow: async (...a) => { sb.calls.push(['set', ...a]); if (sb.failSet) throw new Error('down'); return true; },
    deleteChatTimeoutRow: async (...a) => { sb.calls.push(['del', ...a]); if (sb.failDelete) throw new Error('down'); return true; },
    getChatMessage: async (id) => { sb.calls.push(['get', id]); return sb.message; },
    modDeleteChatMessage: async (m) => { sb.calls.push(['moddel', m.id]); },
    latestChatMessageId: async (g) => { sb.calls.push(['latest', g]); return sb.latestId; },
  },
});

const { default: User } = await import('../models/user.model.js');
const { default: Group } = await import('../models/group.model.js');
const { default: router } = await import('../routes/chat.route.js');

const handler = (method, path) => router.stack.find((l) => l.route?.path === path && l.route.methods[method]).route.stack.at(-1).handle;
const del = handler('delete', '/:groupId/messages/:messageId');
const put = handler('put', '/:groupId/timeouts/:userId');
const clear = handler('delete', '/:groupId/timeouts/:userId');

const q = (v) => { const c = { select: () => c, lean: () => c, populate: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const person = (name) => ({ _id: new mongoose.Types.ObjectId(), clerkId: `c-${name}`, firstName: name, expoPushTokens: [`tok-${name}`] });
const call = async (fn, { as, params, body = {} }) => {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await new Promise((resolve, reject) => {
    const r = fn({ clerkId: as.clerkId, params, body }, res, (e) => (e ? reject(e) : resolve()));
    Promise.resolve(r).then(resolve, reject);
  });
  return res;
};

let P, users, group, groupUpdates;
beforeEach(() => {
  pushes.length = 0;
  Object.assign(sb, { configured: true, failSet: false, failDelete: false, message: null, latestId: null, calls: [] });
  groupUpdates = [];
  P = { owner: person('Olive'), mod: person('Mo'), mod2: person('Mia'), a: person('Ana'), out: person('Zed') };
  users = Object.values(P);
  group = {
    _id: new mongoose.Types.ObjectId(), name: 'Hikers', isDM: false,
    owner: P.owner._id, moderators: [P.mod._id, P.mod2._id],
    members: [P.owner._id, P.mod._id, P.mod2._id, P.a._id],
    chatTimeouts: [],
    lastMessage: { text: 'hi', user: { name: 'Ana', clerkId: P.a.clerkId }, createdAt: new Date('2026-11-16T15:00:00.000Z') },
    saves: 0,
    async save() { this.saves++; this.savedTimeouts = this.chatTimeouts.map((e) => ({ ...e })); return this; },
  };
  User.findOne = (f) => q(users.find((u) => u.clerkId === f.clerkId) ?? null);
  // Honours .select(), so loading a person without their push tokens is caught.
  User.findById = (id) => {
    const u = users.find((x) => String(x._id) === String(id)) ?? null;
    let picked = u;
    const c = { select: (f) => { if (u && typeof f === 'string' && !f.startsWith('-')) { picked = Object.fromEntries(Object.entries(u).filter(([k]) => f.split(/\s+/).includes(k))); } return c; }, lean: () => c, then: (r, j) => Promise.resolve(picked).then(r, j) };
    return c;
  };
  Group.findById = () => q(group);
  Group.updateOne = async (filter, update) => { groupUpdates.push({ filter, update }); return {}; };
});

const timeOut = (as, target, duration) => call(put, { as, params: { groupId: String(group._id), userId: String(target._id) }, body: { duration } });
const endTimeout = (as, target) => call(clear, { as, params: { groupId: String(group._id), userId: String(target._id) } });
const modDelete = (as, messageId = 'm1') => call(del, { as, params: { groupId: String(group._id), messageId } });

// ---------------------------------------------------------------- timeouts

test('owner times out a moderator for 1 hour: saved, copied to Supabase, one push', async () => {
  const before = Date.now();
  const res = await timeOut(P.owner, P.mod, '1h');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.userId, String(P.mod._id));
  const until = new Date(res.body.until).getTime();
  assert.ok(until >= before + 3600_000 && until <= Date.now() + 3600_000);
  assert.equal(group.chatTimeouts.length, 1);
  assert.equal(String(group.chatTimeouts[0].user), String(P.mod._id));
  assert.equal(String(group.chatTimeouts[0].by), String(P.owner._id));
  assert.deepEqual(sb.calls[0].slice(0, 3), ['set', String(group._id), P.mod.clerkId]);
  assert.equal(pushes.length, 1);
  assert.deepEqual(pushes[0].to, [String(P.mod._id)]);
  assert.equal(pushes[0].type, 'chat-timeout');
  assert.equal(pushes[0].title, 'Hikers');
  assert.equal(pushes[0].body, "You've been timed out of the chat for 1 hour.");
  assert.deepEqual(pushes[0].data, { groupId: String(group._id), type: 'chat-timeout' });
  // The push needs the person's tokens, and must not name the moderator.
  assert.deepEqual(pushes[0].users[0].expoPushTokens, ['tok-Mo']);
  assert.equal(pushes[0].sender, undefined);
  assert.deepEqual(pushes[0].meta, { duration: '1h' });
});

test('indefinite timeout has until null', async () => {
  const res = await timeOut(P.mod, P.a, 'indefinite');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.until, null);
  assert.equal(group.chatTimeouts[0].until, null);
  assert.equal(sb.calls[0][3], null);
  assert.equal(pushes[0].body, "You've been timed out of the chat until a moderator lifts it.");
});

test('a moderator cannot time out another moderator or the owner', async () => {
  assert.equal((await timeOut(P.mod, P.mod2, '5m')).statusCode, 403);
  assert.equal((await timeOut(P.mod, P.owner, '5m')).statusCode, 403);
  assert.equal(group.chatTimeouts.length, 0);
  assert.equal(sb.calls.length, 0);
  assert.equal(pushes.length, 0);
});

test('a regular member cannot time anyone out', async () => {
  const other = person('Bo'); users.push(other); group.members.push(other._id);
  assert.equal((await timeOut(P.a, other, '5m')).statusCode, 403);
});

test('nobody times themself out', async () => {
  assert.equal((await timeOut(P.owner, P.owner, '5m')).statusCode, 400);
});

test('unknown duration is rejected', async () => {
  assert.equal((await timeOut(P.owner, P.a, '2d')).statusCode, 400);
  assert.equal((await timeOut(P.owner, P.a, undefined)).statusCode, 400);
});

test('target must be a member of the group', async () => {
  assert.equal((await timeOut(P.owner, P.out, '5m')).statusCode, 404);
});

test('no timeouts in a DM', async () => {
  group.isDM = true;
  assert.equal((await timeOut(P.owner, P.a, '5m')).statusCode, 400);
});

test('503 when chat moderation is not set up', async () => {
  sb.configured = false;
  const res = await timeOut(P.owner, P.a, '5m');
  assert.equal(res.statusCode, 503);
  assert.equal(group.chatTimeouts.length, 0);
});

test('Supabase failure rolls the Mongo change back (502)', async () => {
  const keep = { user: P.mod2._id, until: null, by: P.owner._id, createdAt: new Date() };
  group.chatTimeouts = [keep];
  sb.failSet = true;
  const errLog = console.error; console.error = () => {};
  try {
    const res = await timeOut(P.owner, P.a, '1d');
    assert.equal(res.statusCode, 502);
  } finally { console.error = errLog; }
  assert.equal(group.chatTimeouts.length, 1);
  assert.equal(String(group.chatTimeouts[0].user), String(P.mod2._id));
  assert.deepEqual(group.savedTimeouts.map((e) => String(e.user)), [String(P.mod2._id)]);
  assert.equal(pushes.length, 0);
});

test('timing out again replaces the old timeout; expired entries are pruned', async () => {
  group.chatTimeouts = [{ user: P.mod2._id, until: new Date(Date.now() - 1000), by: P.owner._id }];
  await timeOut(P.mod, P.a, '5m');
  await timeOut(P.mod, P.a, '1w');
  assert.equal(group.chatTimeouts.length, 1);
  assert.ok(new Date(group.chatTimeouts[0].until).getTime() > Date.now() + 6 * 864e5);
});

test('ending a timeout removes it in both places, no push', async () => {
  group.chatTimeouts = [{ user: P.a._id, until: null, by: P.owner._id }];
  const res = await endTimeout(P.mod, P.a);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { userId: String(P.a._id), until: null });
  assert.equal(group.chatTimeouts.length, 0);
  assert.deepEqual(sb.calls[0], ['del', String(group._id), P.a.clerkId]);
  assert.equal(pushes.length, 0);
});

test('ending follows the same permission rule and rolls back on failure', async () => {
  group.chatTimeouts = [{ user: P.mod2._id, until: null, by: P.owner._id }];
  assert.equal((await endTimeout(P.mod, P.mod2)).statusCode, 403);
  sb.failDelete = true;
  const errLog = console.error; console.error = () => {};
  try { assert.equal((await endTimeout(P.owner, P.mod2)).statusCode, 502); } finally { console.error = errLog; }
  assert.equal(group.chatTimeouts.length, 1);
});

// ---------------------------------------------------------------- deletes

const msg = (over = {}) => ({ id: 'm1', group_id: String(group._id), sender_id: P.owner.clerkId, image_url: null, deleted_at: null, created_at: '2026-11-16T14:00:00Z', ...over });

test('a moderator deletes a regular member\'s message', async () => {
  sb.message = msg({ sender_id: P.a.clerkId });
  const res = await modDelete(P.mod);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(sb.calls.map((c) => c[0]), ['get', 'moddel', 'latest']);
});

test('a moderator cannot delete the owner\'s message', async () => {
  sb.message = msg({ sender_id: P.owner.clerkId });
  const res = await modDelete(P.mod);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "Moderators can't delete the owner's or other moderators' messages.");
  assert.ok(!sb.calls.some((c) => c[0] === 'moddel'));
});

test('a moderator cannot delete another moderator\'s message', async () => {
  sb.message = msg({ sender_id: P.mod2.clerkId });
  assert.equal((await modDelete(P.mod)).statusCode, 403);
  assert.ok(!sb.calls.some((c) => c[0] === 'moddel'));
});

test('the owner deletes a moderator\'s message', async () => {
  sb.message = msg({ sender_id: P.mod.clerkId });
  assert.equal((await modDelete(P.owner)).statusCode, 200);
  assert.ok(sb.calls.some((c) => c[0] === 'moddel'));
});

test('a moderator deletes a message from someone who has left or deleted their account', async () => {
  sb.message = msg({ sender_id: 'c-gone' });
  assert.equal((await modDelete(P.mod)).statusCode, 200);
  assert.ok(sb.calls.some((c) => c[0] === 'moddel'));
});

test('a message from another group is 404 and nothing is written', async () => {
  sb.message = msg({ group_id: 'some-other-group' });
  assert.equal((await modDelete(P.owner)).statusCode, 404);
  assert.deepEqual(sb.calls.map((c) => c[0]), ['get']);
});

test('missing message is 404', async () => {
  sb.message = null;
  assert.equal((await modDelete(P.owner)).statusCode, 404);
});

test('a regular member cannot use the moderator delete', async () => {
  sb.message = msg();
  assert.equal((await modDelete(P.a)).statusCode, 403);
  assert.equal(sb.calls.length, 0);
});

test('already deleted is a no-op 200', async () => {
  sb.message = msg({ deleted_at: '2026-11-16T14:05:00Z' });
  assert.equal((await modDelete(P.owner)).statusCode, 200);
  assert.deepEqual(sb.calls.map((c) => c[0]), ['get']);
});

test('no moderator delete in a DM', async () => {
  group.isDM = true;
  sb.message = msg();
  assert.equal((await modDelete(P.owner)).statusCode, 400);
});

test('deleting the latest message changes the group list preview, whatever its timestamp', async () => {
  // lastMessage.createdAt is stamped by the server when the app reports the send, often seconds later.
  sb.message = msg({ id: 'm9', sender_id: P.a.clerkId, created_at: '2026-11-16T14:59:20Z' });
  sb.latestId = 'm9';
  await modDelete(P.owner);
  assert.equal(groupUpdates.length, 1);
  assert.deepEqual(groupUpdates[0].update, { $set: { 'lastMessage.text': 'Message deleted' } });
});

test('deleting an older message leaves the preview alone', async () => {
  sb.message = msg({ id: 'm1', sender_id: P.a.clerkId });
  sb.latestId = 'm2';
  await modDelete(P.owner);
  assert.equal(groupUpdates.length, 0);
});

test('a timed-out moderator cannot delete messages', async () => {
  group.chatTimeouts = [{ user: P.mod._id, until: null, by: P.owner._id }];
  sb.message = msg({ sender_id: P.a.clerkId });
  assert.equal((await modDelete(P.mod)).statusCode, 403);
  assert.ok(!sb.calls.some((c) => c[0] === 'moddel'));
});

test('503 for deletes when not set up', async () => {
  sb.configured = false;
  sb.message = msg();
  assert.equal((await modDelete(P.owner)).statusCode, 503);
});
