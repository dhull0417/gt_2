// Join requests (approval-gated invite links) and invites sent to phone contacts.
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
const { default: PendingInvite } = await import('../models/pendingInvite.model.js');
const N = await import('./notification.controller.js');
const C = await import('./invite.controller.js');
const { claimPendingInvites } = await import('../utils/pendingInvites.js');

const q = (v) => { const c = { select: () => c, lean: () => c, sort: () => c, populate: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const person = (name, extra = {}) => ({ _id: new mongoose.Types.ObjectId(), clerkId: `c-${name}`, firstName: name, ...extra, updateOne: async () => ({}) });
const call = async (fn, { as, params = {}, body = {} }) => {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await new Promise((resolve, reject) => {
    const r = fn({ clerkId: as.clerkId, params, body, query: {}, headers: {} }, res, (e) => (e ? reject(e) : resolve()));
    Promise.resolve(r).then(resolve, reject);
  });
  return res;
};

let P, users, group, notes, pendings, groupUpdates;
const note = (extra) => {
  const n = { _id: new mongoose.Types.ObjectId(), status: 'pending', ...extra, async save() { return this; } };
  notes.push(n);
  return n;
};
beforeEach(() => {
  pushes.length = 0; added.length = 0;
  P = { owner: person('Olive'), mod: person('Mo'), a: person('Ana'), req: person('Rae'), out: person('Zed') };
  users = Object.values(P);
  group = {
    _id: new mongoose.Types.ObjectId(), name: 'Hikers', isDM: false, inviteRequiresApproval: true,
    owner: P.owner._id, moderators: [P.mod._id], members: [P.owner._id, P.mod._id, P.a._id],
    updateOne: async () => ({}),
  };
  notes = []; pendings = []; groupUpdates = [];
  User.findOne = (f) => q(f.clerkId ? users.find((u) => u.clerkId === f.clerkId) ?? null
    : users.find((u) => f.$or.some((c) => (c.phoneNumber && u.phoneNumber === c.phoneNumber) || (c.email && u.email === c.email))) ?? null);
  User.findById = (id) => q(users.find((u) => String(u._id) === String(id)) ?? null);
  User.updateOne = async () => ({});
  Group.findById = () => q(group);
  Group.updateOne = async (f, u) => { groupUpdates.push(u); if (u.$addToSet?.members) group.members.push(u.$addToSet.members); return {}; };
  Meetup.updateMany = async () => ({});
  Notification.findById = async (id) => notes.find((n) => String(n._id) === String(id)) ?? null;
  Notification.create = async (d) => note(d);
  Notification.exists = async (f) => notes.some((n) => String(n.recipient) === String(f.recipient) && n.type === f.type && n.status === f.status) ? { _id: 1 } : null;
  Notification.updateMany = async (f, u) => {
    notes.filter((n) => n.type === f.type && String(n.sender) === String(f.sender) && n.status === f.status).forEach((n) => Object.assign(n, u.$set));
    return {};
  };
  PendingInvite.updateOne = async (f, u) => {
    const field = f.phoneNumber ? 'phoneNumber' : 'email';
    let p = pendings.find((x) => String(x.groupId) === String(f.groupId) && x[field] === f[field]);
    if (!p) { p = { _id: new mongoose.Types.ObjectId(), ...u.$setOnInsert }; pendings.push(p); }
    Object.assign(p, u.$set);
    return {};
  };
  PendingInvite.find = (f) => q(pendings.filter((p) => f.$or.some((c) => (c.phoneNumber && p.phoneNumber === c.phoneNumber) || (c.email && p.email === c.email))));
  PendingInvite.deleteMany = async (f) => { pendings = pendings.filter((p) => !f._id.$in.some((id) => String(id) === String(p._id))); return {}; };
});

const requestFor = (manager) => note({ recipient: manager._id, sender: P.req._id, group: group._id, type: 'join-request', meta: { meetupId: 'm1' } });

test('approving a join request adds the person, closes every manager\'s copy, and tells them', async () => {
  const toOwner = requestFor(P.owner);
  const toMod = requestFor(P.mod);
  const r = await call(N.acceptInvite, { as: P.mod, params: { id: String(toMod._id) } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(added, [P.req.clerkId]);
  assert.equal(toOwner.status, 'accepted');
  assert.equal(toMod.status, 'accepted');
  const approved = pushes.find((p) => p.type === 'join-approved');
  assert.deepEqual(approved.to, [String(P.req._id)]);
  assert.equal(approved.data.meetupId, 'm1');
  // The other manager can't answer it again.
  const again = await call(N.acceptInvite, { as: P.owner, params: { id: String(toOwner._id) } });
  assert.equal(again.statusCode, 400);
});

test('declining a join request closes it for everyone and adds no one', async () => {
  const toOwner = requestFor(P.owner);
  const toMod = requestFor(P.mod);
  const r = await call(N.declineInvite, { as: P.owner, params: { id: String(toOwner._id) } });
  assert.equal(r.statusCode, 200);
  assert.equal(added.length, 0);
  assert.equal(toMod.status, 'declined');
  assert.equal((await call(N.acceptInvite, { as: P.mod, params: { id: String(toMod._id) } })).statusCode, 400);
});

test('a manager who has since been demoted cannot approve', async () => {
  const toMod = requestFor(P.mod);
  group.moderators = [];
  const r = await call(N.acceptInvite, { as: P.mod, params: { id: String(toMod._id) } });
  assert.equal(r.statusCode, 403);
  assert.equal(added.length, 0);
});

test('contact invites: saved by phone/email, claimed on sign-up as an in-app invitation', async () => {
  assert.equal((await call(C.createContactInvite, { as: P.out, params: { groupId: String(group._id) }, body: { phone: '(801) 555-0100' } })).statusCode, 403);
  assert.equal((await call(C.createContactInvite, { as: P.a, params: { groupId: String(group._id) }, body: { phone: '12' } })).statusCode, 400);
  const r = await call(C.createContactInvite, { as: P.a, params: { groupId: String(group._id) }, body: { phone: '(801) 555-0100', email: 'New@Example.com' } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(pendings.map((p) => p.phoneNumber ?? p.email).sort(), ['+18015550100', 'new@example.com']);

  const newbie = person('Nia', { phoneNumber: '+18015550100', email: 'new@example.com' });
  const n = await claimPendingInvites(newbie);
  assert.equal(n, 1); // one invitation per group, even though both matched
  assert.equal(pushes.at(-1).type, 'group-invite');
  assert.deepEqual(pushes.at(-1).meta, { source: 'contact' });
  assert.equal(String(pushes.at(-1).sender), String(P.a._id));
  assert.equal(pendings.length, 0);
});

test('contact invites from someone who has left the group are dropped', async () => {
  await call(C.createContactInvite, { as: P.a, params: { groupId: String(group._id) }, body: { email: 'x@y.co' } });
  group.members = group.members.filter((m) => String(m) !== String(P.a._id));
  assert.equal(await claimPendingInvites(person('X', { email: 'x@y.co' })), 0);
});

test('a contact invite can be accepted even though the inviter is not a manager', async () => {
  const invitee = person('Nia');
  users.push(invitee);
  const n = note({ recipient: invitee._id, sender: P.a._id, group: group._id, type: 'group-invite', meta: { source: 'contact' } });
  const r = await call(N.acceptInvite, { as: invitee, params: { id: String(n._id) } });
  assert.equal(r.statusCode, 200);
  assert.equal(n.status, 'accepted');
  // Without the contact marker, a non-manager's invitation is still refused (unchanged rule).
  const plain = note({ recipient: invitee._id, sender: P.a._id, group: group._id, type: 'group-invite' });
  assert.equal((await call(N.acceptInvite, { as: invitee, params: { id: String(plain._id) } })).statusCode, 400);
});
