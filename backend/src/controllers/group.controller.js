import asyncHandler from "express-async-handler";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import Event from "../models/event.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";

// The parseTime and calculateNextEventDate helpers are unchanged
const parseTime = (timeString) => {
    const [time, period] = timeString.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (period.toUpperCase() === 'PM' && hours !== 12) {
        hours += 12;
    }
    if (period.toUpperCase() === 'AM' && hours === 12) {
        hours = 0;
    }
    return { hours, minutes };
};

const calculateNextEventDate = (schedule, groupTime) => {
  const now = new Date();
  const { hours: eventHours, minutes: eventMinutes } = parseTime(groupTime);
  let eventDate = new Date(now);
  if (schedule.frequency === 'weekly') {
    const currentDay = now.getDay();
    const targetDay = schedule.day;
    const dayDifference = (targetDay - currentDay + 7) % 7;
    eventDate.setDate(now.getDate() + dayDifference);
  } else if (schedule.frequency === 'monthly') {
    const currentMonthDate = now.getDate();
    const targetMonthDate = schedule.day;
    eventDate.setDate(targetMonthDate);
    if (targetMonthDate < currentMonthDate) {
      eventDate.setMonth(now.getMonth() + 1);
    }
  }
  eventDate.setHours(eventHours, eventMinutes, 0, 0);
  if (eventDate < now) {
    if (schedule.frequency === 'weekly') {
      eventDate.setDate(eventDate.getDate() + 7);
    } else {
      eventDate.setMonth(eventDate.getMonth() + 1);
    }
  }
  eventDate.setUTCHours(0, 0, 0, 0);
  return eventDate;
};

// ... createGroup, getGroups, getGroupDetails, addMember are unchanged ...
export const createGroup = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  const { name, time, schedule } = req.body;
  if (!name || !time) return res.status(400).json({ error: "Group name and time are required." });
  const owner = await User.findOne({ clerkId: userId });
  if (!owner) return res.status(404).json({ error: "User not found." });
  const groupData = { name, time, owner: owner._id, members: [owner._id] };
  if (schedule) groupData.schedule = schedule;
  const newGroup = await Group.create(groupData);
  await owner.updateOne({ $addToSet: { groups: newGroup._id } });
  if (newGroup.schedule) {
    try {
      const eventDate = calculateNextEventDate(newGroup.schedule, newGroup.time);
      await Event.create({ group: newGroup._id, name: newGroup.name, date: eventDate, time: newGroup.time, members: newGroup.members, undecided: newGroup.members });
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
  if (!currentUser) return res.status(404).json({ error: "User not found." });
  const userGroups = await Group.find({ members: currentUser._id }).select("name _id time schedule owner");
  res.status(200).json(userGroups);
});
export const getGroupDetails = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: "Invalid Group ID format." });
  const group = await Group.findById(groupId).populate({ path: "members", select: "firstName lastName _id profilePicture" }).lean();
  if (!group) return res.status(404).json({ error: "Group not found." });
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
  if (!group || !requester || !userToAdd) return res.status(404).json({ error: "Resource not found." });
  if (group.owner.toString() !== requester._id.toString()) {
    return res.status(403).json({ error: "Only the group owner can add new members." });
  }
  if (group.members.includes(userToAdd._id)) {
    return res.status(409).json({ message: "User is already a member of this group." });
  }
  await group.updateOne({ $addToSet: { members: userToAdd._id } });
  await userToAdd.updateOne({ $addToSet: { groups: group._id } });
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await Event.updateMany({ group: group._id, date: { $gte: today } }, { $addToSet: { members: userToAdd._id, undecided: userToAdd._id } });
    console.log(`Added new member ${userToAdd._id} to all upcoming events for group ${group._id}`);
  } catch (eventError) {
    console.error("Could not update upcoming events with new member:", eventError);
  }
  res.status(200).json({ message: "User added to group successfully." });
});

// --- ADD THIS NEW CONTROLLER FUNCTION ---
export const deleteGroup = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { groupId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({ error: "Invalid Group ID." });
  }

  // Find the group and the user requesting deletion
  const group = await Group.findById(groupId);
  const requester = await User.findOne({ clerkId }).lean();

  if (!group) return res.status(404).json({ error: "Group not found." });
  if (!requester) return res.status(404).json({ error: "User not found." });

  // Authorization: Check if the requester is the group owner
  if (group.owner.toString() !== requester._id.toString()) {
    return res.status(403).json({ error: "Only the group owner can delete the group." });
  }

  // 1. Delete all events associated with this group
  await Event.deleteMany({ group: groupId });
  console.log(`Deleted all events for group ${groupId}`);

  // 2. Remove this group's ID from the 'groups' array of all its members
  await User.updateMany(
    { _id: { $in: group.members } }, // Find all users who are members
    { $pull: { groups: groupId } } // Pull the group ID from their 'groups' array
  );
  console.log(`Removed group ${groupId} from all members' user profiles`);

  // 3. Delete the group itself
  await Group.findByIdAndDelete(groupId);
  console.log(`Deleted group ${groupId}`);

  res.status(200).json({ message: "Group and all associated events have been deleted." });
});