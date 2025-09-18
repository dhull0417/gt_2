import { DateTime } from "luxon";

// This helper now correctly calculates the next date for a SINGLE target day.
// It will be called inside a loop by the controllers.
export const calculateNextEventDate = (targetDay, groupTime, timezone, frequency) => {
  const now = DateTime.now().setZone(timezone);
  const [time, period] = groupTime.split(' ');
  let [hour, minute] = time.split(':').map(Number);
  if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
  
  let eventDate;

  if (frequency === 'weekly') {
    const targetWeekday = targetDay === 0 ? 7 : targetDay; // Luxon: Mon=1, Sun=7
    let eventDateTime = now.set({ hour, minute, second: 0, millisecond: 0 });

    // Logic to find the next occurrence of the target weekday
    if (targetWeekday > now.weekday) {
      eventDate = eventDateTime.set({ weekday: targetWeekday });
    } else if (targetWeekday < now.weekday) {
      eventDate = eventDateTime.plus({ weeks: 1 }).set({ weekday: targetWeekday });
    } else { // Today is the correct weekday
      if (eventDateTime > now) {
        eventDate = eventDateTime; // It's for later today
      } else {
        eventDate = eventDateTime.plus({ weeks: 1 }); // It has passed, go to next week
      }
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