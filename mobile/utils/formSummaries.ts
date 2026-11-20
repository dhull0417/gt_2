// One-line values for the form rows ("Weekly · Tue, Thu · 7:00 PM", "Up to 12", …).
import { DateTime } from 'luxon';
import { DAYS_OF_WEEK, ordSfx } from './scheduleConstants';
import { buildLongRoutine, isLongDraftValid, isLongFrequency, longRoutineLabel } from './longInterval';
import type { ScheduleData } from './createGroupDraft';
import type { BringItemDraft } from './editScheduleDraft';

/** "07:00 PM" → "7:00 PM". */
export const clock = (t: string) => t.replace(/^0/, '');

const range = (time: string, end: string | null | undefined) => {
  if (!end) return clock(time);
  const [a, b] = [clock(time), clock(end)];
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${sameHalf ? a.slice(0, -3) : a}–${b}`;
};

export const oneOffWhenSummary = (date: string, time: string, endTime: string | null) =>
  `${DateTime.fromISO(date).toFormat('ccc, LLL d')} · ${range(time, endTime)}`;

const short = (day: number) => DAYS_OF_WEEK.find(d => d.value === day)?.short ?? '';
const timesOf = (times: string[]) => (new Set(times).size === 1 ? clock(times[0]) : 'Times vary');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const LABEL: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly',
  quarterly: 'Quarterly', semiannual: 'Every 6 months', yearly: 'Yearly', custom: 'Custom',
};

/** "Mar 15" this year, "Mar 15, 2027" otherwise. `iso` is a calendar date (YYYY-MM-DD). */
export const endDateShort = (iso: string) => {
  const dt = DateTime.fromISO(iso.slice(0, 10));
  return dt.toFormat(dt.year === DateTime.now().year ? 'LLL d' : 'LLL d, yyyy');
};

/** "Ends Mar 15, 2027" for review/details screens; the stored value is a date-only UTC midnight. */
export const endsLine = (endDate: string | null | undefined): string | null =>
  endDate ? `Ends ${DateTime.fromISO(String(endDate).slice(0, 10)).toLocaleString(DateTime.DATE_MED)}` : null;

export const recurrenceSummary = (d: ScheduleData): string => {
  const base = repeatSummary(d);
  return d.frequency && d.endDate ? `${base} · until ${endDateShort(d.endDate)}` : base;
};

const repeatSummary = (d: ScheduleData): string => {
  const f = d.frequency;
  if (!f) return 'Not set';
  const label = LABEL[f] ?? f;
  if (f === 'daily') {
    if (d.dailySameTime === true) return `${label} · ${clock(d.dailySharedTime)}`;
    return d.dailySameTime === false ? `${label} · Times vary` : label;
  }
  if (f === 'weekly' || f === 'biweekly') {
    const rows = d.weekdayRows.filter(r => r.day !== null).sort((a, b) => a.day! - b.day!);
    if (!rows.length) return label;
    return `${label} · ${rows.map(r => short(r.day!)).join(', ')} · ${timesOf(rows.map(r => r.time))}`;
  }
  if (f === 'monthly') {
    if (d.monthlyMode === 'date' && d.monthlyDates.length) {
      return `${label} · ${[...d.monthlyDates].sort((a, b) => a.date - b.date).map(e => `${e.date}${ordSfx(e.date)}`).join(', ')}`;
    }
    if (d.monthlyMode === 'ordinal' && d.ordinalEntries.length) {
      return `${label} · ${d.ordinalEntries.map(e => `${e.occurrence} ${short(e.day)}`).join(', ')}`;
    }
    return label;
  }
  if (isLongFrequency(f)) return isLongDraftValid(d) ? longRoutineLabel(buildLongRoutine(f, d)) : label;
  if (f === 'custom') return d.builtRoutines.length ? `${label} · ${plural(d.builtRoutines.length, 'rule', 'rules')}` : label;
  return label;
};

const daysBefore = (n: number) => (n === 0 ? 'the day of' : `${plural(n, 'day', 'days')} before`);

export const rsvpSummary = (d: { rsvpRestricted: boolean; leadEnabled: boolean; leadDays: number; deadlineEnabled: boolean; deadlineDays: number; minAttendeesInput: string }) => {
  if (!d.rsvpRestricted) return 'Anytime';
  const parts = [
    d.leadEnabled && `Opens ${daysBefore(d.leadDays)}`,
    d.deadlineEnabled && `Closes ${daysBefore(d.deadlineDays)}`,
    d.deadlineEnabled && d.minAttendeesInput !== '' && `Min ${d.minAttendeesInput}`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Anytime';
};

export const capacitySummary = (mode: 'unlimited' | 'limited', input: string) =>
  mode === 'unlimited' ? 'Unlimited' : input ? `Up to ${input}` : 'Limited';

export const bringSummary = (items: BringItemDraft[]) =>
  items.length === 0 ? 'None' : items.length === 1 && items[0].name.trim() ? items[0].name.trim() : plural(items.length, 'item', 'items');
