import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import { getAuth } from "@clerk/express";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import Meetup from "../models/meetup.model.js";
import Notification from "../models/notification.model.js";
import InviteToken from "../models/inviteToken.model.js";
import InviteEvent, { INVITE_SOURCES } from "../models/inviteEvent.model.js";
import PendingInvite from "../models/pendingInvite.model.js";
import { claimPendingInvites, PENDING_INVITE_DAYS } from "../utils/pendingInvites.js";
import { normalizePhone } from "../utils/phone.js";
import { addChatMembers } from "../utils/supabaseAdmin.js";
import { notifyAndPersist } from "../utils/push.notifications.js";
import { onInviteRedeemed } from "../utils/email/lifecycle.js";
import { postSystemMessage } from "../utils/systemMessage.js";
import {
  generateInviteCode, generateInviteToken, isInviteCode, isLegacyInviteCode, normalizeInviteCode, inviteStatus,
  DEAD_INVITE_MESSAGES, TOKEN_RE, inviteLinkFor,
} from "../utils/invites.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id)) && String(new mongoose.Types.ObjectId(String(id))) === String(id);
const sameId = (a, b) => a != null && b != null && a.toString() === b.toString();
const isMember = (group, userId) => (group.members || []).some((m) => sameId(m, userId));
const canManage = (group, userId) => sameId(group.owner, userId) || (group.moderators || []).some((m) => sameId(m, userId));

export const MAX_USES_LIMIT = 1000;
const STATS_DAYS = 30;

/** Looks an invite up by its token or its 8-character code (or a 6-character one from before). */
export const findInvite = async (tokenOrCode) => {
  const raw = String(tokenOrCode ?? '').trim();
  if (isInviteCode(raw)) return InviteToken.findOne({ code: normalizeInviteCode(raw) });
  if (TOKEN_RE.test(raw)) return InviteToken.findOne({ token: raw });
  return null;
};

/** Gives a token a code (or swaps an old 6-character one for 8), retrying on the (rare) duplicate. */
const ensureCode = async (invite) => {
  if (invite.code && !isLegacyInviteCode(invite.code)) return invite;
  const unchanged = invite.code ? invite.code : { $exists: false };
  for (let i = 0; i < 5; i++) {
    try {
      const code = generateInviteCode();
      const updated = await InviteToken.findOneAndUpdate({ _id: invite._id, code: unchanged }, { $set: { code } }, { new: true });
      if (updated) return updated;
      return (await InviteToken.findById(invite._id)) ?? invite;
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  return invite;
};

const createInvite = async (groupId, createdBy, { maxUses = null } = {}) => {
  for (let i = 0; i < 5; i++) {
    try {
      return await InviteToken.create({
        token: generateInviteToken(), code: generateInviteCode(), groupId, createdBy, expiresAt: null, maxUses, uses: 0,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  throw new Error('Could not create an invite link.');
};

/**
 * The group's current link: the newest token that hasn't been revoked. Older tokens that still
 * carry an expiry are made permanent here, so a link shared today can't die tomorrow.
 */
export const currentInvite = async (groupId, userId) => {
  let invite = await InviteToken.findOne({ groupId, revokedAt: null }).sort({ createdAt: -1, _id: -1 });
  if (invite && inviteStatus(invite) === 'expired') invite = null;
  if (!invite) return createInvite(groupId, userId);
  if (invite.expiresAt) {
    invite = (await InviteToken.findOneAndUpdate({ _id: invite._id }, { $set: { expiresAt: null } }, { new: true })) ?? invite;
  }
  return ensureCode(invite);
};

const inviteStats = async (groupId) => {
  const since = new Date(Date.now() - STATS_DAYS * 24 * 60 * 60 * 1000);
  const [views, joins, requests] = await Promise.all([
    InviteEvent.countDocuments({ groupId, type: 'view', createdAt: { $gte: since } }),
    InviteEvent.countDocuments({ groupId, type: 'join', createdAt: { $gte: since } }),
    InviteEvent.countDocuments({ groupId, type: 'join_requested', createdAt: { $gte: since } }),
  ]);
  return { days: STATS_DAYS, views, joins, requests };
};

const inviteResponse = async (invite, group, user) => {
  const manager = canManage(group, user._id);
  return {
    link: inviteLinkFor(invite.token),
    token: invite.token,
    code: invite.code ?? null,
    requiresApproval: !!group.inviteRequiresApproval,
    maxUses: invite.maxUses ?? null,
    uses: invite.uses ?? 0,
    canManage: manager,
    ...(manager ? { stats: await inviteStats(group._id) } : {}),
  };
};

const loadMemberContext = async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { groupId } = req.params;
  if (!isValidId(groupId)) { res.status(400).json({ error: "Invalid group." }); return null; }
  const [user, group] = await Promise.all([User.findOne({ clerkId }), Group.findById(groupId)]);
  if (!user || !group) { res.status(404).json({ error: "Resource not found." }); return null; }
  if (!isMember(group, user._id)) { res.status(403).json({ error: "You must be a group member to generate an invite link." }); return null; }
  if (group.isDM) { res.status(400).json({ error: "Direct messages don't have invite links." }); return null; }
  return { user, group };
};

/** @route POST /api/groups/:groupId/invite-link — the group's link, code and settings. */
export const generateInviteLink = asyncHandler(async (req, res) => {
  const ctx = await loadMemberContext(req, res);
  if (!ctx) return;
  const invite = await currentInvite(ctx.group._id, ctx.user._id);
  res.status(200).json(await inviteResponse(invite, ctx.group, ctx.user));
});

/** @route POST /api/groups/:groupId/invite-link/reset — owners/moderators: old link and code stop working. */
export const resetInviteLink = asyncHandler(async (req, res) => {
  const ctx = await loadMemberContext(req, res);
  if (!ctx) return;
  if (!canManage(ctx.group, ctx.user._id)) return res.status(403).json({ error: "Only owners and moderators can reset the invite link." });
  const previous = await InviteToken.findOne({ groupId: ctx.group._id, revokedAt: null }).sort({ createdAt: -1, _id: -1 });
  await InviteToken.updateMany({ groupId: ctx.group._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  const invite = await createInvite(ctx.group._id, ctx.user._id, { maxUses: previous?.maxUses ?? null });
  res.status(200).json(await inviteResponse(invite, ctx.group, ctx.user));
});

/** @route PUT /api/groups/:groupId/invite-settings  @body { requiresApproval?, maxUses? (null = unlimited) } */
export const updateInviteSettings = asyncHandler(async (req, res) => {
  const ctx = await loadMemberContext(req, res);
  if (!ctx) return;
  if (!canManage(ctx.group, ctx.user._id)) return res.status(403).json({ error: "Only owners and moderators can change invite settings." });
  const { requiresApproval, maxUses } = req.body ?? {};
  if (requiresApproval !== undefined && typeof requiresApproval !== 'boolean') return res.status(400).json({ error: "requiresApproval must be true or false." });
  if (maxUses !== undefined && maxUses !== null && !(Number.isInteger(maxUses) && maxUses >= 1 && maxUses <= MAX_USES_LIMIT)) {
    return res.status(400).json({ error: `maxUses must be a whole number from 1 to ${MAX_USES_LIMIT}, or null for unlimited.` });
  }

  if (requiresApproval !== undefined) {
    await Group.updateOne({ _id: ctx.group._id }, { $set: { inviteRequiresApproval: requiresApproval } });
    ctx.group.inviteRequiresApproval = requiresApproval;
  }
  let invite = await currentInvite(ctx.group._id, ctx.user._id);
  if (maxUses !== undefined) {
    invite = (await InviteToken.findOneAndUpdate({ _id: invite._id }, { $set: { maxUses } }, { new: true })) ?? invite;
  }
  res.status(200).json(await inviteResponse(invite, ctx.group, ctx.user));
});

const meetupForInvite = async (meetupId, groupId) => {
  if (!meetupId || !isValidId(meetupId)) return null;
  const meetup = await Meetup.findOne({ _id: meetupId, group: groupId }).select('name date time timezone location status').lean();
  if (!meetup || meetup.status === 'cancelled') return null;
  return meetup;
};

const deadInvite = (res, status) => res.status(status === 'missing' ? 404 : 410).json({ error: DEAD_INVITE_MESSAGES[status], reason: status });

/**
 * @route GET /api/groups/invite/:token?m=<meetupId>&r=<userId> — what the person is about to join.
 * `:token` may also be the invite code.
 */
export const getInvitePreview = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const invite = await findInvite(req.params.token);
  const status = inviteStatus(invite);
  if (status !== 'active') return deadInvite(res, status);

  const [user, group] = await Promise.all([User.findOne({ clerkId }), Group.findById(invite.groupId)]);
  if (!user || !group) return res.status(404).json({ error: DEAD_INVITE_MESSAGES.missing, reason: 'missing' });

  const [meetup, inviter, pendingRequest] = await Promise.all([
    meetupForInvite(req.query?.m, group._id),
    req.query?.r && isValidId(req.query.r) && isMember(group, req.query.r)
      ? User.findById(req.query.r).select('firstName').lean()
      : null,
    Notification.exists({ sender: user._id, group: group._id, type: 'join-request', status: 'pending' }),
  ]);

  res.status(200).json({
    token: invite.token,
    groupId: group._id,
    groupName: group.name,
    image: group.image || null,
    memberCount: (group.members || []).length,
    requiresApproval: !!group.inviteRequiresApproval,
    alreadyMember: isMember(group, user._id),
    pendingRequest: !!pendingRequest,
    inviterName: inviter?.firstName || null,
    meetup: meetup ? { _id: meetup._id, name: meetup.name, date: meetup.date, time: meetup.time, timezone: meetup.timezone } : null,
  });
});

/** Adds someone to a group: membership, chat, upcoming meetups, owner notice and a chat line. */
export const addMemberViaInvite = async (group, user, { noticeBody } = {}) => {
  await Group.updateOne({ _id: group._id }, { $addToSet: { members: user._id } });
  await User.updateOne({ _id: user._id }, { $addToSet: { groups: group._id } });
  await addChatMembers(group._id, [user.clerkId]);
  await onInviteRedeemed(user._id, group._id); // remembered for the welcome email

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await Meetup.updateMany(
    { group: group._id, date: { $gte: today } },
    { $addToSet: { members: user._id, undecided: user._id } }
  );

  const owner = await User.findById(group.owner);
  if (owner && !sameId(owner._id, user._id)) {
    try {
      await notifyAndPersist([owner], {
        title: "New Member",
        body: noticeBody ?? `${user.firstName} joined "${group.name}" via invite link.`,
        data: { groupId: group._id.toString(), type: 'group-member-joined' },
        type: 'group-member-joined',
        sender: user._id,
        group: group._id,
      });
    } catch (err) { console.error(err); }
  }

  await postSystemMessage(group._id, `${user.firstName} joined the group`);
};

const platformOf = (req) => {
  const ua = String(req.headers?.['user-agent'] ?? '');
  if (/iPhone|iPad|iPod|CFNetwork|Darwin/i.test(ua)) return 'ios';
  if (/Android|okhttp/i.test(ua)) return 'android';
  return 'unknown';
};

export const recordInviteEvent = async (event) => {
  try { await InviteEvent.create(event); } catch (err) { console.error('invite event', err?.message); }
};

/**
 * @route POST /api/groups/join/:token  @body { meetupId?, source?, supportsApproval? }
 * `:token` may also be the invite code. Groups that approve new members get a join request
 * instead; app builds that can't show "waiting for approval" (no supportsApproval) are told to update.
 */
export const redeemInviteToken = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const invite = await findInvite(req.params.token);
  const status = inviteStatus(invite);
  if (status !== 'active') return deadInvite(res, status);

  const [user, group] = await Promise.all([User.findOne({ clerkId }), Group.findById(invite.groupId)]);
  if (!user || !group) return res.status(404).json({ error: DEAD_INVITE_MESSAGES.missing, reason: 'missing' });

  const body = req.body ?? {};
  const meetup = await meetupForInvite(body.meetupId, group._id);
  const meetupId = meetup?._id ?? null;
  const source = INVITE_SOURCES.includes(body.source) ? body.source : 'link';
  const base = { groupId: group._id, groupName: group.name, meetupId };

  // Already in: nothing to do, and it doesn't count against the link's limit.
  if (isMember(group, user._id)) return res.status(200).json({ ...base, alreadyMember: true });

  if (group.inviteRequiresApproval) {
    if (body.supportsApproval !== true) {
      return res.status(403).json({ error: "This group approves new members. Update GroupThat to ask to join." });
    }
    const already = await Notification.exists({ sender: user._id, group: group._id, type: 'join-request', status: 'pending' });
    if (already) return res.status(202).json({ ...base, alreadyMember: false, pending: true });
  }

  // Count the use atomically so a link with a limit can't be overrun by people joining at once.
  const counted = await InviteToken.findOneAndUpdate(
    { _id: invite._id, revokedAt: null, $or: [{ maxUses: null }, { $expr: { $lt: ['$uses', '$maxUses'] } }] },
    { $inc: { uses: 1 } },
    { new: true }
  );
  if (!counted) return deadInvite(res, 'maxed');

  if (group.inviteRequiresApproval) {
    const managers = await User.find({ _id: { $in: [group.owner, ...(group.moderators || [])] } });
    await notifyAndPersist(managers, {
      title: "Join request",
      body: `${user.firstName} asked to join "${group.name}".`,
      data: { groupId: group._id.toString(), type: 'join-request' },
      type: 'join-request',
      sender: user._id,
      group: group._id,
      meta: meetupId ? { meetupId: meetupId.toString() } : undefined,
    });
    await recordInviteEvent({ groupId: group._id, token: invite.token, type: 'join_requested', platform: platformOf(req), source, user: user._id });
    return res.status(202).json({ ...base, alreadyMember: false, pending: true });
  }

  await addMemberViaInvite(group, user);
  await recordInviteEvent({ groupId: group._id, token: invite.token, type: 'join', platform: platformOf(req), source, user: user._id });
  res.status(200).json({ ...base, alreadyMember: false });
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @route POST /api/groups/:groupId/contact-invite  @body { phone?, email? }
 * Called when a member texts the invite link to a contact who isn't on GroupThat. If that person
 * later signs up with this number or email, they get an in-app invitation even if the link got lost.
 */
export const createContactInvite = asyncHandler(async (req, res) => {
  const ctx = await loadMemberContext(req, res);
  if (!ctx) return;
  const phoneNumber = req.body?.phone ? normalizePhone(req.body.phone) : null;
  const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const email = EMAIL_RE.test(rawEmail) && rawEmail.length <= 254 ? rawEmail : null;
  if (!phoneNumber && !email) return res.status(400).json({ error: "A valid phone number or email is required." });

  const expiresAt = new Date(Date.now() + PENDING_INVITE_DAYS * 24 * 60 * 60 * 1000);
  const upsert = (field, value) => PendingInvite.updateOne(
    { groupId: ctx.group._id, [field]: value },
    { $set: { inviter: ctx.user._id, expiresAt }, $setOnInsert: { groupId: ctx.group._id, [field]: value } },
    { upsert: true }
  );
  if (phoneNumber) await upsert('phoneNumber', phoneNumber);
  if (email) await upsert('email', email);

  // They may already have an account under that number/email: invite them in the app right away.
  const or = [...(phoneNumber ? [{ phoneNumber }] : []), ...(email ? [{ email }] : [])];
  const existing = await User.findOne({ $or: or });
  if (existing) await claimPendingInvites(existing);

  res.status(200).json({ ok: true });
});
