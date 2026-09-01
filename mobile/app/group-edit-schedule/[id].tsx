import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Alert,
    Platform,
    ActivityIndicator,
    LayoutAnimation,
    UIManager,
    Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { DateTime } from "luxon";
import { useQueryClient } from "@tanstack/react-query";
import { useGetGroupDetails } from "../../hooks/useGetGroupDetails";
import { useApiClient, groupApi, GroupDetails, NamedSchedule, Frequency, DayTime, Routine } from "../../utils/api";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import NativeTimePicker, { timeStringToDate } from "../../components/NativeTimePicker";
import OptionPickerModal from "../../components/OptionPickerModal";
import LocationField from "@/components/LocationField";
import LocationSearchModal from "@/components/LocationSearchModal";
import InfoBubble from "@/components/InfoBubble";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = [
    { label: "Sunday",    short: "Sun", value: 0 },
    { label: "Monday",    short: "Mon", value: 1 },
    { label: "Tuesday",   short: "Tue", value: 2 },
    { label: "Wednesday", short: "Wed", value: 3 },
    { label: "Thursday",  short: "Thu", value: 4 },
    { label: "Friday",    short: "Fri", value: 5 },
    { label: "Saturday",  short: "Sat", value: 6 },
];

// One accent color per weekday so day rows/cards are distinguishable at a glance
const DAY_COLORS: { bg: string; fg: string }[] = [
    { bg: "#FEE2E2", fg: "#DC2626" }, // Sunday
    { bg: "#DBEAFE", fg: "#2563EB" }, // Monday
    { bg: "#EDE9FE", fg: "#7C3AED" }, // Tuesday
    { bg: "#D1FAE5", fg: "#059669" }, // Wednesday
    { bg: "#FEF3C7", fg: "#D97706" }, // Thursday
    { bg: "#FCE7F3", fg: "#DB2777" }, // Friday
    { bg: "#CFFAFE", fg: "#0891B2" }, // Saturday
];

const ORDINAL_OCCURRENCES = ["1st", "2nd", "3rd", "4th", "5th", "Last"];

const USA_TIMEZONES = [
    { label: "Eastern (ET)",      value: "America/New_York"    },
    { label: "Central (CT)",      value: "America/Chicago"     },
    { label: "Mountain (MT)",     value: "America/Denver"      },
    { label: "Mountain (no DST)", value: "America/Phoenix"     },
    { label: "Pacific (PT)",      value: "America/Los_Angeles" },
    { label: "Alaska (AKT)",      value: "America/Anchorage"   },
    { label: "Hawaii (HT)",       value: "Pacific/Honolulu"    },
];

// Short badge for the compact timezone pill — mirrors the abbreviations already
// used elsewhere (e.g. GroupDetailsView) so the same zone reads the same way everywhere.
const TZ_ABBR: Record<string, string> = {
    "America/New_York": "ET",
    "America/Chicago": "CT",
    "America/Denver": "MT",
    "America/Phoenix": "MST",
    "America/Los_Angeles": "PT",
    "America/Anchorage": "AKST",
    "Pacific/Honolulu": "HST",
};

const FREQ_LABELS: Record<string, string> = {
    daily: "Daily", weekly: "Weekly", biweekly: "Bi-Weekly",
    monthly: "Monthly", custom: "Multiple Rules",
};

const uid = () => Math.random().toString(36).slice(2);
const ordSfx = (n: number) => n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

// Time-of-day matters when RSVP open/deadline land on the same day-count —
// comparing leadDays >= deadlineDays alone isn't enough.
const timeToMinutes = (time: string): number => {
    const t = timeStringToDate(time);
    return t.getHours() * 60 + t.getMinutes();
};

const getMaxAttendeesError = (mode: "unlimited" | "limited", input: string): string | null => {
    if (mode !== "limited" || input === "") return null;
    if (!/^\d+$/.test(input)) return "Numbers only, please.";
    const n = parseInt(input, 10);
    if (n < 1 || n > 200) return "Enter a number between 1 and 200.";
    return null;
};

// ─── ToggleSwitch ─────────────────────────────────────────────────────────────

