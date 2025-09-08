import asyncHandler from "express-async-handler";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { getAuth } from "@clerk/express";

export const createGroup = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  // Destructure name and time from the request body
  const { name, time } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Group name is required." });
  }

  if (!time) {
    return res.status(400).json({ error: "Meeting time is required." });
  }

  // Find the current user to set as the group owner
  const owner = await User.findOne({ clerkId: userId });

  if (!owner) {
    // Corrected the status code to 404 for 'Not Found'
    return res.status(404).json({ error: "User not found." });
  }

  // Create the new group document with the time
  const newGroup = await Group.create({
    name,
    time, // Add the time here
    owner: owner._id,
    members: [owner._id],
  });

  console.log("New group created with ID:", newGroup._id);
  
  // You can also add the new group to the user's list of groups
  // Assuming the User model has a 'groups' array field.
  // If not, you can remove these two lines.
  owner.groups.push(newGroup._id);
  await owner.save();

  res.status(201).json({ group: newGroup, message: "Group created successfully." });
});

export const getGroups = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);

  const currentUser = await User.findOne({ clerkId: userId }).lean();

  if (!currentUser) {
    return res.status(404).json({ error: "User not found." });
  }

  const userGroups = await Group.find({ members: currentUser._id }).select(
    "name _id time" // Add 'time' so it's fetched from the DB
  );

  res.status(200).json(userGroups);
});