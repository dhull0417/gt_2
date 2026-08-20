import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    Modal,
    ActivityIndicator,
    Alert,
    ScrollView
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GroupDetails, groupApi, useApiClient } from '@/utils/api';
import { DateTime } from 'luxon';
import NativeTimePicker from './NativeTimePicker';
import { useQueryClient } from '@tanstack/react-query';

interface AddMeetupWizardProps {
    visible: boolean;
    onClose: () => void;
    groupDetails: GroupDetails;
}

const usaTimezones = [
    { label: "Eastern (ET)", value: "America/New_York" },
    { label: "Central (CST)", value: "America/Chicago" },
    { label: "Mountain (MT)", value: "America/Denver" },
    { label: "Mountain (no DST)", value: "America/Phoenix" },
    { label: "Pacific (PST)", value: "America/Los_Angeles" },
    { label: "Alaska (AKST)", value: "America/Anchorage" },
    { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
];

// Mirrors the Max Attendees validation on the group-creation Schedule screen
// (mobile/app/create-group/index.tsx) so both screens agree on what's valid.
const getMaxAttendeesError = (mode: "unlimited" | "limited", input: string): string | null => {
    if (mode !== "limited" || input === "") return null;
    if (!/^\d+$/.test(input)) return "Numbers only, please.";
    const n = parseInt(input, 10);
    if (n < 1 || n > 200) return "Enter a number between 1 and 200.";
    return null;
};

/**
 * AddMeetupWizard
 * Single-screen form for creating one-off meetups, styled to match the
 * group-creation Schedule screen (mobile/app/create-group/index.tsx).
 */
const AddMeetupWizard = ({ visible, onClose, groupDetails }: AddMeetupWizardProps) => {
    const api = useApiClient();
    const queryClient = useQueryClient();

    const [isSaving, setIsSaving] = useState(false);

    // --- Data States ---
    const [meetupDate, setMeetupDate] = useState<string>(DateTime.now().toISODate()!);
    const [meetupTime, setMeetupTime] = useState("05:00 PM");
    const [meetupTZ, setMeetupTZ] = useState(groupDetails.timezone || "America/Denver");
    const [maxAttendeesMode, setMaxAttendeesMode] = useState<"unlimited" | "limited">(
        groupDetails.defaultCapacity ? "limited" : "unlimited"
    );
    const [maxAttendeesInput, setMaxAttendeesInput] = useState<string>(
        groupDetails.defaultCapacity ? String(groupDetails.defaultCapacity) : ""
    );
    const [meetupLocation, setMeetupLocation] = useState(groupDetails.defaultLocation || "");

    const [showTimePicker, setShowTimePicker] = useState(false);
    const [showTZPicker, setShowTZPicker] = useState(false);

    // --- Calendar Logic ---
    const [calendarMonth, setCalendarMonth] = useState<DateTime>(DateTime.now().startOf('month'));

    // Chunked into explicit 7-cell week rows rather than one flex-wrap grid — letting
    // aspect-ratio cells wrap on their own leaves Yoga reserving a phantom trailing row
    // of blank space whenever the day count isn't a clean multiple of 7.
    const calendarWeeks = useMemo(() => {
        const start = calendarMonth.startOf('month');
        const firstDayIdx = start.weekday === 7 ? 0 : start.weekday;
        const days: (DateTime | null)[] = [];
        for (let i = 0; i < firstDayIdx; i++) days.push(null);
        for (let i = 1; i <= calendarMonth.daysInMonth!; i++) days.push(calendarMonth.set({ day: i }));
        while (days.length % 7 !== 0) days.push(null);
        const chunks: (DateTime | null)[][] = [];
        for (let i = 0; i < days.length; i += 7) chunks.push(days.slice(i, i + 7));
        return chunks;
    }, [calendarMonth]);

    const minDT = DateTime.now().startOf('day');

    const maxAttendeesError = getMaxAttendeesError(maxAttendeesMode, maxAttendeesInput);
    const canSubmit = maxAttendeesMode !== "limited" || (maxAttendeesInput !== "" && !maxAttendeesError);

    const handleCreateMeetup = async () => {
        if (!canSubmit) return;
        setIsSaving(true);
        try {
            /**
             * FIX: Passing meetupDate as the raw string (YYYY-MM-DD) instead of new Date().
             * This prevents local environment timezone shifting that causes the "one day early" bug.
             */
            const capacity = maxAttendeesMode === "limited" ? parseInt(maxAttendeesInput, 10) : 0;
            await groupApi.createOneOffMeetup(api, {
                groupId: groupDetails._id,
                date: meetupDate as any,
                time: meetupTime,
                timezone: meetupTZ,
                capacity,
                location: meetupLocation,
                name: groupDetails.name
            });
            Alert.alert("Success", "Meetup added!");
            resetAndClose();
            queryClient.invalidateQueries({ queryKey: ['meetups'] });
        } catch (error: any) {
            Alert.alert("Error", error.response?.data?.error || "Failed to add meetup.");
        } finally {
            setIsSaving(false);
        }
    };

    const resetAndClose = () => {
        setMeetupDate(DateTime.now().toISODate()!);
        setMeetupTime("05:00 PM");
        setShowTimePicker(false);
        setShowTZPicker(false);
        setMaxAttendeesMode(groupDetails.defaultCapacity ? "limited" : "unlimited");
        setMaxAttendeesInput(groupDetails.defaultCapacity ? String(groupDetails.defaultCapacity) : "");
        onClose();
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={resetAndClose}
        >
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
                    automaticallyAdjustKeyboardInsets
                >
                    <Text style={s.screenTitle}>Add Meetup</Text>
                    <Text style={s.screenSub}>Set the date, time, and details</Text>

                    {/* Date */}
                    <Text style={s.fieldLabel}>Date</Text>
                    <View style={cal.container}>
                        <View style={cal.nav}>
                            <TouchableOpacity onPress={() => setCalendarMonth(m => m.minus({ months: 1 }))} style={cal.navBtn}>
                                <Feather name="chevron-left" size={18} color="#4A90E2" />
                            </TouchableOpacity>
                            <Text style={cal.monthLabel}>{calendarMonth.toFormat('MMMM yyyy')}</Text>
                            <TouchableOpacity onPress={() => setCalendarMonth(m => m.plus({ months: 1 }))} style={cal.navBtn}>
                                <Feather name="chevron-right" size={18} color="#4A90E2" />
                            </TouchableOpacity>
                        </View>
                        <View style={cal.weekRow}>
                            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                                <Text key={i} style={cal.dayHeader}>{d}</Text>
                            ))}
                        </View>
                        {calendarWeeks.map((week, wi) => (
                            <View key={wi} style={cal.weekRow}>
                                {week.map((day, i) => {
                                    if (!day) return <View key={`e-${wi}-${i}`} style={cal.cell} />;
                                    const iso = day.toISODate()!;
                                    const selected = iso === meetupDate;
                                    const disabled = day < minDT;
                                    return (
                                        <TouchableOpacity
                                            key={iso}
                                            style={[cal.cell, selected && cal.cellSelected, disabled && cal.cellDisabled]}
                                            onPress={() => !disabled && setMeetupDate(iso)}
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

                    {/* Time */}
                    <Text style={s.fieldLabel}>Time</Text>
                    <TouchableOpacity
                        style={s.dateFieldRow}
                        onPress={() => { setShowTimePicker(v => !v); setShowTZPicker(false); }}
                    >
                        <Feather name="clock" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                        <Text style={s.dateFieldText}>{meetupTime}</Text>
                        <Feather name={showTimePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                    </TouchableOpacity>
                    {showTimePicker && (
                        <NativeTimePicker value={meetupTime} onChange={setMeetupTime} onClose={() => setShowTimePicker(false)} />
                    )}

                    {/* Timezone */}
                    <Text style={s.fieldLabel}>Timezone</Text>
                    <TouchableOpacity
                        style={s.dateFieldRow}
                        onPress={() => { setShowTZPicker(v => !v); setShowTimePicker(false); }}
                    >
                        <Feather name="globe" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                        <Text style={s.dateFieldText}>{usaTimezones.find(tz => tz.value === meetupTZ)?.label || meetupTZ}</Text>
                        <Feather name={showTZPicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                    </TouchableOpacity>
                    {showTZPicker && (
                        <View style={s.inlineDayPicker}>
                            {usaTimezones.map(tz => (
                                <TouchableOpacity
                                    key={tz.value}
                                    style={[s.dayOption, meetupTZ === tz.value && s.dayOptionActive]}
                                    onPress={() => { setMeetupTZ(tz.value); setShowTZPicker(false); }}
                                >
                                    <Text style={[s.dayOptionText, meetupTZ === tz.value && s.dayOptionTextActive]}>{tz.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Max Attendees */}
                    <Text style={s.fieldLabel}>Max Attendees</Text>
                    <View style={s.boolRow}>
                        <TouchableOpacity
                            style={[s.boolBtn, maxAttendeesMode === "unlimited" && s.boolBtnActive]}
                            onPress={() => { setMaxAttendeesMode("unlimited"); setMaxAttendeesInput(""); }}
                        >
                            <Text style={[s.boolBtnText, maxAttendeesMode === "unlimited" && s.boolBtnTextActive]}>Unlimited</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[s.boolBtn, maxAttendeesMode === "limited" && s.boolBtnActive]}
                            onPress={() => setMaxAttendeesMode("limited")}
                        >
                            <Text style={[s.boolBtnText, maxAttendeesMode === "limited" && s.boolBtnTextActive]}>Limited</Text>
                        </TouchableOpacity>
                    </View>
                    {maxAttendeesMode === "limited" && (
                        <View style={{ marginTop: 10 }}>
                            <View style={[s.inputRow, maxAttendeesError && s.inputRowError]}>
                                <Feather name="users" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
                                <TextInput
                                    style={s.inlineInput}
                                    placeholder="How many?"
                                    placeholderTextColor="#C4C9D4"
                                    keyboardType="number-pad"
                                    value={maxAttendeesInput}
                                    onChangeText={setMaxAttendeesInput}
                                />
                            </View>
                            {maxAttendeesError && <Text style={s.errorText}>{maxAttendeesError}</Text>}
                        </View>
                    )}

                    {/* Location */}
                    <Text style={s.fieldLabel}>Location or link</Text>
                    <View style={s.inputRow}>
                        <Feather name="map-pin" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
                        <TextInput
                            style={s.inlineInput}
                            placeholder="e.g. Starbucks or Zoom link..."
                            placeholderTextColor="#C4C9D4"
                            value={meetupLocation}
                            onChangeText={setMeetupLocation}
                        />
                    </View>
                </ScrollView>

                <View style={s.screenFooter}>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity style={[s.primaryBtn, !canSubmit && s.primaryBtnDisabled]} onPress={handleCreateMeetup} disabled={isSaving || !canSubmit}>
                        {isSaving ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <>
                                <Text style={s.primaryBtnText}>Create Meetup</Text>
                                <Feather name="check" size={18} color="#fff" style={{ marginLeft: 6 }} />
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#F9FAFB" },
    screenHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    screenFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#F3F4F6", backgroundColor: "#fff" },
    screenTitle: { fontSize: 26, fontWeight: "900", color: "#111827", marginBottom: 4 },
    screenSub: { fontSize: 14, color: "#9CA3AF", marginBottom: 20 },
    iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    fieldLabel: { fontSize: 11, fontWeight: "800", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
    dateFieldRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 13, marginBottom: 4 },
    dateFieldText: { fontSize: 15, color: "#374151", fontWeight: "500" },
    inlineDayPicker: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", marginTop: 6, overflow: "hidden" },
    dayOption: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
    dayOptionActive: { backgroundColor: "#EEF6FF" },
    dayOptionText: { fontSize: 15, color: "#374151" },
    dayOptionTextActive: { color: "#4A90E2", fontWeight: "700" },
    boolRow: { flexDirection: "row", gap: 10 },
    boolBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB", alignItems: "center", backgroundColor: "#fff" },
    boolBtnActive: { borderColor: "#4A90E2", backgroundColor: "#EEF6FF" },
    boolBtnText: { fontSize: 14, fontWeight: "700", color: "#6B7280" },
    boolBtnTextActive: { color: "#4A90E2" },
    inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 12 },
    inputRowError: { borderColor: "#EF4444" },
    inlineInput: { flex: 1, fontSize: 15, color: "#374151" },
    errorText: { fontSize: 12, fontWeight: "600", color: "#EF4444", marginTop: 6, marginLeft: 2 },
    primaryBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#4A90E2", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
    primaryBtnDisabled: { backgroundColor: "#93C5FD" },
    primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});

const cal = StyleSheet.create({
    container: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", padding: 12, marginTop: 6, marginBottom: 4 },
    nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
    monthLabel: { fontSize: 15, fontWeight: "800", color: "#111827" },
    weekRow: { flexDirection: "row" },
    dayHeader: { width: `${100 / 7}%`, textAlign: "center", fontSize: 11, fontWeight: "800", color: "#9CA3AF", marginBottom: 4 },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
    cellSelected: { backgroundColor: "#4A90E2", borderRadius: 100 },
    cellDisabled: { opacity: 0.3 },
    cellText: { fontSize: 14, color: "#374151" },
    cellTextSelected: { color: "#fff", fontWeight: "800" },
    cellTextDisabled: { color: "#D1D5DB" },
});

export default AddMeetupWizard;
