import asyncHandler from "express-async-handler";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import Meetup from "../models/meetup.model.js";
import Notification from "../models/notification.model.js";
import InviteToken from "../models/inviteToken.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";
import crypto from "crypto";
import { calculateNextMeetupDate } from "../utils/date.utils.js";
import { generateMeetupsForGroup, generateMeetupsForSchedule } from "../utils/meetupGeneration.js";
import { notifyAndPersist } from "../utils/push.notifications.js";

// --- Helpers ---

// Distinguishes "field omitted" (use fallback) from "field explicitly cleared to
// unrestricted" (keep null) — a bare Number(null) would otherwise coerce to 0.
const numOrNull = (v, fallback) => v === undefined ? fallback : (v === null ? null : Number(v));

// --- Multi-schedule helpers ---

const MAX_ACTIVE_SCHEDULES = 5;

/**
 * Normalizes a request body into the namedSchedule shape stored on
 * Group.schedules; used by per-schedule endpoints and the legacy wrapper.
 */
const normalizeScheduleInput = (input, fallbackName) => ({
    name: (input.name && String(input.name).trim()) || fallbackName || "Schedule",
    startDate: input.startDate || null,
    routines: input.routines || [],
    defaultLocation: input.defaultLocation || "",
    defaultCapacity: input.defaultCapacity || 0,
    generationLeadDays: numOrNull(input.generationLeadDays, 1),
    generationLeadTime: input.generationLeadTime || "09:00 AM",
    generationDeadlineDays: numOrNull(input.generationDeadlineDays, null),
    generationDeadlineTime: input.generationDeadlineTime || "09:00 AM",
    active: true,
});

/**
 * Mirrors the first active schedule onto legacy top-level group fields
 * (schedule, generationLeadDays/Time, etc.) so pre-multi-schedule app
 * installs keep working. Applied to lean objects before sending. Remove
 * once the old client shape is no longer supported.
 */
const withLegacyScheduleMirror = (groupObj) => {
    const primary = groupObj.schedules?.find(s => s.active !== false) || null;
    return {
        ...groupObj,
        schedule: primary ? { startDate: primary.startDate, routines: primary.routines } : null,
        generationLeadDays: primary ? primary.generationLeadDays : null,
        generationLeadTime: primary ? primary.generationLeadTime : "09:00 AM",
        generationDeadlineDays: primary ? primary.generationDeadlineDays : null,
        generationDeadlineTime: primary ? primary.generationDeadlineTime : "09:00 AM",
    };
};

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
 * HELPER: canManageMember
 * Owner can manage anyone. A moderator can manage regular members only —
 * not the owner, and not another moderator.
 */
export const canManageMember = (requesterId, targetUserId, group) => {
    if (!canManageGroup(requesterId, group)) return false;
    if (group.owner.toString() === requesterId.toString()) return true;
    const targetIsOwner = group.owner.toString() === targetUserId.toString();
    const targetIsMod = group.moderators?.some(id => id.toString() === targetUserId.toString());
    return !targetIsOwner && !targetIsMod;
};

/**
 * @desc    Create a new group
 */
