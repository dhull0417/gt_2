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
    Share,
    ActivityIndicator,
    LayoutAnimation,
    UIManager,
    Image,
    Keyboard,
    Animated,
    Modal,
} from "react-native";
import { BlurView } from "expo-blur";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { pickAndUploadImage } from "@/utils/uploadImage";
import { GroupAvatar } from "@/components/GroupAvatar";
import { DateTime } from "luxon";
import { useQuery } from "@tanstack/react-query";
import { useCreateGroup } from "../../hooks/useCreateGroup";
import NativeTimePicker, { timeStringToDate } from "../../components/NativeTimePicker";
import LocationField from "../../components/LocationField";
import LocationSearchModal from "../../components/LocationSearchModal";
import { Frequency, DayTime, useApiClient, groupApi } from "../../utils/api";

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

interface UserStub { _id: string; firstName?: string; lastName?: string; }

interface WeekdayRow {
    id: string;
    day: number | null;
    time: string;
    startDate: string | null;
    showTimePicker: boolean;
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
    maxAttendeesMode: "unlimited" | "limited";
    maxAttendeesInput: string;
}

// Shared by the live inline error and the Continue-button gate so both agree on
// what counts as valid. Empty input is treated as "not yet answered" (no error
// shown) rather than invalid, so the field doesn't flash red before typing starts.
// RSVP opens and RSVP deadline are each "N days before, at time of day". When both
// land on the same day-count, only the time of day keeps opens before the deadline,
// so the day-count comparison alone (leadDays >= deadlineDays) isn't sufficient.
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

