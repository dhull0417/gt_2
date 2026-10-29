import asyncHandler from "express-async-handler";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import Meetup from "../models/meetup.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";
import { postSystemMessage } from "../utils/systemMessage.js";
import { addChatMembers } from "../utils/supabaseAdmin.js";

// Get all notifications for the logged-in user
export const getNotifications = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const user = await User.findOne({ clerkId }).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    // Newest first, capped. `?limit=` (max 200, default 100) and `?before=<ISO date>` allow paging.
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const query = { recipient: user._id };
    if (req.query.before) {
        const before = new Date(req.query.before);
        if (!isNaN(before.getTime())) query.createdAt = { $lt: before };
    }

    const notifications = await Notification.find(query)
        .populate('sender', 'firstName lastName profilePicture')
        .populate('group', 'name image')
        .populate('meetup', 'name date time timezone location capacity')
        .populate('poll', 'prompt')
        .sort({ createdAt: -1 })
        .limit(limit);

    // Drop notifications with broken refs (deleted group/meetup/poll) to avoid
    // client crashes. Sender is optional — system notifications have none.
    const validNotifications = notifications.filter(notification => {
        // 'group-removed' / 'group-deleted' are kept even if the group is gone: they have no destination to open but are still informative.
        const groupRequiredTypes = ['group-invite', 'invite-accepted', 'invite-declined', 'group-added', 'group-member-joined', 'group-updated', 'ownership-transferred'];
        if (groupRequiredTypes.includes(notification.type) && !notification.group) {
            return false;
        }

        if (notification.meetup === null && notification.type.startsWith('meetup-')) {
            return false;
        }

        const pollRequiredTypes = ['poll-created', 'poll-closed'];
        if (pollRequiredTypes.includes(notification.type) && !notification.poll) {
            return false;
        }

        return true;
    });

    res.status(200).json(validNotifications);
});

// Accept a group invitation
export const acceptInvite = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { id: notificationId } = req.params;

    const user = await User.findOne({ clerkId });
    if (!user) return res.status(404).json({ error: "User not found." });

    const notification = await Notification.findById(notificationId);
    if (!notification || notification.recipient.toString() !== user._id.toString()) {
        return res.status(404).json({ error: "Invitation not found or you are not the recipient." });
    }
    if (notification.type !== 'group-invite') {
        return res.status(400).json({ error: "This notification is not an invitation." });
    }
    if (notification.status !== 'pending') {
        return res.status(400).json({ error: "This invitation has already been responded to." });
    }
    
    const group = await Group.findById(notification.group);
    if (!group) return res.status(404).json({ error: "Group not found." });

    // Invitations only count if they came from someone who can still manage the group.
    const inviterId = notification.sender?.toString();
    const inviterCanManage = inviterId && (
        group.owner.toString() === inviterId ||
        (group.moderators || []).some(id => id.toString() === inviterId)
    );
    if (!inviterCanManage) {
        notification.status = 'declined';
        await notification.save();
        return res.status(400).json({ error: "This invitation is no longer valid." });
    }

    // Add user to group and group to user
    await group.updateOne({ $addToSet: { members: user._id } });
    await user.updateOne({ $addToSet: { groups: group._id } });
    await addChatMembers(group._id, [user.clerkId]);

    // Add user to all upcoming meetups for this group
    await Meetup.updateMany(
        { group: group._id, date: { $gte: new Date() } },
        { $addToSet: { members: user._id, undecided: user._id } }
    );

    notification.status = 'accepted';
    await notification.save();

    // Create a new notification for the group owner
    await Notification.create({
        recipient: group.owner,
        sender: user._id,
        type: 'invite-accepted',
        group: group._id,
        status: 'read', // Mark as read since it's just an info notification
    });

    await postSystemMessage(group._id, `${user.firstName} joined the group`);

    res.status(200).json({ message: "Invitation accepted. You have been added to the group." });
});

// Decline a group invitation
export const declineInvite = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { id: notificationId } = req.params;

    const user = await User.findOne({ clerkId }).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const notification = await Notification.findById(notificationId);
    if (!notification || notification.recipient.toString() !== user._id.toString()) {
        return res.status(404).json({ error: "Invitation not found or you are not the recipient." });
    }
    if (notification.type !== 'group-invite') {
        return res.status(400).json({ error: "This notification is not an invitation." });
    }
    if (notification.status !== 'pending') {
        return res.status(400).json({ error: "This invitation has already been responded to." });
    }
    
    const group = await Group.findById(notification.group);
    if (!group) return res.status(404).json({ error: "Group not found." });
    
    notification.status = 'declined';
    await notification.save();
    
    // Create a new notification for the group owner
    await Notification.create({
        recipient: group.owner,
        sender: user._id,
        type: 'invite-declined',
        group: group._id,
        status: 'read',
    });

    res.status(200).json({ message: "Invitation declined." });
});

// Mark notifications as read
export const markNotificationsAsRead = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const user = await User.findOne({ clerkId }).lean();
    if (!user) {
        return res.status(401).json({ error: "User not authenticated." });
    }

    await Notification.updateMany(
      { recipient: user._id, read: false },
      { $set: { read: true } }
    );

    res.status(200).json({ message: "Notifications marked as read" });
});

// Delete one of my notifications (swipe-to-delete). A pending invite can't be deleted - answer it first.
export const deleteNotification = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID." });

    const user = await User.findOne({ clerkId }).select('_id').lean();
    if (!user) return res.status(401).json({ error: "User not authenticated." });

    const result = await Notification.deleteOne({ _id: id, recipient: user._id, status: { $ne: 'pending' } });
    if (result.deletedCount === 0) {
        return res.status(404).json({ error: "Notification not found, or it is still waiting for your answer." });
    }
    res.status(200).json({ message: "Notification deleted." });
});

// Clear every notification that isn't waiting on an answer.
export const clearNotifications = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const user = await User.findOne({ clerkId }).select('_id').lean();
    if (!user) return res.status(401).json({ error: "User not authenticated." });

    const result = await Notification.deleteMany({ recipient: user._id, status: { $ne: 'pending' } });
    res.status(200).json({ deleted: result.deletedCount });
});
