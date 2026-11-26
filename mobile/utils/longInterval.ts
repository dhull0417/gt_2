// Quarterly / semi-annual / yearly schedules: anchored on a picked first date, repeating
// every 3, 6 or 12 months on the same date or the same "Nth weekday".
// See docs/specs/2026-11-10-long-interval-frequencies-design.md.
import { DateTime } from 'luxon';
import type { Frequency, Routine } from './api';
import { ordSfx, FREQ_LABELS } from './scheduleConstants';
import { formatTimeRange } from './timeString';

export type LongFrequency = 'quarterly' | 'semiannual' | 'yearly';
export const LONG_FREQUENCIES: LongFrequency[] = ['quarterly', 'semiannual', 'yearly'];
export const isLongFrequency = (f: Frequency | string | null | undefined): f is LongFrequency =>
    !!f && (LONG_FREQUENCIES as string[]).includes(f);

export type RepeatBy = 'date' | 'weekday';

/** The draft fields both schedule screens keep for these frequencies. */
export interface LongDraft {
    /** ISO date (yyyy-MM-dd) of the first meetup. */
    longFirstDate: string | null;
    longRepeatBy: RepeatBy | null;
    longTime: string;
    longEndTime: string | null;
}

export const emptyLongDraft = (): LongDraft => ({
    longFirstDate: null, longRepeatBy: null, longTime: '05:00 PM', longEndTime: null,
});

export const isLongDraftValid = (d: LongDraft): boolean => !!d.longFirstDate && !!d.longRepeatBy;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const parseISODate = (iso: string) => DateTime.fromISO(iso.slice(0, 10));

/** Days 1-28 give 1st-4th, 29-31 give "Last"; a 5th weekday is never used. */
export const deriveWeekdayRule = (iso: string): { occurrence: string; day: number } => {
    const dt = parseISODate(iso);
    return {
        occurrence: dt.day >= 29 ? 'Last' : ['1st', '2nd', '3rd', '4th'][Math.ceil(dt.day / 7) - 1],
        day: dt.weekday % 7,
    };
};

/** Draft -> API routine. Call only when isLongDraftValid(d). */
export const buildLongRoutine = (frequency: LongFrequency, d: LongDraft): Routine => {
    const iso = d.longFirstDate!.slice(0, 10);
    const end = d.longEndTime ? { endTime: d.longEndTime } : {};
    if (d.longRepeatBy === 'weekday') {
        const rule = deriveWeekdayRule(iso);
        return {
            frequency, repeatBy: 'weekday',
            rules: [{ type: 'byDay', occurrence: rule.occurrence as any, day: rule.day }],
            dayTimes: [{ startDate: iso, day: rule.day, time: d.longTime, ...end }],
        };
    }
    return {
        frequency, repeatBy: 'date', rules: [],
        dayTimes: [{ startDate: iso, date: parseISODate(iso).day, time: d.longTime, ...end }],
    };
};

/** Stored API routine -> draft (for editing). */
export const longDraftFromRoutine = (r: Routine): LongDraft => {
    const dt = r.dayTimes?.[0];
    return {
        longFirstDate: dt?.startDate ? dt.startDate.slice(0, 10) : null,
        longRepeatBy: r.repeatBy ?? null,
        longTime: dt?.time ?? '05:00 PM',
        longEndTime: dt?.endTime ?? null,
    };
};

const everyPhrase = (f: LongFrequency) => (f === 'quarterly' ? 'Every 3 months' : f === 'semiannual' ? 'Every 6 months' : 'Yearly');

/** The two repeat choices worded for a picked date (null until a date is picked). */
export const repeatChoiceLabels = (frequency: LongFrequency, iso: string | null): { date: string; weekday: string } | null => {
    if (!iso) return null;
    const dt = parseISODate(iso);
    const rule = deriveWeekdayRule(iso);
    const weekday = `the ${rule.occurrence} ${DAY_NAMES[rule.day]}`;
    if (frequency === 'yearly') {
        return { date: dt.toFormat('MMMM d'), weekday: `${weekday} of ${dt.toFormat('MMMM')}` };
    }
    return { date: `the ${dt.day}${ordSfx(dt.day)}`, weekday };
};

/** "Every 3 months on the 15th", "Yearly on the 4th Thursday of November", ... */
export const describeLongRoutine = (r: Routine): string => {
    const f = r.frequency as LongFrequency;
    const iso = r.dayTimes?.[0]?.startDate;
    if (!iso || !r.repeatBy) return everyPhrase(f);
    const labels = repeatChoiceLabels(f, iso)!;
    const what = r.repeatBy === 'weekday' ? labels.weekday : labels.date;
    return `${everyPhrase(f)} on ${what}`;
};

/** Chip label in the Multiple Rules list: "Semi-annually · the 3rd Thursday @ 06:00 PM". */
export const longRoutineLabel = (r: Routine): string => {
    const f = r.frequency as LongFrequency;
    const dt = r.dayTimes?.[0];
    const labels = repeatChoiceLabels(f, dt?.startDate ?? null);
    const what = labels ? (r.repeatBy === 'weekday' ? labels.weekday : labels.date) : '';
    return `${FREQ_LABELS[f]} · ${what}${dt ? ` @ ${formatTimeRange(dt.time, dt.endTime)}` : ''}`;
};
