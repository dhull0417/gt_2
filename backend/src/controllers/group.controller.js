import asyncHandler from "express-async-handler";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import Event from "../models/event.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";
import { calculateNextEventDate } from "../utils/date.utils.js";

export const createGroup = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  const { name, time, schedule, timezone } = req.body;
  if (!name || !time || !schedule || !timezone || !schedule.days || schedule.days.length === 0) {
    return res.status(400).json({ error: "All group details, including at least one day, are required." });
  }
  const owner = await User.findOne({ clerkId: userId });
  if (!owner) return res.status(404).json({ error: "User not found." });
  const groupData = { name, time, schedule, timezone, owner: owner._id, members: [owner._id] };
  const newGroup = await Group.create(groupData);
  await owner.updateOne({ $addToSet: { groups: newGroup._id } });

  try {
    for (const day of newGroup.schedule.days) {
      const eventDate = calculateNextEventDate(day, newGroup.time, newGroup.timezone, newGroup.schedule.frequency);
      await Event.create({
        group: newGroup._id, name: newGroup.name, date: eventDate, time: newGroup.time,
        timezone: newGroup.timezone,
        members: newGroup.members, undecided: newGroup.members,
      });
    }
    console.log(`Created initial events for new group '${newGroup.name}'`);
  } catch (eventError) {
    console.error("Failed to create the first events for the new group:", eventError);
  }
  res.status(201).json({ group: newGroup, message: "Group created successfully." });
});

export const updateGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { time, schedule, timezone } = req.body;
    if (!time || !schedule || !timezone || !schedule.days || schedule.days.length === 0) {
        return res.status(400).json({ error: "Time, schedule, and timezone are required." });
    }
    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });
    if (group.owner.toString() !== requester._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can edit the group." });
    }
    group.time = time;
    group.schedule = schedule;
    group.timezone = timezone;
    const updatedGroup = await group.save();
    try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        await Event.deleteMany({ group: group._id, isOverride: false, date: { $gte: today } });
        for (const day of updatedGroup.schedule.days) {
            const nextEventDate = calculateNextEventDate(day, updatedGroup.time, updatedGroup.timezone, updatedGroup.schedule.frequency);
            await Event.create({
                group: updatedGroup._id, name: updatedGroup.name, date: nextEventDate, time: updatedGroup.time,
                timezone: updatedGroup.timezone, members: updatedGroup.members, undecided: updatedGroup.members,
            });
        }
        console.log(`Regenerated events for updated group '${updatedGroup.name}'`);
    } catch (eventError) {
        console.error("Failed to regenerate event after group update:", eventError);
    }
    res.status(200).json({ group: updatedGroup, message: "Group updated successfully." });
});

export const getGroups = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  const currentUser = await User.findOne({ clerkId: userId }).lean();
  if (!currentUser) return res.status(404).json({ error: "User not found." });
  const userGroups = await Group.find({ members: currentUser._id }).select("name _id time schedule owner timezone");
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

export const deleteGroup = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { groupId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: "Invalid Group ID." });
  const group = await Group.findById(groupId);
  const requester = await User.findOne({ clerkId }).lean();
  if (!group || !requester) return res.status(404).json({ error: "Resource not found." });
  if (group.owner.toString() !== requester._id.toString()) {
      return res.status(403).json({ error: "Only the group owner can delete the group." });
  }
  await Event.deleteMany({ group: groupId });
  await User.updateMany({ _id: { $in: group.members } }, { $pull: { groups: groupId } });
  await Group.findByIdAndDelete(groupId);
  res.status(200).json({ message: "Group and all associated events have been deleted." });
});

export const leaveGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({ error: "Invalid Group ID." });
    }

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId }).lean();
    if (!group || !user) return res.status(404).json({ error: "Resource not found." });

    if (group.owner.toString() === user._id.toString()) {
        return res.status(403).json({ error: "Owner cannot leave the group. Please delete the group instead." });
    }

    await group.updateOne({ $pull: { members: user._id } });
    await User.updateOne({ _id: user._id }, { $pull: { groups: group._id } });

    await Event.updateMany(
        { group: group._id, date: { $gte: new Date() } },
        { $pull: { members: user._id, in: user._id, out: user._id, undecided: user._id } }
    );
    
    res.status(200).json({ message: "You have successfully left the group." });
});

export const removeMember = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { memberIdToRemove } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(memberIdToRemove)) {
        return res.status(400).json({ error: "Invalid ID format provided." });
    }

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    const memberToRemove = await User.findById(memberIdToRemove);
    if (!group || !requester || !memberToRemove) return res.status(404).json({ error: "Resource not found." });
    
    if (group.owner.toString() !== requester._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can remove members." });
    }

    if (group.owner.toString() === memberToRemove._id.toString()) {
        return res.status(400).json({ error: "Owner cannot be removed from their own group." });
    }

    await group.updateOne({ $pull: { members: memberToRemove._id } });
    await memberToRemove.updateOne({ $pull: { groups: group._id } });

    await Event.updateMany(
        { group: group._id, date: { $gte: new Date() } },
        { $pull: { members: memberToRemove._id, in: memberToRemove._id, out: memberToRemove._id, undecided: memberToRemove._id } }
    );
    
    res.status(200).json({ message: "Member successfully removed from the group." });
});

export const createOneOffEvent = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { date, time, timezone } = req.body;

    if (!date || !time || !timezone) {
        return res.status(400).json({ error: "Date, time, and timezone are required." });
    }

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();

    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });

    if (group.owner.toString() !== requester._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can schedule events." });
    }

    const newEvent = await Event.create({
        group: group._id,
        name: group.name,
        date: date,
        time: time,
        timezone: timezone,
        members: group.members,
        undecided: group.members,
        isOverride: true,
    });

    res.status(201).json({ event: newEvent, message: "One-off event scheduled successfully." });
});