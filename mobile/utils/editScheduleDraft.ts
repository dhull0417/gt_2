// Pure data/logic behind the "edit schedule" screen: draft types, defaults, and the converters
// between the API's routines and the screen's editable form state. No React in here.
import { DateTime } from "luxon";
import type { GroupDetails, NamedSchedule, Frequency, DayTime, Routine } from "./api";
import { DAYS_OF_WEEK, FREQ_LABELS, uid, ordSfx } from "./scheduleConstants";
import { buildRoutines } from "./scheduleRoutines";

// Minimum headcount: optional, a whole number of at least 1, and no more than the max when there is one.
export const getMinAttendeesError = (minInput: string, maxMode: "unlimited" | "limited", maxInput: string): string | null => {
    if (minInput === "") return null;
    if (!/^\d+$/.test(minInput)) return "Numbers only, please.";
    const n = parseInt(minInput, 10);
    if (n < 1) return "Enter 1 or more, or leave blank for no minimum.";
    if (maxMode === "limited" && /^\d+$/.test(maxInput) && n > parseInt(maxInput, 10)) return "Can't be more than the max attendees.";
    return null;
};


// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeekdayRow {
    id: string;
    day: number | null;
    time: string;
    startDate: string | null;
    showTimePicker: boolean;
    showDayPicker: boolean;
    showStartDatePicker: boolean;
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

export interface BringItemDraft {
    key: string;
    _id?: string; // present for items already saved, so claims follow edits
    name: string;
    max: string; // "" = no limit
}

