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
  const groups = await Group.find({ 
    "schedule.routines": { $exists: true, $not: { $size: 0 } } 
  });

  let generatedCount = 0;

  for (const group of groups) {
    const timezone = group.timezone;
    const kickoffDate = group.schedule.startDate 
        ? DateTime.fromJSDate(group.schedule.startDate).setZone(timezone).startOf('day').toJSDate()
        : now.setZone(timezone).startOf('day').toJSDate();

    for (const routine of group.schedule.routines) {
        for (const dtEntry of routine.dayTimes) {
            
            // --- PROJECT 6/7: Iterative Window Filling ---
            // We loop to ensure the entire lead-time window is filled immediately.
            let currentAnchor = null;
            let fillingWindow = true;

            while (fillingWindow) {
                // A. Find the most recent anchor for this specific day/time
                const lastEvent = await Event.findOne({ 
                    group: group._id, 
                    isOverride: false,
                    time: dtEntry.time,
                    // If we just created an event in this loop, we anchor to it.
                    // Otherwise, we look at the database.
                    date: currentAnchor ? { $gt: currentAnchor } : { $exists: true }
                })
                .sort({ date: -1 })
                .lean();

                const anchorDate = lastEvent ? lastEvent.date : (currentAnchor || kickoffDate);

                // B. Calculate NEXT date
                const nextMeetingDate = calculateNextEventDate(
                    routine.frequency === 'monthly' ? dtEntry.date : dtEntry.day,
                    dtEntry.time,
                    timezone,
                    routine.frequency,
                    anchorDate,
                    routine.frequency === 'ordinal' ? routine.rules?.[0] : null
                );

                const nextMeetingDT = DateTime.fromJSDate(nextMeetingDate).setZone(timezone);

                // C. Trigger Time math
                const { hours, minutes } = parseTimeString(group.generationLeadTime || "09:00 AM");
                const triggerDT = nextMeetingDT
                    .minus({ days: group.generationLeadDays || 0 })
                    .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

                const nowInTZ = now.setZone(timezone);

                // D. Break condition: If the next potential meeting's trigger is in the future, we are done filling.
                if (nowInTZ < triggerDT) {
                    fillingWindow = false;
                    break;
                }

                // E. Check Existence to prevent duplicates
                const alreadyExists = await Event.findOne({ 
                    group: group._id, 
                    date: nextMeetingDate,
                    time: dtEntry.time
                });

                if (!alreadyExists) {
                    console.log(`[JIT] Creating: ${group.name} | Date: ${nextMeetingDT.toISODate()} | Lead: ${group.generationLeadDays}d`);
                    
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

                    // F. Notify Members
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

                // Update anchor for the next iteration of the while loop
                currentAnchor = nextMeetingDate;

                // Safety break to prevent infinite loops (max 15 events per run per routine)
                if (generatedCount > 15) fillingWindow = false;
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