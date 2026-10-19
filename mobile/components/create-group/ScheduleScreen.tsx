import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import InfoBubble from "@/components/InfoBubble";
import LocationField from "@/components/LocationField";
import LocationSearchModal from "@/components/LocationSearchModal";
import NativeTimePicker from "@/components/NativeTimePicker";
import OptionPickerModal from "@/components/OptionPickerModal";
import { CalendarPickerModal } from "@/components/create-group/CalendarPickerModal";
import { StepDots } from "@/components/create-group/StepDots";
import { animate, getDayColors } from "@/components/create-group/shared";
import { makeStyles } from "@/components/create-group/styles";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { useAppearance, useThemeColors } from "@/contexts/AppearanceContext";
import { DayTime, Frequency } from "@/utils/api";
import { BuiltRoutine, defaultSchedule, isScheduleTabValid, MonthlyDateEntry, OrdinalEntry, ScheduleData, WeekdayRow } from "@/utils/createGroupDraft";
import { DAYS_OF_WEEK, FREQ_LABELS, getMaxAttendeesError, ORDINAL_OCCURRENCES, ordSfx, timeToMinutes, TZ_ABBR, uid, USA_TIMEZONES } from "@/utils/scheduleConstants";
import { Feather } from "@expo/vector-icons";
import { DateTime } from "luxon";

