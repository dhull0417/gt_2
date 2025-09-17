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
  } else {
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
  const allEvents = await Event.find({ isOverride: false }).lean();
  
  // Find all recurring events that have expired by checking their full date and time
  const expiredEvents = allEvents.filter(event => {
    if (!event.date || !event.time || typeof event.time !== 'string' || !event.time.includes(':')) {
      return false;
    }
    const eventDateTime = new Date(event.date);
    const { hours, minutes } = parseTime(event.time);
    eventDateTime.setUTCHours(hours, minutes);
    return eventDateTime < now;
  });

  if (expiredEvents.length === 0) {
    console.log("No expired recurring events to process. Job finished.");
    return res.status(200).json({ message: "No expired recurring events to process." });
  }

  const expiredEventIds = expiredEvents.map(e => e._id);
  const groupIdsToRegenerate = [...new Set(expiredEvents.map(e => String(e.group)))];

  await Event.deleteMany({ _id: { $in: expiredEventIds } });
  console.log(`Deleted ${expiredEventIds.length} expired recurring events.`);

  const groups = await Group.find({ _id: { $in: groupIdsToRegenerate } });
  let regeneratedCount = 0;

  for (const group of groups) {
    if (group.schedule && group.schedule.days) {
      // --- THIS IS THE FIX ---
      // 1. Find all *currently existing* future recurring events for this group.
      const existingFutureEvents = await Event.find({ 
        group: group._id, 
        isOverride: false, 
        date: { $gte: now } 
      }).lean();

      // 2. Create a Set of the days of the week that are already scheduled.
      const existingEventDays = new Set(existingFutureEvents.map(event => {
        const eventDate = DateTime.fromJSDate(event.date, { zone: group.timezone });
        return eventDate.weekday === 7 ? 0 : eventDate.weekday; // Convert Luxon's Sunday=7 back to 0
      }));
      
      console.log(`Group '${group.name}' has future events on days:`, Array.from(existingEventDays));

      // 3. Loop through the days the group is supposed to meet.
      for (const targetDay of group.schedule.days) {
        // 4. If a scheduled day does NOT have a future event, create one.
        if (!existingEventDays.has(targetDay)) {
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
    deleted: expiredEventIds.length,
    regenerated: regeneratedCount,
  });
});