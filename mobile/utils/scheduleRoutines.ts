// Turns a schedule's editable form state into the `routines` array the API expects.
// Shared by the create-group and edit-schedule screens (they had identical copies).
import type { Frequency, DayTime } from "./api";
import { DAYS_OF_WEEK } from "./scheduleConstants";
import { endTimeError } from "./timeString";

/** The slice of a screen's draft state that determines the routines. */
export interface RoutineDraft {
    frequency: Frequency | null;
    builtRoutines: { frequency: Frequency; dayTimes: DayTime[]; rules?: any[] }[];
    dailySameTime: boolean | null;
    dailySharedTime: string;
    /** Optional end time shared by every day when dailySameTime is on. */
    dailySharedEndTime?: string | null;
    dailyRows: { day: number | null; time: string; endTime?: string | null }[];
    weekdayRows: { day: number | null; time: string; endTime?: string | null; startDate: string | null }[];
    monthlyMode: "date" | "ordinal" | null;
    monthlyDates: { date: number; time: string; endTime?: string | null }[];
    ordinalEntries: { occurrence: string; day: number; time: string; endTime?: string | null }[];
}

// Only rows with an end time send the field (older servers and payloads stay unchanged).
const withEnd = (endTime?: string | null) => (endTime ? { endTime } : {});

export const buildRoutines = (d: RoutineDraft): any[] => {
    let routines: any[] = [];

    if (d.frequency === "custom") {
        routines = d.builtRoutines.map(r => ({ frequency: r.frequency, dayTimes: r.dayTimes, rules: r.rules }));
    } else if (d.frequency === "daily") {
        const dayTimes = d.dailySameTime
            ? DAYS_OF_WEEK.map(dw => ({ day: dw.value, time: d.dailySharedTime, ...withEnd(d.dailySharedEndTime) }))
            : d.dailyRows.map(r => ({ day: r.day!, time: r.time, ...withEnd(r.endTime) }));
        routines = [{ frequency: "daily", dayTimes }];
    } else if (d.frequency === "weekly" || d.frequency === "biweekly") {
        routines = [{ frequency: d.frequency, dayTimes: d.weekdayRows.filter(r => r.day !== null).map(r => ({ day: r.day!, time: r.time, ...withEnd(r.endTime), ...(r.startDate ? { startDate: r.startDate } : {}) })) }];
    } else if (d.frequency === "monthly") {
        if (d.monthlyMode === "date") {
            routines = [{ frequency: "monthly", dayTimes: d.monthlyDates.map(e => ({ date: e.date, time: e.time, ...withEnd(e.endTime) })) }];
        } else if (d.monthlyMode === "ordinal") {
            const rules = d.ordinalEntries.map(e => ({
                type: "byDay",
                occurrence: e.occurrence ?? "1st",
                day: e.day ?? 1,
            }));
            routines = [{
                frequency: "ordinal",
                dayTimes: d.ordinalEntries.map(e => ({ day: e.day, time: e.time, ...withEnd(e.endTime) })),
                rules,
            }];
        }
    }

    return routines;
};

/** First end-time problem in the schedule being edited (end equal to start), or null. */
export const scheduleEndTimeError = (d: RoutineDraft): string | null => {
    for (const r of buildRoutines(d)) {
        for (const dt of r.dayTimes || []) {
            const error = endTimeError(dt.time, dt.endTime);
            if (error) return error;
        }
    }
    return null;
};
