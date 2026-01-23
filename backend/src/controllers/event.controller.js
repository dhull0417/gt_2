import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import { calculateNextEventDate } from "../utils/date.utils.js";
import { canManageGroup } from "./group.controller.js";
import { notifyUsers } from "../utils/push.notifications.js";

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

/**
 * @desc    Get upcoming events for the current user
 */
export const getEvents = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const currentUser = await User.findOne({ clerkId }).lean();
  if (!currentUser) {
    return res.status(404).json({ error: "User not found." });
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingEvents = await Event.find({
    members: currentUser._id,
    date: { $gte: today },
  })
  .populate({
      path: "members",
      select: "firstName lastName _id profilePicture",
  })
  .populate({
      path: "group",
      select: "owner moderators",
  })
  .sort({ date: "asc" });

  res.status(200).json(upcomingEvents);
});

/**
 * @desc    Edit an existing event instance (Owner/Moderator Only)
 * @route   PUT /api/events/:eventId
 */
export const updateEvent = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { eventId } = req.params;
    const { 
        date, 
        time, 
        timezone, 
        capacity, 
        location 
    } = req.body; 

    if (!date || !time || !timezone) {
        return res.status(400).json({ error: "Date, time, and timezone are required." });
    }
    
    const timeParts = parseTimeString(time);
    const eventDateTime = DateTime.fromJSDate(new Date(date), { zone: timezone }).set({ hour: timeParts.hours, minute: timeParts.minutes });
    const now = DateTime.now().setZone(timezone);

    if (eventDateTime < now) {
        return res.status(400).json({ error: "Cannot reschedule an event to the past." });
    }

    const event = await Event.findById(eventId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();
    
    if (!event || !requester) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, event.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    event.date = date;
    event.time = time;
    event.timezone = timezone;
    if (capacity !== undefined) event.capacity = capacity;
    if (location !== undefined) event.location = location; 
    
    event.isOverride = true;
    await event.save();

    res.status(200).json({ message: "Event updated successfully.", event });
});

/**
 * @desc    RSVP to an event
 * Refined for Project 6 to handle background interactions and JIT undecided state.
 */
export const handleRsvp = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { eventId } = req.params;
  const { status } = req.body; 

  const currentUser = await User.findOne({ clerkId });
  if (!currentUser) return res.status(404).json({ error: "User not found." });

  if (!['in', 'out'].includes(status)) {
    return res.status(400).json({ error: "Invalid RSVP status." });
  }
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(400).json({ error: "Invalid Event ID." });
  }

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ error: "Event not found." });
  if (event.status === 'cancelled') return res.status(400).json({ error: "Cannot RSVP to a cancelled event." });

  const userId = currentUser._id;
  const userIdStr = userId.toString();

  // 1. PROJECT 6: Clean move logic
  event.in = event.in.filter(id => id.toString() !== userIdStr);
  event.out = event.out.filter(id => id.toString() !== userIdStr);
  event.undecided = event.undecided.filter(id => id.toString() !== userIdStr);
  event.waitlist = event.waitlist.filter(id => id.toString() !== userIdStr);

  let responseMessage = "RSVP updated successfully.";

  if (status === 'in') {
    const isUnlimited = event.capacity === 0;
    const hasSpace = event.in.length < event.capacity;

    if (isUnlimited || hasSpace) {
      event.in.push(userId);
    } else {
      event.waitlist.push(userId);
      responseMessage = "Event is full. You've been added to the waitlist.";
    }
  } else if (status === 'out') {
    event.out.push(userId);

    // 2. Waitlist Promotion Logic
    if (event.capacity > 0 && event.waitlist.length > 0) {
      const promotedUserId = event.waitlist.shift(); 
      event.in.push(promotedUserId);

      const promotedUser = await User.findById(promotedUserId);
      if (promotedUser) {
          await notifyUsers([promotedUser], {
              title: "You're off the waitlist!",
              body: `A spot opened up for ${event.name}. You are now confirmed!`,
              data: { eventId: event._id.toString(), type: 'waitlist_promotion' }
          });
      }
    }
  }

  console.log(`[RSVP] User ${currentUser.username} (${userIdStr}) set status to '${status}' for event ${eventId}`);

  await event.save();
  res.status(200).json({ 
    event, 
    message: responseMessage,
    status: status 
  });
});

/**
 * @desc    Cancel an event (Owner/Moderator Only)
 */
export const cancelEvent = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { eventId } = req.params;

    const event = await Event.findById(eventId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();

    if (!event || !requester) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, event.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    event.status = 'cancelled';
    event.isOverride = true;
    await event.save();

    const membersToNotify = await User.find({ _id: { $in: event.members } });
    if (membersToNotify.length > 0) {
        await notifyUsers(membersToNotify, {
            title: "Meeting Cancelled",
            body: `The meeting "${event.name}" on ${new Date(event.date).toLocaleDateString()} has been cancelled.`,
            data: { eventId: event._id.toString(), type: 'event_cancellation' }
        });
    }

    res.status(200).json({ message: "Event cancelled successfully.", event });
});

/**
 * @desc    Permanently delete an event (Owner/Moderator Only)
 * Refined for Project 6: Loops to fill all due recurring spots after deletion.
 */
export const deleteEvent = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return res.status(400).json({ error: "Invalid Event ID." });
    }

    const event = await Event.findById(eventId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();
    if (!event || !requester) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, event.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    const wasRecurring = !event.isOverride;
    const parentGroup = event.group;

    await Event.findByIdAndDelete(eventId);

    // If we delete the current recurring meeting, fill any gaps that are due by lead time
    if (wasRecurring && parentGroup.schedule) {
        try {
            const now = DateTime.now().setZone(parentGroup.timezone);
            const { hours, minutes } = parseTimeString(parentGroup.generationLeadTime);
            
            let currentAnchor = new Date();
            currentAnchor.setHours(0, 0, 0, 0);

            while (true) {
                const nextDate = calculateNextEventDate(
                    parentGroup.schedule.days?.[0] || 0, 
                    parentGroup.time, 
                    parentGroup.timezone,
                    parentGroup.schedule.frequency,
                    currentAnchor
                );

                const nextDT = DateTime.fromJSDate(nextDate).setZone(parentGroup.timezone);
                const triggerDT = nextDT.minus({ days: parentGroup.generationLeadDays || 0 }).set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

                const exists = await Event.findOne({ group: parentGroup._id, date: nextDate });

                if (now >= triggerDT && !exists) {
                    await Event.create({
                        group: parentGroup._id,
                        name: parentGroup.name,
                        date: nextDate,
                        time: parentGroup.time,
                        timezone: parentGroup.timezone,
                        location: parentGroup.defaultLocation,
                        members: parentGroup.members,
                        undecided: parentGroup.members,
                        isOverride: false,
                        capacity: parentGroup.defaultCapacity 
                    });
                    currentAnchor = nextDate;
                } else {
                    break;
                }
            }
        } catch (regenError) {
            console.error("Failed to regenerate meetings after deletion:", regenError);
        }
    }

    res.status(200).json({ message: "Event deleted successfully." });
});