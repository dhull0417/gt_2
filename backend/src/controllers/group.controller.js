import asyncHandler from "express-async-handler";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";

export const createGroup = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  const { name, time, schedule } = req.body;

  if (!name || !time) {
    return res.status(400).json({ error: "Group name and time are required." });
  }

  const owner = await User.findOne({ clerkId: userId });
  if (!owner) {
    return res.status(404).json({ error: "User not found." });
  }

  const groupData = {
    name,
    time,
    owner: owner._id,
    members: [owner._id],
  };

  if (schedule) {
    if (schedule.frequency && typeof schedule.day === 'number') {
      groupData.schedule = schedule;
    } else {
      console.warn("Received invalid schedule object:", schedule);
    }
  }

  const newGroup = await Group.create(groupData);

  await owner.updateOne({ $addToSet: { groups: newGroup._id } });

  res.status(201).json({ group: newGroup, message: "Group created successfully." });
});


export const getGroups = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  const currentUser = await User.findOne({ clerkId: userId }).lean();
  if (!currentUser) {
    return res.status(404).json({ error: "User not found." });
  }

  const userGroups = await Group.find({ members: currentUser._id })
    .select("name _id time schedule owner");

  res.status(200).json(userGroups);
});

export const getGroupDetails = asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({ error: "Invalid Group ID format." });
  }

  const group = await Group.findById(groupId)
    .populate({
      path: "members",
      select: "firstName lastName _id profilePicture",
    })
    .lean();

  if (!group) {
    return res.status(404).json({ error: "Group not found." });
  }

  res.status(200).json(group);
});

export const addMember = asyncHandler(async (req, res) => {
  const { userId: requesterClerkId } = getAuth(req);
  const { groupId } = req.params;
  const { userId: userIdToAdd } = req.body;

  // --- ADDED: Debugging logs to inspect the incoming data ---
  console.log("--- DEBUGGING addMember ---");
  console.log("Received Request Body:", req.body);
  console.log("Extracted User ID to Add:", userIdToAdd);
  console.log("Type of userIdToAdd:", typeof userIdToAdd);
  console.log("Is ID valid according to Mongoose?:", mongoose.Types.ObjectId.isValid(userIdToAdd));
  console.log("-------------------------");

  if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(userIdToAdd)) {
    return res.status(400).json({ error: "Invalid ID format provided." });
  }

  const group = await Group.findById(groupId);
  const requester = await User.findOne({ clerkId: requesterClerkId });
  const userToAdd = await User.findById(userIdToAdd);

  if (!group) return res.status(404).json({ error: "Group not found." });
  if (!requester) return res.status(404).json({ error: "Requesting user not found." });
  if (!userToAdd) return res.status(404).json({ error: "User to add not found." });
  
  if (group.owner.toString() !== requester._id.toString()) {
    return res.status(403).json({ error: "Only the group owner can add new members." });
  }

  if (group.members.includes(userToAdd._id)) {
    return res.status(409).json({ message: "User is already a member of this group." });
  }

  await group.updateOne({ $addToSet: { members: userToAdd._id } });
  await userToAdd.updateOne({ $addToSet: { groups: group._id } });
  
  res.status(200).json({ message: "User added to group successfully." });
});