export const ScheduleScreen = ({ groupName, initialSchedules, initialTimezone, onNext, onBack, onSkip }: {
    groupName?: string;
    initialSchedules?: ScheduleData[];
    initialTimezone?: string;
    onNext: (schedules: ScheduleData[], timezone: string) => void;
    onBack: () => void;
    onSkip: () => void;
}) => {
    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const isDark = scheme === 'dark';
    const s = useMemo(() => makeStyles(colors), [colors]);
    const dayColors = useMemo(() => getDayColors(isDark), [isDark]);
    // One shared timezone for the whole group — not per-schedule (the backend
    // only stores one Group.timezone), so it lives outside the tabbed array.
    const [timezone, setTimezone] = useState(initialTimezone ?? "America/Denver");
    const [showTZPicker, setShowTZPicker] = useState(false);
    const scrollViewRef = useRef<ScrollView>(null);

    // Starts with one blank series already in place so its fields are
    // immediately visible — no tap required to begin filling it out.
    const [schedules, setSchedules] = useState<ScheduleData[]>(
        initialSchedules && initialSchedules.length > 0 ? initialSchedules : [defaultSchedule(groupName ?? "")]
    );
    const [activeIndex, setActiveIndexState] = useState(0);
    // Mirrors activeIndex so `setD` (defined once, empty deps) always targets
    // the tab that's actually active instead of closing over a stale index.
    const activeIndexRef = useRef(0);
    const setActiveIndex = (i: number) => { activeIndexRef.current = i; setActiveIndexState(i); };

    const d = schedules[activeIndex] ?? defaultSchedule();
    const setD = useCallback((updater: (prev: ScheduleData) => ScheduleData) => {
        setSchedules(prev => prev.map((sch, i) => i === activeIndexRef.current ? updater(sch) : sch));
    }, []);

    const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false);
    const [dayPickerRowId, setDayPickerRowId] = useState<string | null>(null);
    const [calendarPickerRowId, setCalendarPickerRowId] = useState<string | null>(null);

    const upd = useCallback((patch: Partial<ScheduleData>) => {
        animate();
        setD(prev => ({ ...prev, ...patch }));
    }, [setD]);

    const selectFreq = (freq: Frequency) => {
        animate();
        setDayPickerRowId(null);
        setCalendarPickerRowId(null);
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
        const newId = uid();
        setD(prev => ({
            ...prev,
            weekdayRows: [...prev.weekdayRows, {
                id: newId, day: null, time: "05:00 PM",
                startDate: DateTime.now().toISODate()!,
                showTimePicker: false,
            }],
        }));
        setDayPickerRowId(newId);
    };

    const updWeekdayRow = (id: string, patch: Partial<WeekdayRow>) => {
        animate();
        setD(prev => ({
            ...prev,
            weekdayRows: prev.weekdayRows.map(r => r.id === id ? { ...r, ...patch } : r),
        }));
    };

    const removeWeekdayRow = (id: string) => {
        animate();
        setD(prev => ({ ...prev, weekdayRows: prev.weekdayRows.filter(r => r.id !== id) }));
        setDayPickerRowId(prev => (prev === id ? null : prev));
        setCalendarPickerRowId(prev => (prev === id ? null : prev));
    };

    // ── Monthly dates ─────────────────────────────────────────────────────────
    const addMonthlyDate = () => {
        animate();
        setD(prev => ({
            ...prev,
            monthlyDates: [...prev.monthlyDates, { id: uid(), date: 1, time: "05:00 PM", expanded: true, showTimePicker: false }],
        }));
    };
    const updMonthlyDate = (id: string, patch: Partial<MonthlyDateEntry>) => {
        animate();
        setD(prev => ({ ...prev, monthlyDates: prev.monthlyDates.map(e => e.id === id ? { ...e, ...patch } : e) }));
    };
    const removeMonthlyDate = (id: string) => {
        animate();
        setD(prev => ({ ...prev, monthlyDates: prev.monthlyDates.filter(e => e.id !== id) }));
    };

    // ── Ordinal entries ───────────────────────────────────────────────────────
    const addOrdinalEntry = () => {
        animate();
        setD(prev => ({
            ...prev,
            ordinalEntries: [...prev.ordinalEntries, { id: uid(), occurrence: "1st", day: 1, time: "05:00 PM", expanded: true, showTimePicker: false, showOccurrencePicker: false, showDayOfWeekPicker: false }],
        }));
    };
    const updOrdinal = (id: string, patch: Partial<OrdinalEntry>) => {
        animate();
        setD(prev => ({ ...prev, ordinalEntries: prev.ordinalEntries.map(e => e.id === id ? { ...e, ...patch } : e) }));
    };
    const removeOrdinal = (id: string) => {
        animate();
        setD(prev => ({ ...prev, ordinalEntries: prev.ordinalEntries.filter(e => e.id !== id) }));
    };

    // ── Custom routines ───────────────────────────────────────────────────────
    const buildLabel = (freq: Frequency, dayTimes: DayTime[], ordEntries?: OrdinalEntry[]): string => {
        if (freq === "ordinal" && ordEntries?.length) {
            const parts = ordEntries.slice(0, 2).map(e => `${e.occurrence} ${DAYS_OF_WEEK.find(dw => dw.value === e.day)?.short} @ ${e.time}`);
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
                weekdayRows: d.weekdayRows.map(r => ({ ...r, showTimePicker: false })),
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

    const startEditingRoutine = (id: string) => {
        animate();
        setD(prev => {
            const r = prev.builtRoutines.find(r => r.id === id);
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
                builtRoutines: prev.builtRoutines.map(br => br.id === id ? { ...br, editing: true } : br),
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

    const removeBuiltRoutine = (id: string) => {
        animate();
        setD(prev => ({ ...prev, builtRoutines: prev.builtRoutines.filter(r => r.id !== id) }));
    };

    const editingRoutineId = d.builtRoutines.find(r => r.editing)?.id ?? null;

    // ── Validation ────────────────────────────────────────────────────────────
    const canProceed = (): boolean => schedules.every(isScheduleTabValid);

    // ── Sub-renderers ─────────────────────────────────────────────────────────

    const renderDailyOptions = () => (
        <View style={s.expandBox}>
            <Text style={s.expandBoxTitle}>Daily Options</Text>
            <Text style={s.fieldLabel}>Same time every day?</Text>
            <View style={s.boolRow}>
                <PressableOpacity style={[s.boolBtn, d.dailySameTime === true && s.boolBtnActive]}
                    onPress={() => upd({ dailySameTime: true })}>
                    <Text style={[s.boolBtnText, d.dailySameTime === true && s.boolBtnTextActive]}>Yes</Text>
                </PressableOpacity>
                <PressableOpacity style={[s.boolBtn, d.dailySameTime === false && s.boolBtnActive]}
                    onPress={() => upd({ dailySameTime: false })}>
                    <Text style={[s.boolBtnText, d.dailySameTime === false && s.boolBtnTextActive]}>No, varies</Text>
                </PressableOpacity>
            </View>

            {d.dailySameTime === true && (
                <View style={{ marginTop: 12 }}>
                    <Text style={s.fieldLabel}>Time</Text>
                    <PressableOpacity style={s.dateFieldRow}
                        onPress={() => upd({ showDailySameTimePicker: !d.showDailySameTimePicker })}>
                        <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                        <Text style={s.dateFieldText}>{d.dailySharedTime}</Text>
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
                            <PressableOpacity style={s.dateFieldRow}
                                onPress={() => setD(prev => ({
                                    ...prev,
                                    dailyRows: prev.dailyRows.map(r =>
                                        r.id === row.id
                                            ? { ...r, showTimePicker: !r.showTimePicker }
                                            : { ...r, showTimePicker: false }
                                    ),
                                }))}>
                                <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                                <Text style={s.dateFieldText}>{row.time}</Text>
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
        <View style={s.expandBox}>
            <Text style={s.expandBoxTitle}>{isBiweekly ? "Bi-Weekly Options" : "Weekly Options"}</Text>
            {d.weekdayRows.map(row => (
                <View key={row.id} style={[s.dayCard, row.day !== null && { borderLeftColor: dayColors[row.day].fg }]}>
                    {isBiweekly && <Text style={s.startDateLabel}>Day of Week</Text>}
                    <View style={s.dayRow}>
                        <PressableOpacity style={s.dayPickerTrigger}
                            onPress={() => { updWeekdayRow(row.id, { showTimePicker: false }); setDayPickerRowId(row.id); }}>
                            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                                <View style={[s.dayBadge, { backgroundColor: row.day !== null ? dayColors[row.day].bg : colors.backgroundAlt }]}>
                                    {row.day !== null
                                        ? <Text style={[s.dayBadgeText, { color: dayColors[row.day].fg }]}>{DAYS_OF_WEEK[row.day].short.slice(0, 2)}</Text>
                                        : <Feather name="calendar" size={12} color={colors.textFaint} />}
                                </View>
                                <Text style={row.day !== null ? s.dayPickerText : s.dayPickerPlaceholder}>
                                    {row.day !== null ? DAYS_OF_WEEK.find(dw => dw.value === row.day)?.label : "Select day"}
                                </Text>
                            </View>
                            <Feather name={dayPickerRowId === row.id ? "chevron-up" : "chevron-down"} size={14} color={colors.textFaint} />
                        </PressableOpacity>
                        <PressableOpacity onPress={() => removeWeekdayRow(row.id)} style={{ marginLeft: 8 }}>
                            <Feather name="trash-2" size={16} color="#F87171" />
                        </PressableOpacity>
                    </View>

                    {row.day !== null && (
                        <View style={{ marginTop: 8 }}>
                            <Text style={s.fieldLabel}>Time</Text>
                            <PressableOpacity style={s.dateFieldRow}
                                onPress={() => updWeekdayRow(row.id, { showTimePicker: !row.showTimePicker })}>
                                <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                                <Text style={s.dateFieldText}>{row.time}</Text>
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
                            <Text style={s.startDateLabel}>Start Date</Text>
                            <PressableOpacity style={s.dateFieldRow}
                                onPress={() => setCalendarPickerRowId(row.id)}>
                                <Feather name="calendar" size={14} color={colors.brand} style={{ marginRight: 6 }} />
                                <Text style={s.dateFieldText}>
                                    {row.startDate ? DateTime.fromISO(row.startDate).toLocaleString(DateTime.DATE_MED) : "Set start date"}
                                </Text>
                            </PressableOpacity>
                        </View>
                    )}
                </View>
            ))}
            <PressableOpacity style={s.addRowBtn} onPress={addWeekdayRow}>
                <Feather name="plus-circle" size={16} color={colors.brand} style={{ marginRight: 6 }} />
                <Text style={s.addRowBtnText}>Add day</Text>
            </PressableOpacity>

            {dayPickerRowId !== null && (
                <OptionPickerModal title="Day of week"
                    options={DAYS_OF_WEEK.map(dw => ({ key: String(dw.value), label: dw.label }))}
                    selectedKey={String(d.weekdayRows.find(r => r.id === dayPickerRowId)?.day ?? "")}
                    onSelect={key => {
                        updWeekdayRow(dayPickerRowId, { day: Number(key), showTimePicker: true });
                        setDayPickerRowId(null);
                    }}
                    onClose={() => setDayPickerRowId(null)} />
            )}

            <CalendarPickerModal
                visible={calendarPickerRowId !== null}
                value={d.weekdayRows.find(r => r.id === calendarPickerRowId)?.startDate || DateTime.now().toISODate()!}
                minDate={DateTime.now().toISODate()!}
                maxDate={DateTime.now().plus({ months: 4 }).toISODate()!}
                onChange={(iso) => {
                    if (calendarPickerRowId) updWeekdayRow(calendarPickerRowId, { startDate: iso });
                    setCalendarPickerRowId(null);
                }}
                onCancel={() => setCalendarPickerRowId(null)}
            />
        </View>
    );

    const renderMonthlyDateEntry = (entry: MonthlyDateEntry) => (
        <View key={entry.id} style={s.ordinalCard}>
            {!entry.expanded ? (
                <PressableOpacity style={s.collapsedRuleRow} onPress={() => updMonthlyDate(entry.id, { expanded: true })}>
                    <Text style={s.collapsedRuleText}>{entry.date}{ordSfx(entry.date)} of month · {entry.time}</Text>
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
                        <Text style={s.fieldLabel}>Select date of month</Text>
                        <PressableOpacity onPress={() => removeMonthlyDate(entry.id)}>
                            <Feather name="trash-2" size={16} color="#F87171" />
                        </PressableOpacity>
                    </View>
                    <View style={s.dateGrid}>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(n => (
                            <PressableOpacity key={n} style={[s.dateBox, entry.date === n && s.dateBoxActive]}
                                onPress={() => updMonthlyDate(entry.id, { date: n })}>
                                <Text style={[s.dateBoxText, entry.date === n && s.dateBoxTextActive]}>{n}</Text>
                            </PressableOpacity>
                        ))}
                    </View>
                    <Text style={s.fieldLabel}>Time</Text>
                    <PressableOpacity style={s.dateFieldRow}
                        onPress={() => updMonthlyDate(entry.id, { showTimePicker: !entry.showTimePicker })}>
                        <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                        <Text style={s.dateFieldText}>{entry.time}</Text>
                        <Feather name={entry.showTimePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                    </PressableOpacity>
                    <PressableOpacity style={[s.doneBtn, { alignSelf: "flex-end", marginTop: 10 }]}
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
        <View key={entry.id} style={s.ordinalCard}>
            {!entry.expanded ? (
                <PressableOpacity style={s.collapsedRuleRow} onPress={() => updOrdinal(entry.id, { expanded: true })}>
                    <Text style={s.collapsedRuleText}>
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
                        <Text style={s.fieldLabel}>Occurrence &amp; day</Text>
                        <PressableOpacity onPress={() => removeOrdinal(entry.id)}>
                            <Feather name="trash-2" size={16} color="#F87171" />
                        </PressableOpacity>
                    </View>
                    <PressableOpacity style={s.dateFieldRow}
                        onPress={() => updOrdinal(entry.id, { showOccurrencePicker: true, showDayOfWeekPicker: false, showTimePicker: false })}>
                        <Text style={s.dateFieldText}>{entry.occurrence}</Text>
                        <Feather name="chevron-down" size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                    </PressableOpacity>
                    <PressableOpacity style={s.dateFieldRow}
                        onPress={() => updOrdinal(entry.id, { showDayOfWeekPicker: true, showOccurrencePicker: false, showTimePicker: false })}>
                        <Text style={s.dateFieldText}>{DAYS_OF_WEEK.find(dw => dw.value === entry.day)?.label}</Text>
                        <Feather name="chevron-down" size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                    </PressableOpacity>
                    <Text style={s.fieldLabel}>Time</Text>
                    <PressableOpacity style={s.dateFieldRow}
                        onPress={() => updOrdinal(entry.id, { showTimePicker: !entry.showTimePicker, showOccurrencePicker: false, showDayOfWeekPicker: false })}>
                        <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                        <Text style={s.dateFieldText}>{entry.time}</Text>
                        <Feather name={entry.showTimePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                    </PressableOpacity>
                    <PressableOpacity style={[s.doneBtn, { alignSelf: "flex-end", marginTop: 10 }]}
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
        <View style={s.expandBox}>
            <Text style={s.expandBoxTitle}>Monthly Options</Text>
            <Text style={s.fieldLabel}>Recur by</Text>
            <View style={s.monthlyModeList}>
                <PressableOpacity style={[s.monthlyModeCard, d.monthlyMode === "date" && s.monthlyModeCardActive]}
                    onPress={() => upd({ monthlyMode: "date" })}>
                    <View style={[s.monthlyModeRadio, d.monthlyMode === "date" && s.monthlyModeRadioActive]}>
                        {d.monthlyMode === "date" && <View style={s.monthlyModeRadioDot} />}
                    </View>
                    <View style={[s.monthlyModeIcon, d.monthlyMode === "date" && s.monthlyModeIconActive]}>
                        <Feather name="hash" size={16} color={d.monthlyMode === "date" ? "#fff" : colors.textFaint} />
                    </View>
                    <View style={s.monthlyModeCopy}>
                        <Text style={[s.monthlyModeTitle, d.monthlyMode === "date" && s.monthlyModeTitleActive]}>Same date every month</Text>
                        <Text style={s.monthlyModeExample}>e.g. the 15th</Text>
                    </View>
                </PressableOpacity>
                <PressableOpacity style={[s.monthlyModeCard, d.monthlyMode === "ordinal" && s.monthlyModeCardActive]}
                    onPress={() => upd({ monthlyMode: "ordinal" })}>
                    <View style={[s.monthlyModeRadio, d.monthlyMode === "ordinal" && s.monthlyModeRadioActive]}>
                        {d.monthlyMode === "ordinal" && <View style={s.monthlyModeRadioDot} />}
                    </View>
                    <View style={[s.monthlyModeIcon, d.monthlyMode === "ordinal" && s.monthlyModeIconActive]}>
                        <Feather name="repeat" size={16} color={d.monthlyMode === "ordinal" ? "#fff" : colors.textFaint} />
                    </View>
                    <View style={s.monthlyModeCopy}>
                        <Text style={[s.monthlyModeTitle, d.monthlyMode === "ordinal" && s.monthlyModeTitleActive]}>Same weekday every month</Text>
                        <Text style={s.monthlyModeExample}>e.g. the 2nd Tuesday</Text>
                    </View>
                </PressableOpacity>
            </View>
            {d.monthlyMode === "date" && (
                <View style={{ marginTop: 12, gap: 8 }}>
                    {d.monthlyDates.map(renderMonthlyDateEntry)}
                    <PressableOpacity style={s.addRowBtn} onPress={addMonthlyDate}>
                        <Feather name="plus-circle" size={16} color={colors.brand} style={{ marginRight: 6 }} />
                        <Text style={s.addRowBtnText}>Add date</Text>
                    </PressableOpacity>
                </View>
            )}
            {d.monthlyMode === "ordinal" && (
                <View style={{ marginTop: 12, gap: 8 }}>
                    {d.ordinalEntries.map(renderOrdinalEntry)}
                    <PressableOpacity style={s.addRowBtn} onPress={addOrdinalEntry}>
                        <Feather name="plus-circle" size={16} color={colors.brand} style={{ marginRight: 6 }} />
                        <Text style={s.addRowBtnText}>Add pattern</Text>
                    </PressableOpacity>
                </View>
            )}
        </View>
    );

    const renderCustomSubBuilder = () => (
        <View style={[s.ordinalCard, { marginTop: 8 }]}>
            <Text style={s.fieldLabel}>Rule type</Text>
            <PressableOpacity style={s.dateFieldRow}
                onPress={() => upd({ customShowFreqPicker: !d.customShowFreqPicker })}>
                <Text style={d.customFreq ? s.dateFieldText : s.dayPickerPlaceholder}>
                    {d.customFreq ? FREQ_LABELS[d.customFreq] : "Select frequency"}
                </Text>
                <Feather name={d.customShowFreqPicker ? "chevron-up" : "chevron-down"} size={14} color={colors.textFaint} style={{ marginLeft: "auto" }} />
            </PressableOpacity>
            {d.customShowFreqPicker && (
                <View style={s.inlineDayPicker}>
                    {(["daily", "weekly", "biweekly", "monthly"] as Frequency[]).map(f => (
                        <PressableOpacity key={f} style={[s.dayOption, d.customFreq === f && s.dayOptionActive]}
                            onPress={() => { animate(); setD(prev => ({ ...prev, customFreq: f, customShowFreqPicker: false, weekdayRows: [], monthlyMode: null, monthlyDates: [], ordinalEntries: [], dailySameTime: null })); }}>
                            <Text style={[s.dayOptionText, d.customFreq === f && s.dayOptionTextActive]}>{FREQ_LABELS[f]}</Text>
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
                    <Text style={s.skipBtnText}>Cancel</Text>
                </PressableOpacity>
                <PressableOpacity style={s.primaryBtn}
                    onPress={() => editingRoutineId ? saveEditedRoutine(editingRoutineId) : finishCustomRoutine()}>
                    <Text style={s.primaryBtnText}>{editingRoutineId ? "Save changes" : "Add rule"}</Text>
                </PressableOpacity>
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
                    <PressableOpacity key={r.id} style={s.routineCard} onPress={() => startEditingRoutine(r.id)}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.routineCardLabel}>{r.label}</Text>
                            <Text style={s.routineCardSub}>Tap to edit</Text>
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
                    <Text style={s.addRowBtnText}>Add rule</Text>
                </PressableOpacity>
            )}
            {d.customBuilding && !editingRoutineId && renderCustomSubBuilder()}
        </View>
    );

    return (
        <View style={s.screen}>
            <View style={s.screenHeader}>
                <PressableOpacity onPress={onBack} style={s.iconBtn}>
                    <Feather name="arrow-left" size={24} color={colors.textMuted} />
                </PressableOpacity>
                <StepDots total={4} current={1} />
                <View style={{ width: 36 }} />
            </View>
            <ScrollView
                ref={scrollViewRef}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                automaticallyAdjustKeyboardInsets
            >
                <Text style={s.screenTitle}>Set Recurring Meetups</Text>
                <Text style={s.screenSub}>Set up when, where, and how you meet</Text>

                {schedules.length === 0 ? (
                    <View style={s.reviewEmptyCard}>
                        <Feather name="calendar" size={18} color={colors.textFaint} />
                        <Text style={s.reviewMuted}>No series — tap "Add More Series" below to add one, or continue without any</Text>
                    </View>
                ) : (
                <>
                {/* Description — the series takes on the group's name automatically,
                    so this card only collects optional extra detail. */}
                <View style={[s.sectionCard, { borderLeftWidth: 3, borderLeftColor: colors.brand }]}>
                    <View style={s.sectionHeaderRow}>
                        <View style={s.sectionIconChip}>
                            <Feather name="align-left" size={19} color={colors.brand} />
                        </View>
                        <Text style={s.sectionTitle}>Description</Text>
                    </View>
                    <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Description (optional)</Text>
                    <View style={[s.inputRow, s.descriptionInputRow, { marginBottom: 0 }]}>
                        <TextInput
                            style={[s.inlineInput, s.descriptionInput]}
                            placeholder="Add any extra details for this series..."
                            placeholderTextColor={colors.placeholder}
                            value={d.description}
                            onChangeText={t => upd({ description: t })}
                            multiline
                            textAlignVertical="top"
                        />
                    </View>
                </View>

                {/* Where */}
                <View style={[s.sectionCard, { borderLeftWidth: 3, borderLeftColor: colors.danger }]}>
                    <View style={s.sectionHeaderRow}>
                        <View style={s.sectionIconChip}>
                            <Feather name="map-pin" size={19} color={colors.danger} />
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
                <View style={[s.sectionCard, { borderLeftWidth: 3, borderLeftColor: colors.warning }]}>
                    <View style={s.sectionHeaderRow}>
                        <View style={s.sectionIconChip}>
                            <Feather name="calendar" size={19} color={colors.warning} />
                        </View>
                        <Text style={s.sectionTitle}>When</Text>
                    </View>

                    {/* Frequency */}
                    <Text style={[s.fieldLabel, s.fieldLabelFirst]}>How often?</Text>
                    <PressableOpacity style={s.dateFieldRow}
                        onPress={() => { setShowTZPicker(false); upd({ showFreqPicker: true, showStartDatePicker: false, showLeadTimePicker: false }); }}>
                        <Feather name="repeat" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                        <Text style={d.frequency ? s.dateFieldText : s.dayPickerPlaceholder}>
                            {d.frequency ? FREQ_LABELS[d.frequency] : "Select frequency"}
                        </Text>
                        <Feather name="chevron-down" size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                    </PressableOpacity>
                    {d.showFreqPicker && (
                        <OptionPickerModal title="How often?"
                            options={(["daily", "weekly", "biweekly", "monthly", "custom"] as Frequency[]).map(f => ({ key: f, label: FREQ_LABELS[f] }))}
                            selectedKey={d.frequency ?? ""}
                            onSelect={key => selectFreq(key as Frequency)}
                            onClose={() => upd({ showFreqPicker: false })} />
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
                            <PressableOpacity style={s.dateFieldRow}
                                onPress={() => { setShowTZPicker(false); upd({ showStartDatePicker: true, showFreqPicker: false, showLeadTimePicker: false }); }}>
                                <Feather name="calendar" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                                <Text style={s.dateFieldText}>{DateTime.fromISO(d.startDate).toLocaleString(DateTime.DATE_FULL)}</Text>
                                <Feather name="chevron-down" size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                            </PressableOpacity>
                            <CalendarPickerModal
                                visible={d.showStartDatePicker}
                                value={d.startDate}
                                minDate={DateTime.now().toISODate()!}
                                maxDate={DateTime.now().plus({ months: 4 }).toISODate()!}
                                onChange={iso => upd({ startDate: iso, showStartDatePicker: false })}
                                onCancel={() => upd({ showStartDatePicker: false })}
                            />
                        </>
                    )}

                    {/* Timezone — applies to the whole group, not any one schedule, so
                        it isn't part of the per-series fields above, but lives here
                        since it's still a "when" concern. */}
                    <Text style={s.fieldLabel}>Timezone</Text>
                    <PressableOpacity style={s.dateFieldRow}
                        onPress={() => {
                            animate();
                            setShowTZPicker(v => !v);
                            upd({ showFreqPicker: false, showStartDatePicker: false, showLeadTimePicker: false, showDeadlineTimePicker: false });
                        }}>
                        <Feather name="globe" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                        <Text style={s.dateFieldText}>{TZ_ABBR[timezone] ?? timezone}</Text>
                        <Feather name={showTZPicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                    </PressableOpacity>
                </View>

                {/* RSVP Rules */}
                <View style={[s.sectionCard, { borderLeftWidth: 3, borderLeftColor: "#7C3AED" }]}>
                    <View style={s.sectionHeaderRow}>
                        <View style={s.sectionIconChip}>
                            <Feather name="bell" size={19} color="#7C3AED" />
                        </View>
                        <Text style={s.sectionTitle}>RSVP Rules</Text>
                    </View>

                    <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Limit when people can RSVP?</Text>
                    <View style={s.boolRow}>
                        <PressableOpacity style={[s.boolBtn, !d.rsvpRestricted && s.boolBtnActive]}
                            onPress={() => upd({ rsvpRestricted: false })}>
                            <Text style={[s.boolBtnText, !d.rsvpRestricted && s.boolBtnTextActive]}>Allow anytime</Text>
                        </PressableOpacity>
                        <PressableOpacity style={[s.boolBtn, d.rsvpRestricted && s.boolBtnActive]}
                            onPress={() => upd({ rsvpRestricted: true })}>
                            <Text style={[s.boolBtnText, d.rsvpRestricted && s.boolBtnTextActive]}>Limit RSVPs</Text>
                        </PressableOpacity>
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
                                        <View style={s.leadRow}>
                                            <PressableOpacity style={s.stepperBtn} onPress={() => {
                                                const leadDays = Math.max(d.deadlineEnabled ? d.deadlineDays : 0, d.leadDays - 1);
                                                const sameDayViolation = d.deadlineEnabled && leadDays === d.deadlineDays && timeToMinutes(d.leadTime) > timeToMinutes(d.deadlineTime);
                                                upd({ leadDays, ...(sameDayViolation ? { leadTime: d.deadlineTime } : {}) });
                                            }}>
                                                <Feather name="minus" size={18} color={colors.brand} />
                                            </PressableOpacity>
                                            <View style={s.leadCenter}>
                                                <Text style={s.leadVal}>{d.leadDays}</Text>
                                                <Text style={s.leadSub}>days before</Text>
                                            </View>
                                            <PressableOpacity style={s.stepperBtn} onPress={() => upd({ leadDays: d.leadDays + 1 })}>
                                                <Feather name="plus" size={18} color={colors.brand} />
                                            </PressableOpacity>
                                        </View>
                                        <Text style={s.fieldLabel}>Time</Text>
                                        <PressableOpacity style={s.dateFieldRow}
                                            onPress={() => { setShowTZPicker(false); upd({ showLeadTimePicker: !d.showLeadTimePicker, showDeadlineTimePicker: false, showStartDatePicker: false, showFreqPicker: false }); }}>
                                            <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                                            <Text style={s.dateFieldText}>{d.leadTime}</Text>
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
                                        <Text style={s.toggleRowLabel}>Latest time to RSVP</Text>
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
                                        <View style={s.leadRow}>
                                            <PressableOpacity style={s.stepperBtn} onPress={() => upd({ deadlineDays: Math.max(0, d.deadlineDays - 1) })}>
                                                <Feather name="minus" size={18} color={colors.brand} />
                                            </PressableOpacity>
                                            <View style={s.leadCenter}>
                                                <Text style={s.leadVal}>{d.deadlineDays}</Text>
                                                <Text style={s.leadSub}>days before</Text>
                                            </View>
                                            <PressableOpacity style={s.stepperBtn} onPress={() => {
                                                const deadlineDays = d.leadEnabled ? Math.min(d.leadDays, d.deadlineDays + 1) : d.deadlineDays + 1;
                                                const sameDayViolation = d.leadEnabled && deadlineDays === d.leadDays && timeToMinutes(d.deadlineTime) < timeToMinutes(d.leadTime);
                                                upd({ deadlineDays, ...(sameDayViolation ? { deadlineTime: d.leadTime } : {}) });
                                            }}>
                                                <Feather name="plus" size={18} color={colors.brand} />
                                            </PressableOpacity>
                                        </View>
                                        <Text style={s.fieldLabel}>Time</Text>
                                        <PressableOpacity style={s.dateFieldRow}
                                            onPress={() => { setShowTZPicker(false); upd({ showDeadlineTimePicker: !d.showDeadlineTimePicker, showLeadTimePicker: false, showStartDatePicker: false, showFreqPicker: false }); }}>
                                            <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                                            <Text style={s.dateFieldText}>{d.deadlineTime}</Text>
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
                <View style={[s.sectionCard, { marginBottom: 8, borderLeftWidth: 3, borderLeftColor: "#0D9488" }]}>
                    <View style={s.sectionHeaderRow}>
                        <View style={s.sectionIconChip}>
                            <Feather name="users" size={19} color="#0D9488" />
                        </View>
                        <Text style={s.sectionTitle}>Capacity</Text>
                    </View>

                    <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Max Attendees</Text>
                    <View style={s.boolRow}>
                        <PressableOpacity
                            style={[s.boolBtn, d.maxAttendeesMode === "unlimited" && s.boolBtnActive]}
                            onPress={() => upd({ maxAttendeesMode: "unlimited", maxAttendeesInput: "" })}
                        >
                            <Text style={[s.boolBtnText, d.maxAttendeesMode === "unlimited" && s.boolBtnTextActive]}>Unlimited</Text>
                        </PressableOpacity>
                        <PressableOpacity
                            style={[s.boolBtn, d.maxAttendeesMode === "limited" && s.boolBtnActive]}
                            onPress={() => upd({ maxAttendeesMode: "limited" })}
                        >
                            <Text style={[s.boolBtnText, d.maxAttendeesMode === "limited" && s.boolBtnTextActive]}>Limited</Text>
                        </PressableOpacity>
                    </View>
                    {d.maxAttendeesMode === "limited" && (() => {
                        const maxAttendeesError = getMaxAttendeesError(d.maxAttendeesMode, d.maxAttendeesInput);
                        return (
                            <View style={{ marginTop: 10 }}>
                                <View style={[s.inputRow, { marginBottom: 0 }, maxAttendeesError && s.inputRowError]}>
                                    <Feather name="users" size={16} color={colors.textFaint} style={{ marginRight: 8 }} />
                                    <TextInput
                                        style={s.inlineInput}
                                        placeholder="How many?"
                                        placeholderTextColor={colors.placeholder}
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
                </>
                )}
            </ScrollView>
            <View style={s.screenFooter}>
                <PressableOpacity style={[s.skipBtn, { marginLeft: 12 }]} onPress={onSkip}>
                    <Text style={s.skipBtnText}>Skip</Text>
                </PressableOpacity>

                <PressableOpacity style={[s.reviewBtnGhost, !canProceed() && s.reviewBtnGhostDisabled]}
                    onPress={() => canProceed() && onNext(schedules.filter(sch => sch.frequency), timezone)}
                    disabled={!canProceed()}>
                    <Text style={s.reviewBtnGhostText}>Review</Text>
                    <Feather name="arrow-right" size={16} color={colors.brand} style={{ marginLeft: 4 }} />
                </PressableOpacity>
            </View>

            <LocationSearchModal
                visible={isLocationSearchOpen}
                initialValue={d.location}
                placeholder="e.g. 123 Main St or zoom.us/j/..."
                onDone={(text) => { upd({ location: text }); setIsLocationSearchOpen(false); }}
                onCancel={() => setIsLocationSearchOpen(false)}
            />

            {showTZPicker && (
                <OptionPickerModal
                    title="Timezone"
                    options={USA_TIMEZONES.map(tz => ({ key: tz.value, label: tz.label }))}
                    selectedKey={timezone}
                    onSelect={key => { setTimezone(key); setShowTZPicker(false); }}
                    onClose={() => setShowTZPicker(false)}
                />
            )}
        </View>
    );
};
