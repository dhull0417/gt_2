import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";

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

// --- USING THE SAME ROBUST DATE CALCULATION LOGIC ---
const calculateNextEventDate = (schedule, groupTime) => {
  const now = new Date();
  const { hours: eventHours, minutes: eventMinutes } = parseTime(groupTime);

  console.log(`--- DIAGNOSTICS (CRON): Calculating Next Event Date ---`);
  console.log(`Current Server Time (UTC): ${now.toISOString()}`);
  console.log(`Input Schedule: freq=${schedule.frequency}, day=${schedule.day}`);
  console.log(`Input Time: ${groupTime} (Parsed as H:${eventHours} M:${eventMinutes})`);
  
  let eventDate = new Date(now);

  if (schedule.frequency === 'weekly') {
    const currentDay = now.getDay();
    const targetDay = schedule.day;
    const dayDifference = (targetDay - currentDay + 7) % 7;
    eventDate.setDate(now.getDate() + dayDifference);
    console.log(`Day difference is ${dayDifference}. Initial date set to: ${eventDate.toDateString()}`);
  } else if (schedule.frequency === 'monthly') {
    const currentMonthDate = now.getDate();
    const targetMonthDate = schedule.day;
    eventDate.setDate(targetMonthDate);
    if (targetMonthDate < currentMonthDate) {
      eventDate.setMonth(now.getMonth() + 1);
    }
    console.log(`Initial date set to: ${eventDate.toDateString()}`);
  }
  
  eventDate.setHours(eventHours, eventMinutes, 0, 0);
  console.log(`Date with event time set: ${eventDate.toString()}`);
  
  if (eventDate < now) {
    console.log("Calculated time is in the past, advancing to the next cycle.");
    if (schedule.frequency === 'weekly') {
      eventDate.setDate(eventDate.getDate() + 7);
    } else {
      eventDate.setMonth(eventDate.getMonth() + 1);
    }
  }

  eventDate.setUTCHours(0, 0, 0, 0);
  console.log(`Final event date for DB (UTC): ${eventDate.toISOString()}`);
  console.log(`------------------------------------------`);
  return eventDate;
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
      const nextEventDate = calculateNextEventDate(group.schedule, group.time);
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