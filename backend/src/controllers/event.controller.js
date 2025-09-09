import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";

// This function finds all upcoming events for the currently logged-in user.
export const getEvents = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);

  const currentUser = await User.findOne({ clerkId }).lean();
  if (!currentUser) {
    return res.status(404).json({ error: "User not found." });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // --- MODIFICATION: Populate the 'members' field ---
  // This will replace the member IDs with actual user objects (name, picture, etc.)
  const upcomingEvents = await Event.find({
    members: currentUser._id,
    date: { $gte: today },
  })
  .populate({
      path: "members",
      select: "firstName lastName _id profilePicture",
  })
  .sort({ date: "asc" });

  res.status(200).json(upcomingEvents);
});

// --- ADDED: New function to handle an RSVP submission ---
export const handleRsvp = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { eventId } = req.params;
  const { status } = req.body; // Expecting 'in' or 'out'

  // Find the current user to get their MongoDB _id
  const currentUser = await User.findOne({ clerkId }).lean();
  if (!currentUser) {
    return res.status(404).json({ error: "User not found." });
  }

  // Basic validation
  if (!['in', 'out'].includes(status)) {
    return res.status(400).json({ error: "Invalid RSVP status." });
  }
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(400).json({ error: "Invalid Event ID." });
  }

  const event = await Event.findById(eventId);
  if (!event) {
    return res.status(404).json({ error: "Event not found." });
  }

  // Use Mongoose operators to atomically move the user's ID between arrays.
  // First, pull the user from all possible arrays to ensure they only exist in one.
  await Event.updateOne(
    { _id: eventId },
    {
      $pull: {
        in: currentUser._id,
        out: currentUser._id,
        undecided: currentUser._id,
      },
    }
  );

  // Now, add the user to the correct array based on their new status.
  await Event.updateOne(
    { _id: eventId },
    {
      $addToSet: { [status]: currentUser._id }, // [status] dynamically uses 'in' or 'out'
    }
  );

  res.status(200).json({ message: "RSVP updated successfully." });
});