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

// --- Helpers ---

/**
 * HELPER: canManageGroup
 * Checks if the user is the primary owner or in the moderator list.
 * EXPORTED: Added 'export' so this can be used in event.controller.js 
 * to authorize individual event management.
 */
export const canManageGroup = (userId, group) => {
    if (!userId || !group) return false;
    const isOwner = group.owner.toString() === userId.toString();
    const isMod = group.moderators?.some(id => id.toString() === userId.toString());
    return isOwner || isMod;
};

const getScheduleItems = (schedule) => {
    if (schedule.frequency === 'daily') return [0]; 
    if (schedule.frequency === 'custom') return schedule.rules || [];
    if (schedule.frequency === 'once') return [schedule.date]; 
    return schedule.days || [];
};

/**
 * @desc    Create a new group
 * @route   POST /api/groups/create
 */
export const createGroup = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { name, time, schedule, timezone, eventsToDisplay, members, defaultCapacity } = req.body;
  
  if (!name || !time || !schedule || !timezone) {
    return res.status(400).json({ error: "All details required." });
  }

  const limit = eventsToDisplay ? parseInt(eventsToDisplay) : 3;
  const owner = await User.findOne({ clerkId });
  if (!owner) return res.status(404).json({ error: "User not found." });
  
  let initialMemberIds = [owner._id.toString()];
  if (members && Array.isArray(members)) {
      initialMemberIds = [...initialMemberIds, ...members];
  }
  const uniqueMemberIds = [...new Set(initialMemberIds)];

  const groupData = { 
      name, 
      time, 
      schedule, 
      timezone, 
      eventsToDisplay: limit, 
      owner: owner._id, 
      members: uniqueMemberIds,
      defaultCapacity: defaultCapacity || 0,
      moderators: [] 
  };
  
  const newGroup = await Group.create(groupData);

  await User.updateMany(
      { _id: { $in: uniqueMemberIds } },
      { $addToSet: { groups: newGroup._id } }
  );

  const membersToNotify = uniqueMemberIds.filter(id => id !== owner._id.toString());
  if (membersToNotify.length > 0) {
      const notifications = membersToNotify.map(memberId => ({
          recipient: memberId,
          sender: owner._id,
          type: 'group-added', 
          group: newGroup._id,
          status: 'read',
          read: false
      }));
      
      try {
          await Notification.insertMany(notifications);
      } catch (error) {
          console.error("Failed to create notifications:", error);
      }
  }

  try {
    const itemsToIterate = getScheduleItems(newGroup.schedule);
    let potentialEvents = [];

    for (const item of itemsToIterate) {
        let lastGeneratedDate = null;
        const generationLimit = newGroup.schedule.frequency === 'once' ? 1 : limit;

        for (let i = 0; i < generationLimit; i++) {
            const nextEventDate = calculateNextEventDate(
                item, 
                newGroup.time, 
                newGroup.timezone, 
                newGroup.schedule.frequency,
                lastGeneratedDate
            );
            potentialEvents.push(nextEventDate);
            lastGeneratedDate = nextEventDate;
        }
    }

    potentialEvents.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const finalEvents = potentialEvents.slice(0, limit);

    for (const date of finalEvents) {
        await Event.create({
            group: newGroup._id, 
            name: newGroup.name, 
            date: date, 
            time: newGroup.time,
            timezone: newGroup.timezone,
            members: uniqueMemberIds, 
            undecided: uniqueMemberIds,
            capacity: newGroup.defaultCapacity
        });
    }
  } catch (eventError) {
    console.error("Failed to create initial events:", eventError);
  }

  await Promise.all(uniqueMemberIds.map(id => syncStreamUser({ _id: id })));

  res.status(201).json({ group: newGroup, message: "Created successfully." });
});

/**
 * @desc    Update group basic info (Owner or Moderator)
 * @route   PUT /api/groups/:groupId
 */
export const updateGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { name, eventsToDisplay } = req.body;
    
    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });
    
    if (!canManageGroup(requester._id, group)) {
        return res.status(403).json({ error: "Permission denied." });
    }
    
    if (name) group.name = name;
    if (eventsToDisplay) group.eventsToDisplay = parseInt(eventsToDisplay);
    
    const updatedGroup = await group.save();
    res.status(200).json({ group: updatedGroup, message: "Group updated successfully." });
});

