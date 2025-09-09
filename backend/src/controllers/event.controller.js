import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import { getAuth } from "@clerk/express";

// This function will find all upcoming events for the currently logged-in user.
export const getEvents = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);

  // Find the current user in your database to get their MongoDB _id
  const currentUser = await User.findOne({ clerkId }).lean();
  if (!currentUser) {
    return res.status(404).json({ error: "User not found." });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to the beginning of today for accurate date comparison

  // Find all events where the current user is a member and the event date is today or in the future.
  // We also sort them by date to show the soonest events first.
  const upcomingEvents = await Event.find({
    members: currentUser._id,
    date: { $gte: today }, // $gte means "greater than or equal to"
  }).sort({ date: "asc" }); // 'asc' for ascending order

  res.status(200).json(upcomingEvents);
});
