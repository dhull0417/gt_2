import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";
import { DateTime } from "luxon";

const calculateNextEventDate = (targetDay, groupTime, timezone, frequency) => {
  const now = DateTime.now().setZone(timezone);
  const [time, period] = groupTime.split(' ');
  let [hour, minute] = time.split(':').map(Number);
  if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
  
  let eventDate;

  if (frequency === 'weekly') {
    const targetWeekday = targetDay === 0 ? 7 : targetDay;
    let eventDateTime = now.set({ hour, minute, second: 0, millisecond: 0 });
    if (targetWeekday > now.weekday || (targetWeekday === now.weekday && eventDateTime > now)) {
        eventDate = eventDateTime.set({ weekday: targetWeekday });
    } else {
        eventDate = eventDateTime.plus({ weeks: 1 }).set({ weekday: targetWeekday });
    }
  } else { // monthly
    const targetDayOfMonth = targetDay;
    let eventDateTime = now.set({ day: targetDayOfMonth, hour, minute, second: 0, millisecond: 0 });
    if (eventDateTime < now) {
      eventDate = eventDateTime.plus({ months: 1 });
    } else {
      eventDate = eventDateTime;
    }
  }
  return eventDate.toJSDate();
};

const parseTime = (timeString) => {
    const [time, period] = timeString.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (period.toUpperCase() === 'PM' && hours !== 12) {
        hours += 12;
    }
    if (period.toUpperCase() === 'AM' && hours === 12) {
        hours = 0;
    }
    return { hours, minutes };
};

export const regenerateEvents = asyncHandler(async (req, res) => {
  console.log("Cron job started: Regenerating events...");
  const now = new Date();
  
  // 1. Find and delete all expired recurring events
  const expiredEvents = await Event.find({ isOverride: false, date: { $lt: now } }).lean();
  if (expiredEvents.length > 0) {
    const expiredEventIds = expiredEvents.map(e => e._id);
    await Event.deleteMany({ _id: { $in: expiredEventIds } });
    console.log(`Deleted ${expiredEventIds.length} expired recurring events.`);
  }

  // 2. Find all groups that have recurring schedules
  const recurringGroups = await Group.find({ 'schedule.days': { $exists: true, $not: { $size: 0 } } });
  let regeneratedCount = 0;

  // 3. For each group, ensure it has an upcoming event for each scheduled day
  for (const group of recurringGroups) {
    if (group.schedule && group.schedule.days) {
      const existingFutureEvents = await Event.find({ 
        group: group._id, 
        isOverride: false, 
        date: { $gte: now } 
      }).lean();

      // Create a Set of days that already have a future event scheduled
      const existingEventDays = new Set(existingFutureEvents.map(event => {
        const eventDate = DateTime.fromJSDate(event.date, { zone: group.timezone });
        return eventDate.weekday === 7 ? 0 : eventDate.weekday; // Convert Luxon's Sunday=7 back to 0
      }));

      // Check which scheduled days are missing a future event
      for (const targetDay of group.schedule.days) {
        if (!existingEventDays.has(targetDay)) {
          // If a day is missing, generate a new event for it
          const nextEventDate = calculateNextEventDate(targetDay, group.time, group.timezone, group.schedule.frequency);
          await Event.create({
            group: group._id, name: group.name, date: nextEventDate, time: group.time,
            timezone: group.timezone, members: group.members, undecided: group.members,
          });
          regeneratedCount++;
          console.log(`Regenerated event for group '${group.name}' on day ${targetDay}`);
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