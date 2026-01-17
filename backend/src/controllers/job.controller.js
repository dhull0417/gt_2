import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";
import { DateTime } from "luxon";
import { calculateNextEventDate } from "../utils/date.utils.js";

/**
 * @desc    Cron job to clean up expired events and replenish recurring schedules.
 */
export const regenerateEvents = asyncHandler(async (req, res) => {
  console.log("Cron job started: Regenerating events...");
  const now = new Date();
  
  // 1. Cleanup Expired Events
  const expiredEvents = await Event.find({ date: { $lt: now } }).select('_id').lean();
  if (expiredEvents.length > 0) {
    await Event.deleteMany({ _id: { $in: expiredEvents.map(e => e._id) } });
  }

  // 2. Replenish Recurring Groups
  const groups = await Group.find({ "schedule.frequency": { $exists: true, $ne: 'once' } });
  let regeneratedCount = 0;

  for (const group of groups) {
    const existingFutureEvents = await Event.find({ 
      group: group._id, 
      isOverride: false, 
      date: { $gte: now } 
    }).sort({ date: 1 }).lean();

    const needed = (group.eventsToDisplay || 3) - existingFutureEvents.length;

    if (needed > 0) {
      let anchorDate = existingFutureEvents.length > 0 
        ? existingFutureEvents[existingFutureEvents.length - 1].date 
        : now;

      for (let i = 0; i < needed; i++) {
        let dayOrRule;
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

        const nextDate = calculateNextEventDate(dayOrRule, group.time, group.timezone, group.schedule.frequency, anchorDate);

        // FIXED: Now correctly inherits defaultCapacity from the Group
        await Event.create({
          group: group._id,
          name: group.name,
          date: nextDate,
          time: group.time,
          timezone: group.timezone,
          members: group.members,
          undecided: group.members,
          isOverride: false,
          capacity: group.defaultCapacity || 0 // 👈 Inheritance fix
        });

        anchorDate = nextDate;
        regeneratedCount++;
      }
    }
  }

  res.status(200).json({ message: "Done", deleted: expiredEvents.length, regenerated: regeneratedCount });
});