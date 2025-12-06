import { DateTime } from "luxon";

/**
 * Calculates the next event date based on a schedule rule.
 */
export const calculateNextEventDate = (dayOrRule, time, timezone, frequency) => {
  // 🔍 MODIFICATION 1: SPY LOGS (Check your terminal when you run this!)
  console.log(`[DateUtil] Input Freq: "${frequency}" | Day/Rule: ${JSON.stringify(dayOrRule)}`);

  const now = DateTime.now().setZone(timezone);
  
  // Parse Time (e.g., "05:00 PM")
  const [timeStr, period] = time.split(' ');
  let [hours, minutes] = timeStr.split(':').map(Number);
  
  if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;

  // Base candidate: Today at the correct time
  let eventDate = now.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

  // --- 1. DAILY ---
  // 🔍 MODIFICATION 2: Strict Daily Check
  if (frequency === 'daily') {
    // Note: We ignore 'dayOrRule' here because Daily doesn't care about the index (0-6)
    
    // If time has passed today, move to tomorrow
    if (eventDate <= now) {
        console.log('[DateUtil] Daily: Time passed, moving to tomorrow');
        return eventDate.plus({ days: 1 }).toJSDate();
    }
    console.log('[DateUtil] Daily: Scheduling for today');
    return eventDate.toJSDate();
  }

  // --- 2. WEEKLY / BI-WEEKLY (Standard Numeric Input) ---
  if (typeof dayOrRule === 'number' && (frequency === 'weekly' || frequency === 'biweekly')) {
    const targetDay = dayOrRule; // 0=Sun, 6=Sat
    
    // Map 0 (Sun) -> 7, 1 (Mon) -> 1, ... 6 (Sat) -> 6
    const luxonTarget = targetDay === 0 ? 7 : targetDay;

    // Advance until we hit the target weekday
    while (eventDate.weekday !== luxonTarget) { 
      eventDate = eventDate.plus({ days: 1 });
    }

    // If the calculated date is in the past (e.g., it's today but time passed), add a week
    if (eventDate <= now) {
      eventDate = eventDate.plus({ weeks: 1 });
    }
    return eventDate.toJSDate();
  }

  // --- 3. MONTHLY (Standard Numeric Input) ---
  if (typeof dayOrRule === 'number' && frequency === 'monthly') {
      const targetDate = dayOrRule; // 1-31
      
      // 🔍 MODIFICATION 3: Explicit Monthly Log
      console.log(`[DateUtil] Processing Monthly logic for date: ${targetDate}`);

      // Set to target date of current month
      eventDate = eventDate.set({ day: targetDate });

      // If invalid date (e.g. Feb 30) or past, add month
      if (eventDate <= now || eventDate.invalid) {
          eventDate = eventDate.plus({ months: 1 }).set({ day: targetDate });
      }
      return eventDate.toJSDate();
  }

  // --- 4. CUSTOM RULES (Object Input) ---
  if (frequency === 'custom' && typeof dayOrRule === 'object') {
    const rule = dayOrRule;

    // A. By Date (e.g., 15th, 30th)
    if (rule.type === 'byDate') {
      const sortedDates = rule.dates.sort((a, b) => a - b);
      
      // 1. Check dates in CURRENT month
      for (const dateNum of sortedDates) {
        let candidate = now.set({ day: dateNum, hour: hours, minute: minutes, second: 0, millisecond: 0 });
        if (candidate > now) return candidate.toJSDate();
      }

      // 2. If no valid dates left this month, use the first date of NEXT month
      let nextMonth = now.plus({ months: 1 }).set({ day: sortedDates[0], hour: hours, minute: minutes, second: 0, millisecond: 0 });
      return nextMonth.toJSDate();
    }

    // B. By Day (e.g., "Every 2nd Tuesday")
    if (rule.type === 'byDay') {
      const targetDay = rule.day; // 0=Sun, 6=Sat
      const luxonTarget = targetDay === 0 ? 7 : targetDay;
      const occurrenceMap = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };
      
      let monthPointer = now; // Start looking from this month

      // Loop months until we find a valid future date
      while (true) {
        let candidate = monthPointer.startOf('month');
        
        // Handle "Last" occurrence differently
        if (rule.occurrence === 'Last') {
          candidate = monthPointer.endOf('month');
          // Backtrack to find the specific weekday
          while (candidate.weekday !== luxonTarget) {
             candidate = candidate.minus({ days: 1 });
          }
        } else {
          // Standard 1st, 2nd, 3rd...
          while (candidate.weekday !== luxonTarget) {
            candidate = candidate.plus({ days: 1 });
          }
          const weeksToAdd = occurrenceMap[rule.occurrence] - 1;
          candidate = candidate.plus({ weeks: weeksToAdd });
        }

        // Apply Time
        candidate = candidate.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

        // VALIDATION:
        if (candidate.hasSame(monthPointer, 'month') && candidate > now) {
          return candidate.toJSDate();
        }

        monthPointer = monthPointer.plus({ months: 1 });
      }
    }
  }

  // Fallback for safety
  console.log('[DateUtil] Warning: No frequency matched, returning NOW.');
  return new Date(); 
};