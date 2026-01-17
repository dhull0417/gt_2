import { DateTime } from "luxon";

/**
 * Calculates the next event date based on a schedule rule.
 * Chaining logic included for replenishment.
 */
export const calculateNextEventDate = (dayOrRule, time, timezone, frequency, fromDate = null) => {
  // 1. Parse common time components
  const [timeStr, period] = time.split(' ');
  let [hours, minutes] = timeStr.split(':').map(Number);
  
  if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;

  // --- A. ONE-OFF EVENTS (Troubleshooting Step 1) ---
  if (frequency === 'once') {
    // Troubleshooting: Log exactly what is being received and how Luxon sees it
    const dtInitial = DateTime.fromISO(dayOrRule, { zone: timezone });
    const dtFinal = dtInitial.set({ 
        hour: hours, 
        minute: minutes, 
        second: 0, 
        millisecond: 0 
    });

    console.log(`[DEBUG] frequency: 'once'`);
    console.log(`[DEBUG] Input date string: "${dayOrRule}"`);
    console.log(`[DEBUG] Target Timezone: "${timezone}"`);
    console.log(`[DEBUG] Parsed Time: ${hours}:${minutes}`);
    console.log(`[DEBUG] Luxon Local: ${dtFinal.toString()}`);
    console.log(`[DEBUG] Resulting UTC: ${dtFinal.toUTC().toString()}`);

    return dtFinal.toJSDate();
  }

  // --- B. RECURRING EVENTS ---
  const now = fromDate 
    ? DateTime.fromJSDate(fromDate).setZone(timezone).plus({ seconds: 1 })
    : DateTime.now().setZone(timezone);
  
  let eventDate = now.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

  if (frequency === 'daily') {
    if (eventDate <= now) return eventDate.plus({ days: 1 }).toJSDate();
    return eventDate.toJSDate();
  }

  if (typeof dayOrRule === 'number' && (frequency === 'weekly' || frequency === 'biweekly')) {
    const targetDay = dayOrRule; 
    const luxonTarget = targetDay === 0 ? 7 : targetDay;
    eventDate = now.startOf('week').set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

    if (frequency === 'biweekly') {
      while (eventDate.weekday !== luxonTarget) eventDate = eventDate.plus({ days: 1 });
      if (eventDate <= now) eventDate = eventDate.plus({ weeks: 2 });
    } else {
      while (eventDate.weekday !== luxonTarget) eventDate = eventDate.plus({ days: 1 });
      if (eventDate <= now) eventDate = eventDate.plus({ weeks: 1 });
    }
    return eventDate.toJSDate();
  }

  if (typeof dayOrRule === 'number' && frequency === 'monthly') {
      const targetDate = dayOrRule; 
      eventDate = eventDate.set({ day: targetDate });
      if (eventDate <= now || eventDate.invalid) {
          eventDate = eventDate.plus({ months: 1 }).set({ day: targetDate });
      }
      return eventDate.toJSDate();
  }

  if (frequency === 'custom' && typeof dayOrRule === 'object') {
    const rule = dayOrRule;
    if (rule.type === 'byDate') {
      const sortedDates = rule.dates.sort((a, b) => a - b);
      for (const dateNum of sortedDates) {
        let candidate = now.set({ day: dateNum, hour: hours, minute: minutes, second: 0, millisecond: 0 });
        if (candidate > now) return candidate.toJSDate();
      }
      let nextMonth = now.plus({ months: 1 }).set({ day: sortedDates[0], hour: hours, minute: minutes, second: 0, millisecond: 0 });
      return nextMonth.toJSDate();
    }

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
        if (candidate.hasSame(monthPointer, 'month') && candidate > now) return candidate.toJSDate();
        monthPointer = monthPointer.plus({ months: 1 });
      }
    }
  }

  return new Date();
}