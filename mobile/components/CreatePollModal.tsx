import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    Modal,
    ActivityIndicator,
    ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { DateTime } from 'luxon';
import NativeTimePicker from './NativeTimePicker';
import { useCreatePoll } from '@/hooks/useCreatePoll';
import { useThemeColors, useAppearance } from '@/contexts/AppearanceContext';

interface CreatePollModalProps {
    visible: boolean;
    onClose: () => void;
    groupId: string;
    timezone: string;
}

const MAX_PROMPT_LENGTH = 100;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const PROMPT_PLACEHOLDER = "What time works best for everyone this weekend?";

const parseTimeString = (timeStr: string) => {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return { hours, minutes };
};

const combineDateAndTime = (isoDate: string, time: string, timezone: string): string => {
    const { hours, minutes } = parseTimeString(time);
    return DateTime.fromISO(isoDate, { zone: timezone })
        .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 })
        .toISO()!;
};

// ─── InlineCalendar ───────────────────────────────────────────────────────────
// Copied locally per convention — create-group and group-edit-schedule each keep their own copy.

const InlineCalendar = ({ value, onChange, minDate }: {
    value: string; onChange: (iso: string) => void; minDate?: string;
}) => {
    const colors = useThemeColors();
    const [month, setMonth] = useState(
        value ? DateTime.fromISO(value).startOf("month") : DateTime.now().startOf("month")
    );
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
    return (
        <View style={cal.container}>
            <View style={cal.nav}>
                <TouchableOpacity onPress={() => setMonth(m => m.minus({ months: 1 }))} style={[cal.navBtn, { backgroundColor: colors.brandSoft }]}>
                    <Feather name="chevron-left" size={22} color={colors.brand} />
                </TouchableOpacity>
                <Text style={[cal.monthLabel, { color: colors.textPrimary }]}>{month.toFormat("MMMM yyyy")}</Text>
                <TouchableOpacity onPress={() => setMonth(m => m.plus({ months: 1 }))} style={[cal.navBtn, { backgroundColor: colors.brandSoft }]}>
                    <Feather name="chevron-right" size={22} color={colors.brand} />
                </TouchableOpacity>
            </View>
            <View style={cal.weekRow}>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <Text key={i} style={[cal.dayHeader, { color: colors.textFaint }]}>{d}</Text>
                ))}
            </View>
            {weeks.map((week, wi) => (
                <View key={wi} style={cal.weekRow}>
                    {week.map((day, i) => {
                        if (!day) return <View key={`e-${wi}-${i}`} style={cal.cell} />;
                        const iso = day.toISODate()!;
                        const selected = iso === value;
                        const disabled = day < minDT;
                        return (
                            <TouchableOpacity
                                key={iso}
                                style={[cal.cell, selected && { backgroundColor: colors.brand, borderRadius: 100 }, disabled && cal.cellDisabled]}
                                onPress={() => !disabled && onChange(iso)}
                                disabled={disabled}
                            >
                                <Text style={[
                                    cal.cellText,
                                    { color: colors.textSecondary },
                                    selected && cal.cellTextSelected,
                                    disabled && { color: colors.borderStrong },
                                ]}>
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

// ─── DatePickerModal ──────────────────────────────────────────────────────────
// Blurred-popup overlay, matching create-group's CalendarPickerModal treatment.

const DatePickerModal = ({ visible, value, minDate, onChange, onCancel }: {
    visible: boolean; value: string; minDate?: string; onChange: (iso: string) => void; onCancel: () => void;
}) => {
    const colors = useThemeColors();
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={s.popupWrap}>
                <View style={[s.calendarPopupCard, { backgroundColor: colors.surface }]}>
                    <View style={[s.popupHeader, { borderBottomColor: colors.border }]}>
                        <Text style={[s.popupTitle, { color: colors.textPrimary }]}>Expiration Date</Text>
                        <TouchableOpacity onPress={onCancel} style={{ padding: 4 }} activeOpacity={0.7}>
                            <Feather name="x" size={20} color={colors.textFaint} />
                        </TouchableOpacity>
                    </View>
                    <View style={{ padding: 8 }}>
                        {visible && <InlineCalendar value={value} onChange={onChange} minDate={minDate} />}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const CreatePollModal = ({ visible, onClose, groupId, timezone }: CreatePollModalProps) => {
    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const isDark = scheme === 'dark';
    const { mutateAsync: createPoll, isPending } = useCreatePoll();

    const [prompt, setPrompt] = useState('');
    const [options, setOptions] = useState(['', '']);
    const [allowMultiple, setAllowMultiple] = useState(false);

    const [expiryDate, setExpiryDate] = useState<string | null>(null);
    const [expiryTime, setExpiryTime] = useState<string | null>(null);
    const [showDatePopup, setShowDatePopup] = useState(false);
    const [showTimePopup, setShowTimePopup] = useState(false);

    const filledOptionCount = options.filter(o => o.trim().length > 0).length;
    const hasExpiry = !!expiryDate && !!expiryTime;
    const canStartPoll = prompt.trim().length > 0 && filledOptionCount >= MIN_OPTIONS && hasExpiry;

    const resetAndClose = () => {
        setPrompt('');
        setOptions(['', '']);
        setAllowMultiple(false);
        setExpiryDate(null);
        setExpiryTime(null);
        setShowDatePopup(false);
        setShowTimePopup(false);
        onClose();
    };

    const updateOption = (index: number, text: string) => {
        setOptions(prev => prev.map((opt, i) => (i === index ? text : opt)));
    };

    const addOption = () => {
        if (options.length >= MAX_OPTIONS) return;
        setOptions(prev => [...prev, '']);
    };

    const handleStartPoll = async () => {
        if (!canStartPoll || !expiryDate || !expiryTime) return;
        try {
            await createPoll({
                groupId,
                prompt: prompt.trim(),
                options: options.map(o => o.trim()).filter(Boolean),
                allowMultiple,
                expiresAt: combineDateAndTime(expiryDate, expiryTime, timezone),
            });
            resetAndClose();
        } catch {
            // Errors are surfaced via the mutation's onError alert.
        }
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={resetAndClose}>
            {/* pageSheet is iOS-only; Android renders fullscreen and needs safe-area insets manually */}
            <SafeAreaView style={[s.screen, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
                <View style={s.screenHeader}>
                    <TouchableOpacity onPress={resetAndClose} style={s.iconBtn}>
                        <Feather name="x" size={24} color={colors.textMuted} />
                    </TouchableOpacity>
                    <View style={{ width: 36 }} />
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={[s.screenTitle, { color: colors.textPrimary }]}>Create a poll</Text>
                    <Text style={[s.screenSub, { color: colors.textFaint }]}>The poll will appear in the chat</Text>

                    {/* Poll Details */}
                    <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, { backgroundColor: isDark ? '#1A2A42' : '#EFF6FF', borderColor: isDark ? '#2C4870' : '#BFDBFE' }]}>
                                <Feather name="message-square" size={16} color={colors.brand} />
                            </View>
                            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Poll Details</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst, { color: colors.textMuted }]}>Prompt</Text>
                        <TextInput
                            style={[s.promptInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                            value={prompt}
                            onChangeText={(text) => setPrompt(text.slice(0, MAX_PROMPT_LENGTH))}
                            placeholder={PROMPT_PLACEHOLDER}
                            placeholderTextColor={colors.placeholder}
                            maxLength={MAX_PROMPT_LENGTH}
                            multiline
                        />
                        <Text style={[s.charCounter, { color: colors.textFaint }]}>{prompt.length}/{MAX_PROMPT_LENGTH}</Text>
                    </View>

                    {/* Responses */}
                    <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, { backgroundColor: isDark ? '#241B3D' : '#F5F3FF', borderColor: isDark ? '#3B2E63' : '#DDD6FE' }]}>
                                <Feather name="list" size={16} color="#7C3AED" />
                            </View>
                            <Text style={[s.sectionTitle, { flex: 1, color: colors.textPrimary }]}>Responses</Text>
                            <Text style={[s.responsesCounter, { color: colors.textFaint }]}>{options.length}/{MAX_OPTIONS}</Text>
                        </View>

                        {options.map((option, index) => (
                            <View key={index} style={s.optionRow}>
                                <Text style={[s.optionNumber, { color: colors.textFaint }]}>{index + 1}</Text>
                                <TextInput
                                    style={[s.optionInput, { backgroundColor: colors.backgroundAlt, color: colors.textPrimary, borderColor: colors.border }]}
                                    value={option}
                                    onChangeText={(text) => updateOption(index, text)}
                                    placeholder="Type a response option here"
                                    placeholderTextColor={colors.placeholder}
                                />
                            </View>
                        ))}

                        {options.length < MAX_OPTIONS ? (
                            <TouchableOpacity style={[s.addOptionBox, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]} onPress={addOption}>
                                <Feather name="plus" size={20} color={colors.brand} />
                            </TouchableOpacity>
                        ) : (
                            <Text style={[s.limitReachedText, { color: colors.textFaint }]}>Limit of 10 responses reached</Text>
                        )}
                    </View>

                    {/* Response Type */}
                    <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, { backgroundColor: isDark ? '#123330' : '#ECFDF9', borderColor: isDark ? '#1F5B54' : '#99E6DA' }]}>
                                <Feather name="check-square" size={16} color="#0D9488" />
                            </View>
                            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Group Members can choose:</Text>
                        </View>
                        <View style={s.boolRow}>
                            <TouchableOpacity
                                style={[s.boolBtn, { borderColor: colors.border, backgroundColor: colors.surface }, !allowMultiple && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
                                onPress={() => setAllowMultiple(false)}
                            >
                                <Text style={[s.boolBtnText, { color: colors.textMuted }, !allowMultiple && { color: colors.brand }]}>Only ONE Response</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.boolBtn, { borderColor: colors.border, backgroundColor: colors.surface }, allowMultiple && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
                                onPress={() => setAllowMultiple(true)}
                            >
                                <Text style={[s.boolBtnText, { color: colors.textMuted }, allowMultiple && { color: colors.brand }]}>Multiple Responses</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Expiration */}
                    <View style={[s.sectionCard, { marginBottom: 8, backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, { backgroundColor: isDark ? '#3A2E12' : '#FFFBEB', borderColor: isDark ? '#5C4A1E' : '#FDE68A' }]}>
                                <Feather name="clock" size={16} color={colors.warning} />
                            </View>
                            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Expiration</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst, { color: colors.textMuted }]}>Date</Text>
                        <TouchableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setShowDatePopup(true)}>
                            <Feather name="calendar" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                            <Text style={expiryDate ? [s.dateFieldText, { color: colors.textSecondary }] : [s.dateFieldPlaceholder, { color: colors.textFaint }]}>
                                {expiryDate ? DateTime.fromISO(expiryDate).toFormat('MMM d, yyyy') : 'Select date'}
                            </Text>
                            <Feather name="chevron-right" size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                        </TouchableOpacity>

                        <Text style={[s.fieldLabel, { color: colors.textMuted }]}>Time</Text>
                        <TouchableOpacity style={[s.dateFieldRow, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setShowTimePopup(true)}>
                            <Feather name="clock" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                            <Text style={expiryTime ? [s.dateFieldText, { color: colors.textSecondary }] : [s.dateFieldPlaceholder, { color: colors.textFaint }]}>
                                {expiryTime ?? 'Select time'}
                            </Text>
                            <Feather name="chevron-right" size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                        </TouchableOpacity>
                    </View>
                </ScrollView>

                <View style={[s.screenFooter, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
                    <TouchableOpacity
                        onPress={handleStartPoll}
                        disabled={!canStartPoll || isPending}
                        style={[s.startBtn, { backgroundColor: colors.brand }, (!canStartPoll || isPending) && { backgroundColor: colors.borderStrong }]}
                    >
                        {isPending ? <ActivityIndicator color="white" /> : <Text style={s.startBtnText}>Start Poll</Text>}
                    </TouchableOpacity>
                </View>

                <DatePickerModal
                    visible={showDatePopup}
                    value={expiryDate ?? DateTime.now().toISODate()!}
                    minDate={DateTime.now().toISODate()!}
                    onChange={(iso) => { setExpiryDate(iso); setShowDatePopup(false); }}
                    onCancel={() => setShowDatePopup(false)}
                />

                {showTimePopup && (
                    <NativeTimePicker
                        value={expiryTime ?? '09:00 PM'}
                        onChange={t => setExpiryTime(t)}
                        onClose={() => setShowTimePopup(false)}
                        asOverlay
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
};

const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#F9FAFB" },
    screenHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    screenFooter: { paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#F3F4F6", backgroundColor: "#fff" },
    screenTitle: { fontSize: 26, fontWeight: "900", color: "#111827", marginBottom: 4 },
    screenSub: { fontSize: 14, color: "#9CA3AF", marginBottom: 20 },
    iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

    sectionCard: { backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: "#F3F4F6", padding: 18, marginBottom: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
    sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
    sectionIconChip: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
    sectionIconChipBlue: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
    sectionIconChipAmber: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
    sectionIconChipViolet: { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE" },
    sectionIconChipTeal: { backgroundColor: "#ECFDF9", borderColor: "#99E6DA" },
    sectionTitle: { fontSize: 16, fontWeight: "900", color: "#111827", letterSpacing: -0.2 },

    fieldLabel: { fontSize: 11, fontWeight: "800", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
    fieldLabelFirst: { marginTop: 0 },

    promptInput: {
        backgroundColor: '#fff', padding: 14, borderRadius: 12, fontSize: 15, color: '#111827',
        borderWidth: 1, borderColor: '#E5E7EB', minHeight: 70, textAlignVertical: 'top',
    },
    charCounter: { fontSize: 12, color: '#9CA3AF', textAlign: 'right', marginTop: 6 },

    responsesCounter: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF' },
    optionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
    optionNumber: { width: 20, fontSize: 14, fontWeight: 'bold', color: '#9CA3AF', textAlign: 'center' },
    optionInput: {
        flex: 1, backgroundColor: '#F9FAFB', paddingVertical: 12, paddingHorizontal: 14,
        borderRadius: 12, fontSize: 15, borderWidth: 1, borderColor: '#E5E7EB',
    },
    addOptionBox: {
        marginLeft: 30, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: '#4A90E2',
        borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F9FF',
    },
    limitReachedText: { marginLeft: 30, fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginTop: 4 },

    boolRow: { flexDirection: "column", gap: 10 },
    boolBtn: { paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB", alignItems: "center", backgroundColor: "#fff" },
    boolBtnActive: { borderColor: "#4A90E2", backgroundColor: "#EEF6FF" },
    boolBtnText: { fontSize: 14, fontWeight: "700", color: "#6B7280" },
    boolBtnTextActive: { color: "#4A90E2" },

    dateFieldRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 13, marginBottom: 4 },
    dateFieldText: { fontSize: 15, color: "#1F2937", fontWeight: "600" },
    dateFieldPlaceholder: { fontSize: 15, color: "#C4C9D4", fontWeight: "600" },

    startBtn: { backgroundColor: '#4A90E2', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
    startBtnDisabled: { backgroundColor: '#93C5FD' },
    startBtnText: { color: 'white', fontWeight: '800', fontSize: 16 },

    popupWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
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
    popupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
    popupTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
});

const cal = StyleSheet.create({
    container: { padding: 14 },
    nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    navBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
    monthLabel: { fontSize: 20, fontWeight: "800", color: "#111827" },
    weekRow: { flexDirection: "row", marginBottom: 4 },
    dayHeader: { width: `${100 / 7}%`, textAlign: "center", fontSize: 14, fontWeight: "800", color: "#9CA3AF", marginBottom: 10 },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", paddingVertical: 4 },
    cellSelected: { backgroundColor: "#4A90E2", borderRadius: 100 },
    cellDisabled: { opacity: 0.3 },
    cellText: { fontSize: 18, color: "#374151" },
    cellTextSelected: { color: "#fff", fontWeight: "800" },
    cellTextDisabled: { color: "#D1D5DB" },
});

export default CreatePollModal;
