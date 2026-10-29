import React, { useState, useMemo, useCallback, useRef } from "react";
import {
    View,
    Text,
    TextInput,
    ScrollView,
    StyleSheet,
    Alert,
    Platform,
    ActivityIndicator,
    LayoutAnimation,
    UIManager,
    Switch,
    KeyboardAvoidingView,
} from "react-native";
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { DAYS_OF_WEEK, DAY_COLORS_LIGHT, ORDINAL_OCCURRENCES, FREQ_LABELS, uid, ordSfx, timeToMinutes, getMaxAttendeesError } from '@/utils/scheduleConstants';
import { timezoneOptions, tzAbbr } from '@/utils/timezones';
import { toast } from '@/contexts/ToastContext';
import { haptic } from '@/utils/haptics';
import { getMinAttendeesError, WeekdayRow, MonthlyDateEntry, OrdinalEntry, BuiltRoutine, newBringItemKey, getBringItemsError, ScheduleData, defaultSchedule, buildLabel, buildSchedulePayload, scheduleFromNamedSchedule } from '@/utils/editScheduleDraft';
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { DateTime } from "luxon";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { useGetGroupDetails } from "../../hooks/useGetGroupDetails";
import { useApiClient, groupApi, Frequency, DayTime } from "../../utils/api";
import { broadcastGroupUpdate, broadcastMeetupUpdate } from "../../utils/groupRealtime";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import NativeTimePicker from "../../components/NativeTimePicker";
import OptionPickerModal from "../../components/OptionPickerModal";
import LocationField from "@/components/LocationField";
import LocationSearchModal from "@/components/LocationSearchModal";
import InfoBubble from "@/components/InfoBubble";
import { useAppearance, useThemeColors } from "@/contexts/AppearanceContext";
import { UpgradeButton } from '@/components/UpgradeButton';

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Constants ────────────────────────────────────────────────────────────────


// Friday (pink) has no established pastel-chip dark equivalent elsewhere in the
// app; #3D1530 extrapolates the same treatment used for the other named hues.
const DAY_COLORS_DARK: { bg: string; fg: string }[] = [
    { bg: "#3B1E1E", fg: "#DC2626" }, // Sunday (red)
    { bg: "#1A2A42", fg: "#2563EB" }, // Monday (blue)
    { bg: "#241B3D", fg: "#7C3AED" }, // Tuesday (purple)
    { bg: "#132A1E", fg: "#059669" }, // Wednesday (green)
    { bg: "#3A2E12", fg: "#D97706" }, // Thursday (amber)
    { bg: "#3D1530", fg: "#DB2777" }, // Friday (pink, extrapolated)
    { bg: "#123338", fg: "#0891B2" }, // Saturday (cyan)
];





const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);



// ─── InlineCalendar ───────────────────────────────────────────────────────────

