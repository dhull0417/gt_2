import { DateTime } from "luxon";

/**
 * Calculates the next meetup date based on a schedule rule.
 * * @param {number|object|string} dayOrRule - Day index (0-6), date (1-31), or ISO string
 * @param {string} time - Time string (e.g., "05:00 PM")
 * @param {string} timezone - Target timezone (e.g., "America/Denver")
 * @param {string} frequency - 'daily', 'weekly', 'biweekly', 'monthly', 'ordinal', or 'once'
 * @param {Date} [fromDate=null] - Anchor date to calculate from
 * @param {object} [ordinalConfig=null] - Configuration for ordinal rules { occurrence, day }
 */
export const calculateNextMeetupDate = (dayOrRule, time, timezone, frequency, fromDate = null, ordinalConfig = null) => {
  // 1. Parse common time components
  const [timeStr, period] = time.split(' ');
  let [hours, minutes] = timeStr.split(':').map(Number);
  
  if (period && period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period && period.toUpperCase() === 'AM' && hours === 12) hours = 0;

  // --- A. ONE-OFF MeetupS ---
  if (frequency === 'once') {
    return DateTime.fromISO(dayOrRule, { zone: timezone })
      .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 })
      .toJSDate();
  }

  // --- B. RECURRING MEETUPS ---
  // Determine start point. If chaining, start 1 second after the last meetup to move the cursor forward.
  const now = fromDate 
    ? DateTime.fromJSDate(fromDate).setZone(timezone).plus({ seconds: 1 })
    : DateTime.now().setZone(timezone);
  
  // Base candidate for the calculation
  let meetupDate = now.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

  // 1. DAILY / WEEKLY / BI-WEEKLY (Merged logic to handle day-specific times)
  // Even for 'daily', we check if a specific 'day' index (0-6) was provided to prevent clustering.
  if (typeof dayOrRule === 'number' && ['daily', 'weekly', 'biweekly'].includes(frequency)) {
    const targetDay = dayOrRule; // 0=Sun, 6=Sat
    const luxonTarget = targetDay === 0 ? 7 : targetDay;

    // Search forward from 'now' for the next instance of this specific weekday
    while (meetupDate.weekday !== luxonTarget) {
      meetupDate = meetupDate.plus({ days: 1 });
    }

    // If the found weekday/time is in the past (relative to anchor), move to next occurrence
    if (meetupDate <= now) {
      const skipAmount = frequency === 'biweekly' ? { weeks: 2 } : { weeks: 1 };
      meetupDate = meetupDate.plus(skipAmount);
    }
    return meetupDate.toJSDate();
  }

  // 2. MONTHLY
  if (typeof dayOrRule === 'number' && frequency === 'monthly') {
    const targetDate = dayOrRule; 
    meetupDate = meetupDate.set({ day: targetDate });
    if (meetupDate <= now || meetupDate.invalid) {
      meetupDate = meetupDate.plus({ months: 1 }).set({ day: targetDate });
    }
    return meetupDate.toJSDate();
  }

  // 3. ORDINAL (e.g. 2nd Wednesday)
  if (frequency === 'ordinal' || (frequency === 'custom' && dayOrRule.type === 'byDay')) {
    const config = ordinalConfig || dayOrRule; // Handle both direct pass and custom-rule object
    const targetDay = config.day; 
    const luxonTarget = targetDay === 0 ? 7 : targetDay;
    const occurrenceMap = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };
    
    let monthPointer = now;
    while (true) {
      let candidate = monthPointer.startOf('month');
      if (config.occurrence === 'Last') {
        candidate = monthPointer.endOf('month');
        while (candidate.weekday !== luxonTarget) candidate = candidate.minus({ days: 1 });
      } else {
        while (candidate.weekday !== luxonTarget) candidate = candidate.plus({ days: 1 });
        const weeksToAdd = occurrenceMap[config.occurrence] - 1;
        candidate = candidate.plus({ weeks: weeksToAdd });
      }

      candidate = candidate.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

      // If the candidate found is in the current month pointer AND is in the future relative to 'now'
      if (candidate.hasSame(monthPointer, 'month') && candidate > now) {
        return candidate.toJSDate();
      }
      monthPointer = monthPointer.plus({ months: 1 });
    }
  }

  return new Date(); 
};