const ToggleSwitch = ({ value, onValueChange, activeColor = "#7C3AED" }: {
    value: boolean; onValueChange: (v: boolean) => void; activeColor?: string;
}) => {
    const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
    const scale = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        Animated.timing(anim, { toValue: value ? 1 : 0, duration: 180, useNativeDriver: false }).start();
        Animated.sequence([
            Animated.timing(scale, { toValue: 1.3, duration: 90, useNativeDriver: false }),
            Animated.spring(scale, { toValue: 1, friction: 4, tension: 200, useNativeDriver: false }),
        ]).start();
    }, [value]);
    const trackColor = anim.interpolate({ inputRange: [0, 1], outputRange: ["#E5E7EB", activeColor] });
    const thumbLeft = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });
    return (
        <TouchableOpacity activeOpacity={0.8} onPress={() => onValueChange(!value)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Animated.View style={[s.switchTrack, { backgroundColor: trackColor }]}>
                <Animated.View style={[s.switchThumb, { left: thumbLeft, transform: [{ scale }] }]} />
            </Animated.View>
        </TouchableOpacity>
    );
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeekdayRow {
    id: string;
    day: number | null;
    time: string;
    startDate: string | null;
    showTimePicker: boolean;
    showDayPicker: boolean;
    showStartDatePicker: boolean;
}

interface MonthlyDateEntry {
    id: string;
    date: number;
    time: string;
    expanded: boolean;
    showTimePicker: boolean;
}

interface OrdinalEntry {
    id: string;
    occurrence: string;
    day: number;
    time: string;
    expanded: boolean;
    showTimePicker: boolean;
    showOccurrencePicker: boolean;
    showDayOfWeekPicker: boolean;
}

interface BuiltRoutine {
    id: string;
    frequency: Frequency;
    label: string;
    dayTimes: DayTime[];
    rules?: any[];
    editing: boolean;
    snapshot: Partial<ScheduleData>;
}

interface ScheduleData {
    name: string;
    location: string;
    maxAttendeesMode: "unlimited" | "limited";
    maxAttendeesInput: string;
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

const defaultSchedule = (): ScheduleData => ({
    name: "",
    location: "",
    maxAttendeesMode: "unlimited",
    maxAttendeesInput: "",
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

const buildLabel = (freq: Frequency, dayTimes: DayTime[], ordEntries?: OrdinalEntry[]): string => {
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

const buildSchedulePayload = (d: ScheduleData) => {
    if (!d.frequency) return null;
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

    return {
        name: d.name.trim(),
        startDate: d.startDate,
        routines,
        defaultLocation: d.location.trim(),
        defaultCapacity: d.maxAttendeesMode === "limited" ? parseInt(d.maxAttendeesInput, 10) : 0,
        generationLeadDays: d.rsvpRestricted && d.leadEnabled ? d.leadDays : null,
        generationLeadTime: d.leadTime,
        generationDeadlineDays: d.rsvpRestricted && d.deadlineEnabled ? d.deadlineDays : null,
        generationDeadlineTime: d.deadlineTime,
        timezone: d.timezone,
    };
};

// ─── Convert API routine → BuiltRoutine ──────────────────────────────────────

const apiRoutineToBuiltRoutine = (r: Routine): BuiltRoutine => {
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

const scheduleFromNamedSchedule = (group: GroupDetails, sched: NamedSchedule | null): ScheduleData => {
    const base = defaultSchedule();
    const tz = group.timezone || "America/Denver";

    if (!sched) {
        return { ...base, timezone: tz };
    }

    const common = {
        name: sched.name,
        location: sched.defaultLocation || "",
        maxAttendeesMode: (sched.defaultCapacity > 0 ? "limited" : "unlimited") as "unlimited" | "limited",
        maxAttendeesInput: sched.defaultCapacity ? String(sched.defaultCapacity) : "",
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

// ─── InlineCalendar ───────────────────────────────────────────────────────────

const InlineCalendar = ({ value, onChange, minDate }: {
    value: string; onChange: (iso: string) => void; minDate?: string;
}) => {
    const [month, setMonth] = useState(
        value ? DateTime.fromISO(value).startOf("month") : DateTime.now().startOf("month")
    );
    const grid = useMemo(() => {
        const start = month.startOf("month");
        const firstDow = start.weekday === 7 ? 0 : start.weekday;
        const cells: (DateTime | null)[] = [];
        for (let i = 0; i < firstDow; i++) cells.push(null);
        for (let d = 1; d <= month.daysInMonth!; d++) cells.push(month.set({ day: d }));
        return cells;
    }, [month]);
    const minDT = minDate ? DateTime.fromISO(minDate) : DateTime.now().startOf("day");
    return (
        <View style={cal.container}>
            <View style={cal.nav}>
                <TouchableOpacity onPress={() => setMonth(m => m.minus({ months: 1 }))} style={cal.navBtn}>
                    <Feather name="chevron-left" size={18} color="#4A90E2" />
                </TouchableOpacity>
                <Text style={cal.monthLabel}>{month.toFormat("MMMM yyyy")}</Text>
                <TouchableOpacity onPress={() => setMonth(m => m.plus({ months: 1 }))} style={cal.navBtn}>
                    <Feather name="chevron-right" size={18} color="#4A90E2" />
                </TouchableOpacity>
            </View>
            <View style={cal.grid}>
                {["S","M","T","W","T","F","S"].map((d, i) => (
                    <Text key={i} style={cal.dayHeader}>{d}</Text>
                ))}
                {grid.map((day, i) => {
                    if (!day) return <View key={`e-${i}`} style={cal.cell} />;
                    const iso = day.toISODate()!;
                    const selected = iso === value;
                    const disabled = day < minDT;
                    return (
                        <TouchableOpacity
                            key={iso}
                            style={[cal.cell, selected && cal.cellSelected, disabled && cal.cellDisabled]}
                            onPress={() => !disabled && onChange(iso)}
                            disabled={disabled}
                        >
                            <Text style={[cal.cellText, selected && cal.cellTextSelected, disabled && cal.cellTextDisabled]}>
                                {day.day}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

const EditScheduleScreen = () => {
    const { id, scheduleId: rawScheduleId } = useLocalSearchParams<{ id: string; scheduleId?: string }>();
    // "new" (or no param at all) means creating a schedule rather than editing one.
    const scheduleId = rawScheduleId && rawScheduleId !== "new" ? rawScheduleId : null;
    const isNew = !scheduleId;
    const router = useRouter();
    const api = useApiClient();
    const queryClient = useQueryClient();

    const { data: group, isLoading } = useGetGroupDetails(id);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false);

    const targetSchedule = useMemo(
        () => group?.schedules?.find(s => s._id === scheduleId) ?? null,
        [group, scheduleId]
    );

    // Initialized once when group data arrives
    const originalRef = useRef<ScheduleData | null>(null);
    const [d, setD] = useState<ScheduleData>(defaultSchedule());
    const initialized = useRef(false);

    // Pre-populate from the target schedule (or defaults, for a new one) the first time it loads
    React.useEffect(() => {
        if (group && !initialized.current && (isNew || targetSchedule)) {
            initialized.current = true;
            const initial = scheduleFromNamedSchedule(group, targetSchedule);
            originalRef.current = initial;
            setD(initial);
        }
    }, [group, targetSchedule, isNew]);

    const upd = useCallback((patch: Partial<ScheduleData>) => {
        animate();
        setD(prev => ({ ...prev, ...patch }));
    }, []);

    const selectFreq = (freq: Frequency) => {
        animate();
        setD(prev => ({
            ...prev,
            frequency: freq,
            showFreqPicker: false,
            dailySameTime: null,
            weekdayRows: [],
            monthlyMode: null,
            monthlyDates: [],
            ordinalEntries: [],
            builtRoutines: [],
            customBuilding: false,
            customFreq: null,
        }));
    };

    // ── Weekday rows ──────────────────────────────────────────────────────────

    const addWeekdayRow = () => {
        animate();
        setD(prev => ({
            ...prev,
            weekdayRows: [...prev.weekdayRows, {
                id: uid(), day: null, time: "05:00 PM",
                startDate: DateTime.now().toISODate()!,
                showTimePicker: false, showDayPicker: true, showStartDatePicker: false,
            }],
        }));
    };

    const updWeekdayRow = (rowId: string, patch: Partial<WeekdayRow>) => {
        animate();
        setD(prev => ({
            ...prev,
            weekdayRows: prev.weekdayRows.map(r => r.id === rowId ? { ...r, ...patch } : r),
        }));
    };

    const removeWeekdayRow = (rowId: string) => {
        animate();
        setD(prev => ({ ...prev, weekdayRows: prev.weekdayRows.filter(r => r.id !== rowId) }));
    };

    // ── Monthly dates ─────────────────────────────────────────────────────────

    const addMonthlyDate = () => {
        animate();
        setD(prev => ({
            ...prev,
            monthlyDates: [...prev.monthlyDates, { id: uid(), date: 1, time: "05:00 PM", expanded: true, showTimePicker: false }],
        }));
    };
    const updMonthlyDate = (entryId: string, patch: Partial<MonthlyDateEntry>) => {
        animate();
        setD(prev => ({ ...prev, monthlyDates: prev.monthlyDates.map(e => e.id === entryId ? { ...e, ...patch } : e) }));
    };
    const removeMonthlyDate = (entryId: string) => {
        animate();
        setD(prev => ({ ...prev, monthlyDates: prev.monthlyDates.filter(e => e.id !== entryId) }));
    };

    // ── Ordinal entries ───────────────────────────────────────────────────────

    const addOrdinalEntry = () => {
        animate();
        setD(prev => ({
            ...prev,
            ordinalEntries: [...prev.ordinalEntries, { id: uid(), occurrence: "1st", day: 1, time: "05:00 PM", expanded: true, showTimePicker: false, showOccurrencePicker: false, showDayOfWeekPicker: false }],
        }));
    };
    const updOrdinal = (entryId: string, patch: Partial<OrdinalEntry>) => {
        animate();
        setD(prev => ({ ...prev, ordinalEntries: prev.ordinalEntries.map(e => e.id === entryId ? { ...e, ...patch } : e) }));
    };
    const removeOrdinal = (entryId: string) => {
        animate();
        setD(prev => ({ ...prev, ordinalEntries: prev.ordinalEntries.filter(e => e.id !== entryId) }));
    };

    // ── Custom routines ───────────────────────────────────────────────────────

    const buildRoutineFromState = (): BuiltRoutine | null => {
        const freq = d.customFreq;
        if (!freq) return null;
        let dayTimes: DayTime[] = [];
        let rules: any[] | undefined;
        let finalFreq: Frequency = freq;

        if (freq === "daily") {
            dayTimes = d.dailySameTime
                ? DAYS_OF_WEEK.map(dw => ({ day: dw.value, time: d.dailySharedTime }))
                : d.dailyRows.map(r => ({ day: r.day!, time: r.time }));
        } else if (freq === "weekly" || freq === "biweekly") {
            dayTimes = d.weekdayRows.filter(r => r.day !== null).map(r => ({ day: r.day!, time: r.time, ...(r.startDate ? { startDate: r.startDate } : {}) }));
        } else if (freq === "monthly") {
            if (d.monthlyMode === "date") {
                dayTimes = d.monthlyDates.map(e => ({ date: e.date, time: e.time }));
            } else if (d.monthlyMode === "ordinal") {
                finalFreq = "ordinal" as Frequency;
                dayTimes = d.ordinalEntries.map(e => ({ day: e.day, time: e.time }));
                rules = d.ordinalEntries.map(e => ({ type: "byDay", occurrence: e.occurrence, day: e.day }));
            }
        }
        if (!dayTimes.length) return null;
        return {
            id: uid(),
            frequency: finalFreq,
            label: buildLabel(finalFreq, dayTimes, d.ordinalEntries),
            dayTimes, rules,
            editing: false,
            snapshot: {
                dailySameTime: d.dailySameTime,
                dailySharedTime: d.dailySharedTime,
                weekdayRows: d.weekdayRows.map(r => ({ ...r, showTimePicker: false, showDayPicker: false, showStartDatePicker: false })),
                monthlyMode: d.monthlyMode,
                monthlyDates: d.monthlyDates.map(e => ({ ...e, expanded: false, showTimePicker: false })),
                ordinalEntries: d.ordinalEntries.map(e => ({ ...e, expanded: false, showTimePicker: false, showOccurrencePicker: false, showDayOfWeekPicker: false })),
            },
        };
    };

    const finishCustomRoutine = () => {
        const routine = buildRoutineFromState();
        if (!routine) return;
        animate();
        setD(prev => ({
            ...prev,
            builtRoutines: [...prev.builtRoutines, routine],
            customBuilding: false, customFreq: null, customShowFreqPicker: false,
            weekdayRows: [], monthlyMode: null, monthlyDates: [], ordinalEntries: [], dailySameTime: null,
        }));
    };

    const startEditingRoutine = (routineId: string) => {
        animate();
        setD(prev => {
            const r = prev.builtRoutines.find(br => br.id === routineId);
            if (!r) return prev;
            return {
                ...prev,
                customFreq: r.frequency === "ordinal" ? ("monthly" as Frequency) : r.frequency,
                customBuilding: true,
                customShowFreqPicker: false,
                dailySameTime: r.snapshot.dailySameTime ?? null,
                dailySharedTime: r.snapshot.dailySharedTime ?? "05:00 PM",
                weekdayRows: r.snapshot.weekdayRows ?? [],
                monthlyMode: r.snapshot.monthlyMode ?? null,
                monthlyDates: r.snapshot.monthlyDates ?? [],
                ordinalEntries: (r.snapshot.ordinalEntries ?? []).map(e => ({ ...e, expanded: true })),
                builtRoutines: prev.builtRoutines.map(br => br.id === routineId ? { ...br, editing: true } : br),
            };
        });
    };

    const saveEditedRoutine = (editingId: string) => {
        const routine = buildRoutineFromState();
        if (!routine) return;
        animate();
        setD(prev => ({
            ...prev,
            builtRoutines: prev.builtRoutines.map(r => r.id === editingId ? { ...routine, id: editingId } : r),
            customBuilding: false, customFreq: null,
            weekdayRows: [], monthlyMode: null, monthlyDates: [], ordinalEntries: [], dailySameTime: null,
        }));
    };

    const removeBuiltRoutine = (routineId: string) => {
        animate();
        setD(prev => ({ ...prev, builtRoutines: prev.builtRoutines.filter(r => r.id !== routineId) }));
    };

    const editingRoutineId = d.builtRoutines.find(r => r.editing)?.id ?? null;

    // ── Validation ────────────────────────────────────────────────────────────

    const isScheduleValid = (): boolean => {
        if (!d.name.trim()) return false;
        if (d.maxAttendeesMode === "limited" && (d.maxAttendeesInput === "" || getMaxAttendeesError(d.maxAttendeesMode, d.maxAttendeesInput))) return false;
        if (!d.frequency) return false;
        if (d.frequency === "daily") return d.dailySameTime !== null;
        if (d.frequency === "weekly" || d.frequency === "biweekly")
            return d.weekdayRows.length > 0 && d.weekdayRows.every(r => r.day !== null);
        if (d.frequency === "monthly") {
            if (!d.monthlyMode) return false;
            if (d.monthlyMode === "date") return d.monthlyDates.length > 0;
            return d.ordinalEntries.length > 0;
        }
        if (d.frequency === "custom") return d.builtRoutines.length > 0;
        return false;
    };

    const hasChanged = useMemo(() => {
        if (!originalRef.current) return false;
        return JSON.stringify(buildSchedulePayload(d)) !== JSON.stringify(buildSchedulePayload(originalRef.current));
    }, [d]);

    const saveEnabled = isScheduleValid() && hasChanged && !isSaving;

    // ── Save ──────────────────────────────────────────────────────────────────

    const handleSave = async () => {
        const payload = buildSchedulePayload(d);
        if (!payload || !id) return;
        setIsSaving(true);
        try {
            if (isNew) {
                await groupApi.createSchedule(api, id, payload);
            } else {
                await groupApi.updateSchedule(api, id, scheduleId!, payload);
            }
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["groupDetails", id] }),
                queryClient.invalidateQueries({ queryKey: ["meetups"] }),
                queryClient.invalidateQueries({ queryKey: ["groups"] }),
            ]);
            Alert.alert(
                isNew ? "Schedule created" : "Schedule updated",
                isNew ? "Meetups will start generating shortly." : "Future meetups have been regenerated.",
                [{ text: "OK", onPress: () => router.navigate("/(tabs)/groups") }]
            );
        } catch (err: any) {
            Alert.alert("Error", err?.response?.data?.error || "Failed to save schedule.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = () => {
        if (!id || !scheduleId) return;
        Alert.alert(
            "Remove Schedule",
            `Remove "${d.name || "this schedule"}"? Its upcoming meetups will be cancelled — this can't be undone.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        setIsDeleting(true);
                        try {
                            await groupApi.deleteSchedule(api, id, scheduleId);
                            await Promise.all([
                                queryClient.invalidateQueries({ queryKey: ["groupDetails", id] }),
                                queryClient.invalidateQueries({ queryKey: ["meetups"] }),
                                queryClient.invalidateQueries({ queryKey: ["groups"] }),
                            ]);
                            router.navigate("/(tabs)/groups");
                        } catch (err: any) {
                            Alert.alert("Error", err?.response?.data?.error || "Failed to remove schedule.");
                        } finally {
                            setIsDeleting(false);
                        }
                    },
                },
            ]
        );
    };

    // ── Sub-renderers ─────────────────────────────────────────────────────────

    const renderDailyOptions = () => (
        <View style={s.expandBox}>
            <Text style={s.expandBoxTitle}>Daily Options</Text>
            <Text style={s.fieldLabel}>Same time every day?</Text>
            <View style={s.boolRow}>
                <TouchableOpacity style={[s.boolBtn, d.dailySameTime === true && s.boolBtnActive]}
                    onPress={() => upd({ dailySameTime: true })}>
                    <Text style={[s.boolBtnText, d.dailySameTime === true && s.boolBtnTextActive]}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.boolBtn, d.dailySameTime === false && s.boolBtnActive]}
                    onPress={() => upd({ dailySameTime: false })}>
                    <Text style={[s.boolBtnText, d.dailySameTime === false && s.boolBtnTextActive]}>No, varies</Text>
                </TouchableOpacity>
            </View>

            {d.dailySameTime === true && (
                <View style={{ marginTop: 12 }}>
                    <Text style={s.fieldLabel}>Time</Text>
                    <TouchableOpacity style={s.dateFieldRow}
                        onPress={() => upd({ showDailySameTimePicker: !d.showDailySameTimePicker })}>
                        <Feather name="clock" size={16} color="#9CA3AF" style={{ marginRight: 10 }} />
                        <Text style={s.dateFieldText}>{d.dailySharedTime}</Text>
                        <Feather name={d.showDailySameTimePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                    </TouchableOpacity>
                    {d.showDailySameTimePicker && (
                        <NativeTimePicker value={d.dailySharedTime} onChange={t => upd({ dailySharedTime: t })}
                            onClose={() => upd({ showDailySameTimePicker: false })} />
                    )}
                </View>
            )}

            {d.dailySameTime === false && (
                <View style={{ marginTop: 12, gap: 8 }}>
                    {d.dailyRows.map(row => (
                        <View key={row.id}>
                            <Text style={s.dayRowLabel}>{DAYS_OF_WEEK.find(dw => dw.value === row.day)?.label}</Text>
                            <TouchableOpacity style={s.dateFieldRow}
                                onPress={() => setD(prev => ({
                                    ...prev,
                                    dailyRows: prev.dailyRows.map(r =>
                                        r.id === row.id
                                            ? { ...r, showTimePicker: !r.showTimePicker }
                                            : { ...r, showTimePicker: false }
                                    ),
                                }))}>
                                <Feather name="clock" size={16} color="#9CA3AF" style={{ marginRight: 10 }} />
                                <Text style={s.dateFieldText}>{row.time}</Text>
                                <Feather name={row.showTimePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                            </TouchableOpacity>
                            {row.showTimePicker && (
                                <NativeTimePicker value={row.time}
                                    onChange={t => setD(prev => ({
                                        ...prev,
                                        dailyRows: prev.dailyRows.map(r => r.id === row.id ? { ...r, time: t } : r),
                                    }))}
                                    onClose={() => setD(prev => ({
                                        ...prev,
                                        dailyRows: prev.dailyRows.map(r => r.id === row.id ? { ...r, showTimePicker: false } : r),
                                    }))} />
                            )}
                        </View>
                    ))}
                </View>
            )}
        </View>
    );

    const renderWeekdayRows = (isBiweekly = false) => (
        <View style={s.expandBox}>
            <Text style={s.expandBoxTitle}>{isBiweekly ? "Bi-Weekly Options" : "Weekly Options"}</Text>
            {d.weekdayRows.map(row => (
                <View key={row.id} style={[s.dayCard, row.day !== null && { borderLeftColor: DAY_COLORS[row.day].fg }]}>
                    {isBiweekly && <Text style={s.fieldLabel}>Day of Week</Text>}
                    <View style={s.dayRow}>
                        <TouchableOpacity style={s.dayPickerTrigger}
                            onPress={() => updWeekdayRow(row.id, { showDayPicker: !row.showDayPicker, showTimePicker: false, showStartDatePicker: false })}>
                            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                                <View style={[s.dayBadge, { backgroundColor: row.day !== null ? DAY_COLORS[row.day].bg : "#F3F4F6" }]}>
                                    {row.day !== null
                                        ? <Text style={[s.dayBadgeText, { color: DAY_COLORS[row.day].fg }]}>{DAYS_OF_WEEK[row.day].short.slice(0, 2)}</Text>
                                        : <Feather name="calendar" size={12} color="#9CA3AF" />}
                                </View>
                                <Text style={row.day !== null ? s.dayPickerText : s.dayPickerPlaceholder}>
                                    {row.day !== null ? DAYS_OF_WEEK.find(dw => dw.value === row.day)?.label : "Select day"}
                                </Text>
                            </View>
                            <Feather name={row.showDayPicker ? "chevron-up" : "chevron-down"} size={14} color="#9CA3AF" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeWeekdayRow(row.id)} style={{ marginLeft: 8 }}>
                            <Feather name="trash-2" size={16} color="#F87171" />
                        </TouchableOpacity>
                    </View>

                    {row.showDayPicker && (
                        <OptionPickerModal title="Day of week"
                            options={DAYS_OF_WEEK.map(dw => ({ key: String(dw.value), label: dw.label }))}
                            selectedKey={row.day !== null ? String(row.day) : ""}
                            onSelect={key => updWeekdayRow(row.id, { day: Number(key), showDayPicker: false, showTimePicker: true })}
                            onClose={() => updWeekdayRow(row.id, { showDayPicker: false })} />
                    )}

                    {row.day !== null && (
                        <View style={{ marginTop: 8 }}>
                            <Text style={s.fieldLabel}>Time</Text>
                            <TouchableOpacity style={s.dateFieldRow}
                                onPress={() => updWeekdayRow(row.id, { showTimePicker: !row.showTimePicker, showDayPicker: false, showStartDatePicker: false })}>
                                <Feather name="clock" size={16} color="#9CA3AF" style={{ marginRight: 10 }} />
                                <Text style={s.dateFieldText}>{row.time}</Text>
                                <Feather name={row.showTimePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {row.showTimePicker && (
                        <NativeTimePicker value={row.time}
                            onChange={t => updWeekdayRow(row.id, { time: t })}
                            onClose={() => updWeekdayRow(row.id, { showTimePicker: false })} />
                    )}

                    {isBiweekly && row.day !== null && (
                        <View style={{ marginTop: 8 }}>
                            <Text style={s.fieldLabel}>Start Date</Text>
                            <TouchableOpacity style={s.dateFieldRow}
                                onPress={() => updWeekdayRow(row.id, { showStartDatePicker: !row.showStartDatePicker, showTimePicker: false, showDayPicker: false })}>
                                <Feather name="calendar" size={14} color="#4A90E2" style={{ marginRight: 6 }} />
                                <Text style={s.dateFieldText}>
                                    {row.startDate ? DateTime.fromISO(row.startDate).toLocaleString(DateTime.DATE_MED) : "Set start date"}
                                </Text>
                                <Feather name={row.showStartDatePicker ? "chevron-up" : "chevron-down"} size={14} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                            </TouchableOpacity>
                            {row.showStartDatePicker && (
                                <InlineCalendar value={row.startDate || DateTime.now().toISODate()!}
                                    onChange={iso => updWeekdayRow(row.id, { startDate: iso, showStartDatePicker: false })}
                                    minDate={DateTime.now().toISODate()!} />
                            )}
                        </View>
                    )}
                </View>
            ))}
            <TouchableOpacity style={s.addRowBtn} onPress={addWeekdayRow}>
                <Feather name="plus-circle" size={16} color="#4A90E2" style={{ marginRight: 6 }} />
                <Text style={s.addRowBtnText}>Add day</Text>
            </TouchableOpacity>
        </View>
    );

    const renderMonthlyDateEntry = (entry: MonthlyDateEntry) => (
        <View key={entry.id} style={s.ordinalCard}>
            {!entry.expanded ? (
                <TouchableOpacity style={s.collapsedRuleRow} onPress={() => updMonthlyDate(entry.id, { expanded: true })}>
                    <Text style={s.collapsedRuleText}>{entry.date}{ordSfx(entry.date)} of month · {entry.time}</Text>
                    <View style={s.collapsedRuleActions}>
                        <Feather name="edit-2" size={14} color="#4A90E2" style={{ marginRight: 10 }} />
                        <TouchableOpacity onPress={() => removeMonthlyDate(entry.id)}>
                            <Feather name="trash-2" size={14} color="#F87171" />
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            ) : (
                <View>
                    <View style={s.ordinalRow}>
                        <Text style={s.fieldLabel}>Select date of month</Text>
                        <TouchableOpacity onPress={() => removeMonthlyDate(entry.id)}>
                            <Feather name="trash-2" size={16} color="#F87171" />
                        </TouchableOpacity>
                    </View>
                    <View style={s.dateGrid}>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(n => (
                            <TouchableOpacity key={n} style={[s.dateBox, entry.date === n && s.dateBoxActive]}
                                onPress={() => updMonthlyDate(entry.id, { date: n })}>
                                <Text style={[s.dateBoxText, entry.date === n && s.dateBoxTextActive]}>{n}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={s.fieldLabel}>Time</Text>
                    <TouchableOpacity style={s.dateFieldRow}
                        onPress={() => updMonthlyDate(entry.id, { showTimePicker: !entry.showTimePicker })}>
                        <Feather name="clock" size={16} color="#9CA3AF" style={{ marginRight: 10 }} />
                        <Text style={s.dateFieldText}>{entry.time}</Text>
                        <Feather name={entry.showTimePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.doneBtn, { alignSelf: "flex-end", marginTop: 10 }]}
                        onPress={() => updMonthlyDate(entry.id, { expanded: false, showTimePicker: false })}>
                        <Text style={s.doneBtnText}>Done</Text>
                    </TouchableOpacity>
                    {entry.showTimePicker && (
                        <NativeTimePicker value={entry.time}
                            onChange={t => updMonthlyDate(entry.id, { time: t })}
                            onClose={() => updMonthlyDate(entry.id, { showTimePicker: false })} />
                    )}
                </View>
            )}
        </View>
    );

    const renderOrdinalEntry = (entry: OrdinalEntry) => (
        <View key={entry.id} style={s.ordinalCard}>
            {!entry.expanded ? (
                <TouchableOpacity style={s.collapsedRuleRow} onPress={() => updOrdinal(entry.id, { expanded: true })}>
                    <Text style={s.collapsedRuleText}>
                        {entry.occurrence} {DAYS_OF_WEEK.find(dw => dw.value === entry.day)?.label} · {entry.time}
                    </Text>
                    <View style={s.collapsedRuleActions}>
                        <Feather name="edit-2" size={14} color="#4A90E2" style={{ marginRight: 10 }} />
                        <TouchableOpacity onPress={() => removeOrdinal(entry.id)}>
                            <Feather name="trash-2" size={14} color="#F87171" />
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            ) : (
                <View>
                    <View style={s.ordinalRow}>
                        <Text style={s.fieldLabel}>Occurrence &amp; day</Text>
                        <TouchableOpacity onPress={() => removeOrdinal(entry.id)}>
                            <Feather name="trash-2" size={16} color="#F87171" />
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={s.dateFieldRow}
                        onPress={() => updOrdinal(entry.id, { showOccurrencePicker: true, showDayOfWeekPicker: false, showTimePicker: false })}>
                        <Text style={s.dateFieldText}>{entry.occurrence}</Text>
                        <Feather name="chevron-down" size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.dateFieldRow}
                        onPress={() => updOrdinal(entry.id, { showDayOfWeekPicker: true, showOccurrencePicker: false, showTimePicker: false })}>
                        <Text style={s.dateFieldText}>{DAYS_OF_WEEK.find(dw => dw.value === entry.day)?.label}</Text>
                        <Feather name="chevron-down" size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                    </TouchableOpacity>
                    <Text style={s.fieldLabel}>Time</Text>
                    <TouchableOpacity style={s.dateFieldRow}
                        onPress={() => updOrdinal(entry.id, { showTimePicker: !entry.showTimePicker, showOccurrencePicker: false, showDayOfWeekPicker: false })}>
                        <Feather name="clock" size={16} color="#9CA3AF" style={{ marginRight: 10 }} />
                        <Text style={s.dateFieldText}>{entry.time}</Text>
                        <Feather name={entry.showTimePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.doneBtn, { alignSelf: "flex-end", marginTop: 10 }]}
                        onPress={() => updOrdinal(entry.id, { expanded: false, showTimePicker: false })}>
                        <Text style={s.doneBtnText}>Done</Text>
                    </TouchableOpacity>
                    {entry.showTimePicker && (
                        <NativeTimePicker value={entry.time}
                            onChange={t => updOrdinal(entry.id, { time: t })}
                            onClose={() => updOrdinal(entry.id, { showTimePicker: false })} />
                    )}
                    {entry.showOccurrencePicker && (
                        <OptionPickerModal title="Occurrence"
                            options={ORDINAL_OCCURRENCES.map(occ => ({ key: occ, label: occ }))}
                            selectedKey={entry.occurrence}
                            onSelect={occ => updOrdinal(entry.id, { occurrence: occ, showOccurrencePicker: false })}
                            onClose={() => updOrdinal(entry.id, { showOccurrencePicker: false })} />
                    )}
                    {entry.showDayOfWeekPicker && (
                        <OptionPickerModal title="Day of week"
                            options={DAYS_OF_WEEK.map(dw => ({ key: String(dw.value), label: dw.label }))}
                            selectedKey={String(entry.day)}
                            onSelect={key => updOrdinal(entry.id, { day: Number(key), showDayOfWeekPicker: false })}
                            onClose={() => updOrdinal(entry.id, { showDayOfWeekPicker: false })} />
                    )}
                </View>
            )}
        </View>
    );

    const renderMonthlyOptions = () => (
        <View style={s.expandBox}>
            <Text style={s.expandBoxTitle}>Monthly Options</Text>
            <Text style={s.fieldLabel}>Recur by</Text>
            <View style={s.monthlyModeList}>
                <TouchableOpacity style={[s.monthlyModeCard, d.monthlyMode === "date" && s.monthlyModeCardActive]}
                    onPress={() => upd({ monthlyMode: "date" })}>
                    <View style={[s.monthlyModeRadio, d.monthlyMode === "date" && s.monthlyModeRadioActive]}>
                        {d.monthlyMode === "date" && <View style={s.monthlyModeRadioDot} />}
                    </View>
                    <View style={[s.monthlyModeIcon, d.monthlyMode === "date" && s.monthlyModeIconActive]}>
                        <Feather name="hash" size={16} color={d.monthlyMode === "date" ? "#fff" : "#9CA3AF"} />
                    </View>
                    <View style={s.monthlyModeCopy}>
                        <Text style={[s.monthlyModeTitle, d.monthlyMode === "date" && s.monthlyModeTitleActive]}>Same date every month</Text>
                        <Text style={s.monthlyModeExample}>e.g. the 15th</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity style={[s.monthlyModeCard, d.monthlyMode === "ordinal" && s.monthlyModeCardActive]}
                    onPress={() => upd({ monthlyMode: "ordinal" })}>
                    <View style={[s.monthlyModeRadio, d.monthlyMode === "ordinal" && s.monthlyModeRadioActive]}>
                        {d.monthlyMode === "ordinal" && <View style={s.monthlyModeRadioDot} />}
                    </View>
                    <View style={[s.monthlyModeIcon, d.monthlyMode === "ordinal" && s.monthlyModeIconActive]}>
                        <Feather name="repeat" size={16} color={d.monthlyMode === "ordinal" ? "#fff" : "#9CA3AF"} />
                    </View>
                    <View style={s.monthlyModeCopy}>
                        <Text style={[s.monthlyModeTitle, d.monthlyMode === "ordinal" && s.monthlyModeTitleActive]}>Same weekday every month</Text>
                        <Text style={s.monthlyModeExample}>e.g. the 2nd Tuesday</Text>
                    </View>
                </TouchableOpacity>
            </View>
            {d.monthlyMode === "date" && (
                <View style={{ marginTop: 12, gap: 8 }}>
                    {d.monthlyDates.map(renderMonthlyDateEntry)}
                    <TouchableOpacity style={s.addRowBtn} onPress={addMonthlyDate}>
                        <Feather name="plus-circle" size={16} color="#4A90E2" style={{ marginRight: 6 }} />
                        <Text style={s.addRowBtnText}>Add date</Text>
                    </TouchableOpacity>
                </View>
            )}
            {d.monthlyMode === "ordinal" && (
                <View style={{ marginTop: 12, gap: 8 }}>
                    {d.ordinalEntries.map(renderOrdinalEntry)}
                    <TouchableOpacity style={s.addRowBtn} onPress={addOrdinalEntry}>
                        <Feather name="plus-circle" size={16} color="#4A90E2" style={{ marginRight: 6 }} />
                        <Text style={s.addRowBtnText}>Add pattern</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    const renderCustomSubBuilder = () => (
        <View style={[s.ordinalCard, { marginTop: 8 }]}>
            <Text style={s.fieldLabel}>Rule type</Text>
            <TouchableOpacity style={s.dateFieldRow}
                onPress={() => upd({ customShowFreqPicker: !d.customShowFreqPicker })}>
                <Text style={d.customFreq ? s.dateFieldText : s.dayPickerPlaceholder}>
                    {d.customFreq ? FREQ_LABELS[d.customFreq] : "Select frequency"}
                </Text>
                <Feather name={d.customShowFreqPicker ? "chevron-up" : "chevron-down"} size={14} color="#9CA3AF" style={{ marginLeft: "auto" }} />
            </TouchableOpacity>
            {d.customShowFreqPicker && (
                <View style={s.inlineDayPicker}>
                    {(["daily", "weekly", "biweekly", "monthly"] as Frequency[]).map(f => (
                        <TouchableOpacity key={f} style={[s.dayOption, d.customFreq === f && s.dayOptionActive]}
                            onPress={() => { animate(); setD(prev => ({ ...prev, customFreq: f, customShowFreqPicker: false, weekdayRows: [], monthlyMode: null, monthlyDates: [], ordinalEntries: [], dailySameTime: null })); }}>
                            <Text style={[s.dayOptionText, d.customFreq === f && s.dayOptionTextActive]}>{FREQ_LABELS[f]}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
            {d.customFreq === "daily" && renderDailyOptions()}
            {d.customFreq === "weekly" && renderWeekdayRows(false)}
            {d.customFreq === "biweekly" && renderWeekdayRows(true)}
            {d.customFreq === "monthly" && renderMonthlyOptions()}
            <View style={[s.boolRow, { marginTop: 14 }]}>
                <TouchableOpacity style={s.skipBtn}
                    onPress={() => { animate(); upd({ customBuilding: false, customFreq: null, builtRoutines: d.builtRoutines.map(r => ({ ...r, editing: false })) }); }}>
                    <Text style={s.skipBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.primaryBtn}
                    onPress={() => editingRoutineId ? saveEditedRoutine(editingRoutineId) : finishCustomRoutine()}>
                    <Text style={s.primaryBtnText}>{editingRoutineId ? "Save changes" : "Add rule"}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderCustomOptions = () => (
        <View style={s.expandBox}>
            <Text style={s.expandBoxTitle}>Multiple Rules</Text>
            {d.builtRoutines.map(r =>
                r.editing ? (
                    <View key={r.id}>{renderCustomSubBuilder()}</View>
                ) : (
                    <TouchableOpacity key={r.id} style={s.routineCard} onPress={() => startEditingRoutine(r.id)}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.routineCardLabel}>{r.label}</Text>
                            <Text style={s.routineCardSub}>Tap to edit</Text>
                        </View>
                        <TouchableOpacity onPress={() => removeBuiltRoutine(r.id)}>
                            <Feather name="x-circle" size={18} color="#F87171" />
                        </TouchableOpacity>
                    </TouchableOpacity>
                )
            )}
            {d.builtRoutines.length < 5 && !d.customBuilding && (
                <TouchableOpacity style={s.addRowBtn} onPress={() => upd({ customBuilding: true, customFreq: null })}>
                    <Feather name="plus-circle" size={16} color="#4A90E2" style={{ marginRight: 6 }} />
                    <Text style={s.addRowBtnText}>Add rule</Text>
                </TouchableOpacity>
            )}
            {d.customBuilding && !editingRoutineId && renderCustomSubBuilder()}
        </View>
    );

    // ── Loading state ─────────────────────────────────────────────────────────

    if (isLoading || !group) {
        return (
            <SafeAreaView style={s.safe}>
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                    <LoadingAnimation />
                </View>
            </SafeAreaView>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <SafeAreaView style={s.safe}>
            <View style={s.screen}>
                <View style={s.screenHeader}>
                    <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
                        <Feather name="arrow-left" size={24} color="#6B7280" />
                    </TouchableOpacity>
                    <Text style={s.headerTitle}>{isNew ? "New Schedule" : "Edit Schedule"}</Text>
                    <View style={{ width: 36 }} />
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={s.screenSub}>
                        {isNew
                            ? "Give this schedule a name (e.g. \"Monthly Camping\") and set its recurrence — it shares this group's members and chat."
                            : "Changes will delete future meetups and regenerate them from the updated schedule."}
                    </Text>

                    {/* Timezone — applies to the whole group, not just this schedule,
                        so it's a standalone field rather than part of the form below. */}
                    <View style={s.tzSection}>
                        <View style={s.tzRow}>
                            <Text style={[s.fieldLabel, s.fieldLabelFirst, { marginBottom: 0 }]}>Timezone</Text>
                            <TouchableOpacity style={s.tzPill} onPress={() => upd({
                                showTZPicker: !d.showTZPicker,
                                showFreqPicker: false, showStartDatePicker: false, showLeadTimePicker: false, showDeadlineTimePicker: false,
                            })}>
                                <Feather name="globe" size={13} color="#4A90E2" />
                                <Text style={s.tzPillText}>{TZ_ABBR[d.timezone] ?? d.timezone}</Text>
                                <Feather name={d.showTZPicker ? "chevron-up" : "chevron-down"} size={13} color="#4A90E2" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Name */}
                    <View style={s.sectionCard}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, s.sectionIconChipIndigo]}>
                                <Feather name="tag" size={16} color="#6366F1" />
                            </View>
                            <Text style={s.sectionTitle}>Name</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Schedule name</Text>
                        <View style={s.dateFieldRow}>
                            <Feather name="tag" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                            <TextInput
                                style={s.textInputField}
                                value={d.name}
                                onChangeText={t => setD(prev => ({ ...prev, name: t }))}
                                placeholder="e.g. Sunday Dinner"
                                placeholderTextColor="#9CA3AF"
                                maxLength={60}
                            />
                        </View>
                    </View>

                    {/* Where */}
                    <View style={s.sectionCard}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, s.sectionIconChipBlue]}>
                                <Feather name="map-pin" size={16} color="#4A90E2" />
                            </View>
                            <Text style={s.sectionTitle}>Where</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Location or link</Text>
                        <LocationField
                            variant="wizard"
                            placeholder="e.g. 123 Main St or zoom.us/j/..."
                            value={d.location}
                            onPress={() => setIsLocationSearchOpen(true)}
                        />
                    </View>

                    {/* When */}
                    <View style={s.sectionCard}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, s.sectionIconChipAmber]}>
                                <Feather name="calendar" size={16} color="#F59E0B" />
                            </View>
                            <Text style={s.sectionTitle}>When</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst]}>How often?</Text>
                        <TouchableOpacity style={s.dateFieldRow}
                            onPress={() => upd({ showFreqPicker: !d.showFreqPicker, showStartDatePicker: false, showTZPicker: false })}>
                            <Feather name="repeat" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                            <Text style={d.frequency ? s.dateFieldText : s.dayPickerPlaceholder}>
                                {d.frequency ? FREQ_LABELS[d.frequency] : "Select frequency"}
                            </Text>
                            <Feather name={d.showFreqPicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                        </TouchableOpacity>
                        {d.showFreqPicker && (
                            <View style={s.inlineDayPicker}>
                                {(["daily", "weekly", "biweekly", "monthly", "custom"] as Frequency[]).map(f => (
                                    <TouchableOpacity key={f} style={[s.dayOption, d.frequency === f && s.dayOptionActive]}
                                        onPress={() => selectFreq(f)}>
                                        <Text style={[s.dayOptionText, d.frequency === f && s.dayOptionTextActive]}>{FREQ_LABELS[f]}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {d.frequency === "daily" && renderDailyOptions()}
                        {d.frequency === "weekly" && renderWeekdayRows(false)}
                        {d.frequency === "biweekly" && renderWeekdayRows(true)}
                        {d.frequency === "monthly" && renderMonthlyOptions()}
                        {d.frequency === "custom" && renderCustomOptions()}

                        {/* Start Date — hidden for biweekly, where each day already asks for its own start date */}
                        {d.frequency !== "biweekly" && (
                            <>
                                <Text style={s.fieldLabel}>Start date</Text>
                                <TouchableOpacity style={s.dateFieldRow}
                                    onPress={() => upd({ showStartDatePicker: !d.showStartDatePicker, showFreqPicker: false, showTZPicker: false })}>
                                    <Feather name="calendar" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                                    <Text style={s.dateFieldText}>{DateTime.fromISO(d.startDate).toLocaleString(DateTime.DATE_FULL)}</Text>
                                    <Feather name={d.showStartDatePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                                </TouchableOpacity>
                                {d.showStartDatePicker && (
                                    <InlineCalendar value={d.startDate}
                                        onChange={iso => upd({ startDate: iso, showStartDatePicker: false })}
                                        minDate={DateTime.now().toISODate()!} />
                                )}
                            </>
                        )}
                    </View>

                    {/* RSVP Rules */}
                    <View style={s.sectionCard}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, s.sectionIconChipViolet]}>
                                <Feather name="bell" size={16} color="#7C3AED" />
                            </View>
                            <Text style={s.sectionTitle}>RSVP Rules</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Limit when people can RSVP?</Text>
                        <View style={s.boolRow}>
                            <TouchableOpacity style={[s.boolBtn, !d.rsvpRestricted && s.boolBtnActive]}
                                onPress={() => upd({ rsvpRestricted: false })}>
                                <Text style={[s.boolBtnText, !d.rsvpRestricted && s.boolBtnTextActive]}>Allow anytime</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.boolBtn, d.rsvpRestricted && s.boolBtnActive]}
                                onPress={() => upd({ rsvpRestricted: true })}>
                                <Text style={[s.boolBtnText, d.rsvpRestricted && s.boolBtnTextActive]}>Limit RSVPs</Text>
                            </TouchableOpacity>
                        </View>

                        {d.rsvpRestricted && (
                            <View style={{ marginTop: 14, gap: 14 }}>
                                <View>
                                    <View style={s.toggleRow}>
                                        <View style={s.toggleRowLabelWrap}>
                                            <Text style={s.toggleRowLabel}>Earliest time to RSVP</Text>
                                            <InfoBubble
                                                title="Earliest time to RSVP"
                                                description={"This sets the earliest time and day people can respond.\n\nIt's a number of days before the meetup, at a specific time.\n\nTurn it off to allow RSVPs as soon as the meetup is created."}
                                            />
                                        </View>
                                        <ToggleSwitch value={d.leadEnabled} onValueChange={v => {
                                            const leadDays = v && d.deadlineEnabled && d.leadDays < d.deadlineDays ? d.deadlineDays : d.leadDays;
                                            const sameDayViolation = v && d.deadlineEnabled && leadDays === d.deadlineDays && timeToMinutes(d.leadTime) > timeToMinutes(d.deadlineTime);
                                            upd({
                                                leadEnabled: v,
                                                leadDays,
                                                ...(sameDayViolation ? { leadTime: d.deadlineTime } : {}),
                                            });
                                        }} />
                                    </View>
                                    {d.leadEnabled && (
                                        <View style={{ marginTop: 10 }}>
                                            <View style={s.leadRow}>
                                                <TouchableOpacity style={s.stepperBtn} onPress={() => {
                                                    const leadDays = Math.max(d.deadlineEnabled ? d.deadlineDays : 0, d.leadDays - 1);
                                                    const sameDayViolation = d.deadlineEnabled && leadDays === d.deadlineDays && timeToMinutes(d.leadTime) > timeToMinutes(d.deadlineTime);
                                                    upd({ leadDays, ...(sameDayViolation ? { leadTime: d.deadlineTime } : {}) });
                                                }}>
                                                    <Feather name="minus" size={18} color="#4A90E2" />
                                                </TouchableOpacity>
                                                <View style={s.leadCenter}>
                                                    <Text style={s.leadVal}>{d.leadDays}</Text>
                                                    <Text style={s.leadSub}>days before</Text>
                                                </View>
                                                <TouchableOpacity style={s.stepperBtn} onPress={() => upd({ leadDays: d.leadDays + 1 })}>
                                                    <Feather name="plus" size={18} color="#4A90E2" />
                                                </TouchableOpacity>
                                            </View>
                                            <Text style={s.fieldLabel}>Time</Text>
                                            <TouchableOpacity style={s.dateFieldRow}
                                                onPress={() => upd({ showLeadTimePicker: !d.showLeadTimePicker, showDeadlineTimePicker: false, showStartDatePicker: false, showFreqPicker: false, showTZPicker: false })}>
                                                <Feather name="clock" size={16} color="#9CA3AF" style={{ marginRight: 10 }} />
                                                <Text style={s.dateFieldText}>{d.leadTime}</Text>
                                                <Feather name={d.showLeadTimePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    {d.leadEnabled && d.showLeadTimePicker && (
                                        <NativeTimePicker value={d.leadTime} onChange={t => {
                                            const capped = d.deadlineEnabled && d.leadDays === d.deadlineDays && timeToMinutes(t) > timeToMinutes(d.deadlineTime);
                                            if (capped) {
                                                Alert.alert(
                                                    "Earliest RSVP time must be before the latest RSVP time",
                                                    `• Both are ${d.leadDays} day${d.leadDays === 1 ? '' : 's'} before the meetup\n• Earliest time can't be later than ${d.deadlineTime}\n• Earliest time set to ${d.deadlineTime}`
                                                );
                                            }
                                            upd({ leadTime: capped ? d.deadlineTime : t });
                                        }}
                                            onClose={() => upd({ showLeadTimePicker: false })} />
                                    )}
                                </View>

                                <View>
                                    <View style={s.toggleRow}>
                                        <View style={s.toggleRowLabelWrap}>
                                            <Text style={s.toggleRowLabel}>Latest time to RSVP</Text>
                                            <InfoBubble
                                                title="Latest time to RSVP"
                                                description={"This sets the cutoff for responding.\n\nIt's a number of days before the meetup, at a specific time.\n\nTurn it off to allow RSVPs right up until the meetup starts."}
                                            />
                                        </View>
                                        <ToggleSwitch value={d.deadlineEnabled} onValueChange={v => {
                                            const deadlineDays = v && d.leadEnabled && d.deadlineDays > d.leadDays ? d.leadDays : d.deadlineDays;
                                            const sameDayViolation = v && d.leadEnabled && deadlineDays === d.leadDays && timeToMinutes(d.deadlineTime) < timeToMinutes(d.leadTime);
                                            upd({
                                                deadlineEnabled: v,
                                                deadlineDays,
                                                ...(sameDayViolation ? { deadlineTime: d.leadTime } : {}),
                                            });
                                        }} />
                                    </View>
                                    {d.deadlineEnabled && (
                                        <View style={{ marginTop: 10 }}>
                                            <View style={s.leadRow}>
                                                <TouchableOpacity style={s.stepperBtn} onPress={() => upd({ deadlineDays: Math.max(0, d.deadlineDays - 1) })}>
                                                    <Feather name="minus" size={18} color="#4A90E2" />
                                                </TouchableOpacity>
                                                <View style={s.leadCenter}>
                                                    <Text style={s.leadVal}>{d.deadlineDays}</Text>
                                                    <Text style={s.leadSub}>days before</Text>
                                                </View>
                                                <TouchableOpacity style={s.stepperBtn} onPress={() => {
                                                    const deadlineDays = d.leadEnabled ? Math.min(d.leadDays, d.deadlineDays + 1) : d.deadlineDays + 1;
                                                    const sameDayViolation = d.leadEnabled && deadlineDays === d.leadDays && timeToMinutes(d.deadlineTime) < timeToMinutes(d.leadTime);
                                                    upd({ deadlineDays, ...(sameDayViolation ? { deadlineTime: d.leadTime } : {}) });
                                                }}>
                                                    <Feather name="plus" size={18} color="#4A90E2" />
                                                </TouchableOpacity>
                                            </View>
                                            <Text style={s.fieldLabel}>Time</Text>
                                            <TouchableOpacity style={s.dateFieldRow}
                                                onPress={() => upd({ showDeadlineTimePicker: !d.showDeadlineTimePicker, showLeadTimePicker: false, showStartDatePicker: false, showFreqPicker: false, showTZPicker: false })}>
                                                <Feather name="clock" size={16} color="#9CA3AF" style={{ marginRight: 10 }} />
                                                <Text style={s.dateFieldText}>{d.deadlineTime}</Text>
                                                <Feather name={d.showDeadlineTimePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    {d.deadlineEnabled && d.showDeadlineTimePicker && (
                                        <NativeTimePicker value={d.deadlineTime} onChange={t => {
                                            const capped = d.leadEnabled && d.deadlineDays === d.leadDays && timeToMinutes(t) < timeToMinutes(d.leadTime);
                                            if (capped) {
                                                Alert.alert(
                                                    "Latest RSVP time must be after the earliest RSVP time",
                                                    `• Both are ${d.deadlineDays} day${d.deadlineDays === 1 ? '' : 's'} before the meetup\n• Latest time can't be earlier than ${d.leadTime}\n• Latest time set to ${d.leadTime}`
                                                );
                                            }
                                            upd({ deadlineTime: capped ? d.leadTime : t });
                                        }}
                                            onClose={() => upd({ showDeadlineTimePicker: false })} />
                                    )}
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Capacity */}
                    <View style={[s.sectionCard, { marginBottom: 8 }]}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, s.sectionIconChipTeal]}>
                                <Feather name="users" size={16} color="#0D9488" />
                            </View>
                            <Text style={s.sectionTitle}>Capacity</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Max Attendees</Text>
                        <View style={s.boolRow}>
                            <TouchableOpacity
                                style={[s.boolBtn, d.maxAttendeesMode === "unlimited" && s.boolBtnActive]}
                                onPress={() => upd({ maxAttendeesMode: "unlimited", maxAttendeesInput: "" })}
                            >
                                <Text style={[s.boolBtnText, d.maxAttendeesMode === "unlimited" && s.boolBtnTextActive]}>Unlimited</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.boolBtn, d.maxAttendeesMode === "limited" && s.boolBtnActive]}
                                onPress={() => upd({ maxAttendeesMode: "limited" })}
                            >
                                <Text style={[s.boolBtnText, d.maxAttendeesMode === "limited" && s.boolBtnTextActive]}>Limited</Text>
                            </TouchableOpacity>
                        </View>
                        {d.maxAttendeesMode === "limited" && (() => {
                            const maxAttendeesError = getMaxAttendeesError(d.maxAttendeesMode, d.maxAttendeesInput);
                            return (
                                <View style={{ marginTop: 10 }}>
                                    <View style={[s.inputRow, { marginBottom: 0 }, maxAttendeesError && s.inputRowError]}>
                                        <Feather name="users" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
                                        <TextInput
                                            style={s.inlineInput}
                                            placeholder="How many?"
                                            placeholderTextColor="#C4C9D4"
                                            keyboardType="number-pad"
                                            value={d.maxAttendeesInput}
                                            onChangeText={v => upd({ maxAttendeesInput: v })}
                                        />
                                    </View>
                                    {maxAttendeesError && <Text style={s.errorText}>{maxAttendeesError}</Text>}
                                </View>
                            );
                        })()}
                    </View>
                </ScrollView>

                <LocationSearchModal
                    visible={isLocationSearchOpen}
                    initialValue={d.location}
                    placeholder="e.g. 123 Main St or zoom.us/j/..."
                    onDone={(text) => { upd({ location: text }); setIsLocationSearchOpen(false); }}
                    onCancel={() => setIsLocationSearchOpen(false)}
                />

                {d.showTZPicker && (
                    <OptionPickerModal
                        title="Timezone"
                        options={USA_TIMEZONES.map(tz => ({ key: tz.value, label: tz.label }))}
                        selectedKey={d.timezone}
                        onSelect={key => upd({ timezone: key, showTZPicker: false })}
                        onClose={() => upd({ showTZPicker: false })}
                    />
                )}

                <View style={s.screenFooter}>
                    {!isNew && (
                        <TouchableOpacity style={s.deleteBtn} onPress={handleDelete} disabled={isDeleting}>
                            {isDeleting
                                ? <ActivityIndicator color="#EF4444" size="small" />
                                : <Feather name="trash-2" size={18} color="#EF4444" />
                            }
                        </TouchableOpacity>
                    )}
                    {!hasChanged && isScheduleValid() && (
                        <Text style={s.noChangeHint}>No changes yet</Text>
                    )}
                    <TouchableOpacity
                        style={[s.primaryBtn, !saveEnabled && s.primaryBtnDisabled]}
                        onPress={handleSave}
                        disabled={!saveEnabled}
                    >
                        {isSaving
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <><Text style={s.primaryBtnText}>{isNew ? "Create Schedule" : "Save Changes"}</Text><Feather name="check" size={18} color="#fff" style={{ marginLeft: 6 }} /></>
                        }
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
};

export default EditScheduleScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#F9FAFB" },
    screen: { flex: 1 },
    screenHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F3F4F6", backgroundColor: "#fff" },
    headerTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
    screenSub: { fontSize: 13, color: "#9CA3AF", marginBottom: 8, marginTop: 12, lineHeight: 18 },
    screenFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#F3F4F6", backgroundColor: "#fff", gap: 12 },
    noChangeHint: { fontSize: 13, color: "#9CA3AF", fontWeight: "600" },
    deleteBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", marginRight: "auto" },
    iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    textInputField: { flex: 1, fontSize: 15, color: "#374151", fontWeight: "500", padding: 0 },
    fieldLabelFirst: { marginTop: 0 },
    sectionCard: { backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: "#F3F4F6", padding: 18, marginBottom: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
    sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
    sectionIconChip: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
    sectionIconChipBlue: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
    sectionIconChipAmber: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
    sectionIconChipViolet: { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE" },
    sectionIconChipTeal: { backgroundColor: "#ECFDF9", borderColor: "#99E6DA" },
    sectionIconChipIndigo: { backgroundColor: "#EEF2FF", borderColor: "#C7D2FE" },
    tzSection: { marginTop: 2, marginBottom: 24 },
    tzRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    tzPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: "#EEF6FF", borderWidth: 1, borderColor: "#BFDBFE" },
    tzPillText: { fontSize: 13, fontWeight: "800", color: "#4A90E2" },
    sectionTitle: { fontSize: 16, fontWeight: "900", color: "#111827", letterSpacing: -0.2 },
    toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    toggleRowLabelWrap: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, marginRight: 12 },
    toggleRowLabel: { fontSize: 14, fontWeight: "700", color: "#374151" },
    switchTrack: { width: 44, height: 26, borderRadius: 13, padding: 2, justifyContent: "center" },
    switchThumb: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 2, elevation: 2 },
    leadRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    stepperBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
    leadCenter: { alignItems: "center", minWidth: 60 },
    leadVal: { fontSize: 22, fontWeight: "900", color: "#111827" },
    leadSub: { fontSize: 10, color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase" },
    inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
    inputRowError: { borderColor: "#EF4444" },
    inlineInput: { flex: 1, fontSize: 15, color: "#374151" },
    errorText: { fontSize: 12, fontWeight: "600", color: "#EF4444", marginTop: 6, marginLeft: 2 },
    primaryBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#4A90E2", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
    primaryBtnDisabled: { backgroundColor: "#93C5FD" },
    primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
    skipBtn: { paddingHorizontal: 16, paddingVertical: 14 },
    skipBtnText: { color: "#9CA3AF", fontWeight: "700", fontSize: 15 },
    doneBtn: { backgroundColor: "#4A90E2", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
    doneBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
    fieldLabel: { fontSize: 11, fontWeight: "800", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
    dateFieldRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 13, marginBottom: 4 },
    dateFieldText: { fontSize: 15, color: "#374151", fontWeight: "500" },
    expandBox: { backgroundColor: "#F0F7FF", borderRadius: 14, borderWidth: 1.5, borderColor: "#BFDBFE", padding: 14, marginTop: 8 },
    expandBoxTitle: { fontSize: 12, fontWeight: "900", color: "#1D4ED8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
    boolRow: { flexDirection: "row", gap: 10 },
    boolBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB", alignItems: "center", backgroundColor: "#fff" },
    boolBtnActive: { borderColor: "#4A90E2", backgroundColor: "#EEF6FF" },
    boolBtnText: { fontSize: 14, fontWeight: "700", color: "#6B7280" },
    boolBtnTextActive: { color: "#4A90E2" },

    monthlyModeList: { gap: 10 },
    monthlyModeCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, padding: 12 },
    monthlyModeCardActive: { borderColor: "#4A90E2", backgroundColor: "#EEF6FF" },
    monthlyModeRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: "#D1D5DB", alignItems: "center", justifyContent: "center" },
    monthlyModeRadioActive: { borderColor: "#4A90E2" },
    monthlyModeRadioDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: "#4A90E2" },
    monthlyModeIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4F6", marginHorizontal: 10 },
    monthlyModeIconActive: { backgroundColor: "#4A90E2" },
    monthlyModeCopy: { flex: 1 },
    monthlyModeTitle: { fontSize: 14, fontWeight: "700", color: "#374151" },
    monthlyModeTitleActive: { color: "#1D4ED8" },
    monthlyModeExample: { fontSize: 12.5, color: "#9CA3AF", marginTop: 2 },
    dayRow: { flexDirection: "row", alignItems: "center" },
    dayRowLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: "#374151" },
    dayCard: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", borderLeftWidth: 4, borderLeftColor: "#E5E7EB", padding: 14, marginBottom: 10 },
    dayBadge: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginRight: 10 },
    dayBadgeText: { fontSize: 11, fontWeight: "800" },
    inlineDayPicker: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", marginTop: 6, overflow: "hidden" },
    dayPickerTrigger: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 12, paddingVertical: 10 },
    dayPickerText: { fontSize: 14, fontWeight: "600", color: "#374151" },
    dayPickerPlaceholder: { fontSize: 14, color: "#C4C9D4" },
    dayOption: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
    dayOptionActive: { backgroundColor: "#EEF6FF" },
    dayOptionText: { fontSize: 15, color: "#374151" },
    dayOptionTextActive: { color: "#4A90E2", fontWeight: "700" },
    addRowBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 10, marginTop: 4 },
    addRowBtnText: { fontSize: 14, fontWeight: "700", color: "#4A90E2" },
    dateGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    dateBox: { width: 38, height: 38, borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
    dateBoxActive: { backgroundColor: "#4A90E2", borderColor: "#4A90E2" },
    dateBoxText: { fontSize: 13, fontWeight: "600", color: "#374151" },
    dateBoxTextActive: { color: "#fff" },
    ordinalCard: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", padding: 14, marginBottom: 8 },
    ordinalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    collapsedRuleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    collapsedRuleText: { fontSize: 14, fontWeight: "700", color: "#1D4ED8", flex: 1 },
    collapsedRuleActions: { flexDirection: "row", alignItems: "center" },
    routineCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#EEF6FF", borderRadius: 12, borderWidth: 1, borderColor: "#93C5FD", paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
    routineCardLabel: { fontSize: 14, fontWeight: "700", color: "#1D4ED8" },
    routineCardSub: { fontSize: 11, color: "#93C5FD", marginTop: 2 },
});

const cal = StyleSheet.create({
    container: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", padding: 12, marginTop: 6, marginBottom: 4 },
    nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
    monthLabel: { fontSize: 15, fontWeight: "800", color: "#111827" },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    dayHeader: { width: `${100 / 7}%`, textAlign: "center", fontSize: 11, fontWeight: "800", color: "#9CA3AF", marginBottom: 4 },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
    cellSelected: { backgroundColor: "#4A90E2", borderRadius: 100 },
    cellDisabled: { opacity: 0.3 },
    cellText: { fontSize: 14, color: "#374151" },
    cellTextSelected: { color: "#fff", fontWeight: "800" },
    cellTextDisabled: { color: "#D1D5DB" },
});
