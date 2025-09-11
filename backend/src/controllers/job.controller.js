import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";
// --- THIS IS THE FIX: Using a more robust import style ---
import * as zoned from 'date-fns-tz';
import * as dateFns from 'date-fns';

const calculateNextEventDate = (schedule, groupTime, timezone) => {
  const nowInUserTimezone = zoned.utcToZonedTime(new Date(), timezone);
  const [time, period] = groupTime.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
  let eventDate;
  if (schedule.frequency === 'weekly') {
    const targetDay = schedule.day;
    eventDate = dateFns.nextDay(nowInUserTimezone, targetDay);
  } else {
    const targetDate = schedule.day;
    eventDate = dateFns.setDate(nowInUserTimezone, targetDate);
    if (dateFns.isBefore(eventDate, nowInUserTimezone)) {
      eventDate = dateFns.addMonths(eventDate, 1);
    }
  }
  eventDate = dateFns.setHours(eventDate, hours);
  eventDate = dateFns.setMinutes(eventDate, minutes);
  eventDate = dateFns.setSeconds(eventDate, 0);
  eventDate = dateFns.setMilliseconds(eventDate, 0);
  if (dateFns.isBefore(eventDate, nowInUserTimezone)) {
    if (schedule.frequency === 'weekly') {
      eventDate = dateFns.addWeeks(eventDate, 1);
    } else {
      eventDate = dateFns.addMonths(eventDate, 1);
    }
  }
  return zoned.zonedTimeToUtc(eventDate, timezone);
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