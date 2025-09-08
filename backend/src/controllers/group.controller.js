import asyncHandler from "express-async-handler";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";

// ... existing createGroup function ...
export const createGroup = asyncHandler(async (req, res) => {
// ... no changes here

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

  // Use $addToSet to prevent duplicates, though it's less likely for a new group
  await owner.updateOne({ $addToSet: { groups: newGroup._id } });

  res.status(201).json({ group: newGroup, message: "Group created successfully." });
});


export const getGroups = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  const currentUser = await User.findOne({ clerkId: userId }).lean();
  if (!currentUser) {
    return res.status(404).json({ error: "User not found." });
  }

  // --- MODIFICATION: Add 'owner' to the selection ---
  const userGroups = await Group.find({ members: currentUser._id })
    .select("name _id time schedule owner");

  res.status(200).json(userGroups);
});

// ... existing addMember function ...
export const addMember = asyncHandler(async (req, res) => {
// ... no changes here
  const { userId: userIdToAdd } = req.body;

  // 2. Validate IDs
  if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(userIdToAdd)) {
    return res.status(400).json({ error: "Invalid ID format provided." });
  }

  // 3. Find the documents
  const group = await Group.findById(groupId);
  const requester = await User.findOne({ clerkId: requesterClerkId });
  const userToAdd = await User.findById(userIdToAdd);

  // 4. Check if documents exist
  if (!group) return res.status(404).json({ error: "Group not found." });
  if (!requester) return res.status(404).json({ error: "Requesting user not found." });
  if (!userToAdd) return res.status(404).json({ error: "User to add not found." });
  
  // 5. Authorization: Check if the requester is the group owner
  if (group.owner.toString() !== requester._id.toString()) {
    return res.status(403).json({ error: "Only the group owner can add new members." });
  }

  // 6. Check if user is already a member
  if (group.members.includes(userToAdd._id)) {
    return res.status(409).json({ message: "User is already a member of this group." });
  }

  // 7. Update both documents using $addToSet to prevent duplicates
  await group.updateOne({ $addToSet: { members: userToAdd._id } });
  await userToAdd.updateOne({ $addToSet: { groups: group._id } });
  
  res.status(200).json({ message: "User added to group successfully." });
});