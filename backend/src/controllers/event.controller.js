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

const parseTime = (timeString) => {
    const [time, period] = timeString.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (period.toUpperCase() === 'PM' && hours !== 12) {
        hours += 12;
    }
    if (period.toUpperCase() === 'AM' && hours === 12) {
        hours = 0;
    }
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
        location // Added for Location Feature
    } = req.body; 

    if (!date || !time || !timezone) {
        return res.status(400).json({ error: "Date, time, and timezone are required." });
    }
    
    const { hours, minutes } = parseTime(time);
    const eventDateTime = DateTime.fromJSDate(new Date(date), { zone: timezone }).set({ hour: hours, minute: minutes });
    const now = DateTime.now().setZone(timezone);

    if (eventDateTime < now) {
        return res.status(400).json({ error: "Cannot reschedule an event to the past." });
    }

    const event = await Event.findById(eventId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();
    
    if (!event || !requester) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, event.group)) {
        return res.status(403).json({ error: "Permission denied. Only owners or moderators can edit events." });
    }

    event.date = date;
    event.time = time;
    event.timezone = timezone;
    if (capacity !== undefined) event.capacity = capacity;
    if (location !== undefined) event.location = location; // Update specific event location
    
    event.isOverride = true;
    await event.save();

    res.status(200).json({ message: "Event updated successfully.", event });
});

/**
 * @desc    RSVP to an event with Capacity and Waitlist handling
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

  event.in = event.in.filter(id => id.toString() !== userId.toString());
  event.out = event.out.filter(id => id.toString() !== userId.toString());
  event.undecided = event.undecided.filter(id => id.toString() !== userId.toString());
  event.waitlist = event.waitlist.filter(id => id.toString() !== userId.toString());

  if (status === 'in') {
    const isUnlimited = event.capacity === 0;
    const hasSpace = event.in.length < event.capacity;

    if (isUnlimited || hasSpace) {
      event.in.push(userId);
    } else {
      event.waitlist.push(userId);
      await event.save();
      return res.status(200).json({ 
          event, 
          message: "Event is full. You've been added to the waitlist." 
      });
    }
  } else if (status === 'out') {
    event.out.push(userId);

    if (event.capacity > 0 && event.waitlist.length > 0) {
      const nextUserId = event.waitlist.shift(); 
      event.in.push(nextUserId);

      const promotedUser = await User.findById(nextUserId);
      if (promotedUser) {
          await notifyUsers([promotedUser], {
              title: "You're off the waitlist!",
              body: `A spot opened up for ${event.name}. You are now confirmed!`,
              data: { eventId: event._id.toString(), type: 'waitlist_promotion' }
          });
      }
    }
  }

  await event.save();
  res.status(200).json({ event, message: "RSVP updated successfully." });
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
        return res.status(403).json({ error: "Permission denied. Only owners or moderators can cancel events." });
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
        return res.status(403).json({ error: "Permission denied. Only owners or moderators can delete events." });
    }

    const wasRecurring = !event.isOverride;
    const parentGroup = event.group;

    await Event.findByIdAndDelete(eventId);

    if (wasRecurring && parentGroup.schedule) {
        try {
            const nextEventDate = calculateNextEventDate(parentGroup.schedule, parentGroup.time, parentGroup.timezone);
            await Event.create({
                group: parentGroup._id,
                name: parentGroup.name,
                date: nextEventDate,
                time: parentGroup.time,
                timezone: parentGroup.timezone,
                location: parentGroup.defaultLocation, // Use group default when replenishing
                members: parentGroup.members,
                undecided: parentGroup.members,
                isOverride: false,
                capacity: parentGroup.defaultCapacity 
            });
        } catch (regenError) {
            console.error("Failed to regenerate next event after deletion:", regenError);
        }
    }

    res.status(200).json({ message: "Event deleted successfully." });
});