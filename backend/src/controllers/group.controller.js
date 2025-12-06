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

// --- Helper to determine what to iterate over ---
const getScheduleItems = (schedule) => {
    if (schedule.frequency === 'daily') return [0]; 
    if (schedule.frequency === 'custom') return schedule.rules || [];
    return schedule.days || [];
};

// 👇 RE-ADDED MISSING FUNCTION
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
  const { name, time, schedule, timezone, eventsToDisplay } = req.body;
  
  // Validation
  if (!name || !time || !schedule || !timezone) {
    return res.status(400).json({ error: "All details required." });
  }

  // Validate the new limit field
  const limit = eventsToDisplay ? parseInt(eventsToDisplay) : 1;
  if (limit < 1 || limit > 14) {
      return res.status(400).json({ error: "Display events must be between 1 and 14." });
  }

  // Ensure days exist unless it's a custom schedule
  if (schedule.frequency !== 'custom' && (!schedule.days || schedule.days.length === 0)) {
    return res.status(400).json({ error: "At least one day must be selected." });
  }

  const owner = await User.findOne({ clerkId: userId });
  if (!owner) return res.status(404).json({ error: "User not found." });
  
  const groupData = { 
      name, time, schedule, timezone, 
      eventsToDisplay: limit, 
      owner: owner._id, members: [owner._id] 
  };
  
  const newGroup = await Group.create(groupData);
  await owner.updateOne({ $addToSet: { groups: newGroup._id } });

  try {
    const itemsToIterate = getScheduleItems(newGroup.schedule);

    // 👇 THE CHAINING LOOP
    for (const item of itemsToIterate) {
        let lastGeneratedDate = null; // Start from "Now" (default)

        // Loop N times to create the sequence
        for (let i = 0; i < limit; i++) {
            const nextEventDate = calculateNextEventDate(
                item, 
                newGroup.time, 
                newGroup.timezone, 
                newGroup.schedule.frequency,
                lastGeneratedDate // Pass previous date as anchor
            );

            await Event.create({
                group: newGroup._id, 
                name: newGroup.name, 
                date: nextEventDate, 
                time: newGroup.time,
                timezone: newGroup.timezone,
                members: newGroup.members, 
                undecided: newGroup.members,
            });

            // Update anchor for next iteration
            lastGeneratedDate = nextEventDate;
        }
    }
  } catch (eventError) {
    console.error("Failed to create events:", eventError);
  }

  await Promise.all(newGroup.members.map(syncStreamUser));
  res.status(201).json({ group: newGroup, message: "Group created successfully." });
});

export const updateGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { name, time, schedule, timezone, eventsToDisplay } = req.body;
    
    if ((name && name.trim() === '') || !time || !schedule || !timezone) {
        return res.status(400).json({ error: "Required fields missing." });
    }
    
    const limit = eventsToDisplay ? parseInt(eventsToDisplay) : 1;
    if (limit < 1 || limit > 14) {
        return res.status(400).json({ error: "Display events must be between 1 and 14." });
    }

    if (schedule.frequency !== 'custom' && (!schedule.days || schedule.days.length === 0)) {
        return res.status(400).json({ error: "At least one day is required." });
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
    group.eventsToDisplay = limit;
    
    const updatedGroup = await group.save();
    
    try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        await Event.deleteMany({ group: group._id, isOverride: false, date: { $gte: today } });
        
        const itemsToIterate = getScheduleItems(updatedGroup.schedule);

        // 👇 THE CHAINING LOOP
        for (const item of itemsToIterate) {
            let lastGeneratedDate = null; 

            for (let i = 0; i < limit; i++) {
                const nextEventDate = calculateNextEventDate(
                    item, 
                    updatedGroup.time, 
                    updatedGroup.timezone, 
                    updatedGroup.schedule.frequency,
                    lastGeneratedDate
                );
                
                await Event.create({
                    group: updatedGroup._id, 
                    name: updatedGroup.name, 
                    date: nextEventDate, 
                    time: updatedGroup.time,
                    timezone: updatedGroup.timezone, 
                    members: updatedGroup.members, 
                    undecided: updatedGroup.members,
                });

                lastGeneratedDate = nextEventDate;
            }
        }
    } catch (eventError) {
        console.error("Failed to regenerate events:", eventError);
    }
    res.status(200).json({ group: updatedGroup, message: "Group updated successfully." });
});

export const getGroups = asyncHandler(async (req, res) => {
    const user = await User.findOne({ clerkId: req.auth.userId }).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const groups = await Group.find({ members: user._id }).lean();
    if (!groups.length) {
        return res.status(200).json([]);
    }

    const channelIds = groups.map(group => group._id.toString());

    const channels = await ENV.SERVER_CLIENT.queryChannels(
        { id: { $in: channelIds } },
        [{ last_message_at: -1 }],
        { 
            state: true,
            messages: { limit: 1 } 
        }
    );

    const lastMessageMap = new Map();
    channels.forEach(channel => {
        if (channel.state.messages.length > 0) {
        const lastMsg = channel.state.messages[channel.state.messages.length - 1];            lastMessageMap.set(channel.cid.split(':')[1], {
                text: lastMsg.text,
                user: { name: lastMsg.user.name || lastMsg.user.id }
            });
        }
    });

    const hydratedGroups = groups.map(group => ({
        ...group,
        lastMessage: lastMessageMap.get(group._id.toString()) || null
    }));

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
  await syncStreamUser(userToAdd);

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
    
    // Simple parse helper for local check
    const [t, p] = time.split(' ');
    let [h, m] = t.split(':').map(Number);
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    
    const eventDate = new Date(date);
    eventDate.setHours(h, m, 0, 0);
    if (eventDate < new Date()) {
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