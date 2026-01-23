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
  const now = DateTime.now(); // Local time for comparison
  
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
  const groups = await Group.find({ "schedule.frequency": { $exists: true, $ne: 'once' } });
  let generatedCount = 0;

  for (const group of groups) {
    // A. Find the last generated event to use as anchor
    const lastEvent = await Event.findOne({ group: group._id, isOverride: false })
      .sort({ date: -1 })
      .lean();

    const anchorDate = lastEvent ? lastEvent.date : now.toJSDate();

    // B. Calculate the NEXT potential meeting date
    const nextMeetingDate = calculateNextEventDate(
      group.schedule.frequency === 'daily' ? 0 : (group.schedule.days?.[0] || 0), // Simplification for step
      group.time,
      group.timezone,
      group.schedule.frequency,
      anchorDate
    );

    const nextMeetingDT = DateTime.fromJSDate(nextMeetingDate).setZone(group.timezone);

    // C. Calculate the "Trigger Time" (When this event should be created)
    const { hours, minutes } = parseTimeString(group.generationLeadTime || "09:00 AM");
    const triggerDT = nextMeetingDT
      .minus({ days: group.generationLeadDays || 0 })
      .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

    // D. Check if we have reached the trigger window AND event doesn't exist
    const alreadyExists = await Event.findOne({ 
      group: group._id, 
      date: nextMeetingDate 
    });

    if (now.setZone(group.timezone) >= triggerDT && !alreadyExists) {
      console.log(`Generating JIT event for group: ${group.name}`);
      
      const newEvent = await Event.create({
        group: group._id,
        name: group.name,
        date: nextMeetingDate,
        time: group.time,
        timezone: group.timezone,
        location: group.defaultLocation || "",
        members: group.members,
        undecided: group.members,
        capacity: group.defaultCapacity || 0,
        isOverride: false
      });

      // E. Notify Members
      const members = await User.find({ _id: { $in: group.members } });
      await notifyUsers(members, {
        title: `New Meeting: ${group.name}`,
        body: `Scheduled for ${nextMeetingDT.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)} at ${group.time}. RSVP now!`,
        data: { 
          type: 'event_created', 
          eventId: newEvent._id.toString(),
          groupId: group._id.toString()
        }
      });

      generatedCount++;
    }
  }

  res.status(200).json({ 
    message: "JIT processing complete.", 
    deleted: expiredEvents.length, 
    generated: generatedCount 
  });
});