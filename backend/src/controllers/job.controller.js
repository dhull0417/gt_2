import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";
// --- THIS IS THE FIX: Correctly split imports between the two libraries ---
import { zonedTimeToUtc, utcToZonedTime, nextDay } from 'date-fns-tz';
import { setHours, setMinutes, setSeconds, setMilliseconds, isBefore, addWeeks, addMonths, setDate } from 'date-fns';

const calculateNextEventDate = (schedule, groupTime, timezone) => {
  const nowInUserTimezone = utcToZonedTime(new Date(), timezone);
  const [time, period] = groupTime.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
  let eventDate;
  if (schedule.frequency === 'weekly') {
    const targetDay = schedule.day;
    eventDate = nextDay(nowInUserTimezone, targetDay);
  } else {
    const targetDate = schedule.day;
    eventDate = setDate(nowInUserTimezone, targetDate);
    if (isBefore(eventDate, nowInUserTimezone)) {
      eventDate = addMonths(eventDate, 1);
    }
  }
  eventDate = setHours(eventDate, hours);
  eventDate = setMinutes(eventDate, minutes);
  eventDate = setSeconds(eventDate, 0);
  eventDate = setMilliseconds(eventDate, 0);
  if (isBefore(eventDate, nowInUserTimezone)) {
    if (schedule.frequency === 'weekly') {
      eventDate = addWeeks(eventDate, 1);
    } else {
      eventDate = addMonths(eventDate, 1);
    }
  }
  return zonedTimeToUtc(eventDate, timezone);
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
  const allEvents = await Event.find().lean();
  
  const expiredEvents = allEvents.filter(event => {
    const eventDateTime = new Date(event.date);
    const { hours, minutes } = parseTime(event.time);
    eventDateTime.setUTCHours(hours, minutes);
    return eventDateTime < now;
  });

  if (expiredEvents.length === 0) {
    console.log("No expired events to process. Job finished.");
    return res.status(200).json({ message: "No expired events to process." });
  }

  const expiredEventIds = expiredEvents.map(e => e._id);
  const groupIdsToRegenerate = [...new Set(expiredEvents.map(e => String(e.group)))];

  await Event.deleteMany({ _id: { $in: expiredEventIds } });
  console.log(`Deleted ${expiredEventIds.length} expired events.`);

  const groups = await Group.find({ _id: { $in: groupIdsToRegenerate } });

  for (const group of groups) {
    if (group.schedule) {
      const nextEventDate = calculateNextEventDate(group.schedule, group.time, group.timezone);
      await Event.create({
        group: group._id,
        name: group.name,
        date: nextEventDate,
        time: group.time,
        members: group.members,
        undecided: group.members,
      });
      console.log(`Regenerated event for group '${group.name}' for ${nextEventDate.toDateString()}`);
    }
  }

  console.log("Event regeneration complete. Job finished.");
  res.status(200).json({
    message: "Event regeneration complete.",
    deleted: expiredEventIds.length,
    regenerated: groups.length,
  });
});