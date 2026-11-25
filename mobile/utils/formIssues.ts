// What's wrong with a meetup or schedule draft, as a list of instructions tied to the row that
// needs fixing. The single source of truth for the forms' validation (validateDraft,
// isScheduleTabValid and Edit Schedule's check are built on it).
// Spec: docs/specs/2026-11-19-calmer-meetup-forms-design.md
import { getMaxAttendeesError } from './scheduleConstants';
import { endTimeError } from './timeString';
import { getBringItemsError, getMinAttendeesError, scheduleEndTimeError, type BringItemDraft } from './editScheduleDraft';
import { isLongFrequency } from './longInterval';
import type { MeetupDraft } from './meetupFormDraft';
import type { ScheduleData } from './createGroupDraft';
import { questionsProblems, type QuestionDraft } from './questionDrafts';
import { buildRoutines } from './scheduleRoutines';

export type FormArea = 'group' | 'name' | 'where' | 'when' | 'timezone' | 'rsvp' | 'capacity' | 'bring' | 'questions';
/** `invalid`: shown as soon as it happens. `missing`: shown after the first Save/Review tap. */
export interface Issue { area: FormArea; field: string; kind: 'invalid' | 'missing'; message: string }

const capacityIssues = (mode: 'unlimited' | 'limited', input: string): Issue[] => {
  if (mode !== 'limited') return [];
  if (input === '') return [{ area: 'capacity', field: 'capacityInput', kind: 'missing', message: 'Enter how many people can come' }];
  const e = getMaxAttendeesError(mode, input);
  return e ? [{ area: 'capacity', field: 'capacityInput', kind: 'invalid', message: e }] : [];
};

// The minimum is only sent (and so only checked) when RSVPs are limited with a latest RSVP time.
const minimumIssues = (d: Pick<MeetupDraft, 'rsvpRestricted' | 'deadlineEnabled' | 'minAttendeesInput' | 'maxAttendeesMode' | 'maxAttendeesInput'>): Issue[] => {
  if (!(d.rsvpRestricted && d.deadlineEnabled)) return [];
  const e = getMinAttendeesError(d.minAttendeesInput, d.maxAttendeesMode, d.maxAttendeesInput);
  return e ? [{ area: 'rsvp', field: 'minAttendees', kind: 'invalid', message: e }] : [];
};

/** The first item whose row makes the list invalid (a duplicate is the second copy). */
const bringIssues = (items: BringItemDraft[]): Issue[] => {
  for (let i = 0; i < items.length; i++) {
    const e = getBringItemsError(items.slice(0, i + 1));
    // Shown once the person confirms the list (Done or Save), not while they're still typing.
    if (e) return [{ area: 'bring', field: `item:${items[i].key}`, kind: 'missing', message: e }];
  }
  return [];
};

/** RSVP questions written before the group / schedule / meetup exists. Shown after a Save attempt. */
const questionIssues = (drafts: QuestionDraft[] | undefined): Issue[] =>
  questionsProblems(drafts ?? []).map(p => ({ area: 'questions', field: `question:${p.key}`, kind: 'missing', message: p.message }));

export const meetupIssues = (d: MeetupDraft, extraError?: string | null): Issue[] => {
  const issues: Issue[] = [];
  if (extraError) issues.push({ area: 'group', field: 'group', kind: 'missing', message: extraError });
  issues.push(...capacityIssues(d.maxAttendeesMode, d.maxAttendeesInput));
  const end = endTimeError(d.time, d.endTime);
  if (end) issues.push({ area: 'when', field: 'endTime', kind: 'invalid', message: end });
  issues.push(...minimumIssues(d));
  issues.push(...bringIssues(d.bringItems));
  issues.push(...questionIssues(d.questions));
  return issues;
};

const when = (field: string, message: string): Issue => ({ area: 'when', field, kind: 'missing', message });

