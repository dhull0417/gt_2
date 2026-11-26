// Pure edits to a schedule's recurrence ("When"): frequency, weekday/daily rows, monthly dates,
// "Nth weekday" entries, and custom rules. Shared by create-group and Edit Schedule through
// components/schedule/RecurrenceEditor. Ids and "today" are passed in so results are predictable.
// Behaviour is pinned by utils/__tests__/recurrenceDraft.test.ts (characterised from both old screens).
import type { DayTime, Frequency } from './api';
import { DAYS_OF_WEEK } from './scheduleConstants';
import { buildLabel } from './editScheduleDraft';
import { buildLongRoutine, emptyLongDraft, isLongDraftValid, isLongFrequency, longRoutineLabel, type LongDraft } from './longInterval';
import type { BuiltRoutine, MonthlyDateEntry, OrdinalEntry, ScheduleData, WeekdayRow } from './createGroupDraft';

type D = ScheduleData;

export const selectFrequency = <T extends D>(d: T, frequency: Frequency): T => ({
  ...d,
  frequency,
  showFreqPicker: false,
  dailySameTime: null,
  weekdayRows: [],
  monthlyMode: null,
  monthlyDates: [],
  ordinalEntries: [],
  ...emptyLongDraft(),
  builtRoutines: [],
  customBuilding: false,
  customFreq: null,
});

export const addWeekdayRow = <T extends D>(d: T, id: string, today: string): T => ({
  ...d,
  weekdayRows: [...d.weekdayRows, { id, day: null, time: '05:00 PM', startDate: today, showTimePicker: false } as WeekdayRow],
});
export const updateWeekdayRow = <T extends D>(d: T, id: string, patch: Partial<WeekdayRow>): T =>
  ({ ...d, weekdayRows: d.weekdayRows.map(r => (r.id === id ? { ...r, ...patch } : r)) });
export const removeWeekdayRow = <T extends D>(d: T, id: string): T =>
  ({ ...d, weekdayRows: d.weekdayRows.filter(r => r.id !== id) });

export const updateDailyRow = <T extends D>(d: T, id: string, patch: Partial<WeekdayRow>): T =>
  ({ ...d, dailyRows: d.dailyRows.map(r => (r.id === id ? { ...r, ...patch } : r)) });

export const addMonthlyDate = <T extends D>(d: T, id: string): T => ({
  ...d,
  monthlyDates: [...d.monthlyDates, { id, date: 1, time: '05:00 PM', expanded: true, showTimePicker: false } as MonthlyDateEntry],
});
export const updateMonthlyDate = <T extends D>(d: T, id: string, patch: Partial<MonthlyDateEntry>): T =>
  ({ ...d, monthlyDates: d.monthlyDates.map(e => (e.id === id ? { ...e, ...patch } : e)) });
export const removeMonthlyDate = <T extends D>(d: T, id: string): T =>
  ({ ...d, monthlyDates: d.monthlyDates.filter(e => e.id !== id) });

export const addOrdinal = <T extends D>(d: T, id: string): T => ({
  ...d,
  ordinalEntries: [...d.ordinalEntries, {
    id, occurrence: '1st', day: 1, time: '05:00 PM', expanded: true, showTimePicker: false, showOccurrencePicker: false, showDayOfWeekPicker: false,
  } as OrdinalEntry],
});
export const updateOrdinal = <T extends D>(d: T, id: string, patch: Partial<OrdinalEntry>): T =>
  ({ ...d, ordinalEntries: d.ordinalEntries.map(e => (e.id === id ? { ...e, ...patch } : e)) });
export const removeOrdinal = <T extends D>(d: T, id: string): T =>
  ({ ...d, ordinalEntries: d.ordinalEntries.filter(e => e.id !== id) });

// ── Custom rules ──────────────────────────────────────────────────────────────
// A custom schedule is a list of built rules. While one is being built or edited, the regular
// per-frequency fields above hold its work in progress.

const clearScratch = { weekdayRows: [], monthlyMode: null, monthlyDates: [], ordinalEntries: [], dailySameTime: null } as const;

export const startCustom = <T extends D>(d: T): T => ({ ...d, customBuilding: true, customFreq: null });

export const pickCustomFrequency = <T extends D>(d: T, f: Frequency): T =>
  ({ ...d, customFreq: f, customShowFreqPicker: false, ...clearScratch, ...emptyLongDraft() });

export const cancelCustom = <T extends D>(d: T): T =>
  ({ ...d, customBuilding: false, customFreq: null, builtRoutines: d.builtRoutines.map(r => ({ ...r, editing: false })) });

const withEnd = (endTime?: string | null) => (endTime ? { endTime } : {});

