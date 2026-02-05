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
import { notifyUsers } from "../utils/push.notifications.js";
import { DateTime } from "luxon";

// --- Helpers ---

/**
 * HELPER: canManageGroup
 * Checks if the user is the primary owner or in the moderator list.
 */
export const canManageGroup = (userId, group) => {
    if (!userId || !group) return false;
    const isOwner = group.owner.toString() === userId.toString();
    const isMod = group.moderators?.some(id => id.toString() === userId.toString());
    return isOwner || isMod;
};

/**
 * @desc    Create a new group
 */
export const createGroup = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { 
    name, 
    schedule, 
    timezone, 
    eventsToDisplay, 
    members, 
    defaultCapacity,
    defaultLocation,
    generationLeadDays,
    generationLeadTime
  } = req.body;
  
  if (!name || !timezone) {
    return res.status(400).json({ error: "Name and Timezone are required." });
  }

  const owner = await User.findOne({ clerkId });
  if (!owner) return res.status(404).json({ error: "User not found." });
  
  let initialMemberIds = [owner._id.toString()];
  if (members && Array.isArray(members)) {
      initialMemberIds = [...initialMemberIds, ...members];
  }
  const uniqueMemberIds = [...new Set(initialMemberIds)];

  const groupData = { 
      name, 
      schedule: schedule || null,
      timezone, 
      eventsToDisplay: eventsToDisplay || 1, 
      owner: owner._id, 
      members: uniqueMemberIds,
      defaultCapacity: defaultCapacity || 0,
      defaultLocation: defaultLocation || "",
      generationLeadDays: generationLeadDays !== undefined ? Number(generationLeadDays) : 2,
      generationLeadTime: generationLeadTime || "09:00 AM",
      moderators: [] 
  };
  
  const newGroup = await Group.create(groupData);

  await User.updateMany(
      { _id: { $in: uniqueMemberIds } },
      { $addToSet: { groups: newGroup._id } }
  );

  // Initial Generation with Window Filling
  if (newGroup.schedule && newGroup.schedule.routines) {
      try {
          const now = DateTime.now().setZone(timezone);
          const kickoffDate = newGroup.schedule.startDate 
              ? DateTime.fromJSDate(newGroup.schedule.startDate, { zone: 'utc' })
                  .setZone(timezone, { keepLocalTime: true })
                  .startOf('day')
                  .toJSDate()
              : now.startOf('day').toJSDate();

          for (const routine of newGroup.schedule.routines) {
              for (const dtEntry of routine.dayTimes) {
                  let currentAnchor = null;
                  let fillingWindow = true;
                  let loopSafety = 0;

                  while (fillingWindow && loopSafety < 15) {
                      const nextDate = calculateNextEventDate(
                          routine.frequency === 'monthly' ? dtEntry.date : dtEntry.day, 
                          dtEntry.time, 
                          timezone, 
                          routine.frequency,
                          currentAnchor,
                          routine.frequency === 'ordinal' ? routine.rules?.[0] : null
                      );

                      if (nextDate < kickoffDate) {
                          currentAnchor = nextDate;
                          loopSafety++;
                          continue;
                      }

                      const nextMeetingDT = DateTime.fromJSDate(nextDate).setZone(timezone);
                      const triggerDT = nextMeetingDT.minus({ days: newGroup.generationLeadDays });

                      if (now >= triggerDT) {
                          await Event.create({
                              group: newGroup._id, 
                              name: newGroup.name, 
                              date: nextDate, 
                              time: dtEntry.time,
                              timezone: timezone,
                              location: newGroup.defaultLocation,
                              members: uniqueMemberIds, 
                              undecided: uniqueMemberIds,
                              capacity: newGroup.defaultCapacity,
                              isOverride: false
                          });
                          currentAnchor = nextDate;
                          loopSafety++;
                      } else {
                          fillingWindow = false;
                      }
                  }
              }
          }
      } catch (err) { console.error("Initial Gen Error:", err); }
  }

  await Promise.all(uniqueMemberIds.map(id => syncStreamUser({ _id: id })));
  res.status(201).json({ group: newGroup, message: "Created successfully." });
});

/**
 * @desc    Update group schedule and capacity
 */
