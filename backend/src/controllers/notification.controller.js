import asyncHandler from "express-async-handler";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import Event from "../models/event.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";

// Get all notifications for the logged-in user
export const getNotifications = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const user = await User.findOne({ clerkId }).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const notifications = await Notification.find({ recipient: user._id })
        .populate('sender', 'firstName lastName profilePicture')
        .populate('group', 'name')
        .sort({ createdAt: -1 });

    res.status(200).json(notifications);
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
    if (notification.status !== 'pending') {
        return res.status(400).json({ error: "This invitation has already been responded to." });
    }
    
    const group = await Group.findById(notification.group);
    if (!group) return res.status(404).json({ error: "Group not found." });

    // Add user to group and group to user
    await group.updateOne({ $addToSet: { members: user._id } });
    await user.updateOne({ $addToSet: { groups: group._id } });

    // Add user to all upcoming events for this group
    await Event.updateMany(
        { group: group._id, date: { $gte: new Date() } },
        { $addToSet: { members: user._id, undecided: user._id } }
    );

    // Update the original invitation
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
    if (notification.status !== 'pending') {
        return res.status(400).json({ error: "This invitation has already been responded to." });
    }
    
    const group = await Group.findById(notification.group);
    if (!group) return res.status(404).json({ error: "Group not found." });
    
    // Update the original invitation
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