import asyncHandler from "express-async-handler";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import Meetup from "../models/meetup.model.js";
import Notification from "../models/notification.model.js";
import { getAuth, clerkClient } from "@clerk/express";
import { syncStreamUser, deleteStreamUser } from "../utils/stream.js";
import { ENV } from '../config/env.js';

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

  // 1. Clean start: Remove from both lists first to ensure no duplicates or cross-over
  user.mutedGroups = user.mutedGroups.filter(id => id.toString() !== groupId);
  user.mutedUntilNextMeetup = user.mutedUntilNextMeetup.filter(id => id.toString() !== groupId);

  // 2. Add to the requested list
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

export const searchUsers = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: "Username query is required." });

  const users = await User.find({
    username: { $regex: `^${username}`, $options: "i" },
    clerkId: { $ne: clerkId },
  })
    .select("firstName lastName username profilePicture")
    .limit(10);

  res.status(200).json(users);
});

export const getUserProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.status(200).json({ user });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  const { username } = req.body;

  if (username) {
    const existingUser = await User.findOne({ username });
    if (existingUser && existingUser.clerkId !== userId) {
      return res.status(409).json({ error: "Username is already taken." });
    }
  }

  const user = await User.findOneAndUpdate({ clerkId: userId }, req.body, { new: true });
  if (!user) return res.status(404).json({ error: "User not found" });

  // ✅ Sync Stream user
  await syncStreamUser(user);

  res.status(200).json({ user });
});

export const syncUser = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  let user = await User.findOne({ clerkId: userId });
  if (user) {
    // ✅ keep Stream data in sync even for existing user
    await syncStreamUser(user);
    return res.status(200).json({ user, message: "User already exists" });
  }

  const clerkUser = await clerkClient.users.getUser(userId);

  const userData = {
    clerkId: userId,
    email: clerkUser.emailAddresses[0]?.emailAddress,
    username: clerkUser.username || null,
    firstName: clerkUser.firstName || "",
    lastName: clerkUser.lastName || "",
    profilePicture: clerkUser.imageUrl || "",
  };

  user = await User.create(userData);

  // ✅ Sync Stream after creating
  await syncStreamUser(user);

  res.status(201).json({ user, message: "User created successfully" });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const user = await User.findOne({ clerkId }).lean();
  if (!user) return res.status(404).json({ error: "User not found in database." });

  // GENERATE STREAM TOKEN ON‑THE‑FLY
  const streamToken = ENV.SERVER_CLIENT.createToken(user._id.toString());

  // SEND IT WITH THE USER
  res.status(200).json({
    user: {
      ...user,
      streamToken,   // ← THIS IS THE KEY
    }
  });
});

export const deleteAccount = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);

  const user = await User.findOne({ clerkId });
  if (!user) return res.status(404).json({ error: "User not found." });

  const userId = user._id;

  // --- Step 1: Handle groups where the user is the owner ---
  const ownedGroups = await Group.find({ owner: userId });

  for (const group of ownedGroups) {
    const otherMembers = group.members.filter(id => id.toString() !== userId.toString());

    if (otherMembers.length === 0) {
      // User is the only member — delete the group and all its data
      await Meetup.deleteMany({ group: group._id });
      await Notification.deleteMany({ group: group._id });
      await Group.findByIdAndDelete(group._id);
    } else {
      // Transfer ownership: prefer moderators, fall back to members.
      // Tiebreaker: oldest account (createdAt asc) since per-member join dates aren't stored.
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

  // --- Step 2: Remove user from all non-owned groups ---
  await Group.updateMany(
    { members: userId, owner: { $ne: userId } },
    { $pull: { members: userId, moderators: userId } }
  );

  // --- Step 3: Remove user from all meetup attendance arrays ---
  await Meetup.updateMany(
    {},
    { $pull: { members: userId, undecided: userId, in: userId, out: userId, waitlist: userId } }
  );

  // --- Step 4: Delete all notifications involving the user ---
  await Notification.deleteMany({ $or: [{ recipient: userId }, { sender: userId }] });

  // --- Step 5: Delete from Stream Chat (non-fatal if it fails) ---
  await deleteStreamUser(userId.toString());

  // --- Step 6: Delete from MongoDB ---
  await User.findByIdAndDelete(userId);

  // --- Step 7: Delete from Clerk ---
  await clerkClient.users.deleteUser(clerkId);

  res.status(200).json({ message: "Account deleted successfully." });
});