export const updateGroupSchedule = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { schedule, timezone, defaultCapacity, defaultLocation } = req.body;
    const { userId: clerkId } = getAuth(req);

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });

    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(user._id, group)) return res.status(403).json({ error: "Permission denied." });

    if (schedule) group.schedule = schedule;
    if (timezone) group.timezone = timezone;
    if (defaultCapacity !== undefined) group.defaultCapacity = Number(defaultCapacity);
    if (defaultLocation !== undefined) group.defaultLocation = defaultLocation;
    
    await group.save();

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    await Event.deleteMany({ 
        group: group._id, 
        isOverride: false, 
        date: { $gte: today } 
    });

    if (group.schedule && group.schedule.routines) {
        try {
            const now = DateTime.now().setZone(group.timezone);
            const kickoffDate = group.schedule.startDate 
                ? DateTime.fromJSDate(group.schedule.startDate, { zone: 'utc' })
                    .setZone(group.timezone, { keepLocalTime: true })
                    .startOf('day')
                    .toJSDate()
                : now.startOf('day').toJSDate();

            for (const routine of group.schedule.routines) {
                for (const dtEntry of routine.dayTimes) {
                    let currentAnchor = null;
                    let fillingWindow = true;
                    let loopSafety = 0;

                    while (fillingWindow && loopSafety < 15) {
                        const nextDate = calculateNextEventDate(
                            routine.frequency === 'monthly' ? dtEntry.date : dtEntry.day, 
                            dtEntry.time, 
                            group.timezone, 
                            routine.frequency,
                            currentAnchor,
                            routine.frequency === 'ordinal' ? routine.rules?.[0] : null
                        );

                        if (nextDate < kickoffDate) {
                            currentAnchor = nextDate;
                            loopSafety++;
                            continue;
                        }

                        const nextMeetingDT = DateTime.fromJSDate(nextDate).setZone(group.timezone);
                        const triggerDT = nextMeetingDT.minus({ days: group.generationLeadDays });

                        if (now >= triggerDT) {
                            await Event.create({
                                group: group._id, 
                                name: group.name, 
                                date: nextDate, 
                                time: dtEntry.time,
                                timezone: group.timezone,
                                location: group.defaultLocation,
                                members: group.members, 
                                undecided: group.members,
                                capacity: group.defaultCapacity,
                                isOverride: false
                            });
                            currentAnchor = nextDate;
                            loopSafety++;
                        } else {
                            fillingWindow = false;
                        }
                    }
                }
            }
        } catch (err) { console.error("Update Gen Error:", err); }
    }

    res.status(200).json({ message: "Schedule updated.", group });
});

/**
 * @desc    Update group general details
 */
export const updateGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { 
        name, 
        eventsToDisplay, 
        defaultLocation,
        generationLeadDays,
        generationLeadTime,
        defaultCapacity // FIXED: Now accepting capacity updates in the main controller
    } = req.body;

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    // --- NAME SYNC LOGIC ---
    if (name && name !== group.name) {
        group.name = name;
        await Event.updateMany(
            { group: groupId }, 
            { $set: { name: name } }
        );
    }

    if (eventsToDisplay) group.eventsToDisplay = parseInt(eventsToDisplay);
    if (defaultLocation !== undefined) group.defaultLocation = defaultLocation;
    if (generationLeadDays !== undefined) group.generationLeadDays = Number(generationLeadDays);
    if (generationLeadTime !== undefined) group.generationLeadTime = generationLeadTime;
    
    // FIXED: Persist the default capacity to the group document
    if (defaultCapacity !== undefined) {
        group.defaultCapacity = Math.max(0, Number(defaultCapacity));
    }

    const updatedGroup = await group.save();
    res.status(200).json({ group: updatedGroup, message: "Group updated successfully." });
});

export const updateModerators = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { moderatorIds } = req.body;
    const { userId: clerkId } = getAuth(req);

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });

    if (!group || !user) return res.status(404).json({ error: "Group not found." });
    if (group.owner.toString() !== user._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can manage moderators." });
    }

    const validModeratorIds = moderatorIds.filter(id => 
        id !== group.owner.toString() && group.members.some(m => m.toString() === id)
    );

    group.moderators = validModeratorIds;
    await group.save();
    res.status(200).json({ message: "Moderator list updated successfully.", group });
});

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
    res.status(200).json({ message: isCurrentlyMod ? "Moderator removed." : "Moderator added.", group });
});

export const getGroups = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const user = await User.findOne({ clerkId }).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const groups = await Group.find({ members: user._id }).lean();
    if (!groups.length) return res.status(200).json([]);

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
    if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: "Invalid ID." });
    
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
      return res.status(400).json({ error: "Invalid ID." });
  }

  const group = await Group.findById(groupId);
  const requester = await User.findOne({ clerkId: requesterClerkId });
  const userToAdd = await User.findById(sanitizedUserId);

  if (!group || !requester || !userToAdd) return res.status(404).json({ error: "Resource not found." });
  if (!canManageGroup(requester._id, group)) return res.status(403).json({ error: "Permission denied." });
  if (group.members.includes(userToAdd._id)) return res.status(409).json({ message: "User is already a member." });

  await group.updateOne({ $addToSet: { members: userToAdd._id } });
  await userToAdd.updateOne({ $addToSet: { groups: group._id } });

  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await Event.updateMany(
        { group: group._id, date: { $gte: today } }, 
        { $addToSet: { members: userToAdd._id, undecided: userToAdd._id } }
    );
    await notifyUsers([userToAdd], { 
        title: "Added to Group", 
        body: `${requester.firstName} added you to "${group.name}".`, 
        data: { groupId: group._id.toString(), type: 'group-added' } 
    });
  } catch (err) { console.error(err); }
  
  await syncStreamUser(userToAdd);
  res.status(200).json({ message: "User added." });
});

export const inviteUser = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { userIdToInvite } = req.body;

    const requester = await User.findOne({ clerkId }).lean();
    const group = await Group.findById(groupId);
    const userToInvite = await User.findById(userIdToInvite);

    if (!requester || !group || !userToInvite) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(requester._id, group)) return res.status(403).json({ error: "Permission denied." });
    if (group.members.includes(userToInvite._id)) return res.status(400).json({ error: "User is already a member." });

    const existingInvite = await Notification.findOne({ recipient: userToInvite._id, group: group._id, type: 'group-invite', status: 'pending' });
    if (existingInvite) return res.status(400).json({ error: "Invite already pending." });

    await Notification.create({ recipient: userToInvite._id, sender: requester._id, type: 'group-invite', group: group._id });
    await notifyUsers([userToInvite], { 
        title: "Group Invitation", 
        body: `${requester.firstName} invited you to join "${group.name}".`, 
        data: { groupId: group._id.toString(), type: 'group-invite' } 
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
    if (!canManageGroup(requester._id, group)) return res.status(403).json({ error: "Permission denied." });

    if (group.owner.toString() === memberIdToRemove) return res.status(400).json({ error: "Cannot remove owner." });
    if (group.moderators.some(id => id.toString() === memberIdToRemove) && group.owner.toString() !== requester._id.toString()) {
        return res.status(403).json({ error: "Moderators cannot remove other moderators." });
    }

    await group.updateOne({ $pull: { members: memberToRemove._id, moderators: memberToRemove._id } });
    await memberToRemove.updateOne({ $pull: { groups: group._id } });
    await Event.updateMany({ group: group._id, date: { $gte: new Date() } }, { $pull: { members: memberToRemove._id, in: memberToRemove._id, out: memberToRemove._id, undecided: memberToRemove._id, waitlist: memberToRemove._id } });
    res.status(200).json({ message: "Member removed." });
});

export const createOneOffEvent = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { date, time, timezone, capacity, name, location } = req.body;

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(requester._id, group)) return res.status(403).json({ error: "Permission denied." });

    const eventDate = calculateNextEventDate(date, time, timezone, 'once');
    if (eventDate < new Date()) return res.status(400).json({ error: "Cannot schedule in the past." });

    const newEvent = await Event.create({
        group: group._id,
        name: name || group.name,
        date: eventDate,
        time: time,
        timezone: timezone,
        location: location !== undefined ? location : group.defaultLocation,
        members: group.members,
        undecided: group.members,
        capacity: capacity !== undefined ? capacity : group.defaultCapacity,
        isOverride: true,
    });
    res.status(201).json({ event: newEvent, message: "One-off event scheduled." });
});

export const leaveGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId }).lean();
    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (group.owner.toString() === user._id.toString()) return res.status(403).json({ error: "Owner cannot leave." });

    await group.updateOne({ $pull: { members: user._id, moderators: user._id } });
    await User.updateOne({ _id: user._id }, { $pull: { groups: group._id } });
    await Event.updateMany({ group: group._id, date: { $gte: new Date() } }, { $pull: { members: user._id, in: user._id, out: user._id, undecided: user._id, waitlist: user._id } });
    res.status(200).json({ message: "You have left." });
});

export const deleteGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });
    if (group.owner.toString() !== requester._id.toString()) return res.status(403).json({ error: "Only owner can delete." });

    await Event.deleteMany({ group: groupId });
    await Notification.deleteMany({ group: groupId });
    await User.updateMany({ _id: { $in: group.members } }, { $pull: { groups: groupId } });
    await Group.findByIdAndDelete(groupId);
    res.status(200).json({ message: "Deleted." });
});