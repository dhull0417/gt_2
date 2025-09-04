import asyncHandler from "express-async-handler";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { getAuth } from "@clerk/express";
import { clerkClient } from "@clerk/express";
import expressAsyncHandler from "express-async-handler";

export const createGroup = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Group name is required." });
  }

  // Find the current user to set as the group owner
  const owner = await User.findOne({ clerkId: userId });

  if (!owner) {
    return res.status(404).json({ error: "User not found." });
  }

  // Create the new group document
  const newGroup = await Group.create({
    name,
    owner: owner._id,
    members: [owner._id], // Add the owner as the first member
  });

  // The newGroup document now automatically has a unique `_id`
  console.log("New group created with ID:", newGroup._id);
  
  // You can also add the new group to the user's list of groups
  owner.groups.push(newGroup._id);
  await owner.save();

  res.status(201).json({ group: newGroup, message: "Group created successfully." });
});