const defaultSchedule = (): ScheduleData => ({
    location: "",
    startDate: DateTime.now().toISODate()!,
    timezone: "America/Denver",
    frequency: null,
    rsvpRestricted: false,
    leadEnabled: true,
    leadDays: 5,
    leadTime: "09:00 AM",
    showLeadTimePicker: false,
    deadlineEnabled: false,
    deadlineDays: 2,
    deadlineTime: "09:00 AM",
    showDeadlineTimePicker: false,
    showStartDatePicker: false,
    showTZPicker: false,
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

// ─── Inline Calendar ──────────────────────────────────────────────────────────

const InlineCalendar = ({ value, onChange, minDate, maxDate, bare, large }: {
    value: string; onChange: (iso: string) => void; minDate?: string; maxDate?: string; bare?: boolean; large?: boolean;
}) => {
    const [month, setMonth] = useState(
        value ? DateTime.fromISO(value).startOf("month") : DateTime.now().startOf("month")
    );
    // Chunked into explicit 7-cell week rows rather than one flex-wrap grid — letting
    // aspect-ratio cells wrap on their own leaves Yoga reserving a phantom trailing row
    // of blank space whenever the day count isn't a clean multiple of 7.
    const weeks = useMemo(() => {
        const start = month.startOf("month");
        const firstDow = start.weekday === 7 ? 0 : start.weekday;
        const cells: (DateTime | null)[] = [];
        for (let i = 0; i < firstDow; i++) cells.push(null);
        for (let d = 1; d <= month.daysInMonth!; d++) cells.push(month.set({ day: d }));
        while (cells.length % 7 !== 0) cells.push(null);
        const chunks: (DateTime | null)[][] = [];
        for (let i = 0; i < cells.length; i += 7) chunks.push(cells.slice(i, i + 7));
        return chunks;
    }, [month]);
    const minDT = minDate ? DateTime.fromISO(minDate) : DateTime.now().startOf("day");
    const maxDT = maxDate ? DateTime.fromISO(maxDate) : null;
    const canGoNext = !maxDT || month.plus({ months: 1 }).startOf("month") <= maxDT.startOf("month");
    return (
        <View style={bare ? cal.containerBare : cal.container}>
            <View style={[cal.nav, large && cal.navLarge]}>
                <TouchableOpacity onPress={() => setMonth(m => m.minus({ months: 1 }))} style={[cal.navBtn, large && cal.navBtnLarge]}>
                    <Feather name="chevron-left" size={large ? 22 : 18} color="#4A90E2" />
                </TouchableOpacity>
                <Text style={[cal.monthLabel, large && cal.monthLabelLarge]}>{month.toFormat("MMMM yyyy")}</Text>
                <TouchableOpacity
                    onPress={() => canGoNext && setMonth(m => m.plus({ months: 1 }))}
                    disabled={!canGoNext}
                    style={[cal.navBtn, large && cal.navBtnLarge, !canGoNext && cal.navBtnDisabled]}
                >
                    <Feather name="chevron-right" size={large ? 22 : 18} color={canGoNext ? "#4A90E2" : "#C4C9D4"} />
                </TouchableOpacity>
            </View>
            <View style={[cal.weekRow, large && cal.weekRowLarge]}>
                {["S","M","T","W","T","F","S"].map((d, i) => (
                    <Text key={i} style={[cal.dayHeader, large && cal.dayHeaderLarge]}>{d}</Text>
                ))}
            </View>
            {weeks.map((week, wi) => (
                <View key={wi} style={cal.weekRow}>
                    {week.map((day, i) => {
                        if (!day) return <View key={`e-${wi}-${i}`} style={[cal.cell, large && cal.cellLarge]} />;
                        const iso = day.toISODate()!;
                        const selected = iso === value;
                        const disabled = day < minDT || (maxDT != null && day > maxDT);
                        return (
                            <TouchableOpacity
                                key={iso}
                                style={[cal.cell, large && cal.cellLarge, selected && cal.cellSelected, disabled && cal.cellDisabled]}
                                onPress={() => !disabled && onChange(iso)}
                                disabled={disabled}
                            >
                                <Text style={[cal.cellText, large && cal.cellTextLarge, selected && cal.cellTextSelected, disabled && cal.cellTextDisabled]}>
                                    {day.day}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
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

// ─── DayPickerModal ───────────────────────────────────────────────────────────
// Same blurred-popup treatment as the location search takeover — picking a day
// happens in a focused overlay instead of an inline list expanding the page,
// so choosing a weekday doesn't compete with the rest of the form for attention.

const DayPickerModal = ({ visible, selectedDay, onSelect, onCancel }: {
    visible: boolean; selectedDay: number | null; onSelect: (day: number) => void; onCancel: () => void;
}) => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={s.dayPickerPopupWrap}>
            <View style={s.dayPickerPopupCard}>
                <View style={s.dayPickerPopupHeader}>
                    <Text style={s.dayPickerPopupTitle}>Select Day</Text>
                    <TouchableOpacity onPress={onCancel} style={{ padding: 4 }} activeOpacity={0.7}>
                        <Feather name="x" size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                </View>
                {DAYS_OF_WEEK.map(dw => (
                    <TouchableOpacity
                        key={dw.value}
                        style={[s.dayOption, selectedDay === dw.value && s.dayOptionActive]}
                        onPress={() => onSelect(dw.value)}
                        activeOpacity={0.7}
                    >
                        <Text style={[s.dayOptionText, selectedDay === dw.value && s.dayOptionTextActive]}>{dw.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    </Modal>
);

// ─── CalendarPickerModal ────────────────────────────────────────────────────────
// Same popup treatment for the biweekly "First Occurrence" date — was an inline
// calendar expanding the page, now a focused overlay like the day picker above.

const CalendarPickerModal = ({ visible, value, minDate, maxDate, onChange, onCancel }: {
    visible: boolean; value: string; minDate?: string; maxDate?: string; onChange: (iso: string) => void; onCancel: () => void;
}) => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={s.dayPickerPopupWrap}>
            <View style={s.calendarPopupCard}>
                <View style={s.dayPickerPopupHeader}>
                    <Text style={s.dayPickerPopupTitle}>First Occurrence</Text>
                    <TouchableOpacity onPress={onCancel} style={{ padding: 4 }} activeOpacity={0.7}>
                        <Feather name="x" size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                </View>
                <View style={{ padding: 8 }}>
                    {visible && <InlineCalendar value={value} onChange={onChange} minDate={minDate} maxDate={maxDate} bare large />}
                </View>
            </View>
        </View>
    </Modal>
);

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

// ─── StepDots ─────────────────────────────────────────────────────────────────

const StepDots = ({ total, current }: { total: number; current: number }) => (
    <View style={s.dots}>
        {Array.from({ length: total }).map((_, i) => (
            <React.Fragment key={i}>
                <View style={[s.dot, i <= current && s.dotActive]} />
                {i < total - 1 && (
                    <View style={[s.dotLine, i < current && s.dotLineFilled]} />
                )}
            </React.Fragment>
        ))}
    </View>
);

// ─── SCREEN 1: Name ───────────────────────────────────────────────────────────

const NameScreen = ({ onNext, onClose }: { onNext: (name: string, imageUrl: string) => void; onClose: () => void }) => {
    const [name, setName] = useState("");
    const [localUri, setLocalUri] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState("");
    const [uploading, setUploading] = useState(false);
    const { getToken } = useAuth();

    const handlePickImage = async () => {
        try {
            const token = await getToken({ template: "supabase" });
            if (!token) return;
            setUploading(true);
            const url = await pickAndUploadImage("group-images", `group-${Date.now()}/cover.jpg`, token);
            if (url) {
                setLocalUri(url);
                setImageUrl(url);
            }
        } catch {
            Alert.alert("Error", "Could not upload image. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    const canContinue = name.trim().length > 0 && !uploading;

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
                    onSubmitEditing={() => Keyboard.dismiss()}
                />
                <TouchableOpacity onPress={handlePickImage} disabled={uploading} style={s.imagePicker}>
                    {uploading ? (
                        <ActivityIndicator color="#4A90E2" />
                    ) : localUri ? (
                        <>
                            <Image source={{ uri: localUri }} style={s.imagePreview} />
                            <View style={s.imageEditBadge}>
                                <Feather name="camera" size={18} color="#fff" />
                            </View>
                        </>
                    ) : (
                        <>
                            <Feather name="image" size={36} color="#9CA3AF" />
                            <Text style={s.imagePickerText}>Add group photo</Text>
                            <Text style={s.imagePickerSub}>Optional</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
            <View style={s.screenFooter}>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                    style={[s.primaryBtn, !canContinue && s.primaryBtnDisabled]}
                    onPress={() => canContinue && onNext(name.trim(), imageUrl)}
                    disabled={!canContinue}
                >
                    <Text style={s.primaryBtnText}>Continue</Text>
                    <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

// ─── SCREEN 4: Invite ─────────────────────────────────────────────────────────

const MembersScreen = ({ groupId, groupName, onDone }: {
    groupId: string; groupName: string; onDone: () => void;
}) => {
    const api = useApiClient();
    const { data: inviteLinkData } = useQuery({
        queryKey: ['inviteLink', groupId],
        queryFn: () => groupApi.generateInviteLink(api, groupId),
        enabled: !!groupId,
        staleTime: 1000 * 60 * 5,
    });

    const handleShare = async () => {
        const inviteLink = inviteLinkData?.link;
        if (!inviteLink) {
            Alert.alert('Not Ready', 'The invite link is still loading. Please try again in a moment.');
            return;
        }
        try {
            await Share.share({
                message: `Join my group "${groupName}" on GroupThat!\n\nSTEP 1 — Download the app:\n→ https://invite.groupthatapp.com/download\n\nSTEP 2 — Join the group:\n→ ${inviteLink}`,
            });
        } catch {}
    };

    return (
        <View style={s.screen}>
            <View style={s.screenHeader}>
                <View style={{ width: 36 }} />
                <StepDots total={4} current={3} />
                <View style={{ width: 36 }} />
            </View>
            <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 }}>
                <Text style={s.screenTitle}>Invite members</Text>
                <Text style={s.screenSub}>Invite your friends with an easy link</Text>
            </View>

            <TouchableOpacity style={[s.shareBtn, { marginHorizontal: 24, marginBottom: 12 }]} onPress={handleShare}>
                <Feather name="share-2" size={16} color="#4A90E2" />
                <Text style={s.shareBtnText}>Invite Friends</Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            <View style={s.screenFooter}>
                <TouchableOpacity style={s.skipBtn} onPress={onDone}>
                    <Text style={s.skipBtnText}>Skip for now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.primaryBtn} onPress={onDone}>
                    <Text style={s.primaryBtnText}>Done</Text>
                    <Feather name="check" size={18} color="#fff" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

// ─── SCREEN 3: Group Settings ─────────────────────────────────────────────────

const ScheduleScreen = ({ initialData, onNext, onBack, onSkip }: {
    initialData?: ScheduleData | null; onNext: (data: ScheduleData) => void; onBack: () => void; onSkip: () => void;
}) => {
    const [d, setD] = useState<ScheduleData>(initialData ?? defaultSchedule());
    const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false);
    const [dayPickerRowId, setDayPickerRowId] = useState<string | null>(null);
    const [calendarPickerRowId, setCalendarPickerRowId] = useState<string | null>(null);

    const upd = useCallback((patch: Partial<ScheduleData>) => {
        animate();
        setD(prev => ({ ...prev, ...patch }));
    }, []);

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
                weekdayRows: d.weekdayRows.map(r => ({ ...r, showTimePicker: false })),
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
        if (d.maxAttendeesMode === "limited") {
            if (d.maxAttendeesInput === "" || getMaxAttendeesError(d.maxAttendeesMode, d.maxAttendeesInput)) return false;
        }
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
                        <NativeTimePicker value={d.dailySharedTime} onChange={t => upd({ dailySharedTime: t })}
                            onClose={() => upd({ showDailySameTimePicker: false })} />
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
                <View key={row.id} style={{ marginBottom: 14 }}>
                    <View style={s.dayRow}>
                        <TouchableOpacity style={s.dayPickerTrigger}
                            onPress={() => { updWeekdayRow(row.id, { showTimePicker: false }); setDayPickerRowId(row.id); }}>
                            <Text style={row.day !== null ? s.dayPickerText : s.dayPickerPlaceholder}>
                                {row.day !== null ? DAYS_OF_WEEK.find(dw => dw.value === row.day)?.label : "Select day"}
                            </Text>
                            <Feather name="chevron-down" size={14} color="#9CA3AF" />
                        </TouchableOpacity>
                        {row.day !== null && (
                            <TimeButton time={row.time} active={row.showTimePicker}
                                onPress={() => updWeekdayRow(row.id, { showTimePicker: !row.showTimePicker })} />
                        )}
                        <TouchableOpacity onPress={() => removeWeekdayRow(row.id)} style={{ marginLeft: 8 }}>
                            <Feather name="trash-2" size={16} color="#F87171" />
                        </TouchableOpacity>
                    </View>

                    {row.showTimePicker && (
                        <NativeTimePicker value={row.time}
                            onChange={t => updWeekdayRow(row.id, { time: t })}
                            onClose={() => updWeekdayRow(row.id, { showTimePicker: false })} />
                    )}

                    {isBiweekly && row.day !== null && (
                        <View style={{ marginTop: 8 }}>
                            <Text style={s.startDateLabel}>First Occurrence</Text>
                            <TouchableOpacity style={s.dateFieldRow}
                                onPress={() => setCalendarPickerRowId(row.id)}>
                                <Feather name="calendar" size={14} color="#4A90E2" style={{ marginRight: 6 }} />
                                <Text style={s.dateFieldText}>
                                    {row.startDate ? DateTime.fromISO(row.startDate).toLocaleString(DateTime.DATE_MED) : "Set first occurrence date"}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            ))}
            <TouchableOpacity style={s.addRowBtn} onPress={addWeekdayRow}>
                <Feather name="plus-circle" size={16} color="#4A90E2" style={{ marginRight: 6 }} />
                <Text style={s.addRowBtnText}>Add day</Text>
            </TouchableOpacity>

            <DayPickerModal
                visible={dayPickerRowId !== null}
                selectedDay={d.weekdayRows.find(r => r.id === dayPickerRowId)?.day ?? null}
                onSelect={(day) => {
                    if (dayPickerRowId) updWeekdayRow(dayPickerRowId, { day, showTimePicker: true });
                    setDayPickerRowId(null);
                }}
                onCancel={() => setDayPickerRowId(null)}
            />

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
                        <NativeTimePicker value={entry.time}
                            onChange={t => updOrdinal(entry.id, { time: t })}
                            onClose={() => updOrdinal(entry.id, { showTimePicker: false })} />
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
                <StepDots total={4} current={1} />
                <View style={{ width: 36 }} />
            </View>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                automaticallyAdjustKeyboardInsets
            >
                <Text style={s.screenTitle}>Group Settings</Text>
                <Text style={s.screenSub}>Set up when, where, and how you meet</Text>

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

                    {/* Start Date */}
                    <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Start date</Text>
                    <TouchableOpacity style={s.dateFieldRow}
                        onPress={() => upd({ showStartDatePicker: !d.showStartDatePicker, showTZPicker: false, showFreqPicker: false, showLeadTimePicker: false })}>
                        <Feather name="calendar" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                        <Text style={s.dateFieldText}>{DateTime.fromISO(d.startDate).toLocaleString(DateTime.DATE_FULL)}</Text>
                        <Feather name={d.showStartDatePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                    </TouchableOpacity>
                    {d.showStartDatePicker && (
                        <InlineCalendar value={d.startDate}
                            onChange={iso => upd({ startDate: iso, showStartDatePicker: false })}
                            minDate={DateTime.now().toISODate()!}
                            maxDate={DateTime.now().plus({ months: 4 }).toISODate()!} />
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
                                    <Text style={s.toggleRowLabel}>RSVP opens</Text>
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
                                    <View style={[s.leadRow, { marginTop: 10 }]}>
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
                                        <TimeButton time={d.leadTime} active={d.showLeadTimePicker}
                                            onPress={() => upd({ showLeadTimePicker: !d.showLeadTimePicker, showDeadlineTimePicker: false, showStartDatePicker: false, showTZPicker: false, showFreqPicker: false })} />
                                    </View>
                                )}
                                {d.leadEnabled && d.showLeadTimePicker && (
                                    <NativeTimePicker value={d.leadTime} onChange={t => {
                                        const capped = d.deadlineEnabled && d.leadDays === d.deadlineDays && timeToMinutes(t) > timeToMinutes(d.deadlineTime);
                                        if (capped) {
                                            Alert.alert(
                                                "RSVP open time must happen before RSVP deadline",
                                                `• Both are ${d.leadDays} day${d.leadDays === 1 ? '' : 's'} before the meetup\n• Opens can't be later than ${d.deadlineTime}\n• Opens set to ${d.deadlineTime}`
                                            );
                                        }
                                        upd({ leadTime: capped ? d.deadlineTime : t });
                                    }}
                                        onClose={() => upd({ showLeadTimePicker: false })} />
                                )}
                            </View>

                            <View>
                                <View style={s.toggleRow}>
                                    <Text style={s.toggleRowLabel}>RSVP deadline</Text>
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
                                    <View style={[s.leadRow, { marginTop: 10 }]}>
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
                                        <TimeButton time={d.deadlineTime} active={d.showDeadlineTimePicker}
                                            onPress={() => upd({ showDeadlineTimePicker: !d.showDeadlineTimePicker, showLeadTimePicker: false, showStartDatePicker: false, showTZPicker: false, showFreqPicker: false })} />
                                    </View>
                                )}
                                {d.deadlineEnabled && d.showDeadlineTimePicker && (
                                    <NativeTimePicker value={d.deadlineTime} onChange={t => {
                                        const capped = d.leadEnabled && d.deadlineDays === d.leadDays && timeToMinutes(t) < timeToMinutes(d.leadTime);
                                        if (capped) {
                                            Alert.alert(
                                                "RSVP deadline must happen after RSVPs open",
                                                `• Both are ${d.deadlineDays} day${d.deadlineDays === 1 ? '' : 's'} before the meetup\n• Deadline can't be earlier than ${d.leadTime}\n• Deadline set to ${d.leadTime}`
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

            <LocationSearchModal
                visible={isLocationSearchOpen}
                initialValue={d.location}
                placeholder="e.g. 123 Main St or zoom.us/j/..."
                onDone={(text) => { upd({ location: text }); setIsLocationSearchOpen(false); }}
                onCancel={() => setIsLocationSearchOpen(false)}
            />
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
        generationLeadDays: d.rsvpRestricted && d.leadEnabled ? d.leadDays : null,
        generationLeadTime: d.leadTime,
        generationDeadlineDays: d.rsvpRestricted && d.deadlineEnabled ? d.deadlineDays : null,
        generationDeadlineTime: d.deadlineTime,
    };
};

// ─── SCREEN 4: Review ─────────────────────────────────────────────────────────

const ReviewScreen = ({ groupName, groupImage, members, schedule, onConfirm, onBack, isPending }: {
    groupName: string; groupImage?: string; members: UserStub[]; schedule: ScheduleData | null;
    onConfirm: () => void; onBack: () => void; isPending: boolean;
}) => {
    const maxAttendeesLabel = schedule?.maxAttendeesMode === "limited" && schedule.maxAttendeesInput
        ? schedule.maxAttendeesInput
        : "Unlimited";

    return (
        <View style={s.screen}>
            <View style={s.screenHeader}>
                <TouchableOpacity onPress={onBack} style={s.iconBtn}>
                    <Feather name="arrow-left" size={24} color="#6B7280" />
                </TouchableOpacity>
                <StepDots total={4} current={2} />
                <View style={{ width: 36 }} />
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <Text style={s.screenTitle}>Review</Text>
                <Text style={s.screenSub}>Confirm before creating your group</Text>

                {/* Hero */}
                <View style={s.reviewHero}>
                    <GroupAvatar name={groupName || "?"} imageUrl={groupImage} size={88} borderRadius={22} />
                    <Text style={s.reviewHeroName} numberOfLines={2}>{groupName || "Untitled group"}</Text>
                </View>

                {/* Schedule */}
                <View style={s.reviewSectionHeaderRow}>
                    <View style={[s.reviewIconChip, s.reviewIconChipAmber]}>
                        <Feather name="calendar" size={15} color="#F59E0B" />
                    </View>
                    <Text style={s.reviewSectionTitle}>Schedule</Text>
                </View>

                {!schedule?.frequency ? (
                    <View style={s.reviewEmptyCard}>
                        <Feather name="calendar" size={18} color="#9CA3AF" />
                        <Text style={s.reviewMuted}>No schedule set — you can add one later</Text>
                    </View>
                ) : (
                    <View style={s.reviewScheduleCard}>
                        <Text style={s.reviewScheduleFreq}>{FREQ_LABELS[schedule.frequency] || schedule.frequency}</Text>

                        <View style={{ marginTop: 10, gap: 7 }}>
                            {schedule.location ? (
                                <View style={s.reviewInlineRow}>
                                    <Feather name="map-pin" size={13} color="#9CA3AF" />
                                    <Text style={s.reviewInlineText}>{schedule.location}</Text>
                                </View>
                            ) : null}
                            <View style={s.reviewInlineRow}>
                                <Feather name="clock" size={13} color="#9CA3AF" />
                                <Text style={s.reviewInlineText}>Starts {DateTime.fromISO(schedule.startDate).toLocaleString(DateTime.DATE_MED)}</Text>
                            </View>
                            <View style={s.reviewInlineRow}>
                                <Feather name="globe" size={13} color="#9CA3AF" />
                                <Text style={s.reviewInlineText}>{USA_TIMEZONES.find(t => t.value === schedule.timezone)?.label}</Text>
                            </View>
                            {!schedule.rsvpRestricted || (!schedule.leadEnabled && !schedule.deadlineEnabled) ? (
                                <View style={s.reviewInlineRow}>
                                    <Feather name="bell" size={13} color="#9CA3AF" />
                                    <Text style={s.reviewInlineText}>RSVPs open anytime</Text>
                                </View>
                            ) : (
                                <>
                                    {schedule.leadEnabled && (
                                        <View style={s.reviewInlineRow}>
                                            <Feather name="unlock" size={13} color="#9CA3AF" />
                                            <Text style={s.reviewInlineText}>RSVP opens {schedule.leadDays} days before at {schedule.leadTime}</Text>
                                        </View>
                                    )}
                                    {schedule.deadlineEnabled && (
                                        <View style={s.reviewInlineRow}>
                                            <Feather name="lock" size={13} color="#9CA3AF" />
                                            <Text style={s.reviewInlineText}>RSVP deadline {schedule.deadlineDays} days before at {schedule.deadlineTime}</Text>
                                        </View>
                                    )}
                                </>
                            )}
                        </View>

                        <View style={s.reviewDetailSeparator} />

                        <View style={{ gap: 4 }}>
                            {schedule.frequency === "daily" && (schedule.dailySameTime
                                ? <Text style={s.reviewMutedBullet}>Every day @ {schedule.dailySharedTime}</Text>
                                : schedule.dailyRows.map(r => <Text key={r.id} style={s.reviewMutedBullet}>• {DAYS_OF_WEEK.find(dw => dw.value === r.day)?.label} @ {r.time}</Text>)
                            )}
                            {(schedule.frequency === "weekly" || schedule.frequency === "biweekly") && schedule.weekdayRows.filter(r => r.day !== null).map(r => (
                                <Text key={r.id} style={s.reviewMutedBullet}>
                                    • {DAYS_OF_WEEK.find(dw => dw.value === r.day)?.label} @ {r.time}
                                    {schedule.frequency === "biweekly" && r.startDate ? ` (from ${DateTime.fromISO(r.startDate).toLocaleString(DateTime.DATE_MED)})` : ""}
                                </Text>
                            ))}
                            {schedule.frequency === "monthly" && schedule.monthlyMode === "date" && schedule.monthlyDates.map(e => (
                                <Text key={e.id} style={s.reviewMutedBullet}>• {e.date}{ordSfx(e.date)} of month @ {e.time}</Text>
                            ))}
                            {schedule.frequency === "monthly" && schedule.monthlyMode === "ordinal" && schedule.ordinalEntries.map(e => (
                                <Text key={e.id} style={s.reviewMutedBullet}>• {e.occurrence} {DAYS_OF_WEEK.find(dw => dw.value === e.day)?.label} @ {e.time}</Text>
                            ))}
                            {schedule.frequency === "custom" && (
                                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                                    {schedule.builtRoutines.map(r => (
                                        <View key={r.id} style={s.reviewRoutineChip}>
                                            <Text style={s.reviewRoutineChipText}>{r.label}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    </View>
                )}

                {/* Members + Max Attendees */}
                <View style={[s.detailsCard, { marginTop: 10, marginBottom: 0 }]}>
                    <View style={s.detailItem}>
                        <Text style={s.detailLabel}>Members</Text>
                        <Text style={s.detailValue}>
                            {members.length === 0
                                ? "Just you — invite friends after creating"
                                : members.map(m => [m.firstName, m.lastName].filter(Boolean).join(' ')).join(', ')}
                        </Text>
                    </View>
                    <View style={s.detailSeparator} />
                    <View style={s.detailItem}>
                        <Text style={s.detailLabel}>Max Attendees</Text>
                        <Text style={s.detailValue}>{maxAttendeesLabel}</Text>
                    </View>
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
};

// ─── Root ─────────────────────────────────────────────────────────────────────

type Step = "name" | "schedule" | "review" | "invite";

const CreateGroupScreen = () => {
    const router = useRouter();
    const { mutate, isPending } = useCreateGroup();
    const [step, setStep] = useState<Step>("name");
    const [groupName, setGroupName] = useState("");
    const [groupImage, setGroupImage] = useState("");
    const [schedule, setSchedule] = useState<ScheduleData | null>(null);
    const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);

    const handleClose = () => router.replace("/(tabs)/groups");

    const handleCreate = () => {
        const schedulePayload = schedule?.frequency ? buildSchedulePayload(schedule) : {};
        const defaultCapacity = schedule?.maxAttendeesMode === "limited"
            ? parseInt(schedule.maxAttendeesInput, 10)
            : 0;
        const payload: any = {
            name: groupName,
            image: groupImage,
            meetupsToDisplay: 1,
            generationLeadDays: null,
            generationLeadTime: schedule?.leadTime ?? "09:00 AM",
            generationDeadlineDays: null,
            generationDeadlineTime: schedule?.deadlineTime ?? "09:00 AM",
            timezone: schedule?.timezone ?? "America/Denver",
            defaultLocation: schedule?.location ?? "",
            defaultCapacity,
            ...schedulePayload,
        };
        mutate(payload, {
            onSuccess: (data) => {
                setCreatedGroupId(data.group._id);
                setStep("invite");
            },
            onError: (err: any) => Alert.alert("Error", err?.response?.data?.error || "Failed to create group."),
        });
    };

    if (step === "name") return <SafeAreaView style={s.safe}><NameScreen onNext={(n, img) => { setGroupName(n); setGroupImage(img); setStep("schedule"); }} onClose={handleClose} /></SafeAreaView>;
    if (step === "schedule") return <SafeAreaView style={s.safe}><ScheduleScreen initialData={schedule} onNext={data => { setSchedule(data); setStep("review"); }} onBack={() => setStep("name")} onSkip={() => { setSchedule(null); setStep("review"); }} /></SafeAreaView>;
    if (step === "review") return <SafeAreaView style={s.safe}><ReviewScreen groupName={groupName} groupImage={groupImage} members={[]} schedule={schedule} onConfirm={handleCreate} onBack={() => setStep("schedule")} isPending={isPending} /></SafeAreaView>;
    return <SafeAreaView style={s.safe}><MembersScreen groupId={createdGroupId!} groupName={groupName} onDone={() => router.replace("/(tabs)/groups")} /></SafeAreaView>;
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
    dots: { flexDirection: "row", alignItems: "center", width: "50%", alignSelf: "center" },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#E5E7EB", backgroundColor: "#fff" },
    dotActive: { backgroundColor: "#4A90E2", borderColor: "#4A90E2" },
    dotLine: { flex: 1, height: 2, backgroundColor: "#E5E7EB" },
    dotLineFilled: { backgroundColor: "#4A90E2" },
    bigInput: { fontSize: 22, fontWeight: "700", color: "#111827", borderBottomWidth: 2, borderBottomColor: "#4A90E2", paddingVertical: 12, marginTop: 8 },
    inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
    inputRowError: { borderColor: "#EF4444" },
    inlineInput: { flex: 1, fontSize: 15, color: "#374151" },
    errorText: { fontSize: 12, fontWeight: "600", color: "#EF4444", marginTop: 6, marginLeft: 2 },
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
    fieldLabel: { fontSize: 11, fontWeight: "800", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
    fieldLabelFirst: { marginTop: 0 },
    // Schedule screen — groups related fields into clearly bounded cards so the long
    // form reads as a handful of scannable chunks instead of one continuous list.
    sectionCard: { backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: "#F3F4F6", padding: 18, marginBottom: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
    sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
    sectionIconChip: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
    sectionIconChipBlue: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
    sectionIconChipAmber: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
    sectionIconChipViolet: { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE" },
    sectionIconChipTeal: { backgroundColor: "#ECFDF9", borderColor: "#99E6DA" },
    sectionTitle: { fontSize: 16, fontWeight: "900", color: "#111827", letterSpacing: -0.2 },
    dateFieldRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 13, marginBottom: 4 },
    dateFieldText: { fontSize: 15, color: "#1F2937", fontWeight: "600" },
    startDateLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
    expandBox: { backgroundColor: "#F0F7FF", borderRadius: 14, borderWidth: 1.5, borderColor: "#BFDBFE", padding: 14, marginTop: 8 },
    expandBoxTitle: { fontSize: 12, fontWeight: "900", color: "#1D4ED8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
    boolRow: { flexDirection: "row", gap: 10 },
    boolBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB", alignItems: "center", backgroundColor: "#fff" },
    boolBtnActive: { borderColor: "#4A90E2", backgroundColor: "#EEF6FF" },
    boolBtnText: { fontSize: 14, fontWeight: "700", color: "#6B7280" },
    boolBtnTextActive: { color: "#4A90E2" },
    toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    toggleRowLabel: { fontSize: 14, fontWeight: "700", color: "#374151", flex: 1, marginRight: 12 },
    switchTrack: { width: 44, height: 26, borderRadius: 13, padding: 2, justifyContent: "center" },
    switchThumb: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 2, elevation: 2 },
    dayRow: { flexDirection: "row", alignItems: "center" },
    dayRowLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: "#374151" },
    timeBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: "#93C5FD", backgroundColor: "#EFF6FF", marginLeft: "auto" },
    timeBtnActive: { backgroundColor: "#4A90E2", borderColor: "#4A90E2" },
    timeBtnText: { fontSize: 12, fontWeight: "700", color: "#4A90E2" },
    timeBtnTextActive: { color: "#fff" },
    inlineDayPicker: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", marginTop: 6, overflow: "hidden" },
    dayPickerTrigger: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 12, paddingVertical: 10 },
    dayPickerText: { fontSize: 14, fontWeight: "600", color: "#374151" },
    dayPickerPlaceholder: { fontSize: 14, color: "#C4C9D4" },
    dayOption: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
    dayOptionActive: { backgroundColor: "#EEF6FF" },
    dayOptionText: { fontSize: 15, color: "#374151" },
    dayOptionTextActive: { color: "#4A90E2", fontWeight: "700" },
    dayPickerPopupWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    dayPickerPopupCard: {
        width: "85%",
        borderRadius: 24,
        backgroundColor: "#fff",
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 10,
    },
    dayPickerPopupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
    dayPickerPopupTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
    calendarPopupCard: {
        width: "94%",
        borderRadius: 24,
        backgroundColor: "#fff",
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 10,
    },
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
    // Review screen — mirrors MeetupDetailModal's palette, section-header, and
    // detail-card conventions so the two "confirm before you commit" screens feel
    // like the same app.
    reviewHero: { alignItems: "center", marginBottom: 24 },
    reviewHeroName: { fontSize: 22, fontWeight: "900", color: "#111827", letterSpacing: -0.4, textAlign: "center", marginTop: 12 },
    detailsCard: { backgroundColor: "#F9FAFB", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#F3F4F6", marginBottom: 24 },
    detailItem: {},
    detailLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
    detailValue: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
    detailSeparator: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 14 },
    reviewSectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
    reviewSectionTitle: { fontSize: 13, fontWeight: "900", color: "#111827", textTransform: "uppercase", letterSpacing: 0.5 },
    reviewIconChip: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 1 },
    reviewIconChipAmber: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
    reviewEmptyCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F9FAFB", borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", borderStyle: "dashed", padding: 16 },
    reviewMuted: { fontSize: 14, color: "#6B7280" },
    reviewMutedBullet: { fontSize: 13, color: "#6B7280", lineHeight: 19 },
    reviewScheduleCard: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", padding: 16 },
    reviewScheduleFreq: { fontSize: 17, fontWeight: "800", color: "#111827" },
    reviewDetailSeparator: { height: 1, backgroundColor: "#F3F4F6", marginVertical: 14 },
    reviewInlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    reviewInlineText: { fontSize: 14, fontWeight: "600", color: "#374151" },
    reviewRoutineChip: { backgroundColor: "#EEF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "flex-start", marginBottom: 4 },
    reviewRoutineChipText: { fontSize: 13, fontWeight: "700", color: "#1D4ED8" },
    imagePicker: { alignItems: "center", justifyContent: "center", marginTop: 24, width: 160, height: 160, borderRadius: 32, backgroundColor: "#F3F4F6", borderWidth: 1.5, borderColor: "#E5E7EB", borderStyle: "dashed", alignSelf: "center" },
    imagePreview: { width: 160, height: 160, borderRadius: 32 },
    imageEditBadge: { position: "absolute", bottom: 0, right: 0, backgroundColor: "#4A90E2", borderRadius: 14, padding: 6 },
    imagePickerText: { fontSize: 13, fontWeight: "600", color: "#6B7280", marginTop: 6, textAlign: "center" },
    imagePickerSub: { fontSize: 11, color: "#9CA3AF", textAlign: "center" },
});

const cal = StyleSheet.create({
    container: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", padding: 12, marginTop: 6, marginBottom: 4 },
    containerBare: { padding: 14 },
    nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    navLarge: { marginBottom: 16 },
    navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
    navBtnLarge: { width: 42, height: 42, borderRadius: 21 },
    navBtnDisabled: { backgroundColor: "#F3F4F6" },
    monthLabel: { fontSize: 15, fontWeight: "800", color: "#111827" },
    monthLabelLarge: { fontSize: 20 },
    weekRow: { flexDirection: "row" },
    weekRowLarge: { marginBottom: 4 },
    dayHeader: { width: `${100 / 7}%`, textAlign: "center", fontSize: 11, fontWeight: "800", color: "#9CA3AF", marginBottom: 4 },
    dayHeaderLarge: { fontSize: 14, marginBottom: 10 },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
    cellLarge: { paddingVertical: 4 },
    cellSelected: { backgroundColor: "#4A90E2", borderRadius: 100 },
    cellDisabled: { opacity: 0.3 },
    cellText: { fontSize: 14, color: "#374151" },
    cellTextLarge: { fontSize: 18 },
    cellTextSelected: { color: "#fff", fontWeight: "800" },
    cellTextDisabled: { color: "#D1D5DB" },
});