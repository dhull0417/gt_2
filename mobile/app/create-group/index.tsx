import React, { useState, useMemo, useCallback } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    ScrollView,
    FlatList,
    StyleSheet,
    Alert,
    Platform,
    Share,
    Keyboard,
    ActivityIndicator,
    LayoutAnimation,
    UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { DateTime } from "luxon";
import { useCreateGroup } from "../../hooks/useCreateGroup";
import { useSearchUsers } from "../../hooks/useSearchUsers";
import { useContactMatching, ContactEntry } from "../../hooks/useContactMatching";
import TimePicker from "../../components/TimePicker";
import { Frequency, DayTime } from "../../utils/api";

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

interface UserStub { _id: string; username: string; firstName?: string; lastName?: string; }

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
    location: string;
    startDate: string;
    timezone: string;
    frequency: Frequency | null;
    leadDays: number;
    leadTime: string;
    showLeadTimePicker: boolean;
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
    location: "",
    startDate: DateTime.now().toISODate()!,
    timezone: "America/Denver",
    frequency: null,
    leadDays: 1,
    leadTime: "09:00 AM",
    showLeadTimePicker: false,
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

// ─── Inline Calendar ──────────────────────────────────────────────────────────

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

// ─── StepDots ─────────────────────────────────────────────────────────────────

const StepDots = ({ total, current }: { total: number; current: number }) => (
    <View style={s.dots}>
        {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={[s.dot, i === current && s.dotActive]} />
        ))}
    </View>
);

// ─── SCREEN 1: Name ───────────────────────────────────────────────────────────

