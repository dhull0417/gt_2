import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";
import { DateTime } from "luxon";

const calculateNextEventDate = (schedule, groupTime, timezone) => {
  const now = DateTime.now().setZone(timezone);
  const [time, period] = groupTime.split(' ');
  let [hour, minute] = time.split(':').map(Number);
  if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
  let eventDate;
  if (schedule.frequency === 'weekly') {
    const targetWeekday = schedule.day === 0 ? 7 : schedule.day;
    let eventDateTime = now.set({ hour: hour, minute: minute, second: 0, millisecond: 0 });
    if (targetWeekday > now.weekday || (targetWeekday === now.weekday && eventDateTime > now)) {
        eventDate = eventDateTime.set({ weekday: targetWeekday });
    } else {
        eventDate = eventDateTime.plus({ weeks: 1 }).set({ weekday: targetWeekday });
    }
  } else {
    const targetDayOfMonth = schedule.day;
    let eventDateTime = now.set({ day: targetDayOfMonth, hour: hour, minute: minute, second: 0, millisecond: 0 });
    if (eventDateTime < now) {
      eventDate = eventDateTime.plus({ months: 1 });
    } else {
      eventDate = eventDateTime;
    }
  }
  return eventDate.toJSDate();
};

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

export const regenerateEvents = asyncHandler(async (req, res) => {
  console.log("Cron job started: Regenerating events...");
  const now = new Date();
  
  // 1. Find only the automatically scheduled events that have expired.
  const expiredRecurringEvents = await Event.find({
      isOverride: false, // Only look for the main recurring events
  }).lean();

  const eventsToDelete = expiredRecurringEvents.filter(event => {
    const eventDateTime = new Date(event.date);
    const { hours, minutes } = parseTime(event.time);
    eventDateTime.setUTCHours(hours, minutes);
    return eventDateTime < now;
  });
  
  // Note: One-off events (isOverride: true) are now left alone until they are manually deleted or handled differently.
  // This is a simple approach. A more advanced one could clean up expired one-offs here too.

  if (eventsToDelete.length === 0) {
    console.log("No recurring events to process. Job finished.");
    return res.status(200).json({ message: "No recurring events to process." });
  }

  const expiredEventIds = eventsToDelete.map(e => e._id);
  const groupIdsToRegenerate = [...new Set(eventsToDelete.map(e => String(e.group)))];

  // 2. Delete only the expired recurring events
  await Event.deleteMany({ _id: { $in: expiredEventIds } });
  console.log(`Deleted ${expiredEventIds.length} expired recurring events.`);

  const groups = await Group.find({ _id: { $in: groupIdsToRegenerate } });

  for (const group of groups) {
    if (group.schedule) {
      // 3. We can now safely generate the next recurring event
      const nextEventDate = calculateNextEventDate(group.schedule, group.time, group.timezone);
      await Event.create({
        group: group._id,
        name: group.name,
        date: nextEventDate,
        time: group.time,
        timezone: group.timezone,
        members: group.members,
        undecided: group.members,
        isOverride: false, // Ensure it's marked as a recurring event
      });
      console.log(`Regenerated recurring event for group '${group.name}'`);
    }
  }

  console.log("Event regeneration complete. Job finished.");
  res.status(200).json({
    message: "Event regeneration complete.",
    deleted: expiredEventIds.length,
    regenerated: groups.length,
  });
});