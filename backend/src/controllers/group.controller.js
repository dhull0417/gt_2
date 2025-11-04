import asyncHandler from "express-async-handler";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import Event from "../models/event.model.js";
import Notification from "../models/notification.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";
import { calculateNextEventDate } from "../utils/date.utils.js";
import { ENV } from "../config/env.js";
import { syncStreamUser } from "../utils/stream.js";

// New function for inviting a user to a group
export const inviteUser = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { userIdToInvite } = req.body;

    const requester = await User.findOne({ clerkId }).lean();
    const group = await Group.findById(groupId);
    const userToInvite = await User.findById(userIdToInvite);

    if (!requester || !group || !userToInvite) return res.status(404).json({ error: "Resource not found." });

    if (group.owner.toString() !== requester._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can send invitations." });
    }
    
    if (group.members.includes(userToInvite._id)) {
        return res.status(400).json({ error: "User is already a member of this group." });
    }

    const existingInvite = await Notification.findOne({
        recipient: userToInvite._id,
        group: group._id,
        type: 'group-invite',
        status: 'pending',
    });
    if (existingInvite) {
        return res.status(400).json({ error: "This user already has a pending invitation to this group." });
    }

    await Notification.create({
        recipient: userToInvite._id,
        sender: requester._id,
        type: 'group-invite',
        group: group._id,
    });

    res.status(200).json({ message: "Invitation sent successfully." });
});

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
  } catch (eventError) {
    console.error("Failed to create the first events for the new group:", eventError);
  }

  // ✅ Sync all group members with Stream
  await Promise.all(newGroup.members.map(syncStreamUser));

  res.status(201).json({ group: newGroup, message: "Group created successfully." });
});

export const updateGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { name, time, schedule, timezone } = req.body;
    if ((name && name.trim() === '') || !time || !schedule || !timezone || !schedule.days || schedule.days.length === 0) {
        return res.status(400).json({ error: "Time, schedule, and timezone are required. Name cannot be empty." });
    }
    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });
    if (group.owner.toString() !== requester._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can edit the group." });
    }
    if (name) group.name = name;
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
    } catch (eventError) {
        console.error("Failed to regenerate event after group update:", eventError);
    }
    res.status(200).json({ group: updatedGroup, message: "Group updated successfully." });
});

export const getGroups = asyncHandler(async (req, res) => {
    const user = await User.findOne({ clerkId: req.auth.userId }).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    // 1. Get groups from MongoDB as plain objects
    const groups = await Group.find({ members: user._id }).lean();
    if (!groups.length) {
        return res.status(200).json([]);
    }

    // 2. Get the list of channel IDs from your groups
    const channelIds = groups.map(group => group._id.toString());

    // 3. Query Stream for all channels at once, sorted by last message,
    //    and include the last message.
    const channels = await ENV.SERVER_CLIENT.queryChannels(
    { id: { $in: channelIds } },
    [{ last_message_at: -1 }],
    { 
        state: true,
        messages: { limit: 1 } // clearer intention
    }
);


    // 4. Create a simple map of channelId -> lastMessage
    const lastMessageMap = new Map();
    channels.forEach(channel => {
        if (channel.state.messages.length > 0) {
        const lastMsg = channel.state.messages[channel.state.messages.length - 1];            lastMessageMap.set(channel.cid.split(':')[1], {
                text: lastMsg.text,
                user: { name: lastMsg.user.name || lastMsg.user.id } // Use name, fallback to ID
            });
        }
    });

    // 5. Stitch the last message data onto your group objects
    const hydratedGroups = groups.map(group => ({
        ...group,
        lastMessage: lastMessageMap.get(group._id.toString()) || null
    }));

    // 6. Send the combined data
    res.status(200).json(hydratedGroups);
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
  } catch (eventError) {
    console.error("Could not update upcoming events with new member:", eventError);
  }
  // ✅ Ensure the new member exists in Stream
  await syncStreamUser(newMember);

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
    
    const { hours, minutes } = parseTime(time);
    const eventDateTime = DateTime.fromJSDate(new Date(date), { zone: timezone }).set({ hour: hours, minute: minutes });
    const now = DateTime.now().setZone(timezone);

    if (eventDateTime < now) {
        return res.status(400).json({ error: "Cannot schedule an event in the past." });
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