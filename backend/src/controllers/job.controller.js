import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { DateTime } from "luxon";
import { calculateNextEventDate } from "../utils/date.utils.js";
import { notifyUsers } from "../utils/push.notifications.js";

/**
 * Helper: parseTimeString
 * Converts "07:00 PM" into { hours: 19, minutes: 0 }
 */
const parseTimeString = (timeStr) => {
  if (!timeStr) return { hours: 9, minutes: 0 };
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return { hours, minutes };
};

/**
 * @desc    Cron job to clean up expired events and generate new ones "Just-in-Time"
 * @route   POST /api/jobs/regenerate-events
 */
export const regenerateEvents = asyncHandler(async (req, res) => {
  console.log("Cron job started: JIT Event Generation...");
  const now = DateTime.now(); 
  
  // 1. Cleanup Expired Events and Clear Mutes
  const expiredEvents = await Event.find({ date: { $lt: now.toJSDate() } }).select('_id group').lean();
  if (expiredEvents.length > 0) {
    const groupIdsToUnmute = [...new Set(expiredEvents.map(e => e.group.toString()))];
    await User.updateMany(
      { mutedUntilNextEvent: { $in: groupIdsToUnmute } },
      { $pull: { mutedUntilNextEvent: { $in: groupIdsToUnmute } } }
    );
    await Event.deleteMany({ _id: { $in: expiredEvents.map(e => e._id) } });
  }

  // 2. Replenish Groups via JIT Logic
  // Filter for groups that actually have a schedule defined
  const groups = await Group.find({ 
    "schedule.routines": { $exists: true, $not: { $size: 0 } } 
  });

  let generatedCount = 0;

  for (const group of groups) {
    const timezone = group.timezone;
    const kickoffDate = group.schedule.startDate 
        ? DateTime.fromJSDate(group.schedule.startDate).setZone(timezone).startOf('day').toJSDate()
        : now.setZone(timezone).startOf('day').toJSDate();

    // Iterate through each routine (up to 5) in the group's multiple rules
    for (const routine of group.schedule.routines) {
        
        // For each routine, we check every specific day/time entry
        for (const dtEntry of routine.dayTimes) {
            
            // A. Find the last generated event matching THIS specific frequency/day pattern
            // We search for events created by this routine to use as an anchor.
            const lastEvent = await Event.findOne({ 
                group: group._id, 
                isOverride: false,
                time: dtEntry.time, // Matches the specific time of this dayTime entry
                // We use the date logic in calculateNextEventDate to find the next one,
                // so we just need the most recent instance to avoid skipping cycles.
            })
            .sort({ date: -1 })
            .lean();

            const anchorDate = lastEvent ? lastEvent.date : kickoffDate;

            // B. Calculate the NEXT potential meeting date for this specific day/time
            const nextMeetingDate = calculateNextEventDate(
                routine.frequency === 'monthly' ? dtEntry.date : dtEntry.day,
                dtEntry.time,
                timezone,
                routine.frequency,
                anchorDate,
                routine.frequency === 'ordinal' ? routine.ordinalConfig : null
            );

            const nextMeetingDT = DateTime.fromJSDate(nextMeetingDate).setZone(timezone);

            // C. Calculate the "Trigger Time" (When this event should be created)
            const { hours, minutes } = parseTimeString(group.generationLeadTime || "09:00 AM");
            const triggerDT = nextMeetingDT
                .minus({ days: group.generationLeadDays || 0 })
                .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

            // D. Check if we have reached the trigger window AND event doesn't exist
            const alreadyExists = await Event.findOne({ 
                group: group._id, 
                date: nextMeetingDate,
                time: dtEntry.time
            });

            const nowInTZ = now.setZone(timezone);

            if (nowInTZ >= triggerDT && !alreadyExists) {
                console.log(`Generating JIT event for group: ${group.name} - Routine: ${routine.frequency}`);
                
                const newEvent = await Event.create({
                    group: group._id,
                    name: group.name,
                    date: nextMeetingDate,
                    time: dtEntry.time,
                    timezone: timezone,
                    location: group.defaultLocation || "",
                    members: group.members,
                    undecided: group.members,
                    capacity: group.defaultCapacity || 0,
                    isOverride: false
                });

                // E. Notify Members
                const members = await User.find({ _id: { $in: group.members } });
                await notifyUsers(members, {
                    title: `Upcoming: ${group.name}`,
                    body: `${nextMeetingDT.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)} at ${dtEntry.time}`,
                    data: { 
                        type: 'event_created', 
                        eventId: newEvent._id.toString(),
                        groupId: group._id.toString()
                    },
                    categoryIdentifier: 'EVENT_RSVP'
                });

                generatedCount++;
            }
        }
    }
  }

  res.status(200).json({ 
    message: "JIT processing complete.", 
    deleted: expiredEvents.length, 
    generated: generatedCount 
  });
});