import asyncHandler from "express-async-handler";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { getAuth } from "@clerk/express";

export const createGroup = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  // Destructure name, time, and the new schedule from the request body
  const { name, time, schedule } = req.body;

  if (!name || !time) {
    return res.status(400).json({ error: "Group name and time are required." });
  }

  const owner = await User.findOne({ clerkId: userId });
  if (!owner) {
    return res.status(404).json({ error: "User not found." });
  }

  // Create the group data object
  const groupData = {
    name,
    time,
    owner: owner._id,
    members: [owner._id],
  };

  // --- ADDED: Only include schedule if it's provided ---
  if (schedule) {
    // Basic validation for the schedule object
    if (schedule.frequency && typeof schedule.day === 'number') {
      groupData.schedule = schedule;
    } else {
      console.warn("Received invalid schedule object:", schedule);
    }
  }

  const newGroup = await Group.create(groupData);

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

  // Ensure 'schedule' is selected so it's returned to the frontend
  const userGroups = await Group.find({ members: currentUser._id })
    .select("name _id time schedule");

  res.status(200).json(userGroups);
});