import asyncHandler from "express-async-handler";
import Event from "../models/event.model.js";
import Group from "../models/group.model.js";

// --- NEW: Helper to parse "HH:MM AM/PM" time strings into UTC hours/minutes ---
const parseTime = (timeString) => {
    const [time, period] = timeString.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (period === 'PM' && hours !== 12) {
        hours += 12;
    }
    if (period === 'AM' && hours === 12) {
        hours = 0;
    }
    return { hours, minutes };
};

// --- MODIFIED: The date calculation is now time-aware ---
const calculateNextEventDate = (schedule, groupTime) => {
  const now = new Date();
  let eventDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const { hours: eventHours, minutes: eventMinutes } = parseTime(groupTime);

  if (schedule.frequency === 'weekly') {
    const currentDay = now.getUTCDay();
    const targetDay = schedule.day;
    let dayDifference = targetDay - currentDay;

    if (dayDifference < 0) {
      dayDifference += 7;
    } else if (dayDifference === 0) {
      // It's today. Check if the time has already passed.
      const currentUTCHours = now.getUTCHours();
      const currentUTCMinutes = now.getUTCMinutes();
      if (currentUTCHours > eventHours || (currentUTCHours === eventHours && currentUTCMinutes >= eventMinutes)) {
        // Time has passed for today, schedule for next week
        dayDifference += 7;
      }
    }
    eventDate.setUTCDate(eventDate.getUTCDate() + dayDifference);
  } else if (schedule.frequency === 'monthly') {
    const currentMonthDate = now.getUTCDate();
    const targetMonthDate = schedule.day;
    eventDate.setUTCDate(targetMonthDate);

    if (targetMonthDate < currentMonthDate) {
      // Date has passed this month, schedule for next month
      eventDate.setUTCMonth(eventDate.getUTCMonth() + 1);
    } else if (targetMonthDate === currentMonthDate) {
       // It's today. Check if the time has already passed.
       const currentUTCHours = now.getUTCHours();
       const currentUTCMinutes = now.getUTCMinutes();
       if (currentUTCHours > eventHours || (currentUTCHours === eventHours && currentUTCMinutes >= eventMinutes)) {
         // Time has passed, schedule for next month
         eventDate.setUTCMonth(eventDate.getUTCMonth() + 1);
       }
    }
  }
  return eventDate;
};


// The main function for our cron job
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
      // Pass the group's time to the calculation function
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