import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import { calculateNextEventDate } from "../utils/date.utils.js";

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
      select: "owner",
  })
  .sort({ date: "asc" });

  res.status(200).json(upcomingEvents);
});

/**
 * @desc    Edit an existing event instance (Owner/Moderator Only)
 */
export const updateEvent = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { eventId } = req.params;
    const { date, time, timezone, capacity } = req.body; // Added capacity to allowed updates

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

    if (event.group.owner.toString() !== requester._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can edit this event." });
    }

    event.date = date;
    event.time = time;
    event.timezone = timezone;
    if (capacity !== undefined) event.capacity = capacity;
    event.isOverride = true;
    await event.save();

    res.status(200).json({ message: "Event updated successfully.", event });
});

/**
 * @desc    RSVP to an event with Capacity and Waitlist handling
 * @route   POST /api/events/:eventId/rsvp
 */
export const handleRsvp = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { eventId } = req.params;
  const { status } = req.body; // 'in' or 'out'

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

  // 1. Remove user from all existing lists to reset state
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
      // Event is full, add to waitlist
      event.waitlist.push(userId);
      await event.save();
      return res.status(200).json({ 
          event, 
          message: "Event is full. You've been added to the waitlist." 
      });
    }
  } else if (status === 'out') {
    event.out.push(userId);

    // --- QUEUE LOGIC: If a spot opened up, move the first person from waitlist to 'in' ---
    if (event.capacity > 0 && event.waitlist.length > 0) {
      const nextUser = event.waitlist.shift(); // Remove first person from queue
      event.in.push(nextUser);
      // Note: In Project 5, trigger push notification to this user here.
    }
  }

  await event.save();
  res.status(200).json({ event, message: "RSVP updated successfully." });
});

/**
 * @desc    Cancel an event (Owner/Moderator Only)
 * @route   PATCH /api/events/:eventId/cancel
 */
export const cancelEvent = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { eventId } = req.params;

    const event = await Event.findById(eventId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();

    if (!event || !requester) return res.status(404).json({ error: "Resource not found." });

    if (event.group.owner.toString() !== requester._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can cancel events." });
    }

    // Status is simply flipped to 'cancelled' so it stays visible
    event.status = 'cancelled';
    await event.save();

    res.status(200).json({ message: "Event cancelled successfully.", event });
});

/**
 * @desc    Permanently delete an event
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

    if (event.group.owner.toString() !== requester._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can delete this event." });
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
                members: parentGroup.members,
                undecided: parentGroup.members,
                isOverride: false,
                capacity: parentGroup.defaultCapacity // Inherit group limit
            });
        } catch (regenError) {
            console.error("Failed to regenerate next event after deletion:", regenError);
        }
    }

    res.status(200).json({ message: "Event deleted successfully." });
});