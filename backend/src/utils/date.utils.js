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
    case 'quarterly':  return 730;   // ~8 occurrences
    case 'semiannual': return 1095;  // ~6 occurrences
    case 'yearly':     return 1095;  // 3 occurrences
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
RSVP_REMINDER_STAGES.quarterly = RSVP_REMINDER_STAGES.monthly;
RSVP_REMINDER_STAGES.semiannual = [{ key: '30d', offsetHours: 720 }, ...RSVP_REMINDER_STAGES.monthly];
RSVP_REMINDER_STAGES.yearly = RSVP_REMINDER_STAGES.semiannual;

// Quarterly / semiannual / yearly: anchored on the routine's first date (dayTimes[0].startDate)
// and repeating every N months, either on the same date or the same "Nth weekday".
export const INTERVAL_MONTHS = { quarterly: 3, semiannual: 6, yearly: 12 };
export const LONG_INTERVAL_FREQUENCIES = Object.keys(INTERVAL_MONTHS);
export const isLongInterval = (frequency) => LONG_INTERVAL_FREQUENCIES.includes(frequency);

const OCCURRENCE_NUMBER = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };

// The day (midnight-ish, same zone as monthStart) of the Nth / last given weekday (0=Sun..6=Sat)
// in monthStart's month. May spill into the next month for a "5th" that doesn't exist.
const nthWeekdayOfMonth = (monthPointer, occurrence, day) => {
  const luxonTarget = day === 0 ? 7 : day;
  let candidate;
  if (occurrence === 'Last') {
    candidate = monthPointer.endOf('month');
    while (candidate.weekday !== luxonTarget) candidate = candidate.minus({ days: 1 });
  } else {
    candidate = monthPointer.startOf('month');
    while (candidate.weekday !== luxonTarget) candidate = candidate.plus({ days: 1 });
    candidate = candidate.plus({ weeks: OCCURRENCE_NUMBER[occurrence] - 1 });
  }
  return candidate;
};

/** Weekday rule for a picked date: days 1-28 give 1st-4th, 29-31 give "Last" (a 5th is never used). */
export const deriveWeekdayRule = (dt) => ({
  occurrence: dt.day >= 29 ? 'Last' : ['1st', '2nd', '3rd', '4th'][Math.ceil(dt.day / 7) - 1],
  day: dt.weekday % 7,
});

/**
 * Next occurrence of a quarterly/semiannual/yearly routine strictly after `after`
 * (or the first occurrence when `after` is null). Every candidate is computed from the
 * anchor month, never from the previous occurrence, so month-end clamping can't drift
 * (Jan 31 -> Apr 30 -> Jul 31).
 */
export const nextLongIntervalDate = (routine, dtEntry, timezone, after = null) => {
  const interval = INTERVAL_MONTHS[routine.frequency];
  if (!interval || !dtEntry?.startDate) return null;
  const { hours, minutes } = parseTimeString(dtEntry.time);
  const anchor = DateTime.fromJSDate(new Date(dtEntry.startDate), { zone: 'utc' })
    .setZone(timezone, { keepLocalTime: true })
    .startOf('day');
  const anchorMonth = anchor.startOf('month');
  const byWeekday = routine.repeatBy === 'weekday';
  const rule = byWeekday ? (routine.rules?.[0]?.occurrence ? routine.rules[0] : deriveWeekdayRule(anchor)) : null;
  const afterDT = after ? DateTime.fromJSDate(after).setZone(timezone) : null;

  for (let k = 0; k < 1000; k++) {
    const month = anchorMonth.plus({ months: k * interval });
    const day = byWeekday
      ? nthWeekdayOfMonth(month, rule.occurrence, rule.day)
      : month.set({ day: Math.min(anchor.day, month.daysInMonth) });
    if (!day.hasSame(month, 'month')) continue; // a "5th" weekday this month doesn't have
    const candidate = day.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
    if (!afterDT || candidate > afterDT) return candidate.toJSDate();
  }
  return null;
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

  const nextOccurrence = isLongInterval(routine.frequency)
    ? nextLongIntervalDate(routine, dtEntry, timezone, anchor)
    : calculateNextMeetupDate(
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
    // A date a month doesn't have (the 29th-31st) lands on that month's last day instead of
    // overflowing into the next month.
    const clampToMonth = (dt) => dt.set({ day: Math.min(targetDate, dt.daysInMonth) });
    meetupDate = clampToMonth(meetupDate);
    if (meetupDate <= now) {
      // Step from the 1st so the month is never ambiguous, then re-apply the time of day.
      const nextMonth = meetupDate.startOf('month').plus({ months: 1 }).set({ hour: hours, minute: minutes });
      meetupDate = clampToMonth(nextMonth);
    }
    return meetupDate.toJSDate();
  }

  // ORDINAL (e.g. 2nd Wednesday of every month)
  if (frequency === 'ordinal' || (frequency === 'custom' && dayOrRule.type === 'byDay')) {
    const config = ordinalConfig || dayOrRule;
    
    if (!config || config.day === undefined) return new Date();
    
    const targetDay = config.day; 
    
    let monthPointer = now; // 'now' is already 1 second after the anchor
    let safetyCounter = 0;
    
    while (safetyCounter < 24) {
        safetyCounter++;
        let candidate = nthWeekdayOfMonth(monthPointer, config.occurrence, targetDay);

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