const recurrenceIssues = (d: ScheduleData): Issue[] => {
  switch (d.frequency) {
    case null: return [when('frequency', 'Pick how often')];
    case 'daily': return d.dailySameTime === null ? [when('dailySameTime', 'Choose same time or varies')] : [];
    case 'weekly':
    case 'biweekly':
      if (d.weekdayRows.length === 0) return [when('weekdayRows', 'Add a day')];
      return d.weekdayRows.filter(r => r.day === null).map(r => when(`weekday:${r.id}`, 'Pick a day for each row'));
    case 'monthly':
      if (!d.monthlyMode) return [when('monthlyMode', 'Choose by date or by weekday')];
      if (d.monthlyMode === 'date') return d.monthlyDates.length ? [] : [when('monthlyDates', 'Add at least one date')];
      return d.ordinalEntries.length ? [] : [when('ordinalEntries', 'Add at least one day')];
    case 'custom': return d.builtRoutines.length ? [] : [when('builtRoutines', 'Add at least one rule')];
    default:
      if (isLongFrequency(d.frequency)) {
        return [
          ...(d.longFirstDate ? [] : [when('longFirstDate', 'Pick the first date')]),
          ...(d.longRepeatBy ? [] : [when('longRepeatBy', 'Choose how it repeats')]),
        ];
      }
      return [when('frequency', 'Pick how often')];
  }
};

export const END_BEFORE_START = "End date can't be before the start date.";
// Frequencies whose rows carry their own first date (mirrors the server's endDateProblem).
const ROW_START = new Set(['biweekly', 'quarterly', 'semiannual', 'yearly']);

/** The series' first day: its rows' earliest first date where rows have one, else the start date. */
export const seriesStartDay = (d: ScheduleData): string | null => {
  const rowDays = buildRoutines(d)
    .filter(r => ROW_START.has(r.frequency))
    .flatMap(r => (r.dayTimes || []).map((dt: { startDate?: string }) => dt.startDate?.slice(0, 10)))
    .filter((x): x is string => !!x)
    .sort();
  return rowDays[0] ?? (d.frequency && isLongFrequency(d.frequency) ? d.longFirstDate : d.startDate) ?? null;
};

/** The end date can't come before the series' first day. */
const endDateIssues = (d: ScheduleData): Issue[] => {
  if (!d.endDate || !d.frequency) return [];
  const start = seriesStartDay(d);
  return start && d.endDate < start ? [{ area: 'when', field: 'endDate', kind: 'invalid', message: END_BEFORE_START }] : [];
};

/**
 * `emptyIsValid`: a create-group series tab nobody has started (no frequency) is fine and adds nothing.
 * `requireName`: the series needs a name (create-group fills it from the group name).
 */
export const scheduleIssues = (d: ScheduleData, opts: { requireName: boolean; emptyIsValid: boolean }): Issue[] => {
  if (!d.frequency && opts.emptyIsValid) return [];
  const issues: Issue[] = [];
  if (opts.requireName && !d.name.trim()) issues.push({ area: 'name', field: 'name', kind: 'missing', message: 'Give this schedule a name' });
  issues.push(...recurrenceIssues(d));
  if (d.frequency) {
    const end = scheduleEndTimeError(d);
    if (end) issues.push({ area: 'when', field: 'endTime', kind: 'invalid', message: end });
  }
  issues.push(...endDateIssues(d));
  issues.push(...capacityIssues(d.maxAttendeesMode, d.maxAttendeesInput));
  issues.push(...minimumIssues(d));
  issues.push(...bringIssues(d.bringItems));
  issues.push(...questionIssues(d.questions));
  issues.push(...priorityIssues(d));
  return issues;
};

/** Priority RSVP gives members a head start from when RSVPs open, so it needs an open time. */
export const priorityIssues = (d: { priorityEnabled?: boolean; rsvpRestricted: boolean; leadEnabled: boolean }): Issue[] =>
  d.priorityEnabled && !(d.rsvpRestricted && d.leadEnabled)
    ? [{ area: 'rsvp', field: 'priority', kind: 'missing', message: 'Priority RSVP needs a time RSVPs open' }]
    : [];

/** What to show now: invalid input always, missing information only after a submit attempt. */
export const visibleIssues = (issues: Issue[], attempted: boolean): Issue[] =>
  attempted ? issues : issues.filter(i => i.kind === 'invalid');

export const fixMessage = (n: number): string => (n === 0 ? '' : `Fix ${n} ${n === 1 ? 'thing' : 'things'} above`);

/** The first area (in the screen's top-to-bottom order) that has an issue. */
export const firstArea = (issues: Issue[], order: FormArea[]): FormArea | null =>
  order.find(a => issues.some(i => i.area === a)) ?? null;

/** The message to show on a row, or null. */
export const issueFor = (issues: Issue[], area: FormArea): string | null =>
  issues.find(i => i.area === area)?.message ?? null;

/** The message for one field inside a sheet, or null. */
export const fieldIssue = (issues: Issue[], field: string): string | null =>
  issues.find(i => i.field === field)?.message ?? null;