/** The rule described by the work in progress, or null when it isn't complete. */
export const routineFromDraft = (d: D, id: string): BuiltRoutine | null => {
  const freq = d.customFreq;
  if (!freq) return null;
  if (isLongFrequency(freq)) {
    if (!isLongDraftValid(d)) return null;
    const r = buildLongRoutine(freq, d);
    const long: LongDraft = { longFirstDate: d.longFirstDate, longRepeatBy: d.longRepeatBy, longTime: d.longTime, longEndTime: d.longEndTime };
    return { id, frequency: freq, label: longRoutineLabel(r), dayTimes: r.dayTimes, rules: r.rules, repeatBy: r.repeatBy, editing: false, snapshot: long } as BuiltRoutine;
  }
  let dayTimes: DayTime[] = [];
  let rules: any[] | undefined;
  let finalFreq: Frequency = freq;
  if (freq === 'daily') {
    dayTimes = d.dailySameTime
      ? DAYS_OF_WEEK.map(dw => ({ day: dw.value, time: d.dailySharedTime, ...withEnd(d.dailySharedEndTime) }))
      : d.dailyRows.map(r => ({ day: r.day!, time: r.time, ...withEnd(r.endTime) }));
  } else if (freq === 'weekly' || freq === 'biweekly') {
    dayTimes = d.weekdayRows.filter(r => r.day !== null).map(r => ({ day: r.day!, time: r.time, ...withEnd(r.endTime), ...(r.startDate ? { startDate: r.startDate } : {}) }));
  } else if (freq === 'monthly') {
    if (d.monthlyMode === 'date') {
      dayTimes = d.monthlyDates.map(e => ({ date: e.date, time: e.time, ...withEnd(e.endTime) }));
    } else if (d.monthlyMode === 'ordinal') {
      finalFreq = 'ordinal' as Frequency;
      dayTimes = d.ordinalEntries.map(e => ({ day: e.day, time: e.time, ...withEnd(e.endTime) }));
      rules = d.ordinalEntries.map(e => ({ type: 'byDay', occurrence: e.occurrence, day: e.day }));
    }
  }
  if (!dayTimes.length) return null;
  return {
    id,
    frequency: finalFreq,
    label: buildLabel(finalFreq, dayTimes, d.ordinalEntries as any),
    dayTimes, rules,
    editing: false,
    snapshot: {
      dailySameTime: d.dailySameTime,
      dailySharedTime: d.dailySharedTime,
      dailySharedEndTime: d.dailySharedEndTime ?? null,
      weekdayRows: d.weekdayRows.map(r => ({ ...r, showTimePicker: false, showEndTimePicker: false })),
      monthlyMode: d.monthlyMode,
      monthlyDates: d.monthlyDates.map(e => ({ ...e, expanded: false, showTimePicker: false, showEndTimePicker: false })),
      ordinalEntries: d.ordinalEntries.map(e => ({ ...e, expanded: false, showTimePicker: false, showEndTimePicker: false, showOccurrencePicker: false, showDayOfWeekPicker: false })),
    },
  } as BuiltRoutine;
};

/** Adds the rule being built; unchanged draft when it isn't complete. */
export const finishCustomRoutine = <T extends D>(d: T, id: string): T => {
  const routine = routineFromDraft(d, id);
  if (!routine) return d;
  return {
    ...d,
    builtRoutines: [...d.builtRoutines, routine],
    customBuilding: false, customFreq: null, customShowFreqPicker: false,
    ...clearScratch, dailySharedEndTime: null,
    ...emptyLongDraft(),
  };
};

export const startEditingRoutine = <T extends D>(d: T, id: string): T => {
  const r = d.builtRoutines.find(x => x.id === id);
  if (!r) return d;
  const snap = r.snapshot as any;
  return {
    ...d,
    customFreq: r.frequency === 'ordinal' ? ('monthly' as Frequency) : r.frequency,
    customBuilding: true,
    customShowFreqPicker: false,
    dailySameTime: snap.dailySameTime ?? null,
    dailySharedTime: snap.dailySharedTime ?? '05:00 PM',
    dailySharedEndTime: snap.dailySharedEndTime ?? null,
    weekdayRows: snap.weekdayRows ?? [],
    monthlyMode: snap.monthlyMode ?? null,
    monthlyDates: snap.monthlyDates ?? [],
    ordinalEntries: (snap.ordinalEntries ?? []).map((e: OrdinalEntry) => ({ ...e, expanded: true })),
    longFirstDate: snap.longFirstDate ?? null,
    longRepeatBy: snap.longRepeatBy ?? null,
    longTime: snap.longTime ?? '05:00 PM',
    longEndTime: snap.longEndTime ?? null,
    builtRoutines: d.builtRoutines.map(br => (br.id === id ? { ...br, editing: true } : br)),
  };
};

/** Replaces the rule being edited, keeping its id; unchanged draft when it isn't complete. */
export const saveEditedRoutine = <T extends D>(d: T, editingId: string): T => {
  const routine = routineFromDraft(d, editingId);
  if (!routine) return d;
  return {
    ...d,
    builtRoutines: d.builtRoutines.map(r => (r.id === editingId ? routine : r)),
    customBuilding: false, customFreq: null,
    ...clearScratch, dailySharedEndTime: null,
    ...emptyLongDraft(),
  };
};

export const removeBuiltRoutine = <T extends D>(d: T, id: string): T =>
  ({ ...d, builtRoutines: d.builtRoutines.filter(r => r.id !== id) });
