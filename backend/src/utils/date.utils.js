import { DateTime } from "luxon";

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
    let potentialEvent = now.set({ hour, minute, second: 0, millisecond: 0 });
    potentialEvent = potentialEvent.set({ day: targetDayOfMonth });
    
    if (potentialEvent < now) {
      potentialEvent = potentialEvent.plus({ months: 1 });
    }
    eventDate = potentialEvent;
  }
  
  return eventDate.toJSDate();
};