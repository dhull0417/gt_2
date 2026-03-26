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
 * @desc    Job to find scheduled meetups that are now in the past and mark them as 'expired'.
 *          This should be run periodically (e.g., every hour).
 * @route   POST /api/jobs/expire-meetups
 */
export const expirePastMeetups = asyncHandler(async (req, res) => {
    console.log("Running job: expirePastMeetups...");
    const now = DateTime.now();

    // Find all meetups that are still marked as scheduled
    const scheduledMeetups = await Meetup.find({ status: 'scheduled' });

    const meetupsToExpireIds = [];
    const groupsToUnmute = new Set();

    for (const meetup of scheduledMeetups) {
        const timeParts = parseTimeString(meetup.time);
        const meetupDateTime = DateTime.fromJSDate(meetup.date, { zone: meetup.timezone }).set({ 
            hour: timeParts.hours, 
            minute: timeParts.minutes 
        });

        // If the meetup's time is in the past, mark it for expiration
        if (meetupDateTime < now) {
            meetupsToExpireIds.push(meetup._id);
            if (meetup.group) {
              groupsToUnmute.add(meetup.group.toString());
            }
        }
    }

    let expiredCount = 0;
    if (meetupsToExpireIds.length > 0) {
        const result = await Meetup.updateMany(
            { _id: { $in: meetupsToExpireIds } },
            { $set: { status: 'expired' } }
        );
        expiredCount = result.modifiedCount;
        console.log(`Expired ${expiredCount} meetups.`);

        // The original `regenerateMeetups` job handled unmuting. We move that logic here,
        // as this is when a meetup officially "ends".
        if (groupsToUnmute.size > 0) {
            await User.updateMany(
              { mutedUntilNextMeetup: { $in: Array.from(groupsToUnmute) } },
              { $pull: { mutedUntilNextMeetup: { $in: Array.from(groupsToUnmute) } } }
            );
            console.log(`Unmuted users for ${groupsToUnmute.size} groups.`);
        }
    } else {
        console.log("No meetups to expire.");
    }

    res.status(200).json({ message: `Job complete. Expired ${expiredCount} meetups.` });
});

/**
 * @desc    Job to permanently delete meetups that expired more than 7 days ago.
 *          This should be run periodically (e.g., once a day).
 * @route   POST /api/jobs/cleanup-meetups
 */
export const cleanupExpiredMeetups = asyncHandler(async (req, res) => {
    console.log("Running job: cleanupExpiredMeetups...");
    // Delete meetups that expired more than 10 days ago.
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10); 
    tenDaysAgo.setHours(0, 0, 0, 0); // Ensure comparison is at start of day

    const oldMeetups = await Meetup.find({ 
        status: 'expired',
        date: { $lte: tenDaysAgo }
    });

    if (oldMeetups.length === 0) {
        console.log("No old expired meetups to clean up.");
        return res.status(200).json({ message: "No old expired meetups to clean up.", deletedCount: 0 });
    }

    const result = await Meetup.deleteMany({ _id: { $in: oldMeetups.map(m => m._id) } });
    const deletedCount = result.deletedCount;
    console.log(`Cleanup complete. Deleted ${deletedCount} old meetups.`);

    // Note: The regeneration of recurring meetups is handled by the `regenerateMeetups`
    // job. This cleanup job is solely responsible for deleting old data. This separation
    // of concerns creates a more robust and predictable system.

    res.status(200).json({ message: `Cleanup complete. Deleted ${deletedCount} old meetups.` });
});

/**
 * @desc    Cron job to generate new meetups "Just-in-Time"
 * @route   POST /api/jobs/regenerate-meetups
 */
export const regenerateMeetups = asyncHandler(async (req, res) => {
  console.log("Cron job started: JIT Meetup Generation...");
  const now = DateTime.now(); 
  
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