import asyncHandler from "express-async-handler";
import Meetup from "../models/meetup.model.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import Notification from "../models/notification.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import { calculateNextMeetupDate } from "../utils/date.utils.js";
import { canManageGroup } from "./group.controller.js";
import { notifyUsers } from "../utils/push.notifications.js";
import { sendRsvpOpenNotifications } from "./job.controller.js";

/**
 * HELPER: parseTimeString
 * Converts "07:00 PM" into { hours: 19, minutes: 0 }
 */
const parseTimeString = (timeStr) => {
    if (!timeStr) return { hours: 9, minutes: 0 };
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return { hours, minutes };
};

const getDynamicLeadDays = (frequency) => {
  switch (frequency) {
    case 'daily': 
        return { visibility: 3, generation: 3 };
    case 'weekly': 
        return { visibility: 7, generation: 7 };
    case 'biweekly': 
        return { visibility: 14, generation: 14 };
    case 'monthly': 
        return { visibility: 31, generation: 31 };
    default: 
        return { visibility: 14, generation: 14 }; 
  }
};

/**
 * @desc    Get all meetups for the current user
 * @route   GET /api/meetups
 */
export const getMeetups = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const user = await User.findOne({ clerkId }).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const now = new Date();

    const meetups = await Meetup.find({
        members: user._id,
        $or: [
            { date: { $lt: now } },             // past meetups always show
            { isOverride: true },               // one-offs are immediately visible
            { visibilityDate: { $lte: now } },  // scheduled meetups within the window
        ]
    })
        .populate('group', 'name owner moderators timezone defaultLocation visibilityLeadDays')
        .populate('members', 'firstName lastName username profilePicture')
        .sort({ date: 1 });

    res.status(200).json(meetups);

    // Non-blocking: notify members whose RSVP window just opened
    sendRsvpOpenNotifications().catch(err => console.error('[RSVP Open]:', err));
});

/**
 * @desc    RSVP to a meetup
 * @route   POST /api/meetups/:meetupId/rsvp
 */
export const rsvpMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;
    const { status } = req.body; 

    const user = await User.findOne({ clerkId }).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const meetup = await Meetup.findById(meetupId);
    if (!meetup) return res.status(404).json({ error: "Meetup not found." });

    if (!['in', 'out'].includes(status)) {
        return res.status(400).json({ error: "Invalid RSVP status." });
    }

    if (meetup.rsvpOpenDate && new Date(meetup.rsvpOpenDate) > new Date()) {
        return res.status(400).json({ error: "RSVPs are not open yet." });
    }

    // Safely extract the user from all arrays first to prevent duplicates using Mongoose .pull()
    meetup.in.pull(user._id);
    meetup.out.pull(user._id);
    meetup.waitlist.pull(user._id);
    meetup.undecided.pull(user._id);

    if (status === 'out') {
        meetup.out.push(user._id);
        
        // Auto-promote the first person in the waitlist if capacity allows
        if (meetup.capacity > 0 && meetup.waitlist.length > 0 && meetup.in.length < meetup.capacity) {
            const nextUserId = meetup.waitlist.shift();
            meetup.in.push(nextUserId);
            
            const nextUser = await User.findById(nextUserId);
            if (nextUser) {
                await notifyUsers([nextUser], {
                    title: "You're In! 🎉",
                    body: `A spot opened up for "${meetup.name}" and you've been moved off the waitlist!`,
                    data: { meetupId: meetup._id.toString(), type: 'meetup_waitlist_promoted' }
                });
            }
        }
    } else if (status === 'in') {
        // Push to waitlist if at capacity, otherwise 'in'
        if (meetup.capacity > 0 && meetup.in.length >= meetup.capacity) {
            meetup.waitlist.push(user._id);
        } else {
            meetup.in.push(user._id);
        }
    }

    await meetup.save();
    
    // Re-query with populations to return a fresh representation to the frontend hook
    const updatedMeetup = await Meetup.findById(meetupId)
        .populate('group', 'name owner moderators timezone defaultLocation')
        .populate('members', 'firstName lastName username profilePicture');

    res.status(200).json({ message: "RSVP updated successfully.", meetup: updatedMeetup });
});