export const createGroup = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const {
    name,
    image,
    schedule,   // legacy singular payload — pre-multi-schedule app clients
    schedules,  // current payload — array of named schedules (usually 0 or 1 at create time)
    timezone,
    meetupsToDisplay,
    members,
    defaultCapacity,
    defaultLocation,
    generationLeadDays,
    generationLeadTime,
    generationDeadlineDays,
    generationDeadlineTime
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

  // new clients send `schedules`; legacy clients send a single `schedule` +
  // top-level fields — wrap both into the same Group.schedules array.
  let initialSchedules = [];
  if (Array.isArray(schedules) && schedules.length > 0) {
      initialSchedules = schedules.slice(0, MAX_ACTIVE_SCHEDULES).map(s => normalizeScheduleInput(s, name));
  } else if (schedule?.routines?.length) {
      initialSchedules = [normalizeScheduleInput({
          name,
          startDate: schedule.startDate,
          routines: schedule.routines,
          defaultLocation,
          defaultCapacity,
          generationLeadDays,
          generationLeadTime,
          generationDeadlineDays,
          generationDeadlineTime,
      }, name)];
  }

  const groupData = {
      name,
      image: image || "",
      schedules: initialSchedules,
      timezone,
      meetupsToDisplay: meetupsToDisplay || 1,
      owner: owner._id,
      members: uniqueMemberIds,
      defaultCapacity: defaultCapacity || 0,
      defaultLocation: defaultLocation || "",
      moderators: []
  };

  const newGroup = await Group.create(groupData);

  await User.updateMany(
      { _id: { $in: uniqueMemberIds } },
      { $addToSet: { groups: newGroup._id } }
  );

  // --- NOTIFICATION LOGIC ---
  const newlyAddedUserIds = uniqueMemberIds.filter(id => id.toString() !== owner._id.toString());
  if (newlyAddedUserIds.length > 0) {
      const newlyAddedUsers = await User.find({ _id: { $in: newlyAddedUserIds } });
      if (newlyAddedUsers.length > 0) {
          await notifyAndPersist(newlyAddedUsers, {
              title: "You've been added to a group!",
              body: `${owner.firstName} ${owner.lastName} added you to the group "${newGroup.name}".`,
              data: { groupId: newGroup._id.toString(), type: 'group_added' },
              type: 'group-added',
              sender: owner._id,
              group: newGroup._id,
          });
      }
  }
  // --- END NOTIFICATION LOGIC ---

  // Initial Generation with Window Filling
  if (newGroup.schedules?.length) {
    try {
      await generateMeetupsForGroup(newGroup);
    } catch (err) { console.error("Initial Gen Error:", err); }
  }

  res.status(201).json({ group: withLegacyScheduleMirror(newGroup.toObject()), message: "Created successfully." });
});

/**
 * @desc    LEGACY shim: applies the edit to the group's first active schedule
 *          (creating one if none exist), for pre-multi-schedule clients.
 *          Current clients use createSchedule/updateSchedule instead.
 * @route   PATCH /api/groups/:groupId/schedule
 */
export const updateGroupSchedule = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { schedule, timezone, defaultCapacity, defaultLocation } = req.body;
    const { userId: clerkId } = getAuth(req);

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });

    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(user._id, group)) return res.status(403).json({ error: "Permission denied." });

    if (timezone) group.timezone = timezone;
    if (defaultCapacity !== undefined) group.defaultCapacity = Number(defaultCapacity);
    if (defaultLocation !== undefined) group.defaultLocation = defaultLocation;

    let target = group.schedules.find(s => s.active !== false);
    if (!target && schedule?.routines?.length) {
        group.schedules.push(normalizeScheduleInput({
            name: group.name,
            startDate: schedule.startDate,
            routines: schedule.routines,
            defaultLocation,
            defaultCapacity,
        }, group.name));
        target = group.schedules[group.schedules.length - 1];
    } else if (target && schedule) {
        target.startDate = schedule.startDate || target.startDate;
        target.routines = schedule.routines || target.routines;
        if (defaultLocation !== undefined) target.defaultLocation = defaultLocation;
        if (defaultCapacity !== undefined) target.defaultCapacity = Number(defaultCapacity);
    }

    if (target && defaultLocation) {
        // sync auto-generated meetups to the new location, plus overrides with
        // no location of their own; overrides with one already set are untouched.
        await Meetup.updateMany(
            {
                group: group._id,
                schedule: target._id,
                $or: [
                    { isOverride: false },
                    { location: { $in: ["", null] } },
                ],
            },
            { $set: { location: defaultLocation } }
        );
    }

    await group.save();

    if (target) {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        await Meetup.deleteMany({
            group: group._id,
            schedule: target._id,
            isOverride: false,
            date: { $gte: today }
        });

        try {
            await generateMeetupsForGroup(group);
        } catch (err) {
            console.error("Update Gen Error:", err);
        }
    }

    res.status(200).json({ message: "Schedule updated.", group: withLegacyScheduleMirror(group.toObject()) });
});

/**
 * @desc    Create a new named schedule on a group (e.g. "Monthly Camping"),
 *          independent of any other schedules the group already has.
 * @route   POST /api/groups/:groupId/schedules
 */