export const newBringItemKey = () => `bi_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const getBringItemsError = (items: BringItemDraft[]): string | null => {
    const seen = new Set<string>();
    for (const i of items) {
        const name = i.name.trim();
        if (!name) return "Give every item a name, or remove the empty row.";
        if (name.length > 40) return "Item names can be at most 40 characters.";
        if (seen.has(name.toLowerCase())) return `"${name}" is listed twice.`;
        seen.add(name.toLowerCase());
        if (i.max !== "" && !/^\d+$/.test(i.max)) return `Enter a whole number for "${name}", or leave it blank for no limit.`;
        if (i.max !== "" && (parseInt(i.max, 10) < 1 || parseInt(i.max, 10) > 99)) return `The number for "${name}" must be 1 to 99.`;
    }
    return null;
};

export interface ScheduleData {
    name: string;
    location: string;
    description: string;
    maxAttendeesMode: "unlimited" | "limited";
    maxAttendeesInput: string;
    minAttendeesInput: string; // Premium minimum headcount; "" = none
    bringItems: BringItemDraft[]; // Premium assignments: things to bring
    ridesEnabled: boolean; // Premium assignments: carpool coordination
    rsvpRestricted: boolean;
    leadEnabled: boolean;
    leadDays: number;
    leadTime: string;
    showLeadTimePicker: boolean;
    deadlineEnabled: boolean;
    deadlineDays: number;
    deadlineTime: string;
    showDeadlineTimePicker: boolean;
    startDate: string;
    timezone: string;
    frequency: Frequency | null;
    showStartDatePicker: boolean;
    showTZPicker: boolean;
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
}

export const defaultSchedule = (): ScheduleData => ({
    name: "",
    location: "",
    description: "",
    maxAttendeesMode: "unlimited",
    maxAttendeesInput: "",
    minAttendeesInput: "",
    bringItems: [],
    ridesEnabled: false,
    rsvpRestricted: false,
    leadEnabled: true,
    leadDays: 5,
    leadTime: "09:00 AM",
    showLeadTimePicker: false,
    deadlineEnabled: false,
    deadlineDays: 2,
    deadlineTime: "09:00 AM",
    showDeadlineTimePicker: false,
    startDate: DateTime.now().toISODate()!,
    timezone: "America/Denver",
    frequency: null,
    showStartDatePicker: false,
    showTZPicker: false,
    showFreqPicker: false,
    dailySameTime: null,
    dailySharedTime: "05:00 PM",
    showDailySameTimePicker: false,
    dailyRows: DAYS_OF_WEEK.map(dw => ({
        id: uid(), day: dw.value, time: "05:00 PM",
        startDate: null, showTimePicker: false, showDayPicker: false, showStartDatePicker: false,
    })),
    weekdayRows: [],
    monthlyMode: null,
    monthlyDates: [],
    ordinalEntries: [],
    builtRoutines: [],
    customBuilding: false,
    customFreq: null,
    customShowFreqPicker: false,
});

// ─── Build label (for custom routine chips) ───────────────────────────────────

export const buildLabel = (freq: Frequency, dayTimes: DayTime[], ordEntries?: OrdinalEntry[]): string => {
    if (freq === "ordinal" && ordEntries?.length) {
        const parts = ordEntries.slice(0, 2).map(e =>
            `${e.occurrence} ${DAYS_OF_WEEK.find(dw => dw.value === e.day)?.short} @ ${e.time}`
        );
        return `Ordinal · ${parts.join(", ")}${ordEntries.length > 2 ? ` +${ordEntries.length - 2}` : ""}`;
    }
    const freqStr = FREQ_LABELS[freq] || freq;
    const parts = dayTimes.slice(0, 2).map(dt => {
        if (dt.day !== undefined) return `${DAYS_OF_WEEK.find(dw => dw.value === dt.day)?.short} @ ${dt.time}`;
        if (dt.date !== undefined) return `${dt.date}${ordSfx(dt.date)} @ ${dt.time}`;
        return "";
    });
    return `${freqStr} · ${parts.join(", ")}${dayTimes.length > 2 ? ` +${dayTimes.length - 2}` : ""}`;
};

// ─── Build schedule payload ───────────────────────────────────────────────────

export const buildSchedulePayload = (d: ScheduleData) => {
    if (!d.frequency) return null;
    const routines = buildRoutines(d);
    return {
        name: d.name.trim(),
        startDate: d.startDate,
        routines,
        defaultLocation: d.location.trim(),
        defaultCapacity: d.maxAttendeesMode === "limited" ? parseInt(d.maxAttendeesInput, 10) : 0,
        // The minimum is checked at the RSVP deadline, so without one it's sent as off.
        defaultMinAttendees: d.rsvpRestricted && d.deadlineEnabled && d.minAttendeesInput !== "" ? parseInt(d.minAttendeesInput, 10) : 0,
        defaultBringItems: d.bringItems.map(i => ({
            ...(i._id ? { _id: i._id } : {}),
            name: i.name.trim(),
            max: i.max === "" ? null : parseInt(i.max, 10),
        })),
        defaultRidesEnabled: d.ridesEnabled,
        defaultDescription: d.description.trim(),
        generationLeadDays: d.rsvpRestricted && d.leadEnabled ? d.leadDays : null,
        generationLeadTime: d.leadTime,
        generationDeadlineDays: d.rsvpRestricted && d.deadlineEnabled ? d.deadlineDays : null,
        generationDeadlineTime: d.deadlineTime,
        timezone: d.timezone,
    };
};

// ─── Convert API routine → BuiltRoutine ──────────────────────────────────────

export const apiRoutineToBuiltRoutine = (r: Routine): BuiltRoutine => {
    let snapshot: Partial<ScheduleData> = {};

    if (r.frequency === "daily") {
        const dts = r.dayTimes;
        const allSame = dts.length > 0 && dts.every(dt => dt.time === dts[0].time);
        snapshot = {
            dailySameTime: allSame,
            dailySharedTime: allSame ? (dts[0]?.time ?? "05:00 PM") : "05:00 PM",
            dailyRows: DAYS_OF_WEEK.map(dw => {
                const dt = dts.find(d => d.day === dw.value);
                return { id: uid(), day: dw.value, time: dt?.time || "05:00 PM", startDate: null, showTimePicker: false, showDayPicker: false, showStartDatePicker: false };
            }),
        };
    } else if (r.frequency === "weekly" || r.frequency === "biweekly") {
        snapshot = {
            weekdayRows: r.dayTimes.map(dt => ({
                id: uid(), day: dt.day ?? null, time: dt.time,
                startDate: dt.startDate ? DateTime.fromISO(dt.startDate as unknown as string).toISODate() : null,
                showTimePicker: false, showDayPicker: false, showStartDatePicker: false,
            })),
        };
    } else if (r.frequency === "monthly") {
        snapshot = {
            monthlyMode: "date",
            monthlyDates: r.dayTimes.map(dt => ({
                id: uid(), date: dt.date ?? 1, time: dt.time, expanded: false, showTimePicker: false,
            })),
        };
    } else if (r.frequency === "ordinal") {
        snapshot = {
            monthlyMode: "ordinal",
            ordinalEntries: (r.rules || []).map((rule, i) => ({
                id: uid(), occurrence: rule.occurrence || "1st", day: rule.day ?? 1,
                time: r.dayTimes[i]?.time || "05:00 PM", expanded: false, showTimePicker: false,
                showOccurrencePicker: false, showDayOfWeekPicker: false,
            })),
        };
    }

    const ordEntriesForLabel: OrdinalEntry[] | undefined = r.frequency === "ordinal"
        ? (snapshot.ordinalEntries ?? [])
        : undefined;

    return {
        id: uid(),
        frequency: r.frequency,
        label: buildLabel(r.frequency, r.dayTimes, ordEntriesForLabel),
        dayTimes: r.dayTimes,
        rules: r.rules,
        editing: false,
        snapshot,
    };
};

// ─── Convert a named schedule (or none, for creation) → ScheduleData ─────────

export const scheduleFromNamedSchedule = (group: GroupDetails, sched: NamedSchedule | null): ScheduleData => {
    const base = defaultSchedule();
    const tz = group.timezone || "America/Denver";

    if (!sched) {
        return { ...base, timezone: tz };
    }

    const common = {
        name: sched.name,
        location: sched.defaultLocation || "",
        description: sched.defaultDescription || "",
        maxAttendeesMode: (sched.defaultCapacity > 0 ? "limited" : "unlimited") as "unlimited" | "limited",
        maxAttendeesInput: sched.defaultCapacity ? String(sched.defaultCapacity) : "",
        minAttendeesInput: sched.defaultMinAttendees ? String(sched.defaultMinAttendees) : "",
        bringItems: (sched.defaultBringItems || []).map(i => ({ key: i._id, _id: i._id, name: i.name, max: i.max ? String(i.max) : "" })),
        ridesEnabled: !!sched.defaultRidesEnabled,
        rsvpRestricted: sched.generationLeadDays != null || sched.generationDeadlineDays != null,
        leadEnabled: sched.generationLeadDays != null,
        leadDays: sched.generationLeadDays ?? 5,
        leadTime: sched.generationLeadTime || "09:00 AM",
        deadlineEnabled: sched.generationDeadlineDays != null,
        deadlineDays: sched.generationDeadlineDays ?? 2,
        deadlineTime: sched.generationDeadlineTime || "09:00 AM",
    };

    const routines = (sched.routines ?? []) as Routine[];

    // schedule.frequency is not persisted by the backend schema — infer it from routines
    if (!routines.length) {
        return { ...base, ...common, timezone: tz };
    }

    const startDate = sched.startDate
        ? DateTime.fromISO(sched.startDate as unknown as string).toISODate() ?? DateTime.now().toISODate()!
        : DateTime.now().toISODate()!;

    const inferredFreq = routines.length > 1 ? "custom" : routines[0].frequency;

    if (inferredFreq === "custom") {
        return {
            ...base, ...common, timezone: tz, startDate,
            frequency: "custom",
            builtRoutines: routines.map(apiRoutineToBuiltRoutine),
        };
    }

    if (inferredFreq === "daily" && routines[0]) {
        const dts = routines[0].dayTimes;
        const allSame = dts.length > 0 && dts.every(dt => dt.time === dts[0].time);
        return {
            ...base, ...common, timezone: tz, startDate, frequency: "daily",
            dailySameTime: allSame,
            dailySharedTime: allSame ? (dts[0]?.time ?? "05:00 PM") : "05:00 PM",
            dailyRows: allSame ? base.dailyRows : DAYS_OF_WEEK.map(dw => {
                const dt = dts.find(d => d.day === dw.value);
                return { id: uid(), day: dw.value, time: dt?.time || "05:00 PM", startDate: null, showTimePicker: false, showDayPicker: false, showStartDatePicker: false };
            }),
        };
    }

    if ((inferredFreq === "weekly" || inferredFreq === "biweekly") && routines[0]) {
        return {
            ...base, ...common, timezone: tz, startDate, frequency: inferredFreq,
            weekdayRows: routines[0].dayTimes.map(dt => ({
                id: uid(), day: dt.day ?? null, time: dt.time,
                startDate: dt.startDate ? DateTime.fromISO(dt.startDate as unknown as string).toISODate() : null,
                showTimePicker: false, showDayPicker: false, showStartDatePicker: false,
            })),
        };
    }

    if (inferredFreq === "monthly" && routines[0]) {
        return {
            ...base, ...common, timezone: tz, startDate, frequency: "monthly",
            monthlyMode: "date",
            monthlyDates: routines[0].dayTimes.map(dt => ({
                id: uid(), date: dt.date ?? 1, time: dt.time, expanded: false, showTimePicker: false,
            })),
        };
    }

    if (inferredFreq === "ordinal" && routines[0]) {
        const routine = routines[0];
        return {
            ...base, ...common, timezone: tz, startDate, frequency: "monthly",
            monthlyMode: "ordinal",
            ordinalEntries: (routine.rules ?? []).map((rule, i) => ({
                id: uid(),
                occurrence: rule.occurrence || "1st",
                day: rule.day ?? 1,
                time: routine.dayTimes[i]?.time || "05:00 PM",
                expanded: false, showTimePicker: false,
                showOccurrencePicker: false, showDayOfWeekPicker: false,
            })),
        };
    }

    return { ...base, ...common, timezone: tz, startDate };
};