/**
 * @desc    Update group schedule and capacity (Owner or Moderator)
 * @route   PATCH /api/groups/:groupId/schedule
 */
export const updateGroupSchedule = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { schedule, time, timezone, defaultCapacity } = req.body;
    const { userId: clerkId } = getAuth(req);

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });

    if (!group || !user) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(user._id, group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    if (schedule) group.schedule = schedule;
    if (time) group.time = time;
    if (timezone) group.timezone = timezone;
    if (defaultCapacity !== undefined) group.defaultCapacity = Number(defaultCapacity);
    
    await group.save();

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    await Event.deleteMany({ 
        group: group._id, 
        isOverride: false, 
        date: { $gte: today } 
    });

    try {
        const limit = group.eventsToDisplay || 3;
        const items = getScheduleItems(group.schedule);
        let potentialEvents = [];

        for (const item of items) {
            let lastGeneratedDate = null;
            for (let i = 0; i < limit; i++) {
                const nextEventDate = calculateNextEventDate(
                    item, 
                    group.time, 
                    group.timezone, 
                    group.schedule.frequency,
                    lastGeneratedDate
                );
                potentialEvents.push(nextEventDate);
                lastGeneratedDate = nextEventDate;
            }
        }

        potentialEvents.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        const finalDates = potentialEvents.slice(0, limit);

        for (const date of finalDates) {
            await Event.create({
                group: group._id, 
                name: group.name, 
                date: date, 
                time: group.time,
                timezone: group.timezone,
                members: group.members, 
                undecided: group.members,
                capacity: group.defaultCapacity 
            });
        }
    } catch (eventError) {
        console.error("Regeneration Error:", eventError);
    }

    res.status(200).json({ message: "Schedule updated.", group });
});

/**
 * @desc    Set the entire list of moderators (Owner Only)
 */
export const updateModerators = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { moderatorIds } = req.body;
    const { userId: clerkId } = getAuth(req);

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });

    if (!group || !user) return res.status(404).json({ error: "Group not found." });

    if (group.owner.toString() !== user._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can manage the moderator list." });
    }

    const validModeratorIds = moderatorIds.filter(id => 
        id !== group.owner.toString() && 
        group.members.some(m => m.toString() === id)
    );

    group.moderators = validModeratorIds;
    await group.save();

    res.status(200).json({ 
        message: "Moderator list updated successfully.", 
        group 
    });
});

/**
 * @desc    Toggle Moderator status for a member (Owner Only)
 */
export const toggleModerator = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { userIdToToggle } = req.body;
    const { userId: clerkId } = getAuth(req);

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });

    if (!group || !user) return res.status(404).json({ error: "Not found." });

    if (group.owner.toString() !== user._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can manage moderators." });
    }

    if (group.owner.toString() === userIdToToggle) {
        return res.status(400).json({ error: "The owner cannot be demoted." });
    }

    const isCurrentlyMod = group.moderators.some(id => id.toString() === userIdToToggle);

    if (isCurrentlyMod) {
        group.moderators = group.moderators.filter(id => id.toString() !== userIdToToggle);
    } else {
        group.moderators.push(userIdToToggle);
    }

    await group.save();
    res.status(200).json({ 
        message: isCurrentlyMod ? "Moderator permissions removed." : "Member promoted to Moderator.",
        group 
    });
});

