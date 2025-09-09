import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";

// Helper function to calculate the next event date (copied for use here)
const calculateNextEventDate = (schedule) => {
  const now = new Date();
  let eventDate = new Date(now.getTime());

  if (schedule.frequency === 'weekly') {
    const currentDay = now.getUTCDay();
    const targetDay = schedule.day;
    let dayDifference = targetDay - currentDay;
    if (dayDifference < 0) {
      dayDifference += 7;
    }
    eventDate.setUTCDate(now.getUTCDate() + dayDifference);
  } else if (schedule.frequency === 'monthly') {
    const currentMonthDate = now.getUTCDate();
    const targetMonthDate = schedule.day;
    eventDate.setUTCDate(targetMonthDate);
    if (targetMonthDate <= currentMonthDate) {
      eventDate.setUTCMonth(now.getUTCMonth() + 1);
    }
  }

  eventDate.setUTCHours(0, 0, 0, 0);
  return eventDate;
};

// The main function for our cron job
export const regenerateEvents = asyncHandler(async (req, res) => {
  console.log("Cron job started: Regenerating events...");
  const now = new Date();

  // 1. Find all events that have already occurred.
  // We do this by combining the event's date and time.
  const allEvents = await Event.find().lean();
  
  const expiredEvents = allEvents.filter(event => {
    const eventDateTime = new Date(event.date);
    const [hours, minutes] = event.time.split(' ')[0].split(':');
    const period = event.time.split(' ')[1];
    
    let hour = parseInt(hours);
    if (period === 'PM' && hour !== 12) {
      hour += 12;
    }
    if (period === 'AM' && hour === 12) {
      hour = 0;
    }

    eventDateTime.setUTCHours(hour, parseInt(minutes));
    return eventDateTime < now;
  });

  if (expiredEvents.length === 0) {
    console.log("No expired events to process. Job finished.");
    return res.status(200).json({ message: "No expired events to process." });
  }

  // 2. Collect IDs of expired events and their parent groups
  const expiredEventIds = expiredEvents.map(e => e._id);
  const groupIdsToRegenerate = [...new Set(expiredEvents.map(e => e.group))];

  // 3. Delete all expired events in one operation
  await Event.deleteMany({ _id: { $in: expiredEventIds } });
  console.log(`Deleted ${expiredEventIds.length} expired events.`);

  // 4. Find the groups that need new events
  const groups = await Group.find({ _id: { $in: groupIdsToRegenerate } });

  // 5. Create a new event for each of those groups
  for (const group of groups) {
    if (group.schedule) {
      const nextEventDate = calculateNextEventDate(group.schedule);
      await Event.create({
        group: group._id,
        name: group.name,
        date: nextEventDate,
        time: group.time,
        members: group.members, // Use the group's current member list
        undecided: group.members,
      });
      console.log(`Regenerated event for group '${group.name}' for ${nextEventDate.toDateString()}`);
    }
  }

  console.log("Event regeneration complete. Job finished.");
  res.status(200).json({
    message: "Event regeneration complete.",
    deleted: expiredEventIds.length,
    regenerated: groups.length,
  });
});