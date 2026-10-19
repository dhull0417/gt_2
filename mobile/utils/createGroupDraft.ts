// Pure data/logic behind the "create group" flow: draft types, defaults, validation, and the payload
// sent to the API. No React in here.
import { DateTime } from "luxon";
import type { Frequency, DayTime } from "./api";
import { DAYS_OF_WEEK, uid, getMaxAttendeesError } from "./scheduleConstants";
import { buildRoutines } from "./scheduleRoutines";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserStub { _id: string; firstName?: string; lastName?: string; }

export interface WeekdayRow {
    id: string;
    day: number | null;
    time: string;
    startDate: string | null;
    showTimePicker: boolean;
}

export interface MonthlyDateEntry {
    id: string;
    date: number;
    time: string;
    expanded: boolean;
    showTimePicker: boolean;
}

export interface OrdinalEntry {
    id: string;
    occurrence: string;
    day: number;
    time: string;
    expanded: boolean;
    showTimePicker: boolean;
    showOccurrencePicker: boolean;
    showDayOfWeekPicker: boolean;
}

export interface BuiltRoutine {
    id: string;
    frequency: Frequency;
    label: string;
    dayTimes: DayTime[];
    rules?: any[];
    editing: boolean;
    snapshot: Partial<ScheduleData>;
}

export interface ScheduleData {
    name: string;
    location: string;
    description: string;
    startDate: string;
    frequency: Frequency | null;
    rsvpRestricted: boolean;
    leadEnabled: boolean;
    leadDays: number;
    leadTime: string;
    showLeadTimePicker: boolean;
    deadlineEnabled: boolean;
    deadlineDays: number;
    deadlineTime: string;
    showDeadlineTimePicker: boolean;
    showStartDatePicker: boolean;
    showFreqPicker: boolean;
    dailySameTime: boolean | null;
    dailySharedTime: string;
    showDailySameTimePicker: boolean;
    dailyRows: WeekdayRow[];
    weekdayRows: WeekdayRow[];
    monthlyMode: "date" | "ordinal" | null;
    monthlyDates: MonthlyDateEntry[];
    ordinalEntries: OrdinalEntry[];
    builtRoutines: BuiltRoutine[];
    customBuilding: boolean;
    customFreq: Frequency | null;
    customShowFreqPicker: boolean;
    maxAttendeesMode: "unlimited" | "limited";
    maxAttendeesInput: string;
}



// A tab with no frequency chosen is "empty" — always valid, contributes nothing
// to the group (same as today's single-schedule Skip). Only a tab someone has
// actually started configuring needs to be complete before Review is reachable.
export const isScheduleTabValid = (sch: ScheduleData): boolean => {
    if (!sch.frequency) return true;
    if (!sch.name.trim()) return false;
    if (sch.maxAttendeesMode === "limited" && (sch.maxAttendeesInput === "" || getMaxAttendeesError(sch.maxAttendeesMode, sch.maxAttendeesInput))) return false;
    if (sch.frequency === "daily") return sch.dailySameTime !== null;
    if (sch.frequency === "weekly" || sch.frequency === "biweekly")
        return sch.weekdayRows.length > 0 && sch.weekdayRows.every(r => r.day !== null);
    if (sch.frequency === "monthly") {
        if (!sch.monthlyMode) return false;
        if (sch.monthlyMode === "date") return sch.monthlyDates.length > 0;
        return sch.ordinalEntries.length > 0;
    }
    if (sch.frequency === "custom") return sch.builtRoutines.length > 0;
    return false;
};

export const defaultSchedule = (name = ""): ScheduleData => ({
    name,
    location: "",
    description: "",
    startDate: DateTime.now().toISODate()!,
    frequency: null,
    rsvpRestricted: false,
    leadEnabled: false,
    leadDays: 5,
    leadTime: "09:00 AM",
    showLeadTimePicker: false,
    deadlineEnabled: false,
    deadlineDays: 2,
    deadlineTime: "09:00 AM",
    showDeadlineTimePicker: false,
    showStartDatePicker: false,
    showFreqPicker: false,
    dailySameTime: null,
    dailySharedTime: "05:00 PM",
    showDailySameTimePicker: false,
    dailyRows: DAYS_OF_WEEK.map(dw => ({
        id: uid(), day: dw.value, time: "05:00 PM",
        startDate: null, showTimePicker: false,
    })),
    weekdayRows: [],
    monthlyMode: null,
    monthlyDates: [],
    ordinalEntries: [],
    builtRoutines: [],
    customBuilding: false,
    customFreq: null,
    customShowFreqPicker: false,
    maxAttendeesMode: "unlimited",
    maxAttendeesInput: "",
});

// ─── Build payload ────────────────────────────────────────────────────────────

// Builds everything a named schedule needs except `name` (the caller supplies
// that, since it depends on the group name entered on an earlier screen).
export const buildSchedulePayload = (d: ScheduleData) => {
    if (!d.frequency) return null;
    const routines = buildRoutines(d);
    if (!routines.length) return null;

    return {
        startDate: d.startDate,
        routines,
        defaultLocation: d.location,
        defaultCapacity: d.maxAttendeesMode === "limited" ? parseInt(d.maxAttendeesInput, 10) : 0,
        defaultDescription: d.description,
        generationLeadDays: d.rsvpRestricted && d.leadEnabled ? d.leadDays : null,
        generationLeadTime: d.leadTime,
        generationDeadlineDays: d.rsvpRestricted && d.deadlineEnabled ? d.deadlineDays : null,
        generationDeadlineTime: d.deadlineTime,
    };
};