/**
 * @desc    Edit an existing meetup instance (Owner/Moderator Only)
 * @route   PUT /api/meetups/:meetupId
 */
export const updateMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;
    const { 
        date, 
        time,
        // timezone is intentionally omitted from destructuring
        capacity, 
        location 
    } = req.body; 

    const meetup = await Meetup.findById(meetupId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();
    
    if (!meetup || !requester) return res.status(404).json({ error: "Resource not found." });

    const isPast = new Date(meetup.date) < new Date();
        if (meetup.status === 'cancelled' || meetup.status === 'expired' || isPast) {
            return res.status(400).json({ error: "This event is closed for adjustments." });
        }

    if (!canManageGroup(requester._id, meetup.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    // Store old values for notification check
    const oldDateStr = new Date(meetup.date).toLocaleDateString();
    const oldTime = meetup.time;
    const oldLocation = meetup.location;
    const oldCapacity = meetup.capacity;

    // --- The source of truth for timezone is ALWAYS the parent group ---
    const groupTimezone = meetup.group.timezone;

    // --- Partial Update & Validation ---
    const newDate = date || meetup.date;
    const newTime = time || meetup.time;

    // Validate if date/time is being changed to a past date
    if (date || time) {
        const timeParts = parseTimeString(newTime);
        const meetupDateTime = DateTime.fromJSDate(new Date(newDate), { zone: groupTimezone }).set({ hour: timeParts.hours, minute: timeParts.minutes });
        const now = DateTime.now().setZone(groupTimezone);

        if (meetupDateTime < now) {
            return res.status(400).json({ error: "Cannot reschedule an meetup to the past." });
        }
    }

    // Apply updates
    meetup.date = newDate;
    meetup.time = newTime;
    meetup.timezone = groupTimezone; // Always enforce the group's timezone
    if (capacity !== undefined) meetup.capacity = capacity;
    if (location !== undefined) meetup.location = location; 
    
    meetup.isOverride = true;
    await meetup.save();

    // --- Notification Logic ---
    const newDateStr = new Date(meetup.date).toLocaleDateString();
    const dateOrTimeChanged = oldDateStr !== newDateStr || oldTime !== meetup.time;
    const locationChanged = location !== undefined && oldLocation !== meetup.location;
    const capacityChanged = capacity !== undefined && oldCapacity !== meetup.capacity;
    
    const hasChanged = dateOrTimeChanged || locationChanged || capacityChanged;

    if (hasChanged) {
        const membersToNotify = await User.find({ _id: { $in: meetup.members } });
        if (membersToNotify.length > 0) {
            await notifyUsers(membersToNotify, {
                title: `Meetup Updated: ${meetup.name}`,
                body: `The details for "${meetup.name}" have been updated. Tap to see what's new.`,
                data: { meetupId: meetup._id.toString(), type: 'meetup_updated' }
            });
        }
    }

    // Re-fetch the meetup after saving to ensure all paths are populated correctly for the response.
    const populatedMeetup = await Meetup.findById(meetup._id)
        .populate([
            { path: 'group', select: 'name owner moderators' },
            { path: 'members', select: 'firstName lastName _id profilePicture username' },
            { path: 'in', select: 'firstName lastName _id profilePicture username' },
            { path: 'out', select: 'firstName lastName _id profilePicture username' },
            { path: 'waitlist', select: 'firstName lastName _id profilePicture username' }
        ]);

    res.status(200).json({ message: "Meetup updated successfully.", meetup: populatedMeetup });
});


/**
 * @desc    Cancel an meetup (Owner/Moderator Only)
 */
export const cancelMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;

    const meetup = await Meetup.findById(meetupId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();

    if (!meetup || !requester) return res.status(404).json({ error: "Resource not found." });

    const isPast = new Date(meetup.date) < new Date();
        if (meetup.status === 'cancelled' || meetup.status === 'expired' || isPast) {
            return res.status(400).json({ error: "This event is closed for adjustments." });
        }

    if (!canManageGroup(requester._id, meetup.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    if (meetup.status === 'expired') {
        return res.status(400).json({ error: "Cannot cancel a meetup that has already expired." });
    }

    meetup.status = 'cancelled';
    meetup.isOverride = true;
    await meetup.save();

    const membersToNotify = await User.find({ _id: { $in: meetup.members } });
    if (membersToNotify.length > 0) {
        await notifyUsers(membersToNotify, {
            title: "Meetup Cancelled",
            body: `The meetup "${meetup.name}" on ${new Date(meetup.date).toLocaleDateString()} has been cancelled.`,
            data: { meetupId: meetup._id.toString(), type: 'meetup_cancellation' }
        });
    }

    res.status(200).json({ message: "Meetup cancelled successfully.", meetup });
});

/**
 * @desc    Permanently delete an meetup (Owner/Moderator Only)
 * Refined for Project 6: Loops to fill all due recurring spots after deletion.
 */
export const deleteMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(meetupId)) {
        return res.status(400).json({ error: "Invalid Meetup ID." });
    }

    const meetup = await Meetup.findById(meetupId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();
    if (!meetup || !requester) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, meetup.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    const wasRecurring = !meetup.isOverride;
    const parentGroup = meetup.group;

    await Meetup.findByIdAndDelete(meetupId);

    // If we delete the current recurring meetup, fill any gaps that are due by lead time
    if (wasRecurring && parentGroup.schedule) {
        try {
            const now = DateTime.now().setZone(parentGroup.timezone);
            const { hours, minutes } = parseTimeString(parentGroup.rsvpLeadTime);
            
            let currentAnchor = new Date();
            currentAnchor.setHours(0, 0, 0, 0);

            while (true) {
                const nextDate = calculateNextMeetupDate(
                    parentGroup.schedule.days?.[0] || 0, 
                    parentGroup.time, 
                    parentGroup.timezone,
                    parentGroup.schedule.frequency,
                    currentAnchor
                );

                const nextDT = DateTime.fromJSDate(nextDate).setZone(parentGroup.timezone);
            const triggerDT = nextDT.minus({ 
                days: parentGroup.rsvpLeadDays !== undefined 
                    ? parentGroup.rsvpLeadDays 
                    : getDynamicLeadDays(parentGroup.schedule?.frequency).generation 
            }).set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

                const exists = await Meetup.findOne({ group: parentGroup._id, date: nextDate });
                
                if (now >= triggerDT && !exists) {
                    const newMeetup = await Meetup.create({
                        group: parentGroup._id,
                        name: parentGroup.name,
                        date: nextDate,
                        time: parentGroup.time,
                        timezone: parentGroup.timezone,
                        location: parentGroup.defaultLocation,
                        members: parentGroup.members,
                        undecided: parentGroup.members,
                        isOverride: false,
                        capacity: parentGroup.defaultCapacity,
                        visibilityDate: nextDT.minus({ 
                            days: parentGroup.visibilityLeadDays !== undefined 
                                ? parentGroup.visibilityLeadDays 
                                : getDynamicLeadDays(parentGroup.schedule?.frequency).visibility 
                        }).set({ hour: hours, minute: minutes, second: 0, millisecond: 0 }).toJSDate(),
                        rsvpOpenDate: nextDT.minus({ 
                            days: parentGroup.rsvpLeadDays !== undefined 
                                ? parentGroup.rsvpLeadDays 
                                : getDynamicLeadDays(parentGroup.schedule?.frequency).generation 
                        }).set({ hour: hours, minute: minutes, second: 0, millisecond: 0 }).toJSDate()
                    });

                    // Notify users about the newly created recurring meetup
                    const membersToNotify = await User.find({ _id: { $in: parentGroup.members } });
                    if (membersToNotify.length > 0) {
                        await notifyUsers(membersToNotify, {
                            title: "New Meetup Scheduled",
                            body: `A new meetup for "${parentGroup.name}" has been scheduled for ${new Date(nextDate).toLocaleDateString()}.`,
                            data: { meetupId: newMeetup._id.toString(), type: 'meetup_created', groupId: parentGroup._id.toString() }
                        });
                    }

                    currentAnchor = nextDate;
                } else {
                    break;
                }
            }
        } catch (regenError) {
            console.error("Failed to regenerate meetups after deletion:", regenError);
        }
    }

    res.status(200).json({ message: "Meetup deleted successfully." });
});