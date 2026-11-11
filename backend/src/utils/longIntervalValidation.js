// Rules for quarterly / semiannual / yearly routines (see docs/specs/2026-11-10-long-interval-frequencies-design.md).
import { isLongInterval } from "./date.utils.js";

const toPlain = (v) => (v && typeof v.toObject === "function" ? v.toObject() : v);

/** First problem with any long-interval routine, or null. Other frequencies are ignored. */
export const validateLongIntervalRoutines = (routines) => {
  for (const raw of routines || []) {
    const routine = toPlain(raw);
    if (!routine || !isLongInterval(routine.frequency)) continue;
    const dayTimes = routine.dayTimes || [];
    if (dayTimes.length !== 1) return "Quarterly, semi-annual and yearly schedules take one date.";
    const start = dayTimes[0]?.startDate;
    if (!start || Number.isNaN(new Date(start).getTime())) return "Pick a first date.";
    if (!["date", "weekday"].includes(routine.repeatBy)) return "Choose same date or same weekday.";
    if (routine.repeatBy === "weekday" && !routine.rules?.[0]?.occurrence) return "Choose same date or same weekday.";
  }
  return null;
};

/**
 * Old app builds (1.3.x) don't know these frequencies, so whatever they send back for a
 * schedule that has one would drop or mangle it. Keep the stored routines in that case.
 */
export const keepLongIntervalRoutinesForLegacy = (incoming, existing) => {
  const stored = (existing || []).map(toPlain);
  return stored.some((r) => isLongInterval(r?.frequency)) ? existing : incoming;
};
