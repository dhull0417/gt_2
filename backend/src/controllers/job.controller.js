import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";
import { DateTime } from "luxon";
import { calculateNextEventDate } from "../utils/date.utils.js";

const parseTime = (timeString) => {
    if (!timeString || typeof timeString !== 'string' || !timeString.includes(':')) {
        return { hours: 0, minutes: 0 }; // Return a default/safe value
    }
    const [time, period] = timeString.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (period && period.toUpperCase() === 'PM' && hours !== 12) {
        hours += 12;
    }
    if (period && period.toUpperCase() === 'AM' && hours === 12) {
        hours = 0;
    }
    return { hours, minutes };
};

export const regenerateEvents = asyncHandler(async (req, res) => {
  console.log("Cron job started: Regenerating events...");
  const now = new Date();
  
  const allEvents = await Event.find({ isOverride: false }).lean();
  
  const expiredEvents = allEvents.filter(event => {
    if (!event.date || !event.time) {
      return false;
    }
    const eventDateTime = new Date(event.date);
    const { hours, minutes } = parseTime(event.time);
    eventDateTime.setUTCHours(hours, minutes);
    return eventDateTime < now;
  });

  if (expiredEvents.length === 0) {
    console.log("No expired recurring events to process. Job finished.");
    return res.status(200).json({ message: "No expired recurring events to process." });
  }

  const expiredEventIds = expiredEvents.map(e => e._id);
  const groupIdsToRegenerate = [...new Set(expiredEvents.map(e => String(e.group)))];

  await Event.deleteMany({ _id: { $in: expiredEventIds } });
  console.log(`Deleted ${expiredEventIds.length} expired recurring events.`);

  const groups = await Group.find({ _id: { $in: groupIdsToRegenerate } });
  let regeneratedCount = 0;

  for (const group of groups) {
    if (group.schedule) {
      // 1. Fetch existing future events sorted by date
      const existingFutureEvents = await Event.find({ 
        group: group._id, 
        isOverride: false, 
        date: { $gte: now } 
      }).sort({ date: 1 }).lean();

      // --- Troubleshooting Logs ---
      console.log(`--- Troubleshooting Group: ${group.name} ---`);
      console.log(`Frequency: ${group.schedule.frequency}`);
      console.log(`Desired Count (eventsToDisplay): ${group.eventsToDisplay}`);
      console.log(`Current Future Count: ${existingFutureEvents.length}`);

      if (existingFutureEvents.length > 0) {
        const latestEvent = existingFutureEvents[existingFutureEvents.length - 1];
        console.log(`Latest Event Date: ${latestEvent.date} at ${latestEvent.time}`);
      } else {
        console.log(`No future events found. Anchor will be NOW.`);
      }
      // ----------------------------

      // Temporarily keeping your existing logic below to see how it compares to the logs above
      const existingEventDays = new Set(existingFutureEvents.map(event => {
        const eventDate = DateTime.fromJSDate(event.date, { zone: group.timezone });
        return group.schedule.frequency === 'weekly' 
          ? (eventDate.weekday === 7 ? 0 : eventDate.weekday)
          : eventDate.day;
      }));

      if (group.schedule.days) {
        for (const targetDay of group.schedule.days) {
          if (!existingEventDays.has(targetDay)) {
            const nextEventDate = calculateNextEventDate(targetDay, group.time, group.timezone, group.schedule.frequency);
            
            // Log exactly what's being attempted
            console.log(`Action: Attempting to create missing event for value ${targetDay} on date: ${nextEventDate}`);
            
            await Event.create({
              group: group._id, 
              name: group.name, 
              date: nextEventDate, 
              time: group.time,
              timezone: group.timezone, 
              members: group.members, 
              undecided: group.members,
            });
            regeneratedCount++;
          }
        }
      }
    }
  }

  console.log("Event regeneration complete. Job finished.");
  res.status(200).json({
    message: "Event regeneration complete.",
    deleted: expiredEvents.length,
    regenerated: regeneratedCount,
  });
});