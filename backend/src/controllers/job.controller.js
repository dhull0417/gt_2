import asyncHandler from "express-async-handler";
import Meetup from "../models/meetup.model.js";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { DateTime } from "luxon";
import { calculateNextMeetupDate } from "../utils/date.utils.js";
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
 * @desc    Cron job to clean up expired meetups and generate new ones "Just-in-Time"
 * @route   POST /api/jobs/regenerate-meetups
 */
export const regenerateMeetups = asyncHandler(async (req, res) => {
  console.log("Cron job started: JIT Meetup Generation...");
  const now = DateTime.now(); 
  
  // 1. Cleanup Expired Meetups
  const expiredMeetups = await Meetup.find({ date: { $lt: now.toJSDate() } }).select('_id group name date').lean();
  if (expiredMeetups.length > 0) {
    const groupIdsToUnmute = [...new Set(expiredMeetups.map(e => e.group.toString()))];
    await User.updateMany(
      { mutedUntilNextMeetup: { $in: groupIdsToUnmute } },
      { $pull: { mutedUntilNextMeetup: { $in: groupIdsToUnmute } } }
    );
    await Meetup.deleteMany({ _id: { $in: expiredMeetups.map(e => e._id) } });
  }

  // 2. Replenish Groups via JIT Logic
  const groups = await Group.find({ 
    "schedule.routines": { $exists: true, $not: { $size: 0 } } 
  });

  let generatedCount = 0;

  for (const group of groups) {
    const timezone = group.timezone;
    
    // --- FIX FOR KICKOFF DRIFT ---
    // We treat the stored UTC date as the 'Local' intended date to prevent the 1-day-early bug.
    const kickoffDate = group.schedule.startDate 
        ? DateTime.fromJSDate(group.schedule.startDate, { zone: 'utc' })
            .setZone(timezone, { keepLocalTime: true })
            .startOf('day')
            .toJSDate()
        : now.setZone(timezone).startOf('day').toJSDate();

    for (const routine of group.schedule.routines) {
        for (const dtEntry of routine.dayTimes) {
            
            let currentAnchor = null;
            let fillingWindow = true;
            let safetyCounter = 0;

            while (fillingWindow && safetyCounter < 20) {
                safetyCounter++;

                const lastMeetup = await Meetup.findOne({ 
                    group: group._id, 
                    isOverride: false,
                    time: dtEntry.time,
                    date: currentAnchor ? { $gt: currentAnchor } : { $exists: true }
                })
                .sort({ date: -1 })
                .lean();

                const anchorDate = lastMeetup ? lastMeetup.date : currentAnchor;

                const nextMeetupDate = calculateNextMeetupDate(
                    routine.frequency === 'monthly' ? dtEntry.date : dtEntry.day,
                    dtEntry.time,
                    timezone,
                    routine.frequency,
                    anchorDate,
                    routine.frequency === 'ordinal' ? routine.rules?.[0] : null
                );

                const nextMeetupDT = DateTime.fromJSDate(nextMeetupDate).setZone(timezone);

                // --- TROUBLESHOOTING LOG: STEP 2 ---
                if (group.name === "Hello") {
                    const kickoffDT = DateTime.fromJSDate(kickoffDate).setZone(timezone);
                    console.log(`[KICKOFF DEBUG] Kickoff: ${kickoffDT.toLocaleString(DateTime.DATETIME_MED)} | Target: ${nextMeetupDT.toLocaleString(DateTime.DATETIME_MED)} | Skip? ${nextMeetupDate < kickoffDate}`);
                }

                if (nextMeetupDate < kickoffDate) {
                    currentAnchor = nextMeetupDate;
                    continue;
                }

                if (nextMeetupDT < now.setZone(timezone)) {
                    currentAnchor = nextMeetupDate;
                    continue;
                }

                const { hours, minutes } = parseTimeString(group.generationLeadTime || "09:00 AM");
                const triggerDT = nextMeetupDT
                    .minus({ days: group.generationLeadDays || 0 })
                    .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

                const nowInTZ = now.setZone(timezone);

                if (nowInTZ < triggerDT) {
                    fillingWindow = false;
                    break;
                }

                const alreadyExists = await Meetup.findOne({ 
                    group: group._id, 
                    date: nextMeetupDate,
                    time: dtEntry.time
                });

                if (!alreadyExists) {
                    console.log(`[JIT] Creating: ${group.name} | Date: ${nextMeetupDT.toISODate()}`);
                    
                    const newMeetup = await Meetup.create({
                        group: group._id,
                        name: group.name,
                        date: nextMeetupDate,
                        time: dtEntry.time,
                        timezone: timezone,
                        location: group.defaultLocation || "",
                        members: group.members,
                        undecided: group.members,
                        capacity: group.defaultCapacity || 0,
                        isOverride: false
                    });

                    const members = await User.find({ _id: { $in: group.members } });
                    await notifyUsers(members, {
                        title: `Upcoming: ${group.name}`,
                        body: `${nextMeetupDT.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)} at ${dtEntry.time}`,
                        data: { 
                            type: 'meetup_created', 
                            meetupId: newMeetup._id.toString(),
                            groupId: group._id.toString()
                        },
                        categoryIdentifier: 'MEETUP_RSVP'
                    });

                    generatedCount++;
                }

                currentAnchor = nextMeetupDate;
            }
        }
    }
  }

  res.status(200).json({ generated: generatedCount });
});