import { DateTime } from "luxon";

/**
 * The last moment a schedule may generate a meetup: the end of its end date's day in
 * the group timezone (the end date is inclusive). `endDate` is stored like `startDate`,
 * as a date-only UTC midnight. Returns null when the schedule has no end date.
 */
export const scheduleEndBoundary = (schedule, timezone) => {
  if (!schedule?.endDate) return null;
  return DateTime.fromJSDate(new Date(schedule.endDate), { zone: 'utc' })
    .setZone(timezone, { keepLocalTime: true })
    .endOf('day');
};

export const END_BEFORE_START = "End date can't be before the start date.";

// Frequencies whose rows carry their own first date (the schedule-level start is hidden for them).
const ROW_START_FREQUENCIES = new Set(['biweekly', 'quarterly', 'semiannual', 'yearly']);
const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** The day a series starts: its rows' earliest first date where rows have one, else `startDate`. */
const seriesStartDay = ({ startDate, routines }) => {
  const rowDays = (routines || [])
    .filter((r) => ROW_START_FREQUENCIES.has(r.frequency))
    .flatMap((r) => (r.dayTimes || []).map((dt) => isoDay(dt.startDate)))
    .filter(Boolean)
    .sort();
  return rowDays[0] ?? isoDay(startDate);
};

/** Why an end date can't be saved, or null. Compares calendar days (both are date-only). */
export const endDateProblem = ({ endDate, startDate, routines }) => {
  const end = isoDay(endDate);
  if (!end) return null;
  const start = seriesStartDay({ startDate, routines });
  return start && end < start ? END_BEFORE_START : null;
};