const NameScreen = ({ onNext, onClose }: { onNext: (name: string) => void; onClose: () => void }) => {
    const [name, setName] = useState("");
    return (
        <View style={s.screen}>
            <View style={s.screenHeader}>
                <TouchableOpacity onPress={onClose} style={s.iconBtn}>
                    <Feather name="x" size={24} color="#6B7280" />
                </TouchableOpacity>
                <StepDots total={4} current={0} />
                <View style={{ width: 36 }} />
            </View>
            <View style={s.screenBody}>
                <Text style={s.screenTitle}>Name your group</Text>
                <Text style={s.screenSub}>What are you calling this crew?</Text>
                <TextInput
                    style={s.bigInput}
                    placeholder="e.g. Basketball Squad"
                    placeholderTextColor="#C4C9D4"
                    value={name}
                    onChangeText={setName}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => name.trim() && onNext(name.trim())}
                />
            </View>
            <View style={s.screenFooter}>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                    style={[s.primaryBtn, !name.trim() && s.primaryBtnDisabled]}
                    onPress={() => name.trim() && onNext(name.trim())}
                    disabled={!name.trim()}
                >
                    <Text style={s.primaryBtnText}>Continue</Text>
                    <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

// ─── SCREEN 2: Members ────────────────────────────────────────────────────────

const MembersScreen = ({ groupName, onNext, onBack }: {
    groupName: string; onNext: (members: UserStub[]) => void; onBack: () => void;
}) => {
    const [selected, setSelected] = useState<UserStub[]>([]);
    const [query, setQuery] = useState("");
    const { data: results, isLoading: isSearching } = useSearchUsers(query);
    const { contacts, isLoading: isLoadingContacts } = useContactMatching();

    const isSearchActive = query.length > 0;

    const toggle = (u: UserStub) => {
        setSelected(prev => prev.some(m => m._id === u._id) ? prev.filter(m => m._id !== u._id) : [...prev, u]);
        setQuery("");
        Keyboard.dismiss();
    };

    const handleShare = async () => {
        try { await Share.share({ message: `Join my group "${groupName}" on GroupThat! Download the app: https://dhull0417.github.io/groupthat-testing/` }); } catch {}
    };

    const handleSmsContact = async (contact: ContactEntry) => {
        try {
            await Share.share({
                message: `Hey ${contact.name.split(' ')[0]}! I'm inviting you to join "${groupName}" on GroupThat. Download the app: https://dhull0417.github.io/groupthat-testing/`,
            });
        } catch {}
    };

    const renderContact = ({ item }: { item: ContactEntry }) => {
        const appUser = item.appUser;
        const isSelected = !!appUser && selected.some(m => m._id === appUser._id);
        return (
            <View style={s.resultRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={s.resultText}>{item.name}</Text>
                    {appUser?.username ? (
                        <Text style={[s.resultSubText, { color: '#6B7280' }]}>@{appUser.username}</Text>
                    ) : null}
                    <Text style={[s.resultSubText, appUser ? s.statusOnApp : s.statusNotOnApp]}>
                        {appUser ? 'On GroupThat' : 'Invite to GroupThat'}
                    </Text>
                </View>
                {appUser ? (
                    <TouchableOpacity
                        style={isSelected ? s.contactBtnSelected : s.contactBtnAdd}
                        onPress={() => toggle(appUser)}
                    >
                        <Text style={isSelected ? s.contactBtnSelectedText : s.contactBtnAddText}>
                            {isSelected ? 'Added' : 'Add'}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={s.contactBtnSms}
                        onPress={() => handleSmsContact(item)}
                    >
                        <Feather name="send" size={13} color="#6B7280" />
                        <Text style={s.contactBtnSmsText}>SMS</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <View style={s.screen}>
            <View style={s.screenHeader}>
                <TouchableOpacity onPress={onBack} style={s.iconBtn}>
                    <Feather name="arrow-left" size={24} color="#6B7280" />
                </TouchableOpacity>
                <StepDots total={4} current={1} />
                <View style={{ width: 36 }} />
            </View>
            <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 }}>
                <Text style={s.screenTitle}>Invite members</Text>
                <Text style={s.screenSub}>Search or pick from your contacts</Text>
            </View>
            <View style={[s.searchRow, { marginHorizontal: 24 }]}>
                <Feather name="search" size={18} color="#9CA3AF" />
                <TextInput
                    style={s.searchInput}
                    placeholder="Search by name or username..."
                    placeholderTextColor="#C4C9D4"
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')}>
                        <Feather name="x" size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                )}
            </View>

            {selected.length > 0 && (
                <View style={s.selectedChipsWrap}>
                    {selected.map(u => (
                        <TouchableOpacity key={u._id} style={s.chip} onPress={() => toggle(u)}>
                            <Text style={s.chipText}>{u.firstName ? `${u.firstName}` : `@${u.username}`}</Text>
                            <Feather name="x" size={11} color="#3730A3" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            <View style={{ flex: 1, paddingHorizontal: 24 }}>
                {isSearchActive ? (
                    isSearching ? (
                        <ActivityIndicator color="#4A90E2" style={{ marginTop: 20 }} />
                    ) : (
                        <FlatList
                            data={results || []}
                            keyExtractor={i => i._id}
                            keyboardShouldPersistTaps="handled"
                            renderItem={({ item }) => (
                                <TouchableOpacity style={s.resultRow} onPress={() => toggle(item)}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.resultText}>{item.firstName} {item.lastName}</Text>
                                        <Text style={[s.resultSubText, { color: '#6B7280' }]}>@{item.username}</Text>
                                    </View>
                                    {selected.some(m => m._id === item._id) && (
                                        <Feather name="check-circle" size={20} color="#4A90E2" />
                                    )}
                                </TouchableOpacity>
                            )}
                        />
                    )
                ) : (
                    isLoadingContacts ? (
                        <ActivityIndicator color="#4A90E2" style={{ marginTop: 20 }} />
                    ) : (
                        <FlatList
                            data={contacts}
                            keyExtractor={i => i.id}
                            keyboardShouldPersistTaps="handled"
                            renderItem={renderContact}
                            ListEmptyComponent={
                                <Text style={{ textAlign: 'center', marginTop: 24, color: '#9CA3AF', fontSize: 14 }}>
                                    No contacts found.
                                </Text>
                            }
                        />
                    )
                )}
            </View>

            <TouchableOpacity style={[s.shareBtn, { marginHorizontal: 24, marginBottom: 12 }]} onPress={handleShare}>
                <Feather name="share-2" size={16} color="#4A90E2" />
                <Text style={s.shareBtnText}>Share Invite Link</Text>
            </TouchableOpacity>

            <View style={s.screenFooter}>
                <TouchableOpacity style={s.skipBtn} onPress={() => onNext([])}>
                    <Text style={s.skipBtnText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.primaryBtn} onPress={() => onNext(selected)}>
                    <Text style={s.primaryBtnText}>Continue</Text>
                    <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

// ─── SCREEN 3: Schedule ───────────────────────────────────────────────────────

const ScheduleScreen = ({ onNext, onBack, onSkip }: {
    onNext: (data: ScheduleData) => void; onBack: () => void; onSkip: () => void;
}) => {
    const [d, setD] = useState<ScheduleData>(defaultSchedule());

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
            ordinalEntries: [...prev.ordinalEntries, { id: uid(), occurrence: "1st", day: 1, time: "05:00 PM", expanded: true, showTimePicker: false }],
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
    const canProceed = (): boolean => {
        if (!d.frequency) return true;
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

    return (
        <View style={s.screen}>
            <View style={s.screenHeader}>
                <TouchableOpacity onPress={onBack} style={s.iconBtn}>
                    <Feather name="arrow-left" size={24} color="#6B7280" />
                </TouchableOpacity>
                <StepDots total={4} current={2} />
                <View style={{ width: 36 }} />
            </View>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Text style={s.screenTitle}>Schedule</Text>
                <Text style={s.screenSub}>Set up when and where you meet</Text>

                {/* Location */}
                <Text style={s.fieldLabel}>Location or link</Text>
                <View style={s.inputRow}>
                    <Feather name="map-pin" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
                    <TextInput style={s.inlineInput} placeholder="e.g. 123 Main St or zoom.us/j/..."
                        placeholderTextColor="#C4C9D4" value={d.location} onChangeText={v => upd({ location: v })} />
                </View>

                {/* Start Date */}
                <Text style={s.fieldLabel}>Start date</Text>
                <TouchableOpacity style={s.dateFieldRow}
                    onPress={() => upd({ showStartDatePicker: !d.showStartDatePicker, showTZPicker: false, showFreqPicker: false, showLeadTimePicker: false })}>
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
                    onPress={() => upd({ showTZPicker: !d.showTZPicker, showStartDatePicker: false, showFreqPicker: false, showLeadTimePicker: false })}>
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
                    onPress={() => upd({ showFreqPicker: !d.showFreqPicker, showStartDatePicker: false, showTZPicker: false, showLeadTimePicker: false })}>
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

                {/* RSVP Lead */}
                <Text style={[s.fieldLabel, { marginTop: 20 }]}>RSVP opens</Text>
                <View style={s.leadRow}>
                    <TouchableOpacity style={s.stepperBtn} onPress={() => upd({ leadDays: Math.max(1, d.leadDays - 1) })}>
                        <Feather name="minus" size={18} color="#4A90E2" />
                    </TouchableOpacity>
                    <View style={s.leadCenter}>
                        <Text style={s.leadVal}>{d.leadDays}</Text>
                        <Text style={s.leadSub}>days before</Text>
                    </View>
                    <TouchableOpacity style={s.stepperBtn} onPress={() => upd({ leadDays: d.leadDays + 1 })}>
                        <Feather name="plus" size={18} color="#4A90E2" />
                    </TouchableOpacity>
                    <TimeButton time={d.leadTime} active={d.showLeadTimePicker}
                        onPress={() => upd({ showLeadTimePicker: !d.showLeadTimePicker, showStartDatePicker: false, showTZPicker: false, showFreqPicker: false })} />
                </View>
                {d.showLeadTimePicker && (
                    <View style={s.inlinePickerBox}>
                        <TimePicker initialValue={d.leadTime} onTimeChange={t => upd({ leadTime: t })} />
                    </View>
                )}
            </ScrollView>
            <View style={s.screenFooter}>
                <TouchableOpacity style={s.skipBtn} onPress={onSkip}>
                    <Text style={s.skipBtnText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.primaryBtn, !canProceed() && s.primaryBtnDisabled]}
                    onPress={() => canProceed() && onNext(d)} disabled={!canProceed()}>
                    <Text style={s.primaryBtnText}>Review</Text>
                    <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

// ─── Build payload ────────────────────────────────────────────────────────────

const buildSchedulePayload = (d: ScheduleData) => {
    if (!d.frequency) return {};
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
        routines = [{ 
            frequency: "monthly", 
            dayTimes: d.monthlyDates.map(e => ({ date: e.date, time: e.time })) 
        }];
    } else if (d.monthlyMode === "ordinal") {
        topFreq = "ordinal" as Frequency;
        // Ensure rules are always included and non-empty
        const rules = d.ordinalEntries.map(e => ({ 
            type: "byDay", 
            occurrence: e.occurrence ?? "1st",  // ← safety fallback
            day: e.day ?? 1                      // ← safety fallback
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
        defaultLocation: d.location,
        generationLeadDays: d.leadDays,
        generationLeadTime: d.leadTime,
    };
};

// ─── SCREEN 4: Review ─────────────────────────────────────────────────────────

const ReviewScreen = ({ groupName, members, schedule, onConfirm, onBack, isPending }: {
    groupName: string; members: UserStub[]; schedule: ScheduleData | null;
    onConfirm: () => void; onBack: () => void; isPending: boolean;
}) => (
    <View style={s.screen}>
        <View style={s.screenHeader}>
            <TouchableOpacity onPress={onBack} style={s.iconBtn}>
                <Feather name="arrow-left" size={24} color="#6B7280" />
            </TouchableOpacity>
            <StepDots total={4} current={3} />
            <View style={{ width: 36 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <Text style={s.screenTitle}>Review</Text>
            <Text style={s.screenSub}>Confirm before creating your group</Text>

            <View style={s.reviewCard}>
                <Text style={s.reviewCardLabel}>Group name</Text>
                <Text style={s.reviewCardValue}>{groupName}</Text>
            </View>

            <View style={s.reviewCard}>
                <Text style={s.reviewCardLabel}>Members</Text>
                {members.length === 0
                    ? <Text style={s.reviewCardMuted}>Just you for now</Text>
                    : members.map(m => <Text key={m._id} style={s.reviewCardValue}>@{m.username}</Text>)
                }
            </View>

            <View style={s.reviewCard}>
                <Text style={s.reviewCardLabel}>Schedule</Text>
                {!schedule?.frequency ? (
                    <Text style={s.reviewCardMuted}>No schedule set</Text>
                ) : (
                    <>
                        <Text style={s.reviewCardValue}>{FREQ_LABELS[schedule.frequency] || schedule.frequency}</Text>
                        {schedule.location ? <Text style={s.reviewCardMuted}>📍 {schedule.location}</Text> : null}
                        <Text style={s.reviewCardMuted}>Starts {DateTime.fromISO(schedule.startDate).toLocaleString(DateTime.DATE_MED)}</Text>
                        <Text style={s.reviewCardMuted}>Timezone: {USA_TIMEZONES.find(t => t.value === schedule.timezone)?.label}</Text>
                        <Text style={s.reviewCardMuted}>RSVP opens {schedule.leadDays} days before at {schedule.leadTime}</Text>
                        {schedule.frequency === "daily" && (schedule.dailySameTime
                            ? <Text style={s.reviewCardMuted}>Every day @ {schedule.dailySharedTime}</Text>
                            : schedule.dailyRows.map(r => <Text key={r.id} style={s.reviewCardMuted}>• {DAYS_OF_WEEK.find(dw => dw.value === r.day)?.label} @ {r.time}</Text>)
                        )}
                        {(schedule.frequency === "weekly" || schedule.frequency === "biweekly") && schedule.weekdayRows.filter(r => r.day !== null).map(r => (
                            <Text key={r.id} style={s.reviewCardMuted}>
                                • {DAYS_OF_WEEK.find(dw => dw.value === r.day)?.label} @ {r.time}
                                {schedule.frequency === "biweekly" && r.startDate ? ` (from ${DateTime.fromISO(r.startDate).toLocaleString(DateTime.DATE_MED)})` : ""}
                            </Text>
                        ))}
                        {schedule.frequency === "monthly" && schedule.monthlyMode === "date" && schedule.monthlyDates.map(e => (
                            <Text key={e.id} style={s.reviewCardMuted}>• {e.date}{ordSfx(e.date)} of month @ {e.time}</Text>
                        ))}
                        {schedule.frequency === "monthly" && schedule.monthlyMode === "ordinal" && schedule.ordinalEntries.map(e => (
                            <Text key={e.id} style={s.reviewCardMuted}>• {e.occurrence} {DAYS_OF_WEEK.find(dw => dw.value === e.day)?.label} @ {e.time}</Text>
                        ))}
                        {schedule.frequency === "custom" && schedule.builtRoutines.map(r => (
                            <View key={r.id} style={s.reviewRoutineChip}>
                                <Text style={s.reviewRoutineChipText}>{r.label}</Text>
                            </View>
                        ))}
                    </>
                )}
            </View>
        </ScrollView>
        <View style={s.screenFooter}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={s.primaryBtn} onPress={onConfirm} disabled={isPending}>
                {isPending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Text style={s.primaryBtnText}>Create Group</Text><Feather name="check" size={18} color="#fff" style={{ marginLeft: 6 }} /></>
                }
            </TouchableOpacity>
        </View>
    </View>
);

// ─── Root ─────────────────────────────────────────────────────────────────────

type Step = "name" | "members" | "schedule" | "review";

const CreateGroupScreen = () => {
    const router = useRouter();
    const { mutate, isPending } = useCreateGroup();
    const [step, setStep] = useState<Step>("name");
    const [groupName, setGroupName] = useState("");
    const [members, setMembers] = useState<UserStub[]>([]);
    const [schedule, setSchedule] = useState<ScheduleData | null>(null);

    const handleClose = () => router.replace("/(tabs)/groups");

    const handleCreate = () => {
        console.log("Schedule at create time:", JSON.stringify(schedule, null, 2)); // ← add this
        const schedulePayload = schedule?.frequency ? buildSchedulePayload(schedule) : {};
        console.log("Built payload:", JSON.stringify(schedulePayload, null, 2)); // ← and this
        const payload: any = {
            name: groupName,
            members: members.map(m => m._id),
            meetupsToDisplay: 1,
            generationLeadDays: schedule?.leadDays ?? 4,
            generationLeadTime: schedule?.leadTime ?? "09:00 AM",
            timezone: schedule?.timezone ?? "America/Denver",
            defaultLocation: schedule?.location ?? "",
            ...schedulePayload,
        };
        mutate(payload, {
            onSuccess: (data: any) => {
                const groupId = data?.group?._id;
                if (groupId) {
                    router.replace({ pathname: '/add-members/[id]', params: { id: groupId } });
                } else {
                    router.replace("/(tabs)/groups");
                }
            },
            onError: (err: any) => Alert.alert("Error", err?.response?.data?.error || "Failed to create group."),
        });
    };

    if (step === "name") return <SafeAreaView style={s.safe}><NameScreen onNext={n => { setGroupName(n); setStep("members"); }} onClose={handleClose} /></SafeAreaView>;
    if (step === "members") return <SafeAreaView style={s.safe}><MembersScreen groupName={groupName} onNext={m => { setMembers(m); setStep("schedule"); }} onBack={() => setStep("name")} /></SafeAreaView>;
    if (step === "schedule") return <SafeAreaView style={s.safe}><ScheduleScreen onNext={data => { setSchedule(data); setStep("review"); }} onBack={() => setStep("members")} onSkip={() => { setSchedule(null); setStep("review"); }} /></SafeAreaView>;
    return <SafeAreaView style={s.safe}><ReviewScreen groupName={groupName} members={members} schedule={schedule} onConfirm={handleCreate} onBack={() => setStep("schedule")} isPending={isPending} /></SafeAreaView>;
};

export default CreateGroupScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#F9FAFB" },
    screen: { flex: 1 },
    screenHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    screenBody: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
    screenFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#F3F4F6", backgroundColor: "#fff" },
    screenTitle: { fontSize: 26, fontWeight: "900", color: "#111827", marginBottom: 4 },
    screenSub: { fontSize: 14, color: "#9CA3AF", marginBottom: 20 },
    iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    dots: { flexDirection: "row", gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#E5E7EB" },
    dotActive: { backgroundColor: "#4A90E2", width: 18 },
    bigInput: { fontSize: 22, fontWeight: "700", color: "#111827", borderBottomWidth: 2, borderBottomColor: "#4A90E2", paddingVertical: 12, marginTop: 8 },
    inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
    inlineInput: { flex: 1, fontSize: 15, color: "#374151" },
    searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
    searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: "#374151" },
    selectedChipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 24, paddingBottom: 8 },
    chip: { flexDirection: "row", alignItems: "center", backgroundColor: "#EEF2FF", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "#C7D2FE" },
    chipText: { fontSize: 13, fontWeight: "600", color: "#3730A3" },
    resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
    resultText: { fontSize: 15, fontWeight: "600", color: "#374151" },
    resultSubText: { fontSize: 12, marginTop: 1 },
    statusOnApp: { color: "#22C55E" },
    statusNotOnApp: { color: "#9CA3AF" },
    contactBtnAdd: { backgroundColor: "#EEF2FF", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
    contactBtnAddText: { color: "#4A90E2", fontWeight: "700", fontSize: 13 },
    contactBtnSelected: { backgroundColor: "#DCFCE7", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
    contactBtnSelectedText: { color: "#16A34A", fontWeight: "700", fontSize: 13 },
    contactBtnSms: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F3F4F6", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    contactBtnSmsText: { color: "#6B7280", fontWeight: "600", fontSize: 13 },
    shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#93C5FD", backgroundColor: "#EFF6FF" },
    shareBtnText: { marginLeft: 8, color: "#4A90E2", fontWeight: "700", fontSize: 14 },
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
    leadRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    stepperBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
    leadCenter: { alignItems: "center", minWidth: 60 },
    leadVal: { fontSize: 22, fontWeight: "900", color: "#111827" },
    leadSub: { fontSize: 10, color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase" },
    reviewCard: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", padding: 16, marginBottom: 12 },
    reviewCardLabel: { fontSize: 11, fontWeight: "800", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
    reviewCardValue: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 2 },
    reviewCardMuted: { fontSize: 14, color: "#6B7280", marginBottom: 2 },
    reviewRoutineChip: { backgroundColor: "#EEF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "flex-start", marginBottom: 4 },
    reviewRoutineChipText: { fontSize: 13, fontWeight: "700", color: "#1D4ED8" },
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