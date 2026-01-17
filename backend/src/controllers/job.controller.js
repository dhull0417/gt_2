import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";
import { DateTime } from "luxon";
import { calculateNextEventDate } from "../utils/date.utils.js";

/**
 * @desc    Cron job to clean up expired events and replenish recurring schedules.
 * Handles both standard recurring events and one-off overrides.
 */
export const regenerateEvents = asyncHandler(async (req, res) => {
  console.log("Cron job started: Regenerating events...");
  const now = new Date();
  
  // 1. Process Expired Events First (Cleanup)
  // FIX: We fetch ALL events. Previously, this filtered for { isOverride: false },
  // which caused one-off events to be ignored by the cleanup logic.
  const allEvents = await Event.find({}).lean(); 
  
  const expiredEvents = allEvents.filter(event => {
    if (!event.date) return false;
    
    // Convert stored date to JS Date for comparison.
    // Our updated utility ensures 'once' events have the exact time set.
    const eventDateTime = new Date(event.date);
    return eventDateTime < now;
  });

  if (expiredEvents.length > 0) {
    const expiredEventIds = expiredEvents.map(e => e._id);
    await Event.deleteMany({ _id: { $in: expiredEventIds } });
    console.log(`Deleted ${expiredEventIds.length} expired events (including one-offs).`);
  }

  // 2. Replenish Recurring Groups Only (Self-Healing)
  // We explicitly exclude groups with frequency 'once' to prevent infinite replenishment.
  const groups = await Group.find({ 
    "schedule.frequency": { $exists: true, $ne: 'once' } 
  });
  
  let regeneratedCount = 0;

  for (const group of groups) {
    if (group.schedule) {
      // For replenishment logic, we only count standard future events.
      // We don't want a manual one-off (isOverride: true) to prevent 
      // the standard recurring events from generating.
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
          
          // Determine the correct day index or rule object for the utility
          if (group.schedule.frequency === 'custom' && group.schedule.rules?.length > 0) {
            dayOrRule = group.schedule.rules[i % group.schedule.rules.length];
          } else if (group.schedule.frequency === 'daily' || !group.schedule.days || group.schedule.days.length === 0) {
            dayOrRule = (group.schedule.days && group.schedule.days[0]) || 0;
          } else {
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
            isOverride: false // These are standard recurring instances
          });

          console.log(`Created ${group.schedule.frequency} event on: ${nextDate}`);

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