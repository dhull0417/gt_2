import asyncHandler from "express-async-handler";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import Event from "../models/event.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";

// Helper function to calculate the next event date
const calculateNextEventDate = (schedule) => {
  const now = new Date();
  let eventDate = new Date(now.getTime());

  if (schedule.frequency === 'weekly') {
    const currentDay = now.getUTCDay();
    const targetDay = schedule.day;
    let dayDifference = targetDay - currentDay;
    if (dayDifference < 0) {
      dayDifference += 7;
    }
    eventDate.setUTCDate(now.getUTCDate() + dayDifference);
  } else if (schedule.frequency === 'monthly') {
    const currentMonthDate = now.getUTCDate();
    const targetMonthDate = schedule.day;
    eventDate.setUTCDate(targetMonthDate);
    if (targetMonthDate <= currentMonthDate) {
      eventDate.setUTCMonth(now.getUTCMonth() + 1);
    }
  }

  eventDate.setUTCHours(0, 0, 0, 0);
  return eventDate;
};

// ... createGroup, getGroups, and getGroupDetails are unchanged ...
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

  const groupData = { name, time, owner: owner._id, members: [owner._id] };
  if (schedule) {
    if (schedule.frequency && typeof schedule.day === 'number') {
      groupData.schedule = schedule;
    } else {
      console.warn("Received invalid schedule object:", schedule);
    }
  }

  const newGroup = await Group.create(groupData);
  await owner.updateOne({ $addToSet: { groups: newGroup._id } });

  if (newGroup.schedule) {
    try {
      const eventDate = calculateNextEventDate(newGroup.schedule);
      await Event.create({
        group: newGroup._id,
        name: newGroup.name,
        date: eventDate,
        time: newGroup.time,
        members: newGroup.members,
        undecided: newGroup.members,
      });
      console.log(`First event for group '${newGroup.name}' created for ${eventDate.toDateString()}`);
    } catch (eventError) {
      console.error("Failed to create the first event for the new group:", eventError);
    }
  }
  res.status(201).json({ group: newGroup, message: "Group created successfully." });
});

export const getGroups = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  const currentUser = await User.findOne({ clerkId: userId }).lean();
  if (!currentUser) {
    return res.status(404).json({ error: "User not found." });
  }
  const userGroups = await Group.find({ members: currentUser._id }).select("name _id time schedule owner");
  res.status(200).json(userGroups);
});

export const getGroupDetails = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({ error: "Invalid Group ID format." });
  }
  const group = await Group.findById(groupId).populate({ path: "members", select: "firstName lastName _id profilePicture" }).lean();
  if (!group) {
    return res.status(404).json({ error: "Group not found." });
  }
  res.status(200).json(group);
});


export const addMember = asyncHandler(async (req, res) => {
  const { userId: requesterClerkId } = getAuth(req);
  const { groupId } = req.params;
  const { userId: userIdToAdd } = req.body;

  const sanitizedUserId = String(userIdToAdd || '').replace(/[^a-f0-9]/gi, '');

  if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(sanitizedUserId)) {
    return res.status(400).json({ error: "Invalid ID format provided." });
  }

  const group = await Group.findById(groupId);
  const requester = await User.findOne({ clerkId: requesterClerkId });
  const userToAdd = await User.findById(sanitizedUserId);

  if (!group) return res.status(404).json({ error: "Group not found." });
  if (!requester) return res.status(404).json({ error: "Requesting user not found." });
  if (!userToAdd) return res.status(404).json({ error: "User to add not found." });
  
  if (group.owner.toString() !== requester._id.toString()) {
    return res.status(403).json({ error: "Only the group owner can add new members." });
  }

  if (group.members.includes(userToAdd._id)) {
    return res.status(409).json({ message: "User is already a member of this group." });
  }

  // Add user to the group and the group to the user's list
  await group.updateOne({ $addToSet: { members: userToAdd._id } });
  await userToAdd.updateOne({ $addToSet: { groups: group._id } });
  
  // --- THIS IS THE FIX ---
  // Now, find all upcoming events for this group and add the new member.
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Find all events for this group that are scheduled for today or later
    await Event.updateMany(
      {
        group: group._id,
        date: { $gte: today },
      },
      {
        // Add the new user to both the main members list and the undecided RSVP list
        $addToSet: {
          members: userToAdd._id,
          undecided: userToAdd._id,
        },
      }
    );
    console.log(`Added new member ${userToAdd._id} to all upcoming events for group ${group._id}`);
  } catch (eventError) {
    // We log the error but don't stop the request, as the main goal (adding to the group) succeeded.
    console.error("Could not update upcoming events with new member:", eventError);
  }
  
  res.status(200).json({ message: "User added to group successfully." });
});