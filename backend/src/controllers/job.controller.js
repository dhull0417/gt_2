import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";
import { DateTime } from "luxon";
import { calculateNextEventDate } from "../utils/date.utils.js";

const parseTime = (timeString) => {
    if (!timeString || typeof timeString !== 'string' || !timeString.includes(':')) {
        return { hours: 0, minutes: 0 }; 
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
    if (!event.date || !event.time) return false;
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
      // 1. Fetch existing future events
      const existingFutureEvents = await Event.find({ 
        group: group._id, 
        isOverride: false, 
        date: { $gte: now } 
      }).sort({ date: 1 }).lean();

      const desiredCount = group.eventsToDisplay || 3;
      const currentCount = existingFutureEvents.length;
      const needed = desiredCount - currentCount;

      if (needed > 0) {
        console.log(`--- Regenerating Group: ${group.name} ---`);
        
        let anchorDate = currentCount > 0 
          ? existingFutureEvents[currentCount - 1].date 
          : now;

        for (let i = 0; i < needed; i++) {
          let dayOrRule;
          
          // 2. Handle Custom vs Standard frequencies
          if (group.schedule.frequency === 'custom' && group.schedule.rules?.length > 0) {
            // For Custom, we rotate through the rules based on the current iteration
            // This works best for replenishment.
            dayOrRule = group.schedule.rules[i % group.schedule.rules.length];
          } else if (group.schedule.frequency === 'daily' || !group.schedule.days || group.schedule.days.length === 0) {
            dayOrRule = (group.schedule.days && group.schedule.days[0]) || 0;
          } else {
            // Weekly / Bi-weekly multi-day logic
            const anchorDateTime = DateTime.fromJSDate(anchorDate).setZone(group.timezone);
            const currentWeekday = anchorDateTime.weekday === 7 ? 0 : anchorDateTime.weekday;
            const sortedDays = [...group.schedule.days].sort((a, b) => a - b);
            
            let nextDay = sortedDays.find(d => d > currentWeekday);
            dayOrRule = nextDay !== undefined ? nextDay : sortedDays[0];
          }

          const nextDate = calculateNextEventDate(
            dayOrRule, 
            group.time, 
            group.timezone, 
            group.schedule.frequency,
            anchorDate
          );

          await Event.create({
            group: group._id,
            name: group.name,
            date: nextDate,
            time: group.time,
            timezone: group.timezone,
            members: group.members,
            undecided: group.members,
          });

          console.log(`Created ${group.schedule.frequency} event (Day/Rule: ${typeof dayOrRule === 'object' ? 'Custom' : dayOrRule}) on: ${nextDate}`);

          anchorDate = nextDate;
          regeneratedCount++;
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