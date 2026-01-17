import { DateTime } from "luxon";

/**
 * Calculates the next event date based on a schedule rule.
 * Now handles the 'once' frequency for one-off events and 
 * correctly incorporates time and timezone to prevent date-shifting.
 * * @param {number|object|string} dayOrRule 
 * @param {string} time 
 * @param {string} timezone 
 * @param {string} frequency 
 * @param {Date} [fromDate=null] - Anchor date to calculate from (defaults to NOW)
 */
export const calculateNextEventDate = (dayOrRule, time, timezone, frequency, fromDate = null) => {
  // 1. Parse common time components
  const [timeStr, period] = time.split(' ');
  let [hours, minutes] = timeStr.split(':').map(Number);
  
  if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;

  // --- A. ONE-OFF EVENTS ---
  if (frequency === 'once') {
    // dayOrRule contains the ISO date string (e.g. "2026-01-17")
    // We parse it in the target timezone, then apply the selected time.
    return DateTime.fromISO(dayOrRule, { zone: timezone })
      .set({ 
        hour: hours, 
        minute: minutes, 
        second: 0, 
        millisecond: 0 
      })
      .toJSDate();
  }

  // --- B. RECURRING EVENTS ---
  // Determine start point. If chaining, start 1 second after the last event.
  const now = fromDate 
    ? DateTime.fromJSDate(fromDate).setZone(timezone).plus({ seconds: 1 })
    : DateTime.now().setZone(timezone);
  
  // Base candidate: 'Now' at the correct time
  let eventDate = now.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

  // 1. DAILY
  if (frequency === 'daily') {
    if (eventDate <= now) {
        return eventDate.plus({ days: 1 }).toJSDate();
    }
    return eventDate.toJSDate();
  }

  // 2. WEEKLY / BI-WEEKLY
  if (typeof dayOrRule === 'number' && (frequency === 'weekly' || frequency === 'biweekly')) {
    const targetDay = dayOrRule; // 0=Sun, 6=Sat
    const luxonTarget = targetDay === 0 ? 7 : targetDay;

    // Start the search from the beginning of the anchor's week (Monday).
    // This allows the logic to find days earlier in the week than the anchor,
    // which correctly triggers the 1-week or 2-week jump.
    eventDate = now.startOf('week').set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

    if (frequency === 'biweekly') {
      while (eventDate.weekday !== luxonTarget) {
        eventDate = eventDate.plus({ days: 1 });
      }
      if (eventDate <= now) {
        eventDate = eventDate.plus({ weeks: 2 });
      }
    } else {
      while (eventDate.weekday !== luxonTarget) { 
        eventDate = eventDate.plus({ days: 1 });
      }
      if (eventDate <= now) {
        eventDate = eventDate.plus({ weeks: 1 });
      }
    }
    return eventDate.toJSDate();
  }

  // 3. MONTHLY
  if (typeof dayOrRule === 'number' && frequency === 'monthly') {
      const targetDate = dayOrRule; 
      eventDate = eventDate.set({ day: targetDate });
      if (eventDate <= now || eventDate.invalid) {
          eventDate = eventDate.plus({ months: 1 }).set({ day: targetDate });
      }
      return eventDate.toJSDate();
  }

  // 4. CUSTOM RULES
  if (frequency === 'custom' && typeof dayOrRule === 'object') {
    const rule = dayOrRule;

    // byDate
    if (rule.type === 'byDate') {
      const sortedDates = rule.dates.sort((a, b) => a - b);
      for (const dateNum of sortedDates) {
        let candidate = now.set({ day: dateNum, hour: hours, minute: minutes, second: 0, millisecond: 0 });
        if (candidate > now) return candidate.toJSDate();
      }
      let nextMonth = now.plus({ months: 1 }).set({ day: sortedDates[0], hour: hours, minute: minutes, second: 0, millisecond: 0 });
      return nextMonth.toJSDate();
    }

    // byDay (e.g. 2nd Thursday)
    if (rule.type === 'byDay') {
      const targetDay = rule.day; 
      const luxonTarget = targetDay === 0 ? 7 : targetDay;
      const occurrenceMap = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };
      
      let monthPointer = now;
      while (true) {
        let candidate = monthPointer.startOf('month');
        if (rule.occurrence === 'Last') {
          candidate = monthPointer.endOf('month');
          while (candidate.weekday !== luxonTarget) candidate = candidate.minus({ days: 1 });
        } else {
          while (candidate.weekday !== luxonTarget) candidate = candidate.plus({ days: 1 });
          const weeksToAdd = occurrenceMap[rule.occurrence] - 1;
          candidate = candidate.plus({ weeks: weeksToAdd });
        }

        candidate = candidate.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

        if (candidate.hasSame(monthPointer, 'month') && candidate > now) {
          return candidate.toJSDate();
        }
        monthPointer = monthPointer.plus({ months: 1 });
      }
    }
  }

  return new Date(); 
};