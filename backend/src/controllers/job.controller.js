import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";
import User from "../models/user.model.js"; 
import { DateTime } from "luxon";
import { calculateNextEventDate } from "../utils/date.utils.js";

/**
 * @desc    Cron job to clean up expired events, replenish recurring schedules,
 * and clear temporary "Until Next Meeting" mutes.
 * @route   POST /api/jobs/regenerate-events
 */
export const regenerateEvents = asyncHandler(async (req, res) => {
  console.log("Cron job started: Regenerating events and cleaning temporary mutes...");
  const now = new Date();
  
  // 1. Identify and Cleanup Expired Events
  // We select 'group' as well so we know which groups to unmute users for
  const expiredEvents = await Event.find({ date: { $lt: now } }).select('_id group').lean();
  
  if (expiredEvents.length > 0) {
    const expiredIds = expiredEvents.map(e => e._id);
    
    // --- 1.1 Clear Temporary Mutes (Project 4) ---
    // We extract unique group IDs from the events that just expired.
    const groupIdsToUnmute = [...new Set(expiredEvents.map(e => e.group.toString()))];
    
    if (groupIdsToUnmute.length > 0) {
      console.log(`Clearing temporary mutes for groups: ${groupIdsToUnmute.join(', ')}`);
      
      // Pull these group IDs from any user's 'mutedUntilNextEvent' array.
      // This effectively "turns back on" notifications for the next message/event.
      await User.updateMany(
        { mutedUntilNextEvent: { $in: groupIdsToUnmute } },
        { $pull: { mutedUntilNextEvent: { $in: groupIdsToUnmute } } }
      );
    }

    // Now delete the expired event instances
    await Event.deleteMany({ _id: { $in: expiredIds } });
  }

  // 2. Replenish Recurring Groups
  const groups = await Group.find({ "schedule.frequency": { $exists: true, $ne: 'once' } });
  let regeneratedCount = 0;

  for (const group of groups) {
    // Check how many future (non-override) events currently exist for this group
    const existingFutureEvents = await Event.find({ 
      group: group._id, 
      isOverride: false, 
      date: { $gte: now } 
    }).sort({ date: 1 }).lean();

    const needed = (group.eventsToDisplay || 3) - existingFutureEvents.length;

    if (needed > 0) {
      // Use the last existing event date as the anchor, or 'now' if none exist
      let anchorDate = existingFutureEvents.length > 0 
        ? existingFutureEvents[existingFutureEvents.length - 1].date 
        : now;

      for (let i = 0; i < needed; i++) {
        let dayOrRule;
        
        // Determine the logic for selecting the next day based on frequency
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

        // Create the new event instance inheriting group defaults
        await Event.create({
          group: group._id,
          name: group.name,
          date: nextDate,
          time: group.time,
          timezone: group.timezone,
          location: group.defaultLocation || "", // Inherit location
          members: group.members,
          undecided: group.members,
          isOverride: false,
          capacity: group.defaultCapacity || 0 // Inherit capacity
        });

        anchorDate = nextDate;
        regeneratedCount++;
      }
    }
  }

  res.status(200).json({ 
    message: "Cleanup, unmuting, and regeneration complete.", 
    deletedEvents: expiredEvents.length, 
    regeneratedEvents: regeneratedCount 
  });
});