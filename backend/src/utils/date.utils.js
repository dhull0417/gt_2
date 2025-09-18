import { DateTime } from "luxon";

// This helper function can now be used by any controller.
export const calculateNextEventDate = (schedule, groupTime, timezone) => {
  const now = DateTime.now().setZone(timezone);
  const [time, period] = groupTime.split(' ');
  let [hour, minute] = time.split(':').map(Number);
  if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
  
  let eventDate;

  if (schedule.frequency === 'weekly') {
    const targetWeekday = schedule.day === 0 ? 7 : schedule.day;
    let eventDateTime = now.set({ hour: hour, minute: minute, second: 0, millisecond: 0 });
    if (targetWeekday > now.weekday || (targetWeekday === now.weekday && eventDateTime > now)) {
        eventDate = eventDateTime.set({ weekday: targetWeekday });
    } else {
        eventDate = eventDateTime.plus({ weeks: 1 }).set({ weekday: targetWeekday });
    }
  } else {
    const targetDayOfMonth = schedule.day;
    let eventDateTime = now.set({ day: targetDayOfMonth, hour: hour, minute: minute, second: 0, millisecond: 0 });
    if (eventDateTime < now) {
      eventDate = eventDateTime.plus({ months: 1 });
    } else {
      eventDate = eventDateTime;
    }
  }
  return eventDate.toJSDate();
};