const InlineCalendar = ({ value, onChange, minDate }: {
    value: string; onChange: (iso: string) => void; minDate?: string;
}) => {
    const colors = useThemeColors();
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
        <View style={[cal.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={cal.nav}>
                <PressableOpacity onPress={() => setMonth(m => m.minus({ months: 1 }))} style={[cal.navBtn, { backgroundColor: colors.brandSoft }]}>
                    <Feather name="chevron-left" size={18} color={colors.brand} />
                </PressableOpacity>
                <Text style={[cal.monthLabel, { color: colors.textPrimary }]}>{month.toFormat("MMMM yyyy")}</Text>
                <PressableOpacity onPress={() => setMonth(m => m.plus({ months: 1 }))} style={[cal.navBtn, { backgroundColor: colors.brandSoft }]}>
                    <Feather name="chevron-right" size={18} color={colors.brand} />
                </PressableOpacity>
            </View>
            <View style={cal.grid}>
                {["S","M","T","W","T","F","S"].map((d, i) => (
                    <Text key={i} style={[cal.dayHeader, { color: colors.textFaint }]}>{d}</Text>
                ))}
                {grid.map((day, i) => {
                    if (!day) return <View key={`e-${i}`} style={cal.cell} />;
                    const iso = day.toISODate()!;
                    const selected = iso === value;
                    const disabled = day < minDT;
                    return (
                        <PressableOpacity
                            key={iso}
                            style={[cal.cell, selected && cal.cellSelected, selected && { backgroundColor: colors.brand }, disabled && cal.cellDisabled]}
                            onPress={() => !disabled && onChange(iso)}
                            disabled={disabled}
                        >
                            <Text style={[cal.cellText, { color: colors.textSecondary }, selected && cal.cellTextSelected, disabled && { color: colors.borderStrong }]}>
                                {day.day}
                            </Text>
                        </PressableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

const EditScheduleScreen = () => {
    const { id, scheduleId: rawScheduleId } = useLocalSearchParams<{ id: string; scheduleId?: string }>();
    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const isDark = scheme === "dark";
    // Pastel icon-chip backgrounds adapt by scheme while keeping the same hue family
    // (exact dark equivalents established elsewhere in the app for these named hues).
    const chipBlueBg = isDark ? "#1A2A42" : "#EFF6FF";
    const chipBlueBorder = isDark ? "#2C4870" : "#BFDBFE";
    const chipAmberBg = isDark ? "#3A2E12" : "#FFFBEB";
    const chipAmberBorder = isDark ? "#5C4A1E" : "#FDE68A";
    const chipPurpleBg = isDark ? "#241B3D" : "#F5F3FF";
    const chipPurpleBorder = isDark ? "#3B2E63" : "#DDD6FE";
    const chipTealBg = isDark ? "#123330" : "#ECFDF9";
    const chipTealBorder = isDark ? "#1F5B54" : "#99E6DA";
    const chipIndigoBg = isDark ? "#1E2340" : "#EEF2FF";
    const chipIndigoBorder = isDark ? "#333B6B" : "#C7D2FE";
    const deleteChipBg = isDark ? "#3B1E1E" : "#FEF2F2";
    const deleteChipBorder = isDark ? "#5C2E2E" : "#FECACA";
    // Blue border/text used for the "highlighted" recurrence panels and active blue
    // labels below — extrapolated dark equivalents (no exact dark token exists for
    // these particular light blues elsewhere in the app).
    const blueBorder = isDark ? "#2C4870" : "#BFDBFE";
    const blueTextActive = isDark ? "#93C5FD" : "#1D4ED8";
    const mutedBlueText = isDark ? "#6B93C4" : "#93C5FD";
    const primaryDisabledBg = isDark ? "#2A3A52" : "#93C5FD";
    // Per-weekday accent colors: dark mode swaps in the muted background variant
    const DAY_COLORS = isDark ? DAY_COLORS_DARK : DAY_COLORS_LIGHT;
    // "new" (or no param at all) means creating a schedule rather than editing one.
    const scheduleId = rawScheduleId && rawScheduleId !== "new" ? rawScheduleId : null;
    const isNew = !scheduleId;
    const router = useRouter();
    const api = useApiClient();
    const queryClient = useQueryClient();
    const { getToken } = useAuth();

    const { data: group, isLoading } = useGetGroupDetails(id);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false);
    // Belt-and-suspenders alongside the `disabled` prop below: that only takes
    // effect once React re-renders with isSaving/isDeleting true, and a second
    // tap landing in the same tick (more common on Android, where touch events
    // can queue up ahead of a state-driven re-render) would otherwise still
    // fire a second request before the button visually disables.
    const inFlightRef = useRef(false);

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
        if (getMinAttendeesError(d.minAttendeesInput, d.maxAttendeesMode, d.maxAttendeesInput)) return false;
        if (getBringItemsError(d.bringItems)) return false;
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
        if (inFlightRef.current) return;
        inFlightRef.current = true;
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
            broadcastGroupUpdate(getToken, id);
            broadcastMeetupUpdate(getToken, id);
            // Back to Group Settings (where the schedule list lives) instead of dumping the user on the Groups tab.
            toast.success(isNew ? "Schedule created. Meetups will appear shortly." : "Schedule updated. Upcoming meetups were regenerated.");
            haptic.success();
            router.back();
        } catch (err: any) {
            Alert.alert("Error", err?.response?.data?.error || "Failed to save schedule.");
        } finally {
            inFlightRef.current = false;
            setIsSaving(false);
        }
    };

    const handleDelete = () => {
        if (!id || !scheduleId) return;
        Alert.alert(
            "Remove Schedule",
            `Remove "${d.name || "this schedule"}"? Its upcoming meetups will be deleted along with their RSVPs, and members will be notified. This can't be undone.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        if (inFlightRef.current) return;
                        inFlightRef.current = true;
                        setIsDeleting(true);
                        try {
                            await groupApi.deleteSchedule(api, id, scheduleId);
                            await Promise.all([
                                queryClient.invalidateQueries({ queryKey: ["groupDetails", id] }),
                                queryClient.invalidateQueries({ queryKey: ["meetups"] }),
                                queryClient.invalidateQueries({ queryKey: ["groups"] }),
                            ]);
                            broadcastGroupUpdate(getToken, id);
                            broadcastMeetupUpdate(getToken, id);
                            toast.success("Schedule removed.");
                            router.back();
                        } catch (err: any) {
                            Alert.alert("Error", err?.response?.data?.error || "Failed to remove schedule.");
                        } finally {
                            inFlightRef.current = false;
                            setIsDeleting(false);
                        }
                    },
                },
            ]
        );
    };

    // ── Sub-renderers ─────────────────────────────────────────────────────────

    const renderDailyOptions = () => (
        <View style={[s.expandBox, { backgroundColor: colors.brandSoft, borderColor: blueBorder }]}>
            <Text style={[s.expandBoxTitle, { color: blueTextActive }]}>Daily Options</Text>
            <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Same time every day?</Text>
            <View style={s.boolRow}>
                <PressableOpacity style={[s.boolBtn, { backgroundColor: colors.surface, borderColor: colors.border }, d.dailySameTime === true && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
                    onPress={() => upd({ dailySameTime: true })}>
                    <Text style={[s.boolBtnText, { color: colors.textMuted }, d.dailySameTime === true && { color: colors.brand }]}>Yes</Text>
                </PressableOpacity>
                <PressableOpacity style={[s.boolBtn, { backgroundColor: colors.surface, borderColor: colors.border }, d.dailySameTime === false && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
                    onPress={() => upd({ dailySameTime: false })}>
                    <Text style={[s.boolBtnText, { color: colors.textMuted }, d.dailySameTime === false && { color: colors.brand }]}>No, varies</Text>
                </PressableOpacity>
            </View>

            {d.dailySameTime === true && (
                <View style={{ marginTop: 12 }}>
                    <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Time</Text>
                    <PressableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={() => upd({ showDailySameTimePicker: !d.showDailySameTimePicker })}>
                        <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                        <Text style={[s.dateFieldText, { color: colors.textSecondary }]}>{d.dailySharedTime}</Text>
                        <Feather name={d.showDailySameTimePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                    </PressableOpacity>
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
                            <PressableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                onPress={() => setD(prev => ({
                                    ...prev,
                                    dailyRows: prev.dailyRows.map(r =>
                                        r.id === row.id
                                            ? { ...r, showTimePicker: !r.showTimePicker }
                                            : { ...r, showTimePicker: false }
                                    ),
                                }))}>
                                <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                                <Text style={[s.dateFieldText, { color: colors.textSecondary }]}>{row.time}</Text>
                                <Feather name={row.showTimePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                            </PressableOpacity>
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
        <View style={[s.expandBox, { backgroundColor: colors.brandSoft, borderColor: blueBorder }]}>
            <Text style={[s.expandBoxTitle, { color: blueTextActive }]}>{isBiweekly ? "Bi-Weekly Options" : "Weekly Options"}</Text>
            {d.weekdayRows.map(row => (
                <View key={row.id} style={[s.dayCard, { backgroundColor: colors.surface, borderColor: colors.border }, row.day !== null && { borderLeftColor: DAY_COLORS[row.day].fg }]}>
                    {isBiweekly && <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Day of Week</Text>}
                    <View style={s.dayRow}>
                        <PressableOpacity style={[s.dayPickerTrigger, { backgroundColor: colors.surface, borderColor: colors.border }]}
                            onPress={() => updWeekdayRow(row.id, { showDayPicker: !row.showDayPicker, showTimePicker: false, showStartDatePicker: false })}>
                            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                                <View style={[s.dayBadge, { backgroundColor: row.day !== null ? DAY_COLORS[row.day].bg : colors.backgroundAlt }]}>
                                    {row.day !== null
                                        ? <Text style={[s.dayBadgeText, { color: DAY_COLORS[row.day].fg }]}>{DAYS_OF_WEEK[row.day].short.slice(0, 2)}</Text>
                                        : <Feather name="calendar" size={12} color={colors.textFaint} />}
                                </View>
                                <Text style={row.day !== null ? [s.dayPickerText, { color: colors.textSecondary }] : [s.dayPickerPlaceholder, { color: colors.textFaint }]}>
                                    {row.day !== null ? DAYS_OF_WEEK.find(dw => dw.value === row.day)?.label : "Select day"}
                                </Text>
                            </View>
                            <Feather name={row.showDayPicker ? "chevron-up" : "chevron-down"} size={14} color={colors.textFaint} />
                        </PressableOpacity>
                        <PressableOpacity onPress={() => removeWeekdayRow(row.id)} style={{ marginLeft: 8 }}>
                            <Feather name="trash-2" size={16} color="#F87171" />
                        </PressableOpacity>
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
                            <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Time</Text>
                            <PressableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                onPress={() => updWeekdayRow(row.id, { showTimePicker: !row.showTimePicker, showDayPicker: false, showStartDatePicker: false })}>
                                <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                                <Text style={[s.dateFieldText, { color: colors.textSecondary }]}>{row.time}</Text>
                                <Feather name={row.showTimePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                            </PressableOpacity>
                        </View>
                    )}

                    {row.showTimePicker && (
                        <NativeTimePicker value={row.time}
                            onChange={t => updWeekdayRow(row.id, { time: t })}
                            onClose={() => updWeekdayRow(row.id, { showTimePicker: false })} />
                    )}

                    {isBiweekly && row.day !== null && (
                        <View style={{ marginTop: 8 }}>
                            <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Start Date</Text>
                            <PressableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                onPress={() => updWeekdayRow(row.id, { showStartDatePicker: !row.showStartDatePicker, showTimePicker: false, showDayPicker: false })}>
                                <Feather name="calendar" size={14} color={colors.brand} style={{ marginRight: 6 }} />
                                <Text style={[s.dateFieldText, { color: colors.textSecondary }]}>
                                    {row.startDate ? DateTime.fromISO(row.startDate).toLocaleString(DateTime.DATE_MED) : "Set start date"}
                                </Text>
                                <Feather name={row.showStartDatePicker ? "chevron-up" : "chevron-down"} size={14} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                            </PressableOpacity>
                            {row.showStartDatePicker && (
                                <InlineCalendar value={row.startDate || DateTime.now().toISODate()!}
                                    onChange={iso => updWeekdayRow(row.id, { startDate: iso, showStartDatePicker: false })}
                                    minDate={DateTime.now().toISODate()!} />
                            )}
                        </View>
                    )}
                </View>
            ))}
            <PressableOpacity style={s.addRowBtn} onPress={addWeekdayRow}>
                <Feather name="plus-circle" size={16} color={colors.brand} style={{ marginRight: 6 }} />
                <Text style={[s.addRowBtnText, { color: colors.brand }]}>Add day</Text>
            </PressableOpacity>
        </View>
    );

    const renderMonthlyDateEntry = (entry: MonthlyDateEntry) => (
        <View key={entry.id} style={[s.ordinalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {!entry.expanded ? (
                <PressableOpacity style={s.collapsedRuleRow} onPress={() => updMonthlyDate(entry.id, { expanded: true })}>
                    <Text style={[s.collapsedRuleText, { color: blueTextActive }]}>{entry.date}{ordSfx(entry.date)} of month · {entry.time}</Text>
                    <View style={s.collapsedRuleActions}>
                        <Feather name="edit-2" size={14} color={colors.brand} style={{ marginRight: 10 }} />
                        <PressableOpacity onPress={() => removeMonthlyDate(entry.id)}>
                            <Feather name="trash-2" size={14} color="#F87171" />
                        </PressableOpacity>
                    </View>
                </PressableOpacity>
            ) : (
                <View>
                    <View style={s.ordinalRow}>
                        <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Select date of month</Text>
                        <PressableOpacity onPress={() => removeMonthlyDate(entry.id)}>
                            <Feather name="trash-2" size={16} color="#F87171" />
                        </PressableOpacity>
                    </View>
                    <View style={s.dateGrid}>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(n => (
                            <PressableOpacity key={n} style={[s.dateBox, { backgroundColor: colors.surface, borderColor: colors.border }, entry.date === n && { backgroundColor: colors.brand, borderColor: colors.brand }]}
                                onPress={() => updMonthlyDate(entry.id, { date: n })}>
                                <Text style={[s.dateBoxText, { color: colors.textSecondary }, entry.date === n && s.dateBoxTextActive]}>{n}</Text>
                            </PressableOpacity>
                        ))}
                    </View>
                    <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Time</Text>
                    <PressableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={() => updMonthlyDate(entry.id, { showTimePicker: !entry.showTimePicker })}>
                        <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                        <Text style={[s.dateFieldText, { color: colors.textSecondary }]}>{entry.time}</Text>
                        <Feather name={entry.showTimePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                    </PressableOpacity>
                    <PressableOpacity style={[s.doneBtn, { alignSelf: "flex-end", marginTop: 10, backgroundColor: colors.brand }]}
                        onPress={() => updMonthlyDate(entry.id, { expanded: false, showTimePicker: false })}>
                        <Text style={s.doneBtnText}>Done</Text>
                    </PressableOpacity>
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
        <View key={entry.id} style={[s.ordinalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {!entry.expanded ? (
                <PressableOpacity style={s.collapsedRuleRow} onPress={() => updOrdinal(entry.id, { expanded: true })}>
                    <Text style={[s.collapsedRuleText, { color: blueTextActive }]}>
                        {entry.occurrence} {DAYS_OF_WEEK.find(dw => dw.value === entry.day)?.label} · {entry.time}
                    </Text>
                    <View style={s.collapsedRuleActions}>
                        <Feather name="edit-2" size={14} color={colors.brand} style={{ marginRight: 10 }} />
                        <PressableOpacity onPress={() => removeOrdinal(entry.id)}>
                            <Feather name="trash-2" size={14} color="#F87171" />
                        </PressableOpacity>
                    </View>
                </PressableOpacity>
            ) : (
                <View>
                    <View style={s.ordinalRow}>
                        <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Occurrence &amp; day</Text>
                        <PressableOpacity onPress={() => removeOrdinal(entry.id)}>
                            <Feather name="trash-2" size={16} color="#F87171" />
                        </PressableOpacity>
                    </View>
                    <PressableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={() => updOrdinal(entry.id, { showOccurrencePicker: true, showDayOfWeekPicker: false, showTimePicker: false })}>
                        <Text style={[s.dateFieldText, { color: colors.textSecondary }]}>{entry.occurrence}</Text>
                        <Feather name="chevron-down" size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                    </PressableOpacity>
                    <PressableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={() => updOrdinal(entry.id, { showDayOfWeekPicker: true, showOccurrencePicker: false, showTimePicker: false })}>
                        <Text style={[s.dateFieldText, { color: colors.textSecondary }]}>{DAYS_OF_WEEK.find(dw => dw.value === entry.day)?.label}</Text>
                        <Feather name="chevron-down" size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                    </PressableOpacity>
                    <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Time</Text>
                    <PressableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={() => updOrdinal(entry.id, { showTimePicker: !entry.showTimePicker, showOccurrencePicker: false, showDayOfWeekPicker: false })}>
                        <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                        <Text style={[s.dateFieldText, { color: colors.textSecondary }]}>{entry.time}</Text>
                        <Feather name={entry.showTimePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                    </PressableOpacity>
                    <PressableOpacity style={[s.doneBtn, { alignSelf: "flex-end", marginTop: 10, backgroundColor: colors.brand }]}
                        onPress={() => updOrdinal(entry.id, { expanded: false, showTimePicker: false })}>
                        <Text style={s.doneBtnText}>Done</Text>
                    </PressableOpacity>
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
        <View style={[s.expandBox, { backgroundColor: colors.brandSoft, borderColor: blueBorder }]}>
            <Text style={[s.expandBoxTitle, { color: blueTextActive }]}>Monthly Options</Text>
            <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Recur by</Text>
            <View style={s.monthlyModeList}>
                <PressableOpacity style={[s.monthlyModeCard, { backgroundColor: colors.surface, borderColor: colors.border }, d.monthlyMode === "date" && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
                    onPress={() => upd({ monthlyMode: "date" })}>
                    <View style={[s.monthlyModeRadio, { borderColor: colors.borderStrong }, d.monthlyMode === "date" && { borderColor: colors.brand }]}>
                        {d.monthlyMode === "date" && <View style={[s.monthlyModeRadioDot, { backgroundColor: colors.brand }]} />}
                    </View>
                    <View style={[s.monthlyModeIcon, { backgroundColor: colors.backgroundAlt }, d.monthlyMode === "date" && { backgroundColor: colors.brand }]}>
                        <Feather name="hash" size={16} color={d.monthlyMode === "date" ? "#fff" : colors.textFaint} />
                    </View>
                    <View style={s.monthlyModeCopy}>
                        <Text style={[s.monthlyModeTitle, { color: colors.textSecondary }, d.monthlyMode === "date" && { color: blueTextActive }]}>Same date every month</Text>
                        <Text style={[s.monthlyModeExample, { color: colors.textFaint }]}>e.g. the 15th</Text>
                    </View>
                </PressableOpacity>
                <PressableOpacity style={[s.monthlyModeCard, { backgroundColor: colors.surface, borderColor: colors.border }, d.monthlyMode === "ordinal" && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
                    onPress={() => upd({ monthlyMode: "ordinal" })}>
                    <View style={[s.monthlyModeRadio, { borderColor: colors.borderStrong }, d.monthlyMode === "ordinal" && { borderColor: colors.brand }]}>
                        {d.monthlyMode === "ordinal" && <View style={[s.monthlyModeRadioDot, { backgroundColor: colors.brand }]} />}
                    </View>
                    <View style={[s.monthlyModeIcon, { backgroundColor: colors.backgroundAlt }, d.monthlyMode === "ordinal" && { backgroundColor: colors.brand }]}>
                        <Feather name="repeat" size={16} color={d.monthlyMode === "ordinal" ? "#fff" : colors.textFaint} />
                    </View>
                    <View style={s.monthlyModeCopy}>
                        <Text style={[s.monthlyModeTitle, { color: colors.textSecondary }, d.monthlyMode === "ordinal" && { color: blueTextActive }]}>Same weekday every month</Text>
                        <Text style={[s.monthlyModeExample, { color: colors.textFaint }]}>e.g. the 2nd Tuesday</Text>
                    </View>
                </PressableOpacity>
            </View>
            {d.monthlyMode === "date" && (
                <View style={{ marginTop: 12, gap: 8 }}>
                    {d.monthlyDates.map(renderMonthlyDateEntry)}
                    <PressableOpacity style={s.addRowBtn} onPress={addMonthlyDate}>
                        <Feather name="plus-circle" size={16} color={colors.brand} style={{ marginRight: 6 }} />
                        <Text style={[s.addRowBtnText, { color: colors.brand }]}>Add date</Text>
                    </PressableOpacity>
                </View>
            )}
            {d.monthlyMode === "ordinal" && (
                <View style={{ marginTop: 12, gap: 8 }}>
                    {d.ordinalEntries.map(renderOrdinalEntry)}
                    <PressableOpacity style={s.addRowBtn} onPress={addOrdinalEntry}>
                        <Feather name="plus-circle" size={16} color={colors.brand} style={{ marginRight: 6 }} />
                        <Text style={[s.addRowBtnText, { color: colors.brand }]}>Add pattern</Text>
                    </PressableOpacity>
                </View>
            )}
        </View>
    );

    const renderCustomSubBuilder = () => (
        <View style={[s.ordinalCard, { marginTop: 8, backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Rule type</Text>
            <PressableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => upd({ customShowFreqPicker: !d.customShowFreqPicker })}>
                <Text style={d.customFreq ? [s.dateFieldText, { color: colors.textSecondary }] : [s.dayPickerPlaceholder, { color: colors.textFaint }]}>
                    {d.customFreq ? FREQ_LABELS[d.customFreq] : "Select frequency"}
                </Text>
                <Feather name={d.customShowFreqPicker ? "chevron-up" : "chevron-down"} size={14} color={colors.textFaint} style={{ marginLeft: "auto" }} />
            </PressableOpacity>
            {d.customShowFreqPicker && (
                <View style={[s.inlineDayPicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {(["daily", "weekly", "biweekly", "monthly"] as Frequency[]).map(f => (
                        <PressableOpacity key={f} style={[s.dayOption, { borderBottomColor: colors.border }, d.customFreq === f && { backgroundColor: colors.brandSoft }]}
                            onPress={() => { animate(); setD(prev => ({ ...prev, customFreq: f, customShowFreqPicker: false, weekdayRows: [], monthlyMode: null, monthlyDates: [], ordinalEntries: [], dailySameTime: null })); }}>
                            <Text style={[s.dayOptionText, { color: colors.textSecondary }, d.customFreq === f && { color: colors.brand }]}>{FREQ_LABELS[f]}</Text>
                        </PressableOpacity>
                    ))}
                </View>
            )}
            {d.customFreq === "daily" && renderDailyOptions()}
            {d.customFreq === "weekly" && renderWeekdayRows(false)}
            {d.customFreq === "biweekly" && renderWeekdayRows(true)}
            {d.customFreq === "monthly" && renderMonthlyOptions()}
            <View style={[s.boolRow, { marginTop: 14 }]}>
                <PressableOpacity style={s.skipBtn}
                    onPress={() => { animate(); upd({ customBuilding: false, customFreq: null, builtRoutines: d.builtRoutines.map(r => ({ ...r, editing: false })) }); }}>
                    <Text style={[s.skipBtnText, { color: colors.textFaint }]}>Cancel</Text>
                </PressableOpacity>
                <PressableOpacity style={[s.primaryBtn, { backgroundColor: colors.brand }]}
                    onPress={() => editingRoutineId ? saveEditedRoutine(editingRoutineId) : finishCustomRoutine()}>
                    <Text style={s.primaryBtnText}>{editingRoutineId ? "Save changes" : "Add rule"}</Text>
                </PressableOpacity>
            </View>
        </View>
    );

    const renderCustomOptions = () => (
        <View style={[s.expandBox, { backgroundColor: colors.brandSoft, borderColor: blueBorder }]}>
            <Text style={[s.expandBoxTitle, { color: blueTextActive }]}>Multiple Rules</Text>
            {d.builtRoutines.map(r =>
                r.editing ? (
                    <View key={r.id}>{renderCustomSubBuilder()}</View>
                ) : (
                    <PressableOpacity key={r.id} style={[s.routineCard, { backgroundColor: colors.brandSoft, borderColor: blueBorder }]} onPress={() => startEditingRoutine(r.id)}>
                        <View style={{ flex: 1 }}>
                            <Text style={[s.routineCardLabel, { color: blueTextActive }]}>{r.label}</Text>
                            <Text style={[s.routineCardSub, { color: mutedBlueText }]}>Tap to edit</Text>
                        </View>
                        <PressableOpacity onPress={() => removeBuiltRoutine(r.id)}>
                            <Feather name="x-circle" size={18} color="#F87171" />
                        </PressableOpacity>
                    </PressableOpacity>
                )
            )}
            {d.builtRoutines.length < 5 && !d.customBuilding && (
                <PressableOpacity style={s.addRowBtn} onPress={() => upd({ customBuilding: true, customFreq: null })}>
                    <Feather name="plus-circle" size={16} color={colors.brand} style={{ marginRight: 6 }} />
                    <Text style={[s.addRowBtnText, { color: colors.brand }]}>Add rule</Text>
                </PressableOpacity>
            )}
            {d.customBuilding && !editingRoutineId && renderCustomSubBuilder()}
        </View>
    );

    // ── Loading state ─────────────────────────────────────────────────────────

    if (isLoading || !group) {
        return (
            <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                    <LoadingAnimation />
                </View>
            </SafeAreaView>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
            <View style={s.screen}>
                <View style={[s.screenHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                    <PressableOpacity onPress={() => router.back()} style={s.iconBtn}>
                        <Feather name="arrow-left" size={24} color={colors.textMuted} />
                    </PressableOpacity>
                    <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{isNew ? "New Schedule" : "Edit Schedule"}</Text>
                    <View style={{ width: 36 }} />
                </View>

                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={[s.screenSub, { color: colors.textFaint }]}>
                        {isNew
                            ? "Give this schedule a name (e.g. \"Monthly Camping\") and set its recurrence — it shares this group's members and chat."
                            : "Changes will delete future meetups and regenerate them from the updated schedule."}
                    </Text>

                    {/* Timezone — applies to the whole group, not just this schedule,
                        so it's a standalone field rather than part of the form below. */}
                    <View style={s.tzSection}>
                        <View style={s.tzRow}>
                            <Text style={[s.fieldLabel, s.fieldLabelFirst, { marginBottom: 0, color: colors.textFaint }]}>Timezone</Text>
                            <PressableOpacity style={[s.tzPill, { backgroundColor: colors.brandSoft, borderColor: blueBorder }]} onPress={() => upd({
                                showTZPicker: !d.showTZPicker,
                                showFreqPicker: false, showStartDatePicker: false, showLeadTimePicker: false, showDeadlineTimePicker: false,
                            })}>
                                <Feather name="globe" size={13} color={colors.brand} />
                                <Text style={[s.tzPillText, { color: colors.brand }]}>{tzAbbr(d.timezone)}</Text>
                                <Feather name={d.showTZPicker ? "chevron-up" : "chevron-down"} size={13} color={colors.brand} />
                            </PressableOpacity>
                        </View>
                    </View>

                    {/* Name */}
                    <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, { backgroundColor: chipIndigoBg, borderColor: chipIndigoBorder }]}>
                                <Feather name="tag" size={16} color="#6366F1" />
                            </View>
                            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Name</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst, { color: colors.textFaint }]}>Schedule name</Text>
                        <View style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Feather name="tag" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                            <TextInput
                                style={[s.textInputField, { color: colors.textSecondary }]}
                                value={d.name}
                                onChangeText={t => setD(prev => ({ ...prev, name: t }))}
                                placeholder="e.g. Sunday Dinner"
                                placeholderTextColor={colors.placeholder}
                                maxLength={60}
                            />
                        </View>

                        <Text style={[s.fieldLabel, { marginTop: 35, color: colors.textFaint }]}>Description (optional)</Text>
                        <View style={[s.inputRow, s.descriptionInputRow, { marginBottom: 0, backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <TextInput
                                style={[s.inlineInput, s.descriptionInput, { color: colors.textSecondary }]}
                                placeholder="Add any extra details for this series..."
                                placeholderTextColor={colors.placeholder}
                                value={d.description}
                                onChangeText={t => setD(prev => ({ ...prev, description: t }))}
                                multiline
                                textAlignVertical="top"
                            />
                        </View>
                    </View>

                    {/* Where */}
                    <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, { backgroundColor: chipBlueBg, borderColor: chipBlueBorder }]}>
                                <Feather name="map-pin" size={16} color={colors.brand} />
                            </View>
                            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Where</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst, { color: colors.textFaint }]}>Location or link</Text>
                        <LocationField
                            variant="wizard"
                            placeholder="e.g. 123 Main St or zoom.us/j/..."
                            value={d.location}
                            onPress={() => setIsLocationSearchOpen(true)}
                        />
                    </View>

                    {/* When */}
                    <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, { backgroundColor: chipAmberBg, borderColor: chipAmberBorder }]}>
                                <Feather name="calendar" size={16} color="#F59E0B" />
                            </View>
                            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>When</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst, { color: colors.textFaint }]}>How often?</Text>
                        <PressableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                            onPress={() => upd({ showFreqPicker: !d.showFreqPicker, showStartDatePicker: false, showTZPicker: false })}>
                            <Feather name="repeat" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                            <Text style={d.frequency ? [s.dateFieldText, { color: colors.textSecondary }] : [s.dayPickerPlaceholder, { color: colors.textFaint }]}>
                                {d.frequency ? FREQ_LABELS[d.frequency] : "Select frequency"}
                            </Text>
                            <Feather name={d.showFreqPicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                        </PressableOpacity>
                        {d.showFreqPicker && (
                            <View style={[s.inlineDayPicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                {(["daily", "weekly", "biweekly", "monthly", "custom"] as Frequency[]).map(f => (
                                    <PressableOpacity key={f} style={[s.dayOption, { borderBottomColor: colors.border }, d.frequency === f && { backgroundColor: colors.brandSoft }]}
                                        onPress={() => selectFreq(f)}>
                                        <Text style={[s.dayOptionText, { color: colors.textSecondary }, d.frequency === f && { color: colors.brand }]}>{FREQ_LABELS[f]}</Text>
                                    </PressableOpacity>
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
                                <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Start date</Text>
                                <PressableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                    onPress={() => upd({ showStartDatePicker: !d.showStartDatePicker, showFreqPicker: false, showTZPicker: false })}>
                                    <Feather name="calendar" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                                    <Text style={[s.dateFieldText, { color: colors.textSecondary }]}>{DateTime.fromISO(d.startDate).toLocaleString(DateTime.DATE_FULL)}</Text>
                                    <Feather name={d.showStartDatePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                                </PressableOpacity>
                                {d.showStartDatePicker && (
                                    <InlineCalendar value={d.startDate}
                                        onChange={iso => upd({ startDate: iso, showStartDatePicker: false })}
                                        minDate={DateTime.now().toISODate()!} />
                                )}
                            </>
                        )}
                    </View>

                    {/* RSVP Rules */}
                    <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, { backgroundColor: chipPurpleBg, borderColor: chipPurpleBorder }]}>
                                <Feather name="bell" size={16} color="#7C3AED" />
                            </View>
                            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>RSVP Rules</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst, { color: colors.textFaint }]}>Limit when people can RSVP?</Text>
                        <View style={s.boolRow}>
                            <PressableOpacity style={[s.boolBtn, { backgroundColor: colors.surface, borderColor: colors.border }, !d.rsvpRestricted && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
                                onPress={() => upd({ rsvpRestricted: false })}>
                                <Text style={[s.boolBtnText, { color: colors.textMuted }, !d.rsvpRestricted && { color: colors.brand }]}>Allow anytime</Text>
                            </PressableOpacity>
                            <PressableOpacity style={[s.boolBtn, { backgroundColor: colors.surface, borderColor: colors.border }, d.rsvpRestricted && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
                                onPress={() => upd({ rsvpRestricted: true })}>
                                <Text style={[s.boolBtnText, { color: colors.textMuted }, d.rsvpRestricted && { color: colors.brand }]}>Limit RSVPs</Text>
                            </PressableOpacity>
                        </View>

                        {d.rsvpRestricted && (
                            <View style={{ marginTop: 14, gap: 14 }}>
                                <View>
                                    <View style={s.toggleRow}>
                                        <View style={s.toggleRowLabelWrap}>
                                            <Text style={[s.toggleRowLabel, { color: colors.textSecondary }]}>Earliest time to RSVP</Text>
                                            <InfoBubble
                                                title="Earliest time to RSVP"
                                                description={"This sets the earliest time and day people can respond.\n\nIt's a number of days before the meetup, at a specific time.\n\nTurn it off to allow RSVPs as soon as the meetup is created."}
                                            />
                                        </View>
                                        <ToggleSwitch activeColor="#7C3AED" value={d.leadEnabled} onValueChange={v => {
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
                                            <View style={[s.leadRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                                <PressableOpacity style={[s.stepperBtn, { backgroundColor: colors.brandSoft }]} onPress={() => {
                                                    const leadDays = Math.max(d.deadlineEnabled ? d.deadlineDays : 0, d.leadDays - 1);
                                                    const sameDayViolation = d.deadlineEnabled && leadDays === d.deadlineDays && timeToMinutes(d.leadTime) > timeToMinutes(d.deadlineTime);
                                                    upd({ leadDays, ...(sameDayViolation ? { leadTime: d.deadlineTime } : {}) });
                                                }}>
                                                    <Feather name="minus" size={18} color={colors.brand} />
                                                </PressableOpacity>
                                                <View style={s.leadCenter}>
                                                    <Text style={[s.leadVal, { color: colors.textPrimary }]}>{d.leadDays}</Text>
                                                    <Text style={[s.leadSub, { color: colors.textFaint }]}>days before</Text>
                                                </View>
                                                <PressableOpacity style={[s.stepperBtn, { backgroundColor: colors.brandSoft }]} onPress={() => upd({ leadDays: d.leadDays + 1 })}>
                                                    <Feather name="plus" size={18} color={colors.brand} />
                                                </PressableOpacity>
                                            </View>
                                            <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Time</Text>
                                            <PressableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                                onPress={() => upd({ showLeadTimePicker: !d.showLeadTimePicker, showDeadlineTimePicker: false, showStartDatePicker: false, showFreqPicker: false, showTZPicker: false })}>
                                                <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                                                <Text style={[s.dateFieldText, { color: colors.textSecondary }]}>{d.leadTime}</Text>
                                                <Feather name={d.showLeadTimePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                                            </PressableOpacity>
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
                                            <Text style={[s.toggleRowLabel, { color: colors.textSecondary }]}>Latest time to RSVP</Text>
                                            <InfoBubble
                                                title="Latest time to RSVP"
                                                description={"This sets the cutoff for responding.\n\nIt's a number of days before the meetup, at a specific time.\n\nTurn it off to allow RSVPs right up until the meetup starts."}
                                            />
                                        </View>
                                        <ToggleSwitch activeColor="#7C3AED" value={d.deadlineEnabled} onValueChange={v => {
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
                                            <View style={[s.leadRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                                <PressableOpacity style={[s.stepperBtn, { backgroundColor: colors.brandSoft }]} onPress={() => upd({ deadlineDays: Math.max(0, d.deadlineDays - 1) })}>
                                                    <Feather name="minus" size={18} color={colors.brand} />
                                                </PressableOpacity>
                                                <View style={s.leadCenter}>
                                                    <Text style={[s.leadVal, { color: colors.textPrimary }]}>{d.deadlineDays}</Text>
                                                    <Text style={[s.leadSub, { color: colors.textFaint }]}>days before</Text>
                                                </View>
                                                <PressableOpacity style={[s.stepperBtn, { backgroundColor: colors.brandSoft }]} onPress={() => {
                                                    const deadlineDays = d.leadEnabled ? Math.min(d.leadDays, d.deadlineDays + 1) : d.deadlineDays + 1;
                                                    const sameDayViolation = d.leadEnabled && deadlineDays === d.leadDays && timeToMinutes(d.deadlineTime) < timeToMinutes(d.leadTime);
                                                    upd({ deadlineDays, ...(sameDayViolation ? { deadlineTime: d.leadTime } : {}) });
                                                }}>
                                                    <Feather name="plus" size={18} color={colors.brand} />
                                                </PressableOpacity>
                                            </View>
                                            <Text style={[s.fieldLabel, { color: colors.textFaint }]}>Time</Text>
                                            <PressableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                                onPress={() => upd({ showDeadlineTimePicker: !d.showDeadlineTimePicker, showLeadTimePicker: false, showStartDatePicker: false, showFreqPicker: false, showTZPicker: false })}>
                                                <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                                                <Text style={[s.dateFieldText, { color: colors.textSecondary }]}>{d.deadlineTime}</Text>
                                                <Feather name={d.showDeadlineTimePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                                            </PressableOpacity>
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
                    <View style={[s.sectionCard, { marginBottom: 8, backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, { backgroundColor: chipTealBg, borderColor: chipTealBorder }]}>
                                <Feather name="users" size={16} color="#0D9488" />
                            </View>
                            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Capacity</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst, { color: colors.textFaint }]}>Max Attendees</Text>
                        <View style={s.boolRow}>
                            <PressableOpacity
                                style={[s.boolBtn, { backgroundColor: colors.surface, borderColor: colors.border }, d.maxAttendeesMode === "unlimited" && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
                                onPress={() => upd({ maxAttendeesMode: "unlimited", maxAttendeesInput: "" })}
                            >
                                <Text style={[s.boolBtnText, { color: colors.textMuted }, d.maxAttendeesMode === "unlimited" && { color: colors.brand }]}>Unlimited</Text>
                            </PressableOpacity>
                            <PressableOpacity
                                style={[s.boolBtn, { backgroundColor: colors.surface, borderColor: colors.border }, d.maxAttendeesMode === "limited" && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
                                onPress={() => upd({ maxAttendeesMode: "limited" })}
                            >
                                <Text style={[s.boolBtnText, { color: colors.textMuted }, d.maxAttendeesMode === "limited" && { color: colors.brand }]}>Limited</Text>
                            </PressableOpacity>
                        </View>
                        {d.maxAttendeesMode === "limited" && (() => {
                            const maxAttendeesError = getMaxAttendeesError(d.maxAttendeesMode, d.maxAttendeesInput);
                            return (
                                <View style={{ marginTop: 10 }}>
                                    <View style={[s.inputRow, { marginBottom: 0, backgroundColor: colors.surface, borderColor: colors.border }, maxAttendeesError && { borderColor: colors.danger }]}>
                                        <Feather name="users" size={16} color={colors.textFaint} style={{ marginRight: 8 }} />
                                        <TextInput
                                            style={[s.inlineInput, { color: colors.textSecondary }]}
                                            placeholder="How many?"
                                            placeholderTextColor={colors.placeholder}
                                            keyboardType="number-pad"
                                            value={d.maxAttendeesInput}
                                            onChangeText={v => upd({ maxAttendeesInput: v })}
                                        />
                                    </View>
                                    {maxAttendeesError && <Text style={[s.errorText, { color: colors.danger }]}>{maxAttendeesError}</Text>}
                                </View>
                            );
                        })()}

                        {/* Minimum headcount (Premium) */}
                        <Text style={s.fieldLabel}>Minimum to Play</Text>
                        {group?.isPremium !== true ? (
                            <View style={s.premiumLockRow}>
                                <Feather name="lock" size={16} color="#9CA3AF" style={{ marginTop: 1 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={s.premiumLockTitle}>Premium</Text>
                                    <Text style={s.premiumLockText}>
                                        Cancel a meetup automatically if too few people are in by the RSVP deadline. Requires the group owner to have Premium.
                                    </Text>
                                    <UpgradeButton owner={group?.owner} />
                                </View>
                            </View>
                        ) : !(d.rsvpRestricted && d.deadlineEnabled) ? (
                            <Text style={s.premiumLockText}>
                                Turn on "Limit RSVPs" and set an RSVP deadline above to use a minimum headcount.
                            </Text>
                        ) : (() => {
                            const minAttendeesError = getMinAttendeesError(d.minAttendeesInput, d.maxAttendeesMode, d.maxAttendeesInput);
                            return (
                                <View>
                                    <View style={[s.inputRow, { marginBottom: 0 }, minAttendeesError && s.inputRowError]}>
                                        <Feather name="flag" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
                                        <TextInput
                                            style={s.inlineInput}
                                            placeholder="No minimum"
                                            placeholderTextColor="#C4C9D4"
                                            keyboardType="number-pad"
                                            value={d.minAttendeesInput}
                                            onChangeText={v => upd({ minAttendeesInput: v })}
                                        />
                                    </View>
                                    {minAttendeesError
                                        ? <Text style={s.errorText}>{minAttendeesError}</Text>
                                        : <Text style={s.premiumLockText}>
                                            If fewer than this many people (counting guests) are in when RSVPs close, the meetup is cancelled and everyone is told.
                                          </Text>}
                                </View>
                            );
                        })()}

                        {/* Meetup assignments (Premium) */}
                        <Text style={s.fieldLabel}>Meetup Assignments</Text>
                        {group?.isPremium !== true ? (
                            <View style={s.premiumLockRow}>
                                <Feather name="lock" size={16} color="#9CA3AF" style={{ marginTop: 1 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={s.premiumLockTitle}>Premium</Text>
                                    <Text style={s.premiumLockText}>
                                        Ask people what they're bringing and coordinate rides. Requires the group owner to have Premium.
                                    </Text>
                                    <UpgradeButton owner={group?.owner} />
                                </View>
                            </View>
                        ) : (
                            <View>
                                <Text style={[s.premiumLockText, { marginBottom: 10 }]}>
                                    People who RSVP "I'm In" are asked what they're bringing. Add a number to limit how many people can bring an item.
                                </Text>
                                {d.bringItems.map(item => (
                                    <View key={item.key} style={[s.inputRow, { marginBottom: 8, paddingVertical: 8 }]}>
                                        <TextInput
                                            style={[s.inlineInput, { flex: 1 }]}
                                            placeholder="Item (e.g. Chips)"
                                            placeholderTextColor="#C4C9D4"
                                            maxLength={40}
                                            value={item.name}
                                            onChangeText={v => upd({ bringItems: d.bringItems.map(i => i.key === item.key ? { ...i, name: v } : i) })}
                                        />
                                        <TextInput
                                            style={[s.inlineInput, { flex: 0, width: 74, textAlign: "center", borderLeftWidth: 1, borderLeftColor: "#E5E7EB" }]}
                                            placeholder="No limit"
                                            placeholderTextColor="#C4C9D4"
                                            keyboardType="number-pad"
                                            maxLength={2}
                                            value={item.max}
                                            onChangeText={v => upd({ bringItems: d.bringItems.map(i => i.key === item.key ? { ...i, max: v.replace(/[^0-9]/g, "") } : i) })}
                                        />
                                        <PressableOpacity
                                            onPress={() => upd({ bringItems: d.bringItems.filter(i => i.key !== item.key) })}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            style={{ marginLeft: 10 }}
                                        >
                                            <Feather name="trash-2" size={16} color="#9CA3AF" />
                                        </PressableOpacity>
                                    </View>
                                ))}
                                {getBringItemsError(d.bringItems) && <Text style={s.errorText}>{getBringItemsError(d.bringItems)}</Text>}
                                {d.bringItems.length < 20 && (
                                    <PressableOpacity
                                        onPress={() => upd({ bringItems: [...d.bringItems, { key: newBringItemKey(), name: "", max: "" }] })}
                                        style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 }}
                                    >
                                        <Feather name="plus-circle" size={16} color="#4A90E2" />
                                        <Text style={{ color: "#4A90E2", fontWeight: "700", fontSize: 14 }}>Add item to bring</Text>
                                    </PressableOpacity>
                                )}

                                <View style={[s.inputRow, { marginTop: 8, marginBottom: 0, justifyContent: "space-between" }]}>
                                    <View style={{ flex: 1, paddingRight: 12 }}>
                                        <Text style={{ fontSize: 15, fontWeight: "600", color: "#374151" }}>Coordinate rides</Text>
                                        <Text style={s.premiumLockText}>Ask who's driving (and how many seats) and who needs a ride.</Text>
                                    </View>
                                    <Switch value={d.ridesEnabled} onValueChange={v => upd({ ridesEnabled: v })} trackColor={{ true: "#4FD1C5" }} />
                                </View>
                            </View>
                        )}

                        {/* Priority RSVP (Premium) — saved series only, since it ranks members and edits open meetups in place */}
                        {!isNew && (
                            <>
                                <Text style={s.fieldLabel}>Priority RSVP</Text>
                                {group?.isPremium !== true ? (
                                    <View style={s.premiumLockRow}>
                                        <Feather name="lock" size={16} color="#9CA3AF" style={{ marginTop: 1 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.premiumLockTitle}>Premium</Text>
                                            <Text style={s.premiumLockText}>
                                                Let your longest-standing members RSVP first, in groups you set. Requires the group owner to have Premium.
                                            </Text>
                                            <UpgradeButton owner={group?.owner} />
                                        </View>
                                    </View>
                                ) : (
                                    <PressableOpacity
                                        style={[s.inputRow, { marginBottom: 0, justifyContent: "space-between" }]}
                                        onPress={() => router.push({ pathname: "/group-priority/[id]", params: { id: id!, scheduleId: scheduleId! } })}
                                        activeOpacity={0.7}
                                    >
                                        <View style={{ flex: 1, paddingRight: 12 }}>
                                            <Text style={{ fontSize: 15, fontWeight: "600", color: "#374151" }}>
                                                {targetSchedule?.priorityEnabled ? "On — manage groups and order" : "Set up priority groups"}
                                            </Text>
                                            <Text style={s.premiumLockText}>Rank members and give each group an RSVP head start.</Text>
                                        </View>
                                        <Feather name="chevron-right" size={20} color="#9CA3AF" />
                                    </PressableOpacity>
                                )}

                                <Text style={s.fieldLabel}>RSVP Questions</Text>
                                {group?.isPremium !== true ? (
                                    <View style={s.premiumLockRow}>
                                        <Feather name="lock" size={16} color="#9CA3AF" style={{ marginTop: 1 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.premiumLockTitle}>Premium</Text>
                                            <Text style={s.premiumLockText}>
                                                Ask members your own questions when they RSVP. Requires the group owner to have Premium.
                                            </Text>
                                            <UpgradeButton owner={group?.owner} />
                                        </View>
                                    </View>
                                ) : (
                                    <PressableOpacity
                                        style={[s.inputRow, { marginBottom: 0, justifyContent: "space-between" }]}
                                        onPress={() => router.push({ pathname: "/group-questions/[id]", params: { id: id!, scheduleId: scheduleId! } })}
                                        activeOpacity={0.7}
                                    >
                                        <View style={{ flex: 1, paddingRight: 12 }}>
                                            <Text style={{ fontSize: 15, fontWeight: "600", color: "#374151" }}>
                                                {(targetSchedule?.defaultQuestions?.length ?? 0) > 0
                                                    ? `${targetSchedule!.defaultQuestions!.length} question${targetSchedule!.defaultQuestions!.length === 1 ? "" : "s"} — manage`
                                                    : "Add questions"}
                                            </Text>
                                            <Text style={s.premiumLockText}>Collect answers like dietary needs or skill level.</Text>
                                        </View>
                                        <Feather name="chevron-right" size={20} color="#9CA3AF" />
                                    </PressableOpacity>
                                )}
                            </>
                        )}
                    </View>
                </ScrollView>
                </KeyboardAvoidingView>

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
                        options={timezoneOptions(d.timezone)}
                        searchable
                        selectedKey={d.timezone}
                        onSelect={key => upd({ timezone: key, showTZPicker: false })}
                        onClose={() => upd({ showTZPicker: false })}
                    />
                )}

                <View style={[s.screenFooter, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                    {!isNew && (
                        <PressableOpacity style={[s.deleteBtn, { backgroundColor: deleteChipBg, borderColor: deleteChipBorder }]} onPress={handleDelete} disabled={isDeleting}>
                            {isDeleting
                                ? <ActivityIndicator color={colors.danger} size="small" />
                                : <Feather name="trash-2" size={18} color={colors.danger} />
                            }
                        </PressableOpacity>
                    )}
                    {!hasChanged && isScheduleValid() && (
                        <Text style={[s.noChangeHint, { color: colors.textFaint }]}>No changes yet</Text>
                    )}
                    <PressableOpacity
                        style={[s.primaryBtn, { backgroundColor: colors.brand }, !saveEnabled && { backgroundColor: primaryDisabledBg }]}
                        onPress={handleSave}
                        disabled={!saveEnabled}
                    >
                        {isSaving
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <><Text style={s.primaryBtnText}>{isNew ? "Create Schedule" : "Save Changes"}</Text><Feather name="check" size={18} color="#fff" style={{ marginLeft: 6 }} /></>
                        }
                    </PressableOpacity>
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
    leadRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    stepperBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
    leadCenter: { alignItems: "center", minWidth: 60 },
    leadVal: { fontSize: 22, fontWeight: "900", color: "#111827" },
    leadSub: { fontSize: 10, color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase" },
    inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
    inputRowError: { borderColor: "#EF4444" },
    inlineInput: { flex: 1, fontSize: 15, color: "#374151" },
    descriptionInputRow: { alignItems: "flex-start", height: 90 },
    descriptionInput: { height: "100%" },
    errorText: { fontSize: 12, fontWeight: "600", color: "#EF4444", marginTop: 6, marginLeft: 2 },
    premiumLockRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", padding: 12 },
    premiumLockTitle: { fontSize: 13, fontWeight: "800", color: "#6B7280", marginBottom: 2 },
    premiumLockText: { fontSize: 12, color: "#6B7280", lineHeight: 17, marginTop: 6 },
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
