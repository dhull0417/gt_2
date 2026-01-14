import { DateTime } from "luxon";

/**
 * Calculates the next event date based on a schedule rule.
 * @param {number|object} dayOrRule 
 * @param {string} time 
 * @param {string} timezone 
 * @param {string} frequency 
 * @param {Date} [fromDate=null] - Anchor date to calculate from (defaults to NOW)
 */
export const calculateNextEventDate = (dayOrRule, time, timezone, frequency, fromDate = null) => {
  // Spy Log
  // console.log(`[DateUtil] Freq: ${frequency} | From: ${fromDate ? fromDate.toISOString() : 'NOW'} | Input: ${JSON.stringify(dayOrRule)}`);

  // Determine start point. If chaining, start 1 second after the last event to avoid finding the same slot.
  const now = fromDate 
    ? DateTime.fromJSDate(fromDate).setZone(timezone).plus({ seconds: 1 })
    : DateTime.now().setZone(timezone);
  
  const [timeStr, period] = time.split(' ');
  let [hours, minutes] = timeStr.split(':').map(Number);
  
  if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;

  // Base candidate: 'Now' at the correct time
  let eventDate = now.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

  // --- 1. DAILY ---
  if (frequency === 'daily') {
    if (eventDate <= now) {
        return eventDate.plus({ days: 1 }).toJSDate();
    }
    return eventDate.toJSDate();
  }

  // --- 2. WEEKLY / BI-WEEKLY ---
  if (typeof dayOrRule === 'number' && (frequency === 'weekly' || frequency === 'biweekly')) {
    const targetDay = dayOrRule; // 0=Sun, 6=Sat
    const luxonTarget = targetDay === 0 ? 7 : targetDay;

    // Advance until we hit the target weekday
    while (eventDate.weekday !== luxonTarget) { 
      eventDate = eventDate.plus({ days: 1 });
    }

    // --- ADD THESE DIAGNOSTIC LOGS ---
    console.log(`[DateUtil Debug] Freq received: "${frequency}"`);
    console.log(`[DateUtil Debug] Candidate Date: ${eventDate.toISO()}`);
    console.log(`[DateUtil Debug] Anchor (now): ${now.toISO()}`);
    console.log(`[DateUtil Debug] Is Candidate <= Anchor? ${eventDate <= now}`);
    // ---------------------------------

    // If the calculated date is in the past (or same as anchor), jump forward.
    if (eventDate <= now) {
      const weeksToAdd = frequency === 'biweekly' ? 2 : 1; 
      console.log(`[DateUtil Debug] Applying jump: +${weeksToAdd} weeks`);
      eventDate = eventDate.plus({ weeks: weeksToAdd });
    }
    
    return eventDate.toJSDate();
  }

  // --- 3. MONTHLY ---
  if (typeof dayOrRule === 'number' && frequency === 'monthly') {
      const targetDate = dayOrRule; // 1-31
      
      // Set to target date of current month
      eventDate = eventDate.set({ day: targetDate });

      // If invalid date (e.g. Feb 30) or past, add month
      if (eventDate <= now || eventDate.invalid) {
          eventDate = eventDate.plus({ months: 1 }).set({ day: targetDate });
      }
      return eventDate.toJSDate();
  }

  // --- 4. CUSTOM RULES ---
  if (frequency === 'custom' && typeof dayOrRule === 'object') {
    const rule = dayOrRule;

    // A. By Date
    if (rule.type === 'byDate') {
      const sortedDates = rule.dates.sort((a, b) => a - b);
      // 1. Check current month
      for (const dateNum of sortedDates) {
        let candidate = now.set({ day: dateNum, hour: hours, minute: minutes, second: 0, millisecond: 0 });
        if (candidate > now) return candidate.toJSDate();
      }
      // 2. Move to next month
      let nextMonth = now.plus({ months: 1 }).set({ day: sortedDates[0], hour: hours, minute: minutes, second: 0, millisecond: 0 });
      return nextMonth.toJSDate();
    }

    // B. By Day
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