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
const isoDay = (d) => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
};

export const BAD_END_DATE = "End date must be a date (YYYY-MM-DD).";
const DAY_PREFIX = /^(\d{4}-\d{2}-\d{2})(?:$|T)/;

/**
 * Request value → what to store: `{ value: Date | null }` (a date-only UTC midnight) or
 * `{ error }`. A timestamp keeps the calendar day it was written for, so an offset can't
 * push the series a day later.
 */
export const parseEndDate = (raw) => {
  if (raw === null || raw === undefined || raw === '') return { value: null };
  let day = null;
  if (raw instanceof Date) day = isoDay(raw);
  else if (typeof raw === 'string') day = DAY_PREFIX.exec(raw)?.[1] ?? null;
  const value = day ? new Date(`${day}T00:00:00Z`) : null;
  // Rejects impossible days too (2027-13-45 doesn't round-trip).
  if (!value || Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== day) return { error: BAD_END_DATE };
  return { value };
};

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
