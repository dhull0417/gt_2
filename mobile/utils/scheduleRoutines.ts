// Turns a schedule's editable form state into the `routines` array the API expects.
// Shared by the create-group and edit-schedule screens (they had identical copies).
import type { Frequency, DayTime } from "./api";
import { DAYS_OF_WEEK } from "./scheduleConstants";

/** The slice of a screen's draft state that determines the routines. */
export interface RoutineDraft {
    frequency: Frequency | null;
    builtRoutines: { frequency: Frequency; dayTimes: DayTime[]; rules?: any[] }[];
    dailySameTime: boolean | null;
    dailySharedTime: string;
    dailyRows: { day: number | null; time: string }[];
    weekdayRows: { day: number | null; time: string; startDate: string | null }[];
    monthlyMode: "date" | "ordinal" | null;
    monthlyDates: { date: number; time: string }[];
    ordinalEntries: { occurrence: string; day: number; time: string }[];
}

export const buildRoutines = (d: RoutineDraft): any[] => {
    let routines: any[] = [];

    if (d.frequency === "custom") {
        routines = d.builtRoutines.map(r => ({ frequency: r.frequency, dayTimes: r.dayTimes, rules: r.rules }));
    } else if (d.frequency === "daily") {
        const dayTimes = d.dailySameTime
            ? DAYS_OF_WEEK.map(dw => ({ day: dw.value, time: d.dailySharedTime }))
            : d.dailyRows.map(r => ({ day: r.day!, time: r.time }));
        routines = [{ frequency: "daily", dayTimes }];
    } else if (d.frequency === "weekly" || d.frequency === "biweekly") {
        routines = [{ frequency: d.frequency, dayTimes: d.weekdayRows.filter(r => r.day !== null).map(r => ({ day: r.day!, time: r.time, ...(r.startDate ? { startDate: r.startDate } : {}) })) }];
    } else if (d.frequency === "monthly") {
        if (d.monthlyMode === "date") {
            routines = [{ frequency: "monthly", dayTimes: d.monthlyDates.map(e => ({ date: e.date, time: e.time })) }];
        } else if (d.monthlyMode === "ordinal") {
            const rules = d.ordinalEntries.map(e => ({
                type: "byDay",
                occurrence: e.occurrence ?? "1st",
                day: e.day ?? 1,
            }));
            routines = [{
                frequency: "ordinal",
                dayTimes: d.ordinalEntries.map(e => ({ day: e.day, time: e.time })),
                rules,
            }];
        }
    }

    return routines;
};
