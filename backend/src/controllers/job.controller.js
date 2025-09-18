import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";
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

export const regenerateEvents = asyncHandler(async (req, res) => {
  console.log("Cron job started: Regenerating events...");
  const now = new Date();
  const allEvents = await Event.find({ isOverride: false }).lean();
  
  const expiredEvents = allEvents.filter(event => {
    if (!event.date || !event.time || typeof event.time !== 'string' || !event.time.includes(':')) {
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
    if (group.schedule && group.schedule.days) {
      const existingFutureEvents = await Event.find({ 
        group: group._id, 
        isOverride: false, 
        date: { $gte: now } 
      }).lean();

      const existingEventDays = new Set(existingFutureEvents.map(event => {
        const eventDate = DateTime.fromJSDate(event.date, { zone: group.timezone });
        return group.schedule.frequency === 'weekly' 
          ? (eventDate.weekday === 7 ? 0 : eventDate.weekday) // Get weekday for weekly events
          : eventDate.day; // Get day of month for monthly events
      }));

      for (const targetDay of group.schedule.days) {
        if (!existingEventDays.has(targetDay)) {
          const nextEventDate = calculateNextEventDate(targetDay, group.time, group.timezone, group.schedule.frequency);
          await Event.create({
            group: group._id, name: group.name, date: nextEventDate, time: group.time,
            timezone: group.timezone, members: group.members, undecided: group.members,
          });
          regeneratedCount++;
          console.log(`Regenerated event for group '${group.name}' on day ${targetDay}`);
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