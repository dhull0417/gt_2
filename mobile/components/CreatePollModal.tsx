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
import { BlurView } from 'expo-blur';
import { DateTime } from 'luxon';
import NativeTimePicker from './NativeTimePicker';
import { useCreatePoll } from '@/hooks/useCreatePoll';

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
// Same bare/large calendar used inside create-group's own popups, copied locally
// per this codebase's existing convention (create-group and group-edit-schedule
// each keep their own copy rather than sharing one).

const InlineCalendar = ({ value, onChange, minDate }: {
    value: string; onChange: (iso: string) => void; minDate?: string;
}) => {
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
                <TouchableOpacity onPress={() => setMonth(m => m.minus({ months: 1 }))} style={cal.navBtn}>
                    <Feather name="chevron-left" size={22} color="#4A90E2" />
                </TouchableOpacity>
                <Text style={cal.monthLabel}>{month.toFormat("MMMM yyyy")}</Text>
                <TouchableOpacity onPress={() => setMonth(m => m.plus({ months: 1 }))} style={cal.navBtn}>
                    <Feather name="chevron-right" size={22} color="#4A90E2" />
                </TouchableOpacity>
            </View>
            <View style={cal.weekRow}>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <Text key={i} style={cal.dayHeader}>{d}</Text>
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
            ))}
        </View>
    );
};

// ─── DatePickerModal ──────────────────────────────────────────────────────────
// Same blurred-popup treatment as create-group's CalendarPickerModal: a focused
// overlay instead of an inline calendar competing with the rest of the form.

const DatePickerModal = ({ visible, value, minDate, onChange, onCancel }: {
    visible: boolean; value: string; minDate?: string; onChange: (iso: string) => void; onCancel: () => void;
}) => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={s.popupWrap}>
            <View style={s.calendarPopupCard}>
                <View style={s.popupHeader}>
                    <Text style={s.popupTitle}>Expiration Date</Text>
                    <TouchableOpacity onPress={onCancel} style={{ padding: 4 }} activeOpacity={0.7}>
                        <Feather name="x" size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                </View>
                <View style={{ padding: 8 }}>
                    {visible && <InlineCalendar value={value} onChange={onChange} minDate={minDate} />}
                </View>
            </View>
        </View>
    </Modal>
);

const CreatePollModal = ({ visible, onClose, groupId, timezone }: CreatePollModalProps) => {
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
            <View style={s.screen}>
                <View style={s.screenHeader}>
                    <TouchableOpacity onPress={resetAndClose} style={s.iconBtn}>
                        <Feather name="x" size={24} color="#6B7280" />
                    </TouchableOpacity>
                    <View style={{ width: 36 }} />
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={s.screenTitle}>Create a poll</Text>
                    <Text style={s.screenSub}>The poll will appear in the chat</Text>

                    {/* Poll Details */}
                    <View style={s.sectionCard}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, s.sectionIconChipBlue]}>
                                <Feather name="message-square" size={16} color="#4A90E2" />
                            </View>
                            <Text style={s.sectionTitle}>Poll Details</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Prompt</Text>
                        <TextInput
                            style={s.promptInput}
                            value={prompt}
                            onChangeText={(text) => setPrompt(text.slice(0, MAX_PROMPT_LENGTH))}
                            placeholder={PROMPT_PLACEHOLDER}
                            placeholderTextColor="#9CA3AF"
                            maxLength={MAX_PROMPT_LENGTH}
                            multiline
                        />
                        <Text style={s.charCounter}>{prompt.length}/{MAX_PROMPT_LENGTH}</Text>
                    </View>

                    {/* Responses */}
                    <View style={s.sectionCard}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, s.sectionIconChipViolet]}>
                                <Feather name="list" size={16} color="#7C3AED" />
                            </View>
                            <Text style={[s.sectionTitle, { flex: 1 }]}>Responses</Text>
                            <Text style={s.responsesCounter}>{options.length}/{MAX_OPTIONS}</Text>
                        </View>

                        {options.map((option, index) => (
                            <View key={index} style={s.optionRow}>
                                <Text style={s.optionNumber}>{index + 1}</Text>
                                <TextInput
                                    style={s.optionInput}
                                    value={option}
                                    onChangeText={(text) => updateOption(index, text)}
                                    placeholder="Type a response option here"
                                    placeholderTextColor="#9CA3AF"
                                />
                            </View>
                        ))}

                        {options.length < MAX_OPTIONS ? (
                            <TouchableOpacity style={s.addOptionBox} onPress={addOption}>
                                <Feather name="plus" size={20} color="#4A90E2" />
                            </TouchableOpacity>
                        ) : (
                            <Text style={s.limitReachedText}>Limit of 10 responses reached</Text>
                        )}
                    </View>

                    {/* Response Type */}
                    <View style={s.sectionCard}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, s.sectionIconChipTeal]}>
                                <Feather name="check-square" size={16} color="#0D9488" />
                            </View>
                            <Text style={s.sectionTitle}>Response Type</Text>
                        </View>
                        <View style={s.boolRow}>
                            <TouchableOpacity
                                style={[s.boolBtn, !allowMultiple && s.boolBtnActive]}
                                onPress={() => setAllowMultiple(false)}
                            >
                                <Text style={[s.boolBtnText, !allowMultiple && s.boolBtnTextActive]}>Single Answer</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.boolBtn, allowMultiple && s.boolBtnActive]}
                                onPress={() => setAllowMultiple(true)}
                            >
                                <Text style={[s.boolBtnText, allowMultiple && s.boolBtnTextActive]}>Multiple Answers</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Expiration */}
                    <View style={[s.sectionCard, { marginBottom: 8 }]}>
                        <View style={s.sectionHeaderRow}>
                            <View style={[s.sectionIconChip, s.sectionIconChipAmber]}>
                                <Feather name="clock" size={16} color="#F59E0B" />
                            </View>
                            <Text style={s.sectionTitle}>Expiration</Text>
                        </View>

                        <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Date</Text>
                        <TouchableOpacity style={s.dateFieldRow} onPress={() => setShowDatePopup(true)}>
                            <Feather name="calendar" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                            <Text style={expiryDate ? s.dateFieldText : s.dateFieldPlaceholder}>
                                {expiryDate ? DateTime.fromISO(expiryDate).toFormat('MMM d, yyyy') : 'Select date'}
                            </Text>
                            <Feather name="chevron-right" size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                        </TouchableOpacity>

                        <Text style={s.fieldLabel}>Time</Text>
                        <TouchableOpacity style={s.dateFieldRow} onPress={() => setShowTimePopup(true)}>
                            <Feather name="clock" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                            <Text style={expiryTime ? s.dateFieldText : s.dateFieldPlaceholder}>
                                {expiryTime ?? 'Select time'}
                            </Text>
                            <Feather name="chevron-right" size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                        </TouchableOpacity>
                    </View>
                </ScrollView>

                <View style={s.screenFooter}>
                    <TouchableOpacity
                        onPress={handleStartPoll}
                        disabled={!canStartPoll || isPending}
                        style={[s.startBtn, (!canStartPoll || isPending) && s.startBtnDisabled]}
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
                    />
                )}
            </View>
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

    boolRow: { flexDirection: "row", gap: 10 },
    boolBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB", alignItems: "center", backgroundColor: "#fff" },
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
