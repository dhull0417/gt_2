import { DateTime } from "luxon";

export const calculateNextMeetupDate = (dayOrRule, time, timezone, frequency, fromDate = null, ordinalConfig = null) => {
  const [timeStr, period] = time.split(' ');
  let [hours, minutes] = timeStr.split(':').map(Number);
  
  if (period && period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period && period.toUpperCase() === 'AM' && hours === 12) hours = 0;

  if (frequency === 'once') {
    return DateTime.fromISO(dayOrRule, { zone: timezone })
      .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 })
      .toJSDate();
  }

  const now = fromDate 
    ? DateTime.fromJSDate(fromDate).setZone(timezone).plus({ seconds: 1 })
    : DateTime.now().setZone(timezone);
  
  let meetupDate = now.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

  // DAILY / WEEKLY / BI-WEEKLY
  // All three use a day index (0-6) to target a specific weekday.
  // The only difference is how far we skip when the found day is already past:
  //   - daily:    skip 1 day  (next occurrence of this weekday is next week, 
  //                            but we fill every weekday so it's always 7 days away)
  //   - weekly:   skip 1 week
  //   - biweekly: skip 2 weeks
  if (typeof dayOrRule === 'number' && ['daily', 'weekly', 'biweekly'].includes(frequency)) {
    const targetDay = dayOrRule; // 0=Sun, 6=Sat
    const luxonTarget = targetDay === 0 ? 7 : targetDay; // Luxon: Mon=1, Sun=7

    // Walk forward until we land on the target weekday
    while (meetupDate.weekday !== luxonTarget) {
      meetupDate = meetupDate.plus({ days: 1 });
    }

    // If that weekday/time is already past relative to the anchor, advance to next occurrence.
    // For daily, each specific day only recurs weekly (Sun->next Sun = 7 days),
    // but across all 7 dayTimes entries the group has daily coverage.
    if (meetupDate <= now) {
      meetupDate = meetupDate.plus({ days: 7 }); // Always 7 days to next same weekday
    }

    // For biweekly, add another week on top
    if (frequency === 'biweekly') {
      meetupDate = meetupDate.plus({ weeks: 1 });
    }

    return meetupDate.toJSDate();
  }

  // MONTHLY
  if (typeof dayOrRule === 'number' && frequency === 'monthly') {
    const targetDate = dayOrRule; 
    meetupDate = meetupDate.set({ day: targetDate });
    if (meetupDate <= now || meetupDate.invalid) {
      meetupDate = meetupDate.plus({ months: 1 }).set({ day: targetDate });
    }
    return meetupDate.toJSDate();
  }

  // ORDINAL (e.g. 2nd Wednesday of every month)
  if (frequency === 'ordinal' || (frequency === 'custom' && dayOrRule.type === 'byDay')) {
    const config = ordinalConfig || dayOrRule;
    
    if (!config || config.day === undefined) return new Date();
    
    const targetDay = config.day; 
    const luxonTarget = targetDay === 0 ? 7 : targetDay;
    const occurrenceMap = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };
    
    let monthPointer = now; // 'now' is already 1 second after the anchor
    let safetyCounter = 0;
    
    while (safetyCounter < 24) {
        safetyCounter++;
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

        // Must be in the same month we're checking AND strictly after 'now' (the anchor + 1 second)
        if (candidate.hasSame(monthPointer, 'month') && candidate > now) {
            return candidate.toJSDate();
        }
        
        // Advance to next month
        monthPointer = monthPointer.plus({ months: 1 }).startOf('month');
    }
    return new Date();
  }

  return new Date(); 
};