// Invite links through the real handlers. Models are stubbed per test.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const pushes = [];
const added = [];
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
    notifyAndPersist: async (users, payload) => { pushes.push({ to: users.map((u) => String(u._id)), ...payload }); },
    notifyUsers: async () => {},
  },
});
mock.module(new URL('../utils/supabaseAdmin.js', import.meta.url).href, {
  namedExports: { addChatMembers: async (g, ids) => { added.push(...ids); } },
});
mock.module(new URL('../utils/email/lifecycle.js', import.meta.url).href, {
  namedExports: { onInviteRedeemed: async () => {} },
});
mock.module(new URL('../utils/systemMessage.js', import.meta.url).href, {
  namedExports: { postSystemMessage: async () => {} },
});

const { default: User } = await import('../models/user.model.js');
const { default: Group } = await import('../models/group.model.js');
const { default: Meetup } = await import('../models/meetup.model.js');
const { default: Notification } = await import('../models/notification.model.js');
const { default: InviteToken } = await import('../models/inviteToken.model.js');
const { default: InviteEvent } = await import('../models/inviteEvent.model.js');
const C = await import('./invite.controller.js');

const q = (v) => { const c = { select: () => c, lean: () => c, sort: () => c, populate: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const person = (name) => ({ _id: new mongoose.Types.ObjectId(), clerkId: `c-${name}`, firstName: name });
const call = async (fn, { as, params = {}, body = {}, query = {}, headers = {} }) => {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await new Promise((resolve, reject) => {
    const r = fn({ clerkId: as.clerkId, params, body, query, headers }, res, (e) => (e ? reject(e) : resolve()));
    Promise.resolve(r).then(resolve, reject);
  });
  return res;
};

let P, users, group, tokens, events, notes, groupUpdates, meetups;
beforeEach(() => {
  pushes.length = 0; added.length = 0;
  P = { owner: person('Olive'), mod: person('Mo'), a: person('Ana'), out: person('Zed') };
  users = Object.values(P);
  group = {
    _id: new mongoose.Types.ObjectId(), name: 'Hikers', image: 'https://img/h.jpg', isDM: false,
    owner: P.owner._id, moderators: [P.mod._id], members: [P.owner._id, P.mod._id, P.a._id],
    inviteRequiresApproval: false,
  };
  tokens = []; events = []; notes = []; groupUpdates = []; meetups = [];
  const match = (t, f) => Object.entries(f).every(([k, v]) => {
    if (k === '$or') return true;
    if (v && typeof v === 'object' && '$exists' in v) return (t[k] !== undefined) === v.$exists;
    if (v === null) return t[k] == null;
    return String(t[k]) === String(v);
  });
  User.findOne = (f) => q(users.find((u) => u.clerkId === f.clerkId) ?? null);
  User.findById = (id) => q(users.find((u) => String(u._id) === String(id)) ?? null);
  User.find = (f) => q(users.filter((u) => f._id.$in.some((id) => String(id) === String(u._id))));
  User.updateOne = async () => ({});
  Group.findById = () => q(group);
  Group.updateOne = async (filter, update) => { groupUpdates.push(update); if (update.$set) Object.assign(group, update.$set); return {}; };
  Meetup.findOne = (f) => q(meetups.find((m) => String(m._id) === String(f._id) && String(m.group) === String(f.group)) ?? null);
  Meetup.updateMany = async () => ({});
  Notification.exists = async (f) => notes.some((n) => String(n.sender) === String(f.sender) && n.type === f.type && n.status === f.status) ? { _id: 'x' } : null;
  InviteEvent.create = async (e) => { events.push(e); return e; };
  InviteEvent.countDocuments = async (f) => events.filter((e) => e.type === f.type).length;
  InviteToken.findOne = (f) => q([...tokens].reverse().find((t) => match(t, f)) ?? null);
  InviteToken.findById = (id) => q(tokens.find((t) => String(t._id) === String(id)) ?? null);
  InviteToken.create = async (doc) => { const t = { _id: new mongoose.Types.ObjectId(), createdAt: new Date(), ...doc }; tokens.push(t); return t; };
  InviteToken.updateMany = async (f, u) => { tokens.filter((t) => match(t, f)).forEach((t) => Object.assign(t, u.$set)); return {}; };
  InviteToken.findOneAndUpdate = async (f, u) => {
    const t = tokens.find((x) => String(x._id) === String(f._id));
    if (!t) return null;
    if (f.revokedAt === null && t.revokedAt) return null;
    if (f.$or && t.maxUses != null && (t.uses ?? 0) >= t.maxUses) return null;
    if (f.code?.$exists === false && t.code) return null;
    if (u.$set) Object.assign(t, u.$set);
    if (u.$inc) for (const [k, v] of Object.entries(u.$inc)) t[k] = (t[k] ?? 0) + v;
    return t;
  };
});

const seedToken = (extra = {}) => { const t = { _id: new mongoose.Types.ObjectId(), token: 'a'.repeat(32), code: 'K7P2QX', groupId: group._id, createdBy: P.owner._id, expiresAt: null, revokedAt: null, maxUses: null, uses: 0, createdAt: new Date(), ...extra }; tokens.push(t); return t; };
const gid = () => String(group._id);

test('generateInviteLink: members get a stable link with a code; managers also get stats', async () => {
  const r1 = await call(C.generateInviteLink, { as: P.a, params: { groupId: gid() } });
  assert.equal(r1.statusCode, 200);
  assert.match(r1.body.link, /^https:\/\/invite\.groupthatapp\.com\/join\/[a-f0-9]{32}$/);
  assert.match(r1.body.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(r1.body.canManage, false);
  assert.equal(r1.body.stats, undefined);
  assert.equal(tokens[0].expiresAt, null);
  const r2 = await call(C.generateInviteLink, { as: P.owner, params: { groupId: gid() } });
  assert.equal(r2.body.link, r1.body.link); // same link every time
  assert.equal(r2.body.canManage, true);
  assert.deepEqual(r2.body.stats, { days: 30, views: 0, joins: 0, requests: 0 });
  assert.equal(tokens.length, 1);
});

test('generateInviteLink makes an old expiring token permanent and gives it a code', async () => {
  const old = seedToken({ code: undefined, expiresAt: new Date(Date.now() + 3600_000) });
  const r = await call(C.generateInviteLink, { as: P.a, params: { groupId: gid() } });
  assert.equal(r.body.token, old.token);
  assert.equal(old.expiresAt, null);
  assert.match(old.code, /^[A-Z2-9]{8}$/);
});

test('generateInviteLink swaps an old 6-character code for an 8-character one, same link', async () => {
  const old = seedToken({ code: 'K7P2QX' });
  const r = await call(C.generateInviteLink, { as: P.a, params: { groupId: gid() } });
  assert.equal(r.body.token, old.token);
  assert.match(r.body.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(old.code, r.body.code);
  assert.equal(tokens.length, 1);
});

test('generateInviteLink refuses non-members', async () => {
  const r = await call(C.generateInviteLink, { as: P.out, params: { groupId: gid() } });
  assert.equal(r.statusCode, 403);
});

test('resetInviteLink: managers only; old link dies, new one keeps the limit', async () => {
  const old = seedToken({ maxUses: 25, uses: 7 });
  assert.equal((await call(C.resetInviteLink, { as: P.a, params: { groupId: gid() } })).statusCode, 403);
  const r = await call(C.resetInviteLink, { as: P.mod, params: { groupId: gid() } });
  assert.equal(r.statusCode, 200);
  assert.ok(old.revokedAt instanceof Date);
  assert.notEqual(r.body.token, old.token);
  assert.equal(r.body.maxUses, 25);
  assert.equal(r.body.uses, 0);
});

test('updateInviteSettings validates and saves approval and max uses', async () => {
  seedToken();
  assert.equal((await call(C.updateInviteSettings, { as: P.a, params: { groupId: gid() }, body: { requiresApproval: true } })).statusCode, 403);
  assert.equal((await call(C.updateInviteSettings, { as: P.owner, params: { groupId: gid() }, body: { maxUses: 0 } })).statusCode, 400);
  assert.equal((await call(C.updateInviteSettings, { as: P.owner, params: { groupId: gid() }, body: { requiresApproval: 'yes' } })).statusCode, 400);
  const r = await call(C.updateInviteSettings, { as: P.owner, params: { groupId: gid() }, body: { requiresApproval: true, maxUses: 50 } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.requiresApproval, true);
  assert.equal(r.body.maxUses, 50);
  const r2 = await call(C.updateInviteSettings, { as: P.owner, params: { groupId: gid() }, body: { maxUses: null } });
  assert.equal(r2.body.maxUses, null);
});

test('redeem: dead links explain why', async () => {
  assert.equal((await call(C.redeemInviteToken, { as: P.out, params: { token: 'nope' } })).statusCode, 404);
  seedToken({ revokedAt: new Date() });
  const r = await call(C.redeemInviteToken, { as: P.out, params: { token: 'a'.repeat(32) } });
  assert.equal(r.statusCode, 410);
  assert.equal(r.body.error, 'This invite link is no longer active.');
  assert.equal(r.body.reason, 'revoked');
});

test('redeem: joins by code, records the source, and only passes back a meetup from this group', async () => {
  seedToken();
  const meetup = { _id: new mongoose.Types.ObjectId(), group: group._id, name: 'Hike', status: 'scheduled' };
  meetups.push(meetup);
  const r = await call(C.redeemInviteToken, { as: P.out, params: { token: 'k7p2qx' }, body: { source: 'code', meetupId: String(meetup._id) } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.alreadyMember, false);
  assert.equal(String(r.body.meetupId), String(meetup._id));
  assert.deepEqual(added, [P.out.clerkId]);
  assert.equal(events.at(-1).type, 'join');
  assert.equal(events.at(-1).source, 'code');
  assert.equal(tokens[0].uses, 1);
  assert.equal(pushes[0].type, 'group-member-joined');

  const other = await call(C.redeemInviteToken, { as: P.out, params: { token: 'K7P2QX' }, body: { meetupId: String(new mongoose.Types.ObjectId()) } });
  assert.equal(other.body.meetupId, null);
});

test('redeem: people already in the group do not use up a limited link', async () => {
  seedToken({ maxUses: 1, uses: 0 });
  const r = await call(C.redeemInviteToken, { as: P.a, params: { token: 'a'.repeat(32) } });
  assert.equal(r.body.alreadyMember, true);
  assert.equal(tokens[0].uses, 0);
  const joined = await call(C.redeemInviteToken, { as: P.out, params: { token: 'a'.repeat(32) } });
  assert.equal(joined.statusCode, 200);
  users.push(person('Yan'));
  const full = await call(C.redeemInviteToken, { as: users.at(-1), params: { token: 'a'.repeat(32) } });
  assert.equal(full.statusCode, 410);
  assert.equal(full.body.error, 'This invite link has reached its limit.');
});

test('redeem with approval: old apps are told to update; new apps create one join request for the managers', async () => {
  seedToken();
  group.inviteRequiresApproval = true;
  const old = await call(C.redeemInviteToken, { as: P.out, params: { token: 'a'.repeat(32) } });
  assert.equal(old.statusCode, 403);
  assert.match(old.body.error, /Update GroupThat/);

  const r = await call(C.redeemInviteToken, { as: P.out, params: { token: 'a'.repeat(32) }, body: { supportsApproval: true } });
  assert.equal(r.statusCode, 202);
  assert.equal(r.body.pending, true);
  assert.equal(added.length, 0);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].type, 'join-request');
  assert.deepEqual(pushes[0].to.sort(), [String(P.owner._id), String(P.mod._id)].sort());
  assert.equal(events.at(-1).type, 'join_requested');

  notes.push({ sender: P.out._id, type: 'join-request', status: 'pending' });
  const again = await call(C.redeemInviteToken, { as: P.out, params: { token: 'a'.repeat(32) }, body: { supportsApproval: true } });
  assert.equal(again.statusCode, 202);
  assert.equal(pushes.length, 1); // no second request
  assert.equal(tokens[0].uses, 1);
});

test('preview: shows the group, meetup and inviter (only a real member) without joining', async () => {
  seedToken();
  const meetup = { _id: new mongoose.Types.ObjectId(), group: group._id, name: 'Hike', date: new Date(), time: '9:00 AM', timezone: 'America/Denver', status: 'scheduled' };
  meetups.push(meetup);
  const r = await call(C.getInvitePreview, { as: P.out, params: { token: 'a'.repeat(32) }, query: { m: String(meetup._id), r: String(P.a._id) } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.groupName, 'Hikers');
  assert.equal(r.body.memberCount, 3);
  assert.equal(r.body.alreadyMember, false);
  assert.equal(r.body.inviterName, 'Ana');
  assert.equal(r.body.meetup.name, 'Hike');
  assert.equal(added.length, 0);
  const stranger = await call(C.getInvitePreview, { as: P.out, params: { token: 'a'.repeat(32) }, query: { r: String(P.out._id) } });
  assert.equal(stranger.body.inviterName, null);
  tokens[0].maxUses = 1; tokens[0].uses = 1;
  assert.equal((await call(C.getInvitePreview, { as: P.out, params: { token: 'a'.repeat(32) } })).statusCode, 410);
});

test('public tap events: only store/open taps on live links are recorded', async () => {
  const { postInviteEvent } = await import('../routes/invite.route.js');
  const send = async (body) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
    await postInviteEvent({ body }, res);
    return res;
  };
  assert.equal((await send({ token: 'a'.repeat(32), type: 'join' })).statusCode, 400);
  assert.equal((await send({ token: 'a'.repeat(32), type: 'store_tap' })).statusCode, 204);
  assert.equal(events.length, 0); // no such link yet
  seedToken();
  await send({ token: 'a'.repeat(32), type: 'store_tap', platform: 'ios' });
  assert.deepEqual([events[0].type, events[0].platform, events[0].source], ['store_tap', 'ios', 'link']);
});
