import asyncHandler from "express-async-handler";
import User from "../models/user.model.js";
import { getAuth, clerkClient } from "@clerk/express";
import { syncStreamUser } from "../utils/stream.js"; 
import { ENV } from '../config/env.js';  

/**
 * @desc    Toggle mute status for a specific group's chat
 * @route   PATCH /api/users/mute-group
 */
export const toggleGroupMute = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { groupId } = req.body;

  if (!groupId) {
    return res.status(400).json({ error: "Group ID is required." });
  }

  const user = await User.findOne({ clerkId });
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  // Check if the group is already in the muted list
  const isMuted = user.mutedGroups.some(id => id.toString() === groupId);

  if (isMuted) {
    // Unmute: Remove from array
    user.mutedGroups = user.mutedGroups.filter(id => id.toString() !== groupId);
  } else {
    // Mute: Add to array
    user.mutedGroups.push(groupId);
  }

  await user.save();

  res.status(200).json({ 
    muted: !isMuted, 
    message: isMuted ? "Notifications unmuted." : "Notifications muted." 
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
    { new: true }
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