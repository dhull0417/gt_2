import React, { useState, useMemo, useCallback, useRef } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Alert,
    Platform,
    ActivityIndicator,
    LayoutAnimation,
    UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { DateTime } from "luxon";
import { useQueryClient } from "@tanstack/react-query";
import { useGetGroupDetails } from "../../hooks/useGetGroupDetails";
import { useApiClient, GroupDetails, Frequency, DayTime, Routine } from "../../utils/api";
import TimePicker from "../../components/TimePicker";

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

const FREQ_LABELS: Record<string, string> = {
    daily: "Daily", weekly: "Weekly", biweekly: "Bi-Weekly",
    monthly: "Monthly", custom: "Multiple Rules",
};

const uid = () => Math.random().toString(36).slice(2);
const ordSfx = (n: number) => n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

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
    let topFreq: Frequency = d.frequency;

    if (d.frequency === "custom") {
        routines = d.builtRoutines.map(r => ({ frequency: r.frequency, dayTimes: r.dayTimes, rules: r.rules }));
    } else if (d.frequency === "daily") {
        const dayTimes = d.dailySameTime
            ? DAYS_OF_WEEK.map(dw => ({ day: dw.value, time: d.dailySharedTime }))
            : d.dailyRows.map(r => ({ day: r.day!, time: r.time }));
        routines = [{ frequency: "daily", dayTimes }];
    } else if (d.frequency === "weekly" || d.frequency === "biweekly") {
        routines = [{ frequency: d.frequency, dayTimes: d.weekdayRows.filter(r => r.day !== null).map(r => ({ day: r.day!, time: r.time })) }];
    } else if (d.frequency === "monthly") {
        if (d.monthlyMode === "date") {
            routines = [{ frequency: "monthly", dayTimes: d.monthlyDates.map(e => ({ date: e.date, time: e.time })) }];
        } else if (d.monthlyMode === "ordinal") {
            topFreq = "ordinal" as Frequency;
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
        schedule: { frequency: topFreq, startDate: d.startDate, routines },
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
                id: uid(), day: dt.day ?? null, time: dt.time, startDate: null,
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

// ─── Convert GroupDetails → ScheduleData ─────────────────────────────────────

const scheduleFromGroup = (group: GroupDetails): ScheduleData => {
    const base = defaultSchedule();
    const sched = group.schedule;
    const tz = group.timezone || "America/Denver";

    const routines = (sched?.routines ?? []) as Routine[];

    // schedule.frequency is not persisted by the backend schema — infer it from routines
    if (!routines.length) {
        return { ...base, timezone: tz };
    }

    const startDate = sched?.startDate
        ? DateTime.fromISO(sched.startDate as unknown as string).toISODate() ?? DateTime.now().toISODate()!
        : DateTime.now().toISODate()!;

    const inferredFreq = routines.length > 1 ? "custom" : routines[0].frequency;

    if (inferredFreq === "custom") {
        return {
            ...base, timezone: tz, startDate,
            frequency: "custom",
            builtRoutines: routines.map(apiRoutineToBuiltRoutine),
        };
    }

    if (inferredFreq === "daily" && routines[0]) {
        const dts = routines[0].dayTimes;
        const allSame = dts.length > 0 && dts.every(dt => dt.time === dts[0].time);
        return {
            ...base, timezone: tz, startDate, frequency: "daily",
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
            ...base, timezone: tz, startDate, frequency: inferredFreq,
            weekdayRows: routines[0].dayTimes.map(dt => ({
                id: uid(), day: dt.day ?? null, time: dt.time,
                startDate: DateTime.now().toISODate()!,
                showTimePicker: false, showDayPicker: false, showStartDatePicker: false,
            })),
        };
    }

    if (inferredFreq === "monthly" && routines[0]) {
        return {
            ...base, timezone: tz, startDate, frequency: "monthly",
            monthlyMode: "date",
            monthlyDates: routines[0].dayTimes.map(dt => ({
                id: uid(), date: dt.date ?? 1, time: dt.time, expanded: false, showTimePicker: false,
            })),
        };
    }

    if (inferredFreq === "ordinal" && routines[0]) {
        const routine = routines[0];
        return {
            ...base, timezone: tz, startDate, frequency: "monthly",
            monthlyMode: "ordinal",
            ordinalEntries: (routine.rules ?? []).map((rule, i) => ({
                id: uid(),
                occurrence: rule.occurrence || "1st",
                day: rule.day ?? 1,
                time: routine.dayTimes[i]?.time || "05:00 PM",
                expanded: false, showTimePicker: false,
            })),
        };
    }

    return { ...base, timezone: tz, startDate };
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

// ─── TimeButton ───────────────────────────────────────────────────────────────

const TimeButton = ({ time, onPress, active }: { time: string; onPress: () => void; active: boolean }) => (
    <TouchableOpacity onPress={onPress} style={[s.timeBtn, active && s.timeBtnActive]}>
        <Feather name="clock" size={12} color={active ? "#fff" : "#4A90E2"} style={{ marginRight: 4 }} />
        <Text style={[s.timeBtnText, active && s.timeBtnTextActive]}>{time}</Text>
    </TouchableOpacity>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

const EditScheduleScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const api = useApiClient();
    const queryClient = useQueryClient();

    const { data: group, isLoading } = useGetGroupDetails(id);
    const [isSaving, setIsSaving] = useState(false);

    // Initialized once when group data arrives
    const originalRef = useRef<ScheduleData | null>(null);
    const [d, setD] = useState<ScheduleData>(defaultSchedule());
    const initialized = useRef(false);

    // Pre-populate from group data the first time it loads
    React.useEffect(() => {
        if (group && !initialized.current) {
            initialized.current = true;
            const initial = scheduleFromGroup(group);
            originalRef.current = initial;
            setD(initial);
        }
    }, [group]);

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
            ordinalEntries: [...prev.ordinalEntries, { id: uid(), occurrence: "1st", day: 1, time: "05:00 PM", expanded: true, showTimePicker: false }],
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
            dayTimes = d.weekdayRows.filter(r => r.day !== null).map(r => ({ day: r.day!, time: r.time }));
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
                ordinalEntries: d.ordinalEntries.map(e => ({ ...e, expanded: false, showTimePicker: false })),
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
            await api.patch(`/api/groups/${id}/schedule`, payload);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["groupDetails", id] }),
                queryClient.invalidateQueries({ queryKey: ["meetups"] }),
                queryClient.invalidateQueries({ queryKey: ["groups"] }),
            ]);
            Alert.alert("Schedule updated", "Future meetups have been regenerated.", [
                { text: "OK", onPress: () => router.navigate("/(tabs)/groups") },
            ]);
        } catch (err: any) {
            Alert.alert("Error", err?.response?.data?.error || "Failed to update schedule.");
        } finally {
            setIsSaving(false);
        }
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
                    <TimeButton time={d.dailySharedTime} active={d.showDailySameTimePicker}
                        onPress={() => upd({ showDailySameTimePicker: !d.showDailySameTimePicker })} />
                    {d.showDailySameTimePicker && (
                        <View style={s.inlinePickerBox}>
                            <TimePicker initialValue={d.dailySharedTime} onTimeChange={t => upd({ dailySharedTime: t })} />
                        </View>
                    )}
                </View>
            )}

            {d.dailySameTime === false && (
                <View style={{ marginTop: 12, gap: 8 }}>
                    {d.dailyRows.map(row => (
                        <View key={row.id}>
                            <View style={s.dayRow}>
                                <Text style={s.dayRowLabel}>{DAYS_OF_WEEK.find(dw => dw.value === row.day)?.label}</Text>
                                <TimeButton time={row.time} active={row.showTimePicker}
                                    onPress={() => setD(prev => ({
                                        ...prev,
                                        dailyRows: prev.dailyRows.map(r =>
                                            r.id === row.id
                                                ? { ...r, showTimePicker: !r.showTimePicker }
                                                : { ...r, showTimePicker: false }
                                        ),
                                    }))} />
                            </View>
                            {row.showTimePicker && (
                                <View style={s.inlinePickerBox}>
                                    <TimePicker initialValue={row.time}
                                        onTimeChange={t => setD(prev => ({
                                            ...prev,
                                            dailyRows: prev.dailyRows.map(r => r.id === row.id ? { ...r, time: t } : r),
                                        }))} />
                                </View>
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
                <View key={row.id} style={{ marginBottom: 14 }}>
                    <View style={s.dayRow}>
                        <TouchableOpacity style={s.dayPickerTrigger}
                            onPress={() => updWeekdayRow(row.id, { showDayPicker: !row.showDayPicker, showTimePicker: false, showStartDatePicker: false })}>
                            <Text style={row.day !== null ? s.dayPickerText : s.dayPickerPlaceholder}>
                                {row.day !== null ? DAYS_OF_WEEK.find(dw => dw.value === row.day)?.label : "Select day"}
                            </Text>
                            <Feather name="chevron-down" size={14} color="#9CA3AF" />
                        </TouchableOpacity>
                        {row.day !== null && (
                            <TimeButton time={row.time} active={row.showTimePicker}
                                onPress={() => updWeekdayRow(row.id, { showTimePicker: !row.showTimePicker, showDayPicker: false, showStartDatePicker: false })} />
                        )}
                        <TouchableOpacity onPress={() => removeWeekdayRow(row.id)} style={{ marginLeft: 8 }}>
                            <Feather name="trash-2" size={16} color="#F87171" />
                        </TouchableOpacity>
                    </View>

                    {row.showDayPicker && (
                        <View style={s.inlineDayPicker}>
                            {DAYS_OF_WEEK.map(dw => (
                                <TouchableOpacity key={dw.value}
                                    style={[s.dayOption, row.day === dw.value && s.dayOptionActive]}
                                    onPress={() => updWeekdayRow(row.id, { day: dw.value, showDayPicker: false, showTimePicker: true })}>
                                    <Text style={[s.dayOptionText, row.day === dw.value && s.dayOptionTextActive]}>{dw.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {row.showTimePicker && (
                        <View style={s.inlinePickerBox}>
                            <TimePicker initialValue={row.time}
                                onTimeChange={t => updWeekdayRow(row.id, { time: t })} />
                        </View>
                    )}

                    {isBiweekly && row.day !== null && (
                        <View style={{ marginTop: 8 }}>
                            <TouchableOpacity style={s.dateFieldRow}
                                onPress={() => updWeekdayRow(row.id, { showStartDatePicker: !row.showStartDatePicker, showTimePicker: false, showDayPicker: false })}>
                                <Feather name="calendar" size={14} color="#4A90E2" style={{ marginRight: 6 }} />
                                <Text style={s.dateFieldText}>
                                    {row.startDate ? DateTime.fromISO(row.startDate).toLocaleString(DateTime.DATE_MED) : "Set first occurrence date"}
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
                    <View style={[s.dayRow, { marginTop: 10 }]}>
                        <TimeButton time={entry.time} active={entry.showTimePicker}
                            onPress={() => updMonthlyDate(entry.id, { showTimePicker: !entry.showTimePicker })} />
                        <TouchableOpacity style={[s.doneBtn, { marginLeft: "auto" }]}
                            onPress={() => updMonthlyDate(entry.id, { expanded: false, showTimePicker: false })}>
                            <Text style={s.doneBtnText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                    {entry.showTimePicker && (
                        <View style={s.inlinePickerBox}>
                            <TimePicker initialValue={entry.time}
                                onTimeChange={t => updMonthlyDate(entry.id, { time: t })} />
                        </View>
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
                        <Text style={s.fieldLabel}>Occurrence</Text>
                        <TouchableOpacity onPress={() => removeOrdinal(entry.id)}>
                            <Feather name="trash-2" size={16} color="#F87171" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                        {ORDINAL_OCCURRENCES.map(occ => (
                            <TouchableOpacity key={occ} style={[s.ordinalChip, entry.occurrence === occ && s.ordinalChipActive]}
                                onPress={() => updOrdinal(entry.id, { occurrence: occ })}>
                                <Text style={[s.ordinalChipText, entry.occurrence === occ && s.ordinalChipTextActive]}>{occ}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <Text style={s.fieldLabel}>Day of week</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                        {DAYS_OF_WEEK.map(dw => (
                            <TouchableOpacity key={dw.value} style={[s.ordinalChip, entry.day === dw.value && s.ordinalChipActive]}
                                onPress={() => updOrdinal(entry.id, { day: dw.value })}>
                                <Text style={[s.ordinalChipText, entry.day === dw.value && s.ordinalChipTextActive]}>{dw.short}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <View style={s.dayRow}>
                        <TimeButton time={entry.time} active={entry.showTimePicker}
                            onPress={() => updOrdinal(entry.id, { showTimePicker: !entry.showTimePicker })} />
                        <TouchableOpacity style={[s.doneBtn, { marginLeft: "auto" }]}
                            onPress={() => updOrdinal(entry.id, { expanded: false, showTimePicker: false })}>
                            <Text style={s.doneBtnText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                    {entry.showTimePicker && (
                        <View style={s.inlinePickerBox}>
                            <TimePicker initialValue={entry.time}
                                onTimeChange={t => updOrdinal(entry.id, { time: t })} />
                        </View>
                    )}
                </View>
            )}
        </View>
    );

    const renderMonthlyOptions = () => (
        <View style={s.expandBox}>
            <Text style={s.expandBoxTitle}>Monthly Options</Text>
            <Text style={s.fieldLabel}>Recur by</Text>
            <View style={s.boolRow}>
                <TouchableOpacity style={[s.boolBtn, d.monthlyMode === "date" && s.boolBtnActive]}
                    onPress={() => upd({ monthlyMode: "date" })}>
                    <Text style={[s.boolBtnText, d.monthlyMode === "date" && s.boolBtnTextActive]}>Date number</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.boolBtn, d.monthlyMode === "ordinal" && s.boolBtnActive]}
                    onPress={() => upd({ monthlyMode: "ordinal" })}>
                    <Text style={[s.boolBtnText, d.monthlyMode === "ordinal" && s.boolBtnTextActive]}>Pattern</Text>
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
                    <ActivityIndicator size="large" color="#4A90E2" />
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
                    <Text style={s.headerTitle}>Edit Schedule</Text>
                    <View style={{ width: 36 }} />
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={s.screenSub}>Changes will delete future meetups and regenerate them from the new schedule.</Text>

                    {/* Start Date */}
                    <Text style={s.fieldLabel}>Start date</Text>
                    <TouchableOpacity style={s.dateFieldRow}
                        onPress={() => upd({ showStartDatePicker: !d.showStartDatePicker, showTZPicker: false, showFreqPicker: false })}>
                        <Feather name="calendar" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                        <Text style={s.dateFieldText}>{DateTime.fromISO(d.startDate).toLocaleString(DateTime.DATE_FULL)}</Text>
                        <Feather name={d.showStartDatePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                    </TouchableOpacity>
                    {d.showStartDatePicker && (
                        <InlineCalendar value={d.startDate}
                            onChange={iso => upd({ startDate: iso, showStartDatePicker: false })}
                            minDate={DateTime.now().toISODate()!} />
                    )}

                    {/* Timezone */}
                    <Text style={s.fieldLabel}>Timezone</Text>
                    <TouchableOpacity style={s.dateFieldRow}
                        onPress={() => upd({ showTZPicker: !d.showTZPicker, showStartDatePicker: false, showFreqPicker: false })}>
                        <Feather name="globe" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                        <Text style={s.dateFieldText}>{USA_TIMEZONES.find(t => t.value === d.timezone)?.label || d.timezone}</Text>
                        <Feather name={d.showTZPicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                    </TouchableOpacity>
                    {d.showTZPicker && (
                        <View style={s.inlineDayPicker}>
                            {USA_TIMEZONES.map(tz => (
                                <TouchableOpacity key={tz.value} style={[s.dayOption, d.timezone === tz.value && s.dayOptionActive]}
                                    onPress={() => upd({ timezone: tz.value, showTZPicker: false })}>
                                    <Text style={[s.dayOptionText, d.timezone === tz.value && s.dayOptionTextActive]}>{tz.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Frequency */}
                    <Text style={s.fieldLabel}>How often?</Text>
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
                </ScrollView>

                <View style={s.screenFooter}>
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
                            : <><Text style={s.primaryBtnText}>Save Changes</Text><Feather name="check" size={18} color="#fff" style={{ marginLeft: 6 }} /></>
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
    iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
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
    dayRow: { flexDirection: "row", alignItems: "center" },
    dayRowLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: "#374151" },
    timeBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: "#93C5FD", backgroundColor: "#EFF6FF", marginLeft: "auto" },
    timeBtnActive: { backgroundColor: "#4A90E2", borderColor: "#4A90E2" },
    timeBtnText: { fontSize: 12, fontWeight: "700", color: "#4A90E2" },
    timeBtnTextActive: { color: "#fff" },
    inlinePickerBox: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", padding: 8, width: "100%", marginTop: 8 },
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
    ordinalChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: "#E5E7EB", marginRight: 6, backgroundColor: "#fff" },
    ordinalChipActive: { borderColor: "#4A90E2", backgroundColor: "#EEF6FF" },
    ordinalChipText: { fontSize: 13, fontWeight: "700", color: "#6B7280" },
    ordinalChipTextActive: { color: "#4A90E2" },
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