export const getGroups = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const user = await User.findOne({ clerkId }).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const groups = await Group.find({ members: user._id }).lean();
    if (!groups.length) {
        return res.status(200).json([]);
    }

    const channelIds = groups.map(group => group._id.toString());
    const channels = await ENV.SERVER_CLIENT.queryChannels({ id: { $in: channelIds } }, [{ last_message_at: -1 }], { state: true, messages: { limit: 1 } });

    const lastMessageMap = new Map();
    channels.forEach(channel => {
        if (channel.state.messages.length > 0) {
            const lastMsg = channel.state.messages[channel.state.messages.length - 1];
            lastMessageMap.set(channel.cid.split(':')[1], {
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
    
    const group = await Group.findById(groupId)
        .populate("members", "firstName lastName _id profilePicture username")
        .populate("moderators", "firstName lastName username profilePicture _id")
        .lean();
        
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
  
  if (!canManageGroup(requester._id, group)) {
    return res.status(403).json({ error: "Permission denied." });
  }

  if (group.members.includes(userToAdd._id)) {
    return res.status(409).json({ message: "User is already a member." });
  }

  await group.updateOne({ $addToSet: { members: userToAdd._id } });
  await userToAdd.updateOne({ $addToSet: { groups: group._id } });

  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await Event.updateMany(
        { group: group._id, date: { $gte: today } }, 
        { $addToSet: { members: userToAdd._id, undecided: userToAdd._id } }
    );
  } catch (eventError) {
    console.error("Event update error:", eventError);
  }
  
  await syncStreamUser(userToAdd);
  res.status(200).json({ message: "User added successfully." });
});

export const inviteUser = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { userIdToInvite } = req.body;

    const requester = await User.findOne({ clerkId }).lean();
    const group = await Group.findById(groupId);
    const userToInvite = await User.findById(userIdToInvite);

    if (!requester || !group || !userToInvite) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, group)) {
        return res.status(403).json({ error: "Permission denied." });
    }
    
    if (group.members.includes(userToInvite._id)) {
        return res.status(400).json({ error: "User is already a member." });
    }

    const existingInvite = await Notification.findOne({
        recipient: userToInvite._id,
        group: group._id,
        type: 'group-invite',
        status: 'pending',
    });
    if (existingInvite) return res.status(400).json({ error: "Invite already pending." });

    await Notification.create({
        recipient: userToInvite._id,
        sender: requester._id,
        type: 'group-invite',
        group: group._id,
    });

    res.status(200).json({ message: "Invitation sent." });
});

export const removeMember = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { memberIdToRemove } = req.body;

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    const memberToRemove = await User.findById(memberIdToRemove);

    if (!group || !requester || !memberToRemove) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    const isTargetOwner = group.owner.toString() === memberIdToRemove;
    const isTargetMod = group.moderators.some(id => id.toString() === memberIdToRemove);
    const isRequesterOwner = group.owner.toString() === requester._id.toString();

    if (isTargetOwner) return res.status(400).json({ error: "Cannot remove the owner." });
    
    if (isTargetMod && !isRequesterOwner) {
        return res.status(403).json({ error: "Moderators cannot remove other moderators." });
    }

    await group.updateOne({ $pull: { members: memberToRemove._id, moderators: memberToRemove._id } });
    await memberToRemove.updateOne({ $pull: { groups: group._id } });

    await Event.updateMany(
        { group: group._id, date: { $gte: new Date() } },
        { $pull: { members: memberToRemove._id, in: memberToRemove._id, out: memberToRemove._id, undecided: memberToRemove._id, waitlist: memberToRemove._id } }
    );

    res.status(200).json({ message: "Member successfully removed." });
});

export const createOneOffEvent = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { date, time, timezone, capacity, name } = req.body;

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();

    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    const eventDate = calculateNextEventDate(date, time, timezone, 'once');

    if (eventDate < new Date()) {
         return res.status(400).json({ error: "Cannot schedule an event in the past." });
    }

    const newEvent = await Event.create({
        group: group._id,
        name: name || group.name,
        date: eventDate,
        time: time,
        timezone: timezone,
        members: group.members,
        undecided: group.members,
        capacity: capacity !== undefined ? capacity : group.defaultCapacity,
        isOverride: true,
    });

    res.status(201).json({ event: newEvent, message: "One-off event scheduled successfully." });
});

export const leaveGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId }).lean();

    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    
    if (group.owner.toString() === user._id.toString()) {
        return res.status(403).json({ error: "Owner cannot leave. Please delete the group or transfer ownership." });
    }

    await group.updateOne({ $pull: { members: user._id, moderators: user._id } });
    await User.updateOne({ _id: user._id }, { $pull: { groups: group._id } });

    await Event.updateMany(
        { group: group._id, date: { $gte: new Date() } },
        { $pull: { members: user._id, in: user._id, out: user._id, undecided: user._id, waitlist: user._id } }
    );

    res.status(200).json({ message: "You have left the group." });
});

export const deleteGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();

    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });
    
    if (group.owner.toString() !== requester._id.toString()) {
        return res.status(403).json({ error: "Only the owner can delete the group." });
    }

    await Event.deleteMany({ group: groupId });
    await Notification.deleteMany({ group: groupId });
    await User.updateMany({ _id: { $in: group.members } }, { $pull: { groups: groupId } });
    await Group.findByIdAndDelete(groupId);

    res.status(200).json({ message: "Group and all data deleted." });
});