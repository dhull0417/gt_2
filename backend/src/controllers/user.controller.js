import { syncPremiumForUser } from "../utils/revenuecat.js";
import asyncHandler from "express-async-handler";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import Meetup from "../models/meetup.model.js";
import Notification from "../models/notification.model.js";
import { getAuth, clerkClient } from "@clerk/express";
import { serializeUser, hasPremium } from "../utils/premium.js";
import { notifyAndPersist } from "../utils/push.notifications.js";
import { resolveZone } from "../utils/email/lifecycle.js";
import { ENV } from "../config/env.js";
import mongoose from "mongoose";
import Poll from "../models/poll.model.js";
import InviteToken from "../models/inviteToken.model.js";
import AttendanceRecord from "../models/attendanceRecord.model.js";
import { scrubMemberFromUpcomingMeetups } from "../utils/memberCleanup.js";
import { postSystemMessage } from "../utils/systemMessage.js";
import { purgeGroupChat, removeAllChatMembers, scrubUserChat, removeChatMemberEverywhere } from "../utils/supabaseAdmin.js";

const MAX_PUSH_TOKENS = 5;

/**
 * @desc    Toggle mute status for a specific group's chat
 * @route   PATCH /api/users/mute-group
 */
export const toggleGroupMute = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { groupId, muteType } = req.body;

  if (!groupId || !mongoose.Types.ObjectId.isValid(String(groupId))) {
    return res.status(400).json({ error: "A valid group ID is required." });
  }
  if (muteType !== undefined && !['indefinite', 'untilNext', 'none'].includes(muteType)) {
    return res.status(400).json({ error: "Invalid mute type." });
  }

  const user = await User.findOne({ clerkId });
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  // clear both lists first to avoid duplicates/cross-over
  user.mutedGroups = user.mutedGroups.filter(id => id.toString() !== groupId);
  user.mutedUntilNextMeetup = user.mutedUntilNextMeetup.filter(id => id.toString() !== groupId);

  // add to the requested list
  if (muteType === 'indefinite') {
    user.mutedGroups.push(groupId);
  } else if (muteType === 'untilNext') {
    user.mutedUntilNextMeetup.push(groupId);
  }

  await user.save();

  res.status(200).json({ 
    muteType,
    message: muteType === 'none' ? "Notifications unmuted." : "Notifications muted." 
  });
});

/**
 * @desc    Pin or unpin a group at the top of the member's Groups list
 * @route   PATCH /api/users/pin-group
 * @body    { groupId, pinned: boolean }
 */
export const togglePinGroup = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { groupId, pinned } = req.body || {};

  if (!groupId || !mongoose.Types.ObjectId.isValid(String(groupId))) {
    return res.status(400).json({ error: "A valid group ID is required." });
  }
  if (typeof pinned !== 'boolean') {
    return res.status(400).json({ error: "pinned must be true or false." });
  }

  const update = pinned
    ? { $addToSet: { pinnedGroups: groupId } }
    : { $pull: { pinnedGroups: groupId } };
  const user = await User.findOneAndUpdate({ clerkId }, update, { new: true }).select('pinnedGroups');
  if (!user) return res.status(404).json({ error: "User not found." });
  res.status(200).json({ pinnedGroups: user.pinnedGroups });
});

/**
 * @desc    Mark a group's chat as read up to now, for the unread dot on the groups list
 * @route   PATCH /api/users/groups/:groupId/read
 */
export const markGroupRead = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { groupId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({ error: "Invalid group ID." });
  }

  const user = await User.findOneAndUpdate(
    { clerkId },
    { $set: { [`lastReadAt.${groupId}`]: new Date() } },
    { new: true }
  );
  if (!user) return res.status(404).json({ error: "User not found." });

  res.status(200).json({ ok: true });
});

/**
 * @desc    Save/Update User's Expo Push Token
 * @route   POST /api/users/push-token
 */
export const updatePushToken = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Push token is required." });
  }

  if (typeof token !== 'string' || token.length > 200) {
    return res.status(400).json({ error: "Invalid push token." });
  }

  const user = await User.findOne({ clerkId }).select('_id');
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  // A device token belongs to one account: if someone else signed in on this phone
  // before, they stop receiving this phone's notifications.
  await User.updateMany({ _id: { $ne: user._id }, expoPushToken: token }, { $unset: { expoPushToken: "" } });
  await User.updateMany({ _id: { $ne: user._id }, expoPushTokens: token }, { $pull: { expoPushTokens: token } });

  // This account keeps up to MAX_PUSH_TOKENS devices, newest last.
  await User.updateOne({ _id: user._id }, { $pull: { expoPushTokens: token } });
  await User.updateOne(
    { _id: user._id },
    { $set: { expoPushToken: token }, $push: { expoPushTokens: { $each: [token], $slice: -MAX_PUSH_TOKENS } } }
  );

  res.status(200).json({ message: "Push token updated successfully." });
});

/**
 * @desc    Stop sending this device's notifications to the signed-in account (called on sign-out)
 * @route   DELETE /api/users/push-token
 */
export const removePushToken = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const token = req.body?.token || req.query?.token;
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: "Push token is required." });
  }

  const user = await User.findOne({ clerkId }).select('_id expoPushToken expoPushTokens');
  if (!user) return res.status(404).json({ error: "User not found." });

  const remaining = (user.expoPushTokens || []).filter((t) => t !== token);
  const set = { expoPushTokens: remaining };
  const update = { $set: set };
  if (user.expoPushToken === token) {
    if (remaining.length > 0) set.expoPushToken = remaining[remaining.length - 1];
    else update.$unset = { expoPushToken: "" };
  }
  await User.updateOne({ _id: user._id }, update);
  res.status(200).json({ message: "Push token removed." });
});

const PERMISSION_TYPES = ['notifications', 'location', 'photoLibrary'];
const PERMISSION_STATUSES = ['granted', 'denied', 'undetermined'];

/**
 * @desc    Report current device permission status (batch: only changed types)
 * @route   PATCH /api/users/permissions
 */
export const updatePermissionStatus = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const updates = req.body.permissions;

  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: "permissions object is required." });
  }

  const setDoc = {};
  for (const [type, status] of Object.entries(updates)) {
    if (!PERMISSION_TYPES.includes(type) || !PERMISSION_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid permission type or status: ${type}` });
    }
    setDoc[`permissions.${type}`] = status;
  }
  if (Object.keys(setDoc).length === 0) {
    return res.status(400).json({ error: "No valid permission updates provided." });
  }

  const user = await User.findOneAndUpdate({ clerkId }, { $set: setDoc }, { new: true });
  if (!user) return res.status(404).json({ error: "User not found." });

  res.status(200).json({ permissions: user.permissions });
});

// Digits-only phone numbers become E.164 (+1 assumed for 10-digit US numbers), matching how Clerk stores them.
export const normalizePhone = (raw) => {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits.length >= 8 ? digits : null;
  const onlyDigits = digits.replace(/\D/g, '');
  if (onlyDigits.length === 10) return `+1${onlyDigits}`;
  if (onlyDigits.length === 11 && onlyDigits.startsWith('1')) return `+${onlyDigits}`;
  return null;
};

const MAX_CONTACT_LOOKUPS = 500;

/**
 * @desc    Which of the caller's contacts already use GroupThat. Returns only the people
 *          who matched, with just their name/photo and which of the caller's entries matched.
 * @route   POST /api/users/match-contacts
 */
export const matchContacts = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const rawEmails = Array.isArray(req.body?.emails) ? req.body.emails : [];
  const rawPhones = Array.isArray(req.body?.phoneNumbers) ? req.body.phoneNumbers : [];

  const emails = [...new Set(rawEmails.filter((e) => typeof e === 'string').map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, MAX_CONTACT_LOOKUPS);
  const phones = [...new Set(rawPhones.map(normalizePhone).filter(Boolean))].slice(0, MAX_CONTACT_LOOKUPS);

  if (emails.length === 0 && phones.length === 0) {
    return res.status(200).json([]);
  }

  const conditions = [];
  if (emails.length > 0) conditions.push({ email: { $in: emails } });
  if (phones.length > 0) conditions.push({ phoneNumber: { $in: phones } });

  const users = await User.find({
    $or: conditions,
    clerkId: { $ne: clerkId },
  }).select("firstName lastName profilePicture email phoneNumber").lean();

  const emailSet = new Set(emails);
  const phoneSet = new Set(phones);
  res.status(200).json(users.map((u) => ({
    _id: u._id,
    firstName: u.firstName,
    lastName: u.lastName,
    profilePicture: u.profilePicture,
    // Only echo back what the caller already supplied, never other details about the person.
    email: u.email && emailSet.has(String(u.email).toLowerCase()) ? u.email : undefined,
    phoneNumber: u.phoneNumber && phoneSet.has(u.phoneNumber) ? u.phoneNumber : undefined,
  })));
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @desc    LEGACY name search, used only by app 1.3.x and older (the Group Details screen).
 *          The current app doesn't call it. Remove once nobody runs those builds.
 * @route   GET /api/users/search?query=
 */
export const searchUsers = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const query = typeof req.query.query === "string" ? req.query.query.trim().slice(0, 50) : "";
  if (!query) return res.status(400).json({ error: "Search query is required." });

  const regex = { $regex: escapeRegex(query), $options: "i" };
  const users = await User.find({
    $or: [{ firstName: regex }, { lastName: regex }],
    clerkId: { $ne: clerkId },
  })
    .select("firstName lastName profilePicture")
    .limit(10);

  res.status(200).json(users);
});

// The only fields a signed-in person may change on their own record. Everything else
// (premium, groups, tokens, lifecycle, ...) is owned by the server.
const PROFILE_FIELDS = ['firstName', 'lastName', 'zipCode', 'profilePicture', 'bannerImage', 'hasSeenWelcome', 'timezone', 'phoneNumber', 'email'];

export const updateProfile = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const update = {};
  for (const key of PROFILE_FIELDS) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  for (const key of ['firstName', 'lastName', 'zipCode', 'profilePicture', 'bannerImage', 'timezone', 'phoneNumber', 'email']) {
    if (update[key] !== undefined && update[key] !== null && typeof update[key] !== 'string') {
      return res.status(400).json({ error: `${key} must be text.` });
    }
  }
  if (update.hasSeenWelcome !== undefined && typeof update.hasSeenWelcome !== 'boolean') {
    return res.status(400).json({ error: "hasSeenWelcome must be true or false." });
  }

  if (update.zipCode !== undefined && !/^\d{5}$/.test(update.zipCode)) {
    return res.status(400).json({ error: "Zip code must be exactly 5 digits." });
  }
  if (update.timezone !== undefined) {
    const tz = resolveZone(update.timezone);
    if (tz) update.timezone = tz; else delete update.timezone;
  }
  if (update.firstName !== undefined) update.firstName = (update.firstName || '').trim().slice(0, 60);
  if (update.lastName !== undefined) update.lastName = (update.lastName || '').trim().slice(0, 60);

  // Email and phone are verified by Clerk, so they may only be set to a value Clerk has verified for this account.
  if (update.email !== undefined || update.phoneNumber !== undefined) {
    const clerkUser = await clerkClient.users.getUser(userId);
    if (update.email !== undefined) {
      const wanted = String(update.email).trim().toLowerCase();
      const verified = (clerkUser.emailAddresses || []).find(
        (e) => e.emailAddress.toLowerCase() === wanted && e.verification?.status === 'verified'
      );
      if (!verified) return res.status(400).json({ error: "That email address hasn't been verified yet." });
      update.email = verified.emailAddress;
    }
    if (update.phoneNumber !== undefined) {
      const wanted = normalizePhone(update.phoneNumber);
      const verified = (clerkUser.phoneNumbers || []).find(
        (p) => p.phoneNumber === wanted && p.verification?.status === 'verified'
      );
      if (!wanted || !verified) return res.status(400).json({ error: "That phone number hasn't been verified yet." });
      update.phoneNumber = verified.phoneNumber;
    }
  }

  // Nothing to change (app 1.3.x profile setup sends {} for an Apple user who skips the zip code):
  // answer with the current record, as the old server did, rather than an error that blocks sign-up.
  if (Object.keys(update).length === 0) {
    const current = await User.findOne({ clerkId: userId });
    if (!current) return res.status(404).json({ error: "User not found" });
    return res.status(200).json({ user: serializeUser(current) });
  }

  let user;
  try {
    user = await User.findOneAndUpdate({ clerkId: userId }, { $set: update }, { new: true, runValidators: true });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.email) {
      return res.status(409).json({ error: "That email address is already in use by another account." });
    }
    if (err.code === 11000 && err.keyPattern?.phoneNumber) {
      return res.status(409).json({ error: "That phone number is already in use by another account." });
    }
    throw err;
  }
  if (!user) return res.status(404).json({ error: "User not found" });

  res.status(200).json({ user: serializeUser(user) });
});

const PREF_KEYS = ['chat', 'rsvps', 'reminders', 'polls'];
const PREF_TIME_RE = /^(0?[1-9]|1[0-2]):[0-5]\d (AM|PM)$/;

/**
 * @desc    What the member wants notifications for, plus quiet hours
 * @route   PATCH /api/users/notification-prefs
 * @body    { chat?, rsvps?, reminders?, polls?, quietHours?: { enabled, start, end } }
 */
export const updateNotificationPrefs = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const body = req.body || {};
  const set = {};

  for (const key of PREF_KEYS) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'boolean') return res.status(400).json({ error: `${key} must be true or false.` });
    set[`notificationPrefs.${key}`] = body[key];
  }
  if (body.quietHours !== undefined) {
    const q = body.quietHours || {};
    if (q.enabled !== undefined) {
      if (typeof q.enabled !== 'boolean') return res.status(400).json({ error: "quietHours.enabled must be true or false." });
      set['notificationPrefs.quietHours.enabled'] = q.enabled;
    }
    for (const key of ['start', 'end']) {
      if (q[key] === undefined) continue;
      if (typeof q[key] !== 'string' || !PREF_TIME_RE.test(q[key])) return res.status(400).json({ error: `quietHours.${key} must look like "10:00 PM".` });
      set[`notificationPrefs.quietHours.${key}`] = q[key];
    }
  }
  if (Object.keys(set).length === 0) return res.status(400).json({ error: "Nothing to update." });

  const user = await User.findOneAndUpdate({ clerkId }, { $set: set }, { new: true });
  if (!user) return res.status(404).json({ error: "User not found." });
  res.status(200).json({ notificationPrefs: user.notificationPrefs });
});

export const syncUser = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  let user = await User.findOne({ clerkId: userId });
  if (user) {
    // keep the device timezone current (used to time lifecycle emails)
    const tz = resolveZone(req.body?.timezone);
    if (tz && user.timezone !== tz) {
      await User.updateOne({ _id: user._id }, { $set: { timezone: tz } });
      user.timezone = tz;
    }
    return res.status(200).json({ user: serializeUser(user), message: "User already exists" });
  }

  const clerkUser = await clerkClient.users.getUser(userId);

  // prefer client-sent firstName/lastName — the backend Clerk API can lag on first sign-in
  const bodyFirstName = req.body.firstName?.trim();
  const bodyLastName = req.body.lastName?.trim();

  // Apple only hands over the real name on the very first authorization ever; if it
  // wasn't captured then, Apple/Clerk never supply one again. Fall back to a generic
  // placeholder name instead of leaving these users with a blank display name.
  const isAppleUser = clerkUser.externalAccounts?.some((account) => account.provider === "oauth_apple");

  const userData = {
    clerkId: userId,
    email: clerkUser.emailAddresses[0]?.emailAddress,
    phoneNumber: clerkUser.phoneNumbers[0]?.phoneNumber,
    firstName: bodyFirstName || clerkUser.firstName || (isAppleUser ? "New Member" : ""),
    lastName: bodyLastName || clerkUser.lastName || "",
    profilePicture: clerkUser.imageUrl || "",
    timezone: resolveZone(req.body?.timezone),
    // Only people who sign up while lifecycle emails are switched on get the sequence.
    lifecycle: { enrolledAt: ENV.LIFECYCLE_EMAILS_ENABLED === "true" ? new Date() : null },
  };

  try {
    user = await User.create(userData);
  } catch (err) {
    // Two requests raced to create the same person (e.g. a double launch): use the one that won.
    if (err.code === 11000) {
      const existing = await User.findOne({ clerkId: userId });
      if (existing) return res.status(200).json({ user: serializeUser(existing), message: "User already exists" });
    }
    throw err;
  }

  res.status(201).json({ user: serializeUser(user), message: "User created successfully" });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const user = await User.findOne({ clerkId }).lean();
  if (!user) return res.status(404).json({ error: "User not found in database." });

  // Remember which app version this person uses (for deciding when to switch old behaviour off).
  const seen = appVersionUpdate(user, req.clientInfo);
  if (seen) {
    try {
      await User.updateOne({ _id: user._id }, { $set: seen }, { timestamps: false });
    } catch (err) {
      console.error("Recording app version failed:", err?.message || err);
    }
  }

  res.status(200).json({ user: serializeUser(user) });
});

const APP_SEEN_REFRESH_MS = 6 * 60 * 60 * 1000;

/** What to $set on the user for this request's app version, or null when nothing changed (throttled). */
export const appVersionUpdate = (user, clientInfo, now = new Date()) => {
  if (!user || !clientInfo) return null;
  const stale = (d) => !d || now.getTime() - new Date(d).getTime() > APP_SEEN_REFRESH_MS;
  if (clientInfo.isLegacy || !clientInfo.version) {
    return stale(user.legacyAppSeenAt) ? { legacyAppSeenAt: now } : null;
  }
  if (user.appVersion !== clientInfo.version || stale(user.appVersionSeenAt)) {
    return { appVersion: clientInfo.version, appVersionSeenAt: now };
  }
  return null;
};

export const deleteAccount = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);

  const user = await User.findOne({ clerkId });
  if (!user) return res.status(404).json({ error: "User not found." });

  const userId = user._id;

  // owned groups: delete if solely owned, else transfer ownership
  const ownedGroups = await Group.find({ owner: userId });

  for (const group of ownedGroups) {
    const otherMembers = group.members.filter(id => id.toString() !== userId.toString());

    if (otherMembers.length === 0) {
      // User is the only member — delete the group and all its data
      await Meetup.deleteMany({ group: group._id });
      await Poll.deleteMany({ group: group._id });
      await InviteToken.deleteMany({ groupId: group._id });
      await AttendanceRecord.deleteMany({ group: group._id });
      await Notification.deleteMany({ group: group._id });
      await Group.findByIdAndDelete(group._id);
      await purgeGroupChat(group._id);
      await removeAllChatMembers(group._id);
    } else {
      // prefer moderators over members; tiebreak by oldest account (no join dates stored)
      const otherModerators = group.moderators.filter(id => id.toString() !== userId.toString());

      let newOwnerUser;
      if (otherModerators.length > 0) {
        const modUsers = await User.find({ _id: { $in: otherModerators } }).sort({ createdAt: 1 });
        newOwnerUser = modUsers[0];
      } else {
        const memberUsers = await User.find({ _id: { $in: otherMembers } }).sort({ createdAt: 1 });
        newOwnerUser = memberUsers[0];
      }
      const newOwnerId = newOwnerUser._id;

      await Group.findByIdAndUpdate(group._id, {
        owner: newOwnerId,
        $pull: { members: userId, moderators: userId },
      });

      // Premium is tied to the owner's subscription and doesn't follow the
      // group. If the leaving owner was covering it and the new owner isn't
      // subscribed, tell the new owner (they'd otherwise never find out).
      if (hasPremium(user) && !hasPremium(newOwnerUser)) {
        try {
          await notifyAndPersist([newOwnerUser], {
            title: "You're Now the Owner",
            body: `The previous owner of "${group.name}" left GroupThat, so you're now the owner. Its Premium features are paused until you have your own Premium subscription.`,
            data: { groupId: group._id.toString(), type: 'ownership-transferred' },
            type: 'ownership-transferred',
            group: group._id,
            meta: { premiumPaused: true, reason: 'owner-deleted-account' },
          });
        } catch (err) { console.error(err); }
      }
    }
  }

  // Groups the person leaves behind (including ones whose ownership just moved): tell them in the chat.
  const leftGroups = await Group.find({ members: userId, isDM: { $ne: true } }).select('_id').lean();
  for (const g of leftGroups.slice(0, 50)) {
    await postSystemMessage(g._id, `${user.firstName || 'A member'} left the group`);
  }

  // remove user from non-owned groups
  await Group.updateMany(
    { members: userId },
    { $pull: { members: userId, moderators: userId } }
  );

  // Remove their RSVPs and everything attached to them (guests, items, rides, answers, teams,
  // priority spot) from every upcoming meetup they were part of, and pass freed spots down the waitlist.
  await scrubMemberFromUpcomingMeetups({ userId, clerkId: user.clerkId });

  // Their votes in polls, and polls they made that are still running.
  await Poll.updateMany({ 'options.voters': userId }, { $pull: { 'options.$[].voters': userId } });
  await Poll.updateMany({ creator: userId, status: 'active' }, { $set: { status: 'cancelled' } });

  // Their chat photos and messages, and their entry in the chat membership copy.
  await scrubUserChat(user.clerkId);
  await removeChatMemberEverywhere(user.clerkId);

  // delete notifications involving the user
  await Notification.deleteMany({ $or: [{ recipient: userId }, { sender: userId }] });

  // delete from Clerk first — if it fails, the Mongo record stays intact for retry
  await clerkClient.users.deleteUser(clerkId);

  await User.findByIdAndDelete(userId);

  res.status(200).json({ message: "Account deleted successfully." });
});
/**
 * @desc    Re-check the signed-in user's Premium status with RevenueCat and save it.
 *          The app calls this after a purchase or restore; it never sends a status itself.
 * @route   POST /api/users/premium/sync
 */
export const syncPremium = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const user = await User.findOne({ clerkId });
  if (!user) return res.status(404).json({ error: "User not found in database." });

  const updated = await syncPremiumForUser(user);
  res.status(200).json({ user: serializeUser(updated.toObject ? updated.toObject() : updated) });
});
