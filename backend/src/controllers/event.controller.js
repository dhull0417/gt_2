import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";
import { calculateNextEventDate } from "../utils/date.utils.js"; // Import the shared helper

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

export const updateEvent = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { eventId } = req.params;
    const { date, time, timezone } = req.body;

    if (!date || !time || !timezone) {
        return res.status(400).json({ error: "Date, time, and timezone are required." });
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
    event.isOverride = true;
    await event.save();

    res.status(200).json({ message: "Event updated successfully.", event });
});

export const handleRsvp = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { eventId } = req.params;
  const { status } = req.body;

  const currentUser = await User.findOne({ clerkId }).lean();
  if (!currentUser) return res.status(404).json({ error: "User not found." });

  if (!['in', 'out'].includes(status)) {
    return res.status(400).json({ error: "Invalid RSVP status." });
  }
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(400).json({ error: "Invalid Event ID." });
  }

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ error: "Event not found." });

  await Event.updateOne({ _id: eventId }, { $pull: { in: currentUser._id, out: currentUser._id, undecided: currentUser._id } });
  await Event.updateOne({ _id: eventId }, { $addToSet: { [status]: currentUser._id } });

  res.status(200).json({ message: "RSVP updated successfully." });
});

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
            });
            console.log(`Regenerated next event for group '${parentGroup.name}'`);
        } catch (regenError) {
            console.error("Failed to regenerate next event after deletion:", regenError);
        }
    }

    res.status(200).json({ message: "Event deleted successfully." });
});