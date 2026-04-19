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
 * @desc    Cron job to maintain a 30-day rolling window of meetups
 * @route   POST /api/jobs/regenerate-meetups
 */
export const regenerateMeetups = asyncHandler(async (req, res) => {
  console.log("Cron job started: 30-Day Rolling Window Generator...");
  const now = DateTime.now(); 
  
  const groups = await Group.find({ 
    "schedule.routines": { $exists: true, $not: { $size: 0 } } 
  });

  let generatedCount = 0;

  for (const group of groups) {
    const timezone = group.timezone;
    
    // Treat the stored UTC date as the 'Local' intended date
    const kickoffDate = group.schedule.startDate 
        ? DateTime.fromJSDate(group.schedule.startDate, { zone: 'utc' })
            .setZone(timezone, { keepLocalTime: true })
            .startOf('day')
            .toJSDate()
        : now.setZone(timezone).startOf('day').toJSDate();

    // 1. Define the 30-day hard limit
    const windowEndDT = now.setZone(timezone).plus({ days: 30 }).endOf('day');

    for (const routine of group.schedule.routines) {
        for (const dtEntry of routine.dayTimes) {
            
            // Inside regenerateMeetups (job.controller.js)
            
            let currentAnchor = null;
            let fillingWindow = true;
            let safetyCounter = 0;

            // Bumped to 60 to easily handle 30 days of daily meetups
            while (fillingWindow && safetyCounter < 100) { 
                safetyCounter++;

                const nextDate = calculateNextMeetupDate(
                    routine.frequency === 'monthly' ? dtEntry.date : dtEntry.day,
                    dtEntry.time,
                    timezone,
                    routine.frequency,
                    currentAnchor, // Rely entirely on in-memory anchor
                    routine.frequency === 'ordinal' ? routine.rules?.[0] : null
                );

                const nextMeetupDT = DateTime.fromJSDate(nextDate).setZone(timezone);

                if (nextDate < kickoffDate) {
                    currentAnchor = nextDate;
                    safetyCounter++;
                    continue;
}

                // The Window Break
                if (nextMeetupDT > windowEndDT) {
                    fillingWindow = false;
                    break;
                }

                const alreadyExists = await Meetup.findOne({ 
                    group: group._id, 
                    date: nextDate,
                    time: dtEntry.time
                });

                if (!alreadyExists) {
                    console.log(`[Rolling Window] Creating: ${group.name} | Date: ${nextMeetupDT.toISODate()}`);
                    
                    const { hours, minutes } = parseTimeString(group.rsvpLeadTime || "09:00 AM");
                    
                    const visibilityDT = nextMeetupDT
                        .minus({ days: group.visibilityLeadDays || 14 })
                        .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
                        
                    const rsvpDT = nextMeetupDT
                        .minus({ days: group.rsvpLeadDays || 14 })
                        .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

                    await Meetup.create({
                        group: group._id,
                        name: group.name,
                        date: nextDate,
                        time: dtEntry.time,
                        timezone: timezone,
                        location: group.defaultLocation || "",
                        members: group.members,
                        undecided: group.members,
                        capacity: group.defaultCapacity || 0,
                        isOverride: false,
                        visibilityDate: visibilityDT.toJSDate(),
                        rsvpOpenDate: rsvpDT.toJSDate()
                    });

                    generatedCount++;
                }

                currentAnchor = nextDate;
            }
        }
    }
  }

  res.status(200).json({ generated: generatedCount, message: "Rolling window generation complete." });
});

/**
 * Core logic for sending RSVP-open push notifications.
 * Called both from the HTTP route and as a fire-and-forget from getMeetups.
 */
export const sendRsvpOpenNotifications = async () => {
    const now = new Date();

    const meetups = await Meetup.find({
        status: 'scheduled',
        rsvpOpenDate: { $lte: now },
        rsvpNotificationSent: { $ne: true },
        date: { $gte: now }
    })
    .sort({ date: 1 })
    .populate('group', 'owner moderators name');

    if (meetups.length === 0) return;

    const notifiedGroups = new Set();

    for (const meetup of meetups) {
        const groupId = meetup.group._id.toString();

        // Mark as sent immediately to prevent duplicates from concurrent calls
        await Meetup.updateOne({ _id: meetup._id }, { $set: { rsvpNotificationSent: true } });

        if (notifiedGroups.has(groupId)) continue;

        try {
            const dateStr = new Date(meetup.date).toLocaleDateString(undefined, {
                weekday: 'short', month: 'short', day: 'numeric'
            });

            const membersToNotify = await User.find({ _id: { $in: meetup.undecided } });
            if (membersToNotify.length > 0) {
                await notifyUsers(membersToNotify, {
                    title: "RSVPs Are Open!",
                    body: `You can now RSVP to "${meetup.name}" on ${dateStr}.`,
                    data: { meetupId: meetup._id.toString(), type: 'rsvp_open', groupId }
                });
            }

            const undecidedIds = new Set(meetup.undecided.map(id => id.toString()));
            const adminIds = [
                meetup.group.owner.toString(),
                ...(meetup.group.moderators || []).map(id => id.toString())
            ].filter((id, i, self) => self.indexOf(id) === i && !undecidedIds.has(id));

            if (adminIds.length > 0) {
                const adminsToNotify = await User.find({ _id: { $in: adminIds } });
                if (adminsToNotify.length > 0) {
                    await notifyUsers(adminsToNotify, {
                        title: "RSVP Window Open",
                        body: `The RSVP window for "${meetup.name}" on ${dateStr} is now open.`,
                        data: { meetupId: meetup._id.toString(), type: 'rsvp_open_admin', groupId }
                    });
                }
            }

            notifiedGroups.add(groupId);
        } catch (err) {
            console.error(`[RSVP Open] Failed to notify for meetup ${meetup._id}:`, err);
        }
    }
};

/**
 * @desc    Job to send push notifications when a meetup's RSVP window opens.
 * @route   POST /api/jobs/notify-rsvp-open
 */
export const notifyRsvpOpen = asyncHandler(async (req, res) => {
    await sendRsvpOpenNotifications();
    res.status(200).json({ message: "RSVP open notification check complete." });
});