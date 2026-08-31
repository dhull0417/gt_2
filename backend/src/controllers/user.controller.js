import asyncHandler from "express-async-handler";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import Meetup from "../models/meetup.model.js";
import Notification from "../models/notification.model.js";
import { getAuth, clerkClient } from "@clerk/express";

/**
 * @desc    Toggle mute status for a specific group's chat
 * @route   PATCH /api/users/mute-group
 */
export const toggleGroupMute = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { groupId, muteType } = req.body;

  if (!groupId) {
    return res.status(400).json({ error: "Group ID is required." });
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
 * @desc    Mark a group's chat as read up to now, for the unread dot on the groups list
 * @route   PATCH /api/users/groups/:groupId/read
 */
export const markGroupRead = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { groupId } = req.params;

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

  const user = await User.findOneAndUpdate(
    { clerkId },
    { expoPushToken: token },
    { new: true,}
  );

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  res.status(200).json({ message: "Push token updated successfully." });
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

export const matchContacts = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { emails = [], phoneNumbers = [] } = req.body;

  if (emails.length === 0 && phoneNumbers.length === 0) {
    return res.status(200).json([]);
  }

  const conditions = [];
  if (emails.length > 0) conditions.push({ email: { $in: emails } });
  if (phoneNumbers.length > 0) conditions.push({ phoneNumber: { $in: phoneNumbers } });

  const users = await User.find({
    $or: conditions,
    clerkId: { $ne: clerkId },
  }).select("firstName lastName profilePicture email phoneNumber");

  res.status(200).json(users);
});

export const searchUsers = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "Search query is required." });

  const regex = { $regex: query, $options: "i" };
  const users = await User.find({
    $or: [{ firstName: regex }, { lastName: regex }],
    clerkId: { $ne: clerkId },
  })
    .select("firstName lastName profilePicture")
    .limit(10);

  res.status(200).json(users);
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);

  if (req.body.zipCode !== undefined && !/^\d{5}$/.test(req.body.zipCode)) {
    return res.status(400).json({ error: "Zip code must be exactly 5 digits." });
  }

  let user;
  try {
    user = await User.findOneAndUpdate({ clerkId: userId }, req.body, { new: true, runValidators: true });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.email) {
      return res.status(409).json({ error: "That email address is already in use by another account." });
    }
    throw err;
  }
  if (!user) return res.status(404).json({ error: "User not found" });

  res.status(200).json({ user });
});

export const syncUser = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  let user = await User.findOne({ clerkId: userId });
  if (user) {
    return res.status(200).json({ user, message: "User already exists" });
  }

  const clerkUser = await clerkClient.users.getUser(userId);

  // prefer client-sent firstName/lastName — the backend Clerk API can lag on first sign-in
  const { firstName: bodyFirstName, lastName: bodyLastName } = req.body;

  const userData = {
    clerkId: userId,
    email: clerkUser.emailAddresses[0]?.emailAddress,
    phoneNumber: clerkUser.phoneNumbers[0]?.phoneNumber,
    firstName: bodyFirstName || clerkUser.firstName || "",
    lastName: bodyLastName || clerkUser.lastName || "",
    profilePicture: clerkUser.imageUrl || "",
  };

  user = await User.create(userData);

  res.status(201).json({ user, message: "User created successfully" });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const user = await User.findOne({ clerkId }).lean();
  if (!user) return res.status(404).json({ error: "User not found in database." });

  res.status(200).json({ user });
});

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
      await Notification.deleteMany({ group: group._id });
      await Group.findByIdAndDelete(group._id);
    } else {
      // prefer moderators over members; tiebreak by oldest account (no join dates stored)
      const otherModerators = group.moderators.filter(id => id.toString() !== userId.toString());

      let newOwnerId;
      if (otherModerators.length > 0) {
        const modUsers = await User.find({ _id: { $in: otherModerators } }).sort({ createdAt: 1 });
        newOwnerId = modUsers[0]._id;
      } else {
        const memberUsers = await User.find({ _id: { $in: otherMembers } }).sort({ createdAt: 1 });
        newOwnerId = memberUsers[0]._id;
      }

      await Group.findByIdAndUpdate(group._id, {
        owner: newOwnerId,
        $pull: { members: userId, moderators: userId },
      });
    }
  }

  // remove user from non-owned groups
  await Group.updateMany(
    { members: userId, owner: { $ne: userId } },
    { $pull: { members: userId, moderators: userId } }
  );

  // remove user from meetup attendance arrays
  await Meetup.updateMany(
    {},
    { $pull: { members: userId, undecided: userId, in: userId, out: userId, waitlist: userId } }
  );

  // delete notifications involving the user
  await Notification.deleteMany({ $or: [{ recipient: userId }, { sender: userId }] });

  // delete from Clerk first — if it fails, the Mongo record stays intact for retry
  await clerkClient.users.deleteUser(clerkId);

  await User.findByIdAndDelete(userId);

  res.status(200).json({ message: "Account deleted successfully." });
});