export const createSchedule = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { userId: clerkId } = getAuth(req);
    const {
        name, startDate, routines, defaultLocation, defaultCapacity,
        generationLeadDays, generationLeadTime, generationDeadlineDays, generationDeadlineTime,
        timezone, // shared across the whole group, not per-schedule — see updateSchedule
    } = req.body;

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });
    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(user._id, group)) return res.status(403).json({ error: "Permission denied." });

    if (!name || !String(name).trim()) {
        return res.status(400).json({ error: "Schedule name is required." });
    }

    const activeCount = group.schedules.filter(s => s.active !== false).length;
    if (activeCount >= MAX_ACTIVE_SCHEDULES) {
        return res.status(400).json({ error: `A group can have at most ${MAX_ACTIVE_SCHEDULES} active schedules.` });
    }

    if (timezone) group.timezone = timezone;

    group.schedules.push(normalizeScheduleInput(
        { name, startDate, routines, defaultLocation, defaultCapacity, generationLeadDays, generationLeadTime, generationDeadlineDays, generationDeadlineTime },
        name
    ));
    await group.save();

    const created = group.schedules[group.schedules.length - 1];

    if (created.routines?.length) {
        try {
            await generateMeetupsForSchedule(group, created);
            await group.save();
        } catch (err) {
            console.error("Create Schedule Gen Error:", err);
        }
    }

    res.status(201).json({ message: "Schedule created.", group: withLegacyScheduleMirror(group.toObject()), scheduleId: created._id });
});

/**
 * @desc    Updates one named schedule's settings; regenerates only that
 *          schedule's future non-override meetups (siblings untouched).
 * @route   PATCH /api/groups/:groupId/schedules/:scheduleId
 */
export const updateSchedule = asyncHandler(async (req, res) => {
    const { groupId, scheduleId } = req.params;
    const { userId: clerkId } = getAuth(req);
    const {
        name, startDate, routines, defaultLocation, defaultCapacity,
        generationLeadDays, generationLeadTime, generationDeadlineDays, generationDeadlineTime,
        timezone, // shared across the whole group — schedules don't carry their own
    } = req.body;

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });
    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(user._id, group)) return res.status(403).json({ error: "Permission denied." });

    const target = group.schedules.id(scheduleId);
    if (!target || target.active === false) return res.status(404).json({ error: "Schedule not found." });

    if (timezone) group.timezone = timezone;

    if (name !== undefined) {
        if (!String(name).trim()) return res.status(400).json({ error: "Schedule name cannot be empty." });
        target.name = name.trim();
        // Keep already-generated future meetups' display name in sync with a rename.
        await Meetup.updateMany(
            { group: group._id, schedule: target._id, date: { $gte: new Date() } },
            { $set: { name: target.name } }
        );
    }
    if (startDate !== undefined) target.startDate = startDate;
    if (routines !== undefined) target.routines = routines;
    if (defaultCapacity !== undefined) target.defaultCapacity = Number(defaultCapacity);
    if (defaultLocation !== undefined) {
        target.defaultLocation = defaultLocation;
        if (defaultLocation) {
            await Meetup.updateMany(
                {
                    group: group._id,
                    schedule: target._id,
                    $or: [{ isOverride: false }, { location: { $in: ["", null] } }],
                },
                { $set: { location: defaultLocation } }
            );
        }
    }
    if (generationLeadDays !== undefined) target.generationLeadDays = numOrNull(generationLeadDays, null);
    if (generationLeadTime !== undefined) target.generationLeadTime = generationLeadTime;
    if (generationDeadlineDays !== undefined) target.generationDeadlineDays = numOrNull(generationDeadlineDays, null);
    if (generationDeadlineTime !== undefined) target.generationDeadlineTime = generationDeadlineTime;

    await group.save();

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await Meetup.deleteMany({ group: group._id, schedule: target._id, isOverride: false, date: { $gte: today } });

    if (target.routines?.length) {
        try {
            await generateMeetupsForSchedule(group, target);
            await group.save();
        } catch (err) {
            console.error("Update Schedule Gen Error:", err);
        }
    }

    res.status(200).json({ message: "Schedule updated.", group: withLegacyScheduleMirror(group.toObject()) });
});

/**
 * @desc    Removes a schedule: permanently deletes its future non-override
 *          meetups (they drop off the meetup tab entirely, not just shown as
 *          cancelled) and notifies members. Past meetups are left alone.
 * @route   DELETE /api/groups/:groupId/schedules/:scheduleId
 */
export const deleteSchedule = asyncHandler(async (req, res) => {
    const { groupId, scheduleId } = req.params;
    const { userId: clerkId } = getAuth(req);

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(requester._id, group)) return res.status(403).json({ error: "Permission denied." });

    const target = group.schedules.id(scheduleId);
    if (!target || target.active === false) return res.status(404).json({ error: "Schedule not found." });

    target.active = false;
    await group.save();

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const futureMeetups = await Meetup.find({
        group: group._id,
        schedule: target._id,
        isOverride: false,
        status: 'scheduled',
        date: { $gte: today },
    });

    if (futureMeetups.length > 0) {
        await Meetup.deleteMany({ _id: { $in: futureMeetups.map(m => m._id) } });

        const membersToNotify = await User.find({ _id: { $in: group.members } });
        if (membersToNotify.length > 0) {
            await notifyAndPersist(membersToNotify, {
                title: "Schedule Removed",
                body: `"${target.name}" was removed from "${group.name}" — its upcoming meetups have been deleted.`,
                data: { groupId: group._id.toString(), type: 'schedule_removed' },
                type: 'group-updated',
                sender: requester._id,
                group: group._id,
            });
        }
    }

    res.status(200).json({ message: "Schedule removed.", group: withLegacyScheduleMirror(group.toObject()) });
});

/**
 * @desc    Update group general details
 */
export const updateGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const {
        name,
        image,
        meetupsToDisplay,
        defaultLocation,
        generationLeadDays,
        generationLeadTime,
        generationDeadlineDays,
        generationDeadlineTime,
        defaultCapacity
    } = req.body;

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    const oldName = group.name;

    // renaming the group no longer renames meetups; a meetup's name comes from its schedule
    if (name && name !== group.name) {
        group.name = name;

        const membersToNotify = await User.find({ _id: { $in: group.members } });
        if (membersToNotify.length > 0) {
            await notifyAndPersist(membersToNotify, {
                title: "Group Name Changed",
                body: `The group "${oldName}" is now named "${group.name}".`,
                data: { groupId: group._id.toString(), type: 'group_updated' },
                type: 'group-updated',
                sender: requester._id,
                group: group._id,
            });
        }
    }

    if (image !== undefined) group.image = image;
    if (meetupsToDisplay) group.meetupsToDisplay = parseInt(meetupsToDisplay);

    // defaultCapacity/defaultLocation now live on the group only as the fallback
    // for schedule-less meetups; current clients edit a schedule directly instead.
    // Legacy clients still PUT these expecting them to affect "the" schedule, so
    // mirror onto the sole schedule when the group has exactly one (legacy shape).
    const soleSchedule = group.schedules.length === 1 ? group.schedules[0] : null;

    if (defaultCapacity !== undefined) {
        group.defaultCapacity = Number(defaultCapacity);
        if (soleSchedule) {
            soleSchedule.defaultCapacity = Number(defaultCapacity);
            await Meetup.updateMany(
                { group: groupId, schedule: soleSchedule._id, isOverride: false },
                { $set: { capacity: Number(defaultCapacity) } }
            );
        }
    }
    if (defaultLocation !== undefined) {
        group.defaultLocation = defaultLocation;
        if (soleSchedule) {
            soleSchedule.defaultLocation = defaultLocation;
            if (defaultLocation) {
                await Meetup.updateMany(
                    {
                        group: groupId,
                        schedule: soleSchedule._id,
                        $or: [{ isOverride: false }, { location: { $in: ["", null] } }],
                    },
                    { $set: { location: defaultLocation } }
                );
            }
        }
    }
    if (soleSchedule) {
        if (generationLeadDays !== undefined) soleSchedule.generationLeadDays = numOrNull(generationLeadDays, null);
        if (generationLeadTime !== undefined) soleSchedule.generationLeadTime = generationLeadTime;
        if (generationDeadlineDays !== undefined) soleSchedule.generationDeadlineDays = numOrNull(generationDeadlineDays, null);
        if (generationDeadlineTime !== undefined) soleSchedule.generationDeadlineTime = generationDeadlineTime;
    }

    const updatedGroup = await group.save();
    res.status(200).json({ group: withLegacyScheduleMirror(updatedGroup.toObject()), message: "Group and meetups updated successfully." });
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

    const filter = { members: user._id };
    const { since } = req.query;

    // Delta sync: the client already has a cached copy and only wants what
    // changed since its last sync, plus the current set of valid ids so it
    // can drop anything (left group, deleted group) that's no longer visible.
    if (since) {
        const sinceDate = new Date(since);
        if (isNaN(sinceDate.getTime())) {
            return res.status(400).json({ error: "Invalid 'since' timestamp." });
        }

        const [changed, validIds] = await Promise.all([
            Group.find({ ...filter, updatedAt: { $gte: sinceDate } }).lean(),
            Group.find(filter).distinct('_id'),
        ]);

        return res.status(200).json({
            changed: changed.map(withLegacyScheduleMirror),
            validIds: validIds.map((id) => id.toString()),
            syncedAt: new Date().toISOString(),
        });
    }

    const groups = await Group.find(filter).lean();
    res.status(200).json(groups.map(withLegacyScheduleMirror));
});

export const getGroupDetails = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: "Invalid ID." });
    
    const group = await Group.findById(groupId)
        .populate("members", "firstName lastName _id profilePicture")
        .populate("moderators", "firstName lastName profilePicture _id")
        .lean();
        
    if (!group) return res.status(404).json({ error: "Group not found." });
    res.status(200).json(withLegacyScheduleMirror(group));
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
    await Meetup.updateMany(
        { group: group._id, date: { $gte: today } }, 
        { $addToSet: { members: userToAdd._id, undecided: userToAdd._id } }
    );
    await notifyAndPersist([userToAdd], {
        title: "Added to Group",
        body: `${requester.firstName} added you to "${group.name}".`,
        data: { groupId: group._id.toString(), type: 'group-added' },
        type: 'group-added',
        sender: requester._id,
        group: group._id,
    });
  } catch (err) { console.error(err); }
  
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

    await notifyAndPersist([userToInvite], {
        title: "Group Invitation",
        body: `${requester.firstName} invited you to join "${group.name}".`,
        data: { groupId: group._id.toString(), type: 'group-invite' },
        type: 'group-invite',
        sender: requester._id,
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
    if (!canManageGroup(requester._id, group)) return res.status(403).json({ error: "Permission denied." });

    if (group.owner.toString() === memberIdToRemove) return res.status(400).json({ error: "Cannot remove owner." });
    if (group.moderators.some(id => id.toString() === memberIdToRemove) && group.owner.toString() !== requester._id.toString()) {
        return res.status(403).json({ error: "Moderators cannot remove other moderators." });
    }

    await group.updateOne({ $pull: { members: memberToRemove._id, moderators: memberToRemove._id } });
    await memberToRemove.updateOne({ $pull: { groups: group._id } });
    await Meetup.updateMany({ group: group._id, date: { $gte: new Date() } }, { $pull: { members: memberToRemove._id, in: memberToRemove._id, out: memberToRemove._id, undecided: memberToRemove._id, waitlist: memberToRemove._id } });
    res.status(200).json({ message: "Member removed." });
});

export const createOneOffMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { date, time, timezone, capacity, name, location, scheduleId } = req.body;

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(requester._id, group)) return res.status(403).json({ error: "Permission denied." });

    const meetupDate = calculateNextMeetupDate(date, time, timezone, 'once');
    if (meetupDate < new Date()) return res.status(400).json({ error: "Cannot schedule in the past." });

    // use the linked schedule's location/capacity defaults if this belongs to a
    // series; otherwise fall back to the group-level defaults.
    const linkedSchedule = scheduleId ? group.schedules.id(scheduleId) : null;
    const fallbackLocation = linkedSchedule ? linkedSchedule.defaultLocation : group.defaultLocation;
    const fallbackCapacity = linkedSchedule ? linkedSchedule.defaultCapacity : group.defaultCapacity;

    const newMeetup = await Meetup.create({
        group: group._id,
        schedule: linkedSchedule ? linkedSchedule._id : null,
        name: name || (linkedSchedule ? linkedSchedule.name : group.name),
        date: meetupDate,
        time: time,
        timezone: timezone,
        location: location !== undefined ? location : fallbackLocation,
        members: group.members,
        undecided: group.members,
        capacity: capacity !== undefined ? capacity : fallbackCapacity,
        isOverride: true,
        startsAt: meetupDate,
    });

    // --- NOTIFICATION LOGIC ---
    const membersToNotify = await User.find({ _id: { $in: group.members } });
    if (membersToNotify.length > 0) {
        await notifyAndPersist(membersToNotify, {
            title: "New Meetup Scheduled",
            body: `A new meetup, "${newMeetup.name}", has been scheduled for your group "${group.name}".`,
            data: { meetupId: newMeetup._id.toString(), type: 'meetup_created', groupId: group._id.toString() },
            type: 'meetup-created',
            sender: requester._id,
            meetup: newMeetup._id,
            group: group._id,
        });
    }

    res.status(201).json({ meetup: newMeetup, message: "One-off meetup scheduled." });
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
    await Meetup.updateMany({ group: group._id, date: { $gte: new Date() } }, { $pull: { members: user._id, in: user._id, out: user._id, undecided: user._id, waitlist: user._id } });
    res.status(200).json({ message: "You have left." });
});

export const deleteGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });
    if (group.owner.toString() !== requester._id.toString()) return res.status(403).json({ error: "Only owner can delete." });

    await Meetup.deleteMany({ group: groupId });
    await Notification.deleteMany({ group: groupId });
    await User.updateMany({ _id: { $in: group.members } }, { $pull: { groups: groupId } });
    await Group.findByIdAndDelete(groupId);
    res.status(200).json({ message: "Deleted." });
});

export const generateInviteLink = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;

    const [user, group] = await Promise.all([
        User.findOne({ clerkId }),
        Group.findById(groupId),
    ]);
    if (!user || !group) return res.status(404).json({ error: "Resource not found." });
    if (!group.members.some(m => m.toString() === user._id.toString())) {
        return res.status(403).json({ error: "You must be a group member to generate an invite link." });
    }

    // Reuse an existing unexpired token so the same link stays stable
    let invite = await InviteToken.findOne({ groupId, expiresAt: { $gt: new Date() } });
    if (!invite) {
        const token = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        invite = await InviteToken.create({ token, groupId, createdBy: user._id, expiresAt });
    }

    res.status(200).json({ link: `https://invite.groupthatapp.com/join/${invite.token}` });
});

export const redeemInviteToken = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { token } = req.params;

    const invite = await InviteToken.findOne({ token, expiresAt: { $gt: new Date() } });
    if (!invite) return res.status(404).json({ error: "This invite link is invalid or has expired." });

    const [user, group] = await Promise.all([
        User.findOne({ clerkId }),
        Group.findById(invite.groupId),
    ]);
    if (!user || !group) return res.status(404).json({ error: "Resource not found." });

    if (group.members.some(m => m.toString() === user._id.toString())) {
        return res.status(200).json({ groupId: group._id, groupName: group.name, alreadyMember: true });
    }

    await group.updateOne({ $addToSet: { members: user._id } });
    await user.updateOne({ $addToSet: { groups: group._id } });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await Meetup.updateMany(
        { group: group._id, date: { $gte: today } },
        { $addToSet: { members: user._id, undecided: user._id } }
    );

    const owner = await User.findById(group.owner);
    if (owner && owner._id.toString() !== user._id.toString()) {
        try {
            await notifyAndPersist([owner], {
                title: "New Member",
                body: `${user.firstName} joined "${group.name}" via invite link.`,
                data: { groupId: group._id.toString(), type: 'group-added' },
                type: 'group-added',
                sender: user._id,
                group: group._id,
            });
        } catch (err) { console.error(err); }
    }

    res.status(200).json({ groupId: group._id, groupName: group.name, alreadyMember: false });
});