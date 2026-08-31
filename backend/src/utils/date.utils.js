import { DateTime } from "luxon";

// How far ahead the recurring-meetup pipeline stays filled, per frequency.
// Occurrence count falls out of the window automatically (e.g. 364 days ~52 weekly).
export const getGenerationWindowDays = (frequency) => {
  switch (frequency) {
    case 'daily':    return 93;   // ~3 months
    case 'weekly':   return 364;  // 52 weeks
    case 'biweekly': return 364;  // same 1-year horizon as weekly -> ~26 occurrences
    case 'monthly':  return 730;  // ~2 years
    case 'ordinal':  return 730;  // same as monthly
    default:         return 30;
  }
};

// Staged RSVP reminders, keyed by hours before startsAt; longer-cycle frequencies
// get more/earlier stages. The final 30-min ping is separate (notifyMeetupReminder,
// goes to everyone except `out`) and isn't part of this list.
export const RSVP_REMINDER_STAGES = {
  daily:    [{ key: '4d', offsetHours: 96 }, { key: '24h', offsetHours: 24 }, { key: '6h', offsetHours: 6 }],
  weekly:   [{ key: '7d', offsetHours: 168 }, { key: '3d', offsetHours: 72 }, { key: '24h', offsetHours: 24 }, { key: '6h', offsetHours: 6 }],
  biweekly: [{ key: '7d', offsetHours: 168 }, { key: '3d', offsetHours: 72 }, { key: '24h', offsetHours: 24 }, { key: '6h', offsetHours: 6 }],
  monthly:  [{ key: '14d', offsetHours: 336 }, { key: '7d', offsetHours: 168 }, { key: '3d', offsetHours: 72 }, { key: '24h', offsetHours: 24 }, { key: '6h', offsetHours: 6 }],
  ordinal:  [{ key: '14d', offsetHours: 336 }, { key: '7d', offsetHours: 168 }, { key: '3d', offsetHours: 72 }, { key: '24h', offsetHours: 24 }, { key: '6h', offsetHours: 6 }],
};

export const parseTimeString = (timeStr) => {
  if (!timeStr) return { hours: 9, minutes: 0 };
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return { hours, minutes };
};

// UTC time to generate the next meetup for a routine/dtEntry, based on the last
// anchor date. `schedule` supplies lead-time settings; `timezone` is the parent group's.
export const computeNextGenerationAt = (schedule, timezone, lastAnchorDate, routine, dtEntry, ordinalRule = null) => {
  const { hours: leadH, minutes: leadM } = parseTimeString(schedule.generationLeadTime || "09:00 AM");
  const anchor = lastAnchorDate || new Date();

  const nextOccurrence = calculateNextMeetupDate(
    routine.frequency === 'monthly' ? dtEntry.date : dtEntry.day,
    dtEntry.time,
    timezone,
    routine.frequency,
    anchor,
    routine.frequency === 'ordinal' ? ordinalRule : null
  );

  return DateTime.fromJSDate(nextOccurrence)
    .setZone(timezone)
    .minus({ days: schedule.generationLeadDays || 1 })
    .set({ hour: leadH, minute: leadM, second: 0, millisecond: 0 })
    .toJSDate();
};

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

  // DAILY/WEEKLY/BIWEEKLY: target a weekday (0-6); skip ahead when it's already past —
  // daily fills every weekday so it's always +7 days; weekly +1 week; biweekly +2 weeks.
  if (typeof dayOrRule === 'number' && ['daily', 'weekly', 'biweekly'].includes(frequency)) {
    const targetDay = dayOrRule; // 0=Sun, 6=Sat
    const luxonTarget = targetDay === 0 ? 7 : targetDay; // Luxon: Mon=1, Sun=7

    // Walk forward until we land on the target weekday
    while (meetupDate.weekday !== luxonTarget) {
      meetupDate = meetupDate.plus({ days: 1 });
    }

    // advance to next occurrence if already past the anchor.
    // daily: each entry recurs weekly (Sun->next Sun), but 7 entries together give daily coverage.
    if (meetupDate <= now) {
      meetupDate = meetupDate.plus({ days: 7 }); // Always 7 days to next same weekday
    }

    // biweekly: add another week, but only when continuing (fromDate given) — the
    // anchor-less bootstrap call's weekday is already correct; bumping it would shift
    // every later occurrence a week late.
    if (frequency === 'biweekly' && fromDate) {
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

        // must be in the checked month and strictly after 'now' (anchor + 1s)
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