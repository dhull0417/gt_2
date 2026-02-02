import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { DateTime } from "luxon";
import { calculateNextEventDate } from "../utils/date.utils.js";
import { notifyUsers } from "../utils/push.notifications.js";

/**
 * Helper: parseTimeString
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
  
  // 1. Cleanup Expired Events
  const expiredEvents = await Event.find({ date: { $lt: now.toJSDate() } }).select('_id group name date').lean();
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
    
    // Kickoff date used ONLY as a filter (Step 1 of Troubleshooting)
    const kickoffDate = group.schedule.startDate 
        ? DateTime.fromJSDate(group.schedule.startDate).setZone(timezone).toJSDate()
        : now.setZone(timezone).startOf('day').toJSDate();

    for (const routine of group.schedule.routines) {
        for (const dtEntry of routine.dayTimes) {
            
            let currentAnchor = null;
            let fillingWindow = true;
            let safetyCounter = 0;

            while (fillingWindow && safetyCounter < 20) {
                safetyCounter++;

                // A. Anchor Resolution: Decoupled from kickoffDate
                // If lastEvent and currentAnchor are null, utility starts from 'now'
                const lastEvent = await Event.findOne({ 
                    group: group._id, 
                    isOverride: false,
                    time: dtEntry.time,
                    date: currentAnchor ? { $gt: currentAnchor } : { $exists: true }
                })
                .sort({ date: -1 })
                .lean();

                const anchorDate = lastEvent ? lastEvent.date : currentAnchor;

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

                // C. The Kickoff Guard (Step 1 Implementation)
                // If the meeting happens before kickoff, skip it and look for the next one
                if (nextMeetingDate < kickoffDate) {
                    currentAnchor = nextMeetingDate;
                    continue;
                }

                // D. The Past-Event Guard
                // JIT should never create events that are already in the past
                if (nextMeetingDT < now.setZone(timezone)) {
                    currentAnchor = nextMeetingDate;
                    continue;
                }

                // E. Trigger Time math
                const { hours, minutes } = parseTimeString(group.generationLeadTime || "09:00 AM");
                const triggerDT = nextMeetingDT
                    .minus({ days: group.generationLeadDays || 0 })
                    .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

                const nowInTZ = now.setZone(timezone);

                // F. Break condition
                if (nowInTZ < triggerDT) {
                    fillingWindow = false;
                    break;
                }

                // G. Check Existence
                const alreadyExists = await Event.findOne({ 
                    group: group._id, 
                    date: nextMeetingDate,
                    time: dtEntry.time
                });

                if (!alreadyExists) {
                    console.log(`[JIT] Creating: ${group.name} | Date: ${nextMeetingDT.toISODate()}`);
                    
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

                    // H. Notify Members
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

                currentAnchor = nextMeetingDate;
            }
        }
    }
  }

  res.status(200).json({ generated: generatedCount });
});