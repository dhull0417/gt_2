import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";
import { DateTime } from "luxon";
import { calculateNextEventDate } from "../utils/date.utils.js"; // Import from new location

// The parseTime helper function is still needed here for the expired events filter
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
  
  const expiredRecurringEvents = await Event.find({ isOverride: false }).lean();
  
  const eventsToDelete = expiredRecurringEvents.filter(event => {
    const eventDateTime = new Date(event.date);
    const { hours, minutes } = parseTime(event.time);
    eventDateTime.setUTCHours(hours, minutes);
    return eventDateTime < now;
  });

  if (eventsToDelete.length === 0) {
    console.log("No recurring events to process. Job finished.");
    return res.status(200).json({ message: "No recurring events to process." });
  }

  const expiredEventIds = eventsToDelete.map(e => e._id);
  const groupIdsToRegenerate = [...new Set(eventsToDelete.map(e => String(e.group)))];

  await Event.deleteMany({ _id: { $in: expiredEventIds } });
  console.log(`Deleted ${expiredEventIds.length} expired recurring events.`);

  const groups = await Group.find({ _id: { $in: groupIdsToRegenerate } });
  let regeneratedCount = 0;

  for (const group of groups) {
    if (group.schedule) {
      const upcomingEvent = await Event.findOne({
          group: group._id,
          date: { $gte: now },
      });
      
      if (!upcomingEvent) {
          // This function now uses the imported calculateNextEventDate
          const nextEventDate = calculateNextEventDate(group.schedule, group.time, group.timezone);
          await Event.create({
            group: group._id,
            name: group.name,
            date: nextEventDate,
            time: group.time,
            timezone: group.timezone,
            members: group.members,
            undecided: group.members,
            isOverride: false,
          });
          regeneratedCount++;
          console.log(`Regenerated event for group '${group.name}' for ${nextEventDate.toDateString()}`);
      } else {
        console.log(`Skipping regeneration for group '${group.name}' because a future event already exists.`);
      }
    }
  }

  console.log("Event regeneration complete. Job finished.");
  res.status(200).json({
    message: "Event regeneration complete.",
    deleted: expiredEventIds.length,
    regenerated: regeneratedCount,
  });
});