import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Alert,
    ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from "react-native-safe-area-context";
import { useGetGroupDetails } from "../../hooks/useGetGroupDetails";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { useApiClient, groupApi } from "../../utils/api";
import TimePicker from "../../components/TimePicker";

// ─── TimeButton ───────────────────────────────────────────────────────────────

const TimeButton = ({ time, onPress, active }: { time: string; onPress: () => void; active: boolean }) => (
    <TouchableOpacity onPress={onPress} style={[s.timeBtn, active && s.timeBtnActive]}>
        <Feather name="clock" size={12} color={active ? "#fff" : "#4A90E2"} style={{ marginRight: 4 }} />
        <Text style={[s.timeBtnText, active && s.timeBtnTextActive]}>{time}</Text>
    </TouchableOpacity>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface RsvpSettings {
    rsvpRestricted: boolean;
    leadEnabled: boolean;
    leadDays: number;
    leadTime: string;
    deadlineEnabled: boolean;
    deadlineDays: number;
    deadlineTime: string;
}

const EditJitScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const api = useApiClient();
    const queryClient = useQueryClient();

    const { data: group, isLoading: loadingGroup } = useGetGroupDetails(id);

    const [rsvpRestricted, setRsvpRestricted] = useState(true);
    const [leadEnabled, setLeadEnabled] = useState(true);
    const [leadDays, setLeadDays] = useState(1);
    const [leadTime, setLeadTime] = useState("09:00 AM");
    const [showLeadTimePicker, setShowLeadTimePicker] = useState(false);
    const [deadlineEnabled, setDeadlineEnabled] = useState(false);
    const [deadlineDays, setDeadlineDays] = useState(1);
    const [deadlineTime, setDeadlineTime] = useState("09:00 AM");
    const [showDeadlineTimePicker, setShowDeadlineTimePicker] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Initialized once when group data arrives
    const originalRef = useRef<RsvpSettings | null>(null);
    const initialized = useRef(false);

    useEffect(() => {
        if (group && !initialized.current) {
            initialized.current = true;
            const initial: RsvpSettings = {
                rsvpRestricted: group.generationLeadDays != null || group.generationDeadlineDays != null,
                leadEnabled: group.generationLeadDays != null,
                leadDays: group.generationLeadDays ?? 1,
                leadTime: group.generationLeadTime || "09:00 AM",
                deadlineEnabled: group.generationDeadlineDays != null,
                deadlineDays: group.generationDeadlineDays ?? 1,
                deadlineTime: group.generationDeadlineTime || "09:00 AM",
            };
            originalRef.current = initial;
            setRsvpRestricted(initial.rsvpRestricted);
            setLeadEnabled(initial.leadEnabled);
            setLeadDays(initial.leadDays);
            setLeadTime(initial.leadTime);
            setDeadlineEnabled(initial.deadlineEnabled);
            setDeadlineDays(initial.deadlineDays);
            setDeadlineTime(initial.deadlineTime);
        }
    }, [group]);

    const hasChanged = !!originalRef.current && (
        originalRef.current.rsvpRestricted !== rsvpRestricted ||
        originalRef.current.leadEnabled !== leadEnabled ||
        originalRef.current.leadDays !== leadDays ||
        originalRef.current.leadTime !== leadTime ||
        originalRef.current.deadlineEnabled !== deadlineEnabled ||
        originalRef.current.deadlineDays !== deadlineDays ||
        originalRef.current.deadlineTime !== deadlineTime
    );

    const handleSave = async () => {
        if (!id) return;
        setIsSaving(true);
        try {
            await groupApi.updateGroup(api, {
                groupId: id,
                generationLeadDays: rsvpRestricted && leadEnabled ? leadDays : null,
                generationLeadTime: leadTime,
                generationDeadlineDays: rsvpRestricted && deadlineEnabled ? deadlineDays : null,
                generationDeadlineTime: deadlineTime,
            });

            // Refresh queries to ensure changes are visible in settings and group details
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['groupDetails', id] }),
                queryClient.invalidateQueries({ queryKey: ['groups'] }),
            ]);

            Alert.alert("Saved", "RSVP settings updated.", [
                { text: "OK", onPress: () => router.back() },
            ]);
        } catch (error: any) {
            const msg = error.response?.data?.error || "Failed to update RSVP settings.";
            Alert.alert("Error", msg);
        } finally {
            setIsSaving(false);
        }
    };

    // ── Loading state ─────────────────────────────────────────────────────────

    if (loadingGroup || !group) {
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
                    <Text style={s.headerTitle}>RSVP Settings</Text>
                    <View style={{ width: 36 }} />
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={s.screenSub}>Control when members can RSVP to meetups.</Text>

                    <Text style={s.fieldLabel}>Limit when people can RSVP?</Text>
                    <View style={s.boolRow}>
                        <TouchableOpacity style={[s.boolBtn, rsvpRestricted && s.boolBtnActive]}
                            onPress={() => setRsvpRestricted(true)}>
                            <Text style={[s.boolBtnText, rsvpRestricted && s.boolBtnTextActive]}>Limit RSVPs</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.boolBtn, !rsvpRestricted && s.boolBtnActive]}
                            onPress={() => setRsvpRestricted(false)}>
                            <Text style={[s.boolBtnText, !rsvpRestricted && s.boolBtnTextActive]}>Allow anytime</Text>
                        </TouchableOpacity>
                    </View>

                    {rsvpRestricted && (
                        <View style={{ marginTop: 6 }}>
                            <Text style={s.fieldLabel}>RSVP opens</Text>
                            <View style={s.boolRow}>
                                <TouchableOpacity style={[s.boolBtn, leadEnabled && s.boolBtnActive]}
                                    onPress={() => setLeadEnabled(true)}>
                                    <Text style={[s.boolBtnText, leadEnabled && s.boolBtnTextActive]}>Yes</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.boolBtn, !leadEnabled && s.boolBtnActive]}
                                    onPress={() => setLeadEnabled(false)}>
                                    <Text style={[s.boolBtnText, !leadEnabled && s.boolBtnTextActive]}>No</Text>
                                </TouchableOpacity>
                            </View>

                            {leadEnabled && (
                                <>
                                    <View style={[s.leadRow, { marginTop: 10 }]}>
                                        <TouchableOpacity onPress={() => setLeadDays(Math.max(0, leadDays - 1))} style={s.stepperBtn}>
                                            <Feather name="minus" size={18} color="#4A90E2" />
                                        </TouchableOpacity>
                                        <View style={s.leadCenter}>
                                            <Text style={s.leadVal}>{leadDays}</Text>
                                            <Text style={s.leadSub}>{leadDays === 1 ? "day before" : "days before"}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => setLeadDays(leadDays + 1)} style={s.stepperBtn}>
                                            <Feather name="plus" size={18} color="#4A90E2" />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={s.dateFieldRow}>
                                        <Feather name="unlock" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                                        <Text style={s.dateFieldText}>Opens at</Text>
                                        <TimeButton time={leadTime} active={showLeadTimePicker}
                                            onPress={() => { setShowLeadTimePicker(v => !v); setShowDeadlineTimePicker(false); }} />
                                    </View>
                                    {showLeadTimePicker && (
                                        <View style={s.inlinePickerBox}>
                                            <TimePicker initialValue={leadTime} onTimeChange={setLeadTime} />
                                        </View>
                                    )}
                                </>
                            )}

                            <Text style={[s.fieldLabel, { marginTop: 20 }]}>RSVP deadline</Text>
                            <View style={s.boolRow}>
                                <TouchableOpacity style={[s.boolBtn, deadlineEnabled && s.boolBtnActive]}
                                    onPress={() => setDeadlineEnabled(true)}>
                                    <Text style={[s.boolBtnText, deadlineEnabled && s.boolBtnTextActive]}>Yes</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.boolBtn, !deadlineEnabled && s.boolBtnActive]}
                                    onPress={() => setDeadlineEnabled(false)}>
                                    <Text style={[s.boolBtnText, !deadlineEnabled && s.boolBtnTextActive]}>No</Text>
                                </TouchableOpacity>
                            </View>

                            {deadlineEnabled && (
                                <>
                                    <View style={[s.leadRow, { marginTop: 10 }]}>
                                        <TouchableOpacity onPress={() => setDeadlineDays(Math.max(0, deadlineDays - 1))} style={s.stepperBtn}>
                                            <Feather name="minus" size={18} color="#4A90E2" />
                                        </TouchableOpacity>
                                        <View style={s.leadCenter}>
                                            <Text style={s.leadVal}>{deadlineDays}</Text>
                                            <Text style={s.leadSub}>{deadlineDays === 1 ? "day before" : "days before"}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => setDeadlineDays(deadlineDays + 1)} style={s.stepperBtn}>
                                            <Feather name="plus" size={18} color="#4A90E2" />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={s.dateFieldRow}>
                                        <Feather name="lock" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                                        <Text style={s.dateFieldText}>Closes at</Text>
                                        <TimeButton time={deadlineTime} active={showDeadlineTimePicker}
                                            onPress={() => { setShowDeadlineTimePicker(v => !v); setShowLeadTimePicker(false); }} />
                                    </View>
                                    {showDeadlineTimePicker && (
                                        <View style={s.inlinePickerBox}>
                                            <TimePicker initialValue={deadlineTime} onTimeChange={setDeadlineTime} />
                                        </View>
                                    )}
                                </>
                            )}
                        </View>
                    )}
                </ScrollView>

                <View style={s.screenFooter}>
                    {!hasChanged && (
                        <Text style={s.noChangeHint}>No changes yet</Text>
                    )}
                    <TouchableOpacity
                        style={[s.primaryBtn, (!hasChanged || isSaving) && s.primaryBtnDisabled]}
                        onPress={handleSave}
                        disabled={!hasChanged || isSaving}
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

export default EditJitScreen;

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
    fieldLabel: { fontSize: 11, fontWeight: "800", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
    boolRow: { flexDirection: "row", gap: 10 },
    boolBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB", alignItems: "center", backgroundColor: "#fff" },
    boolBtnActive: { borderColor: "#4A90E2", backgroundColor: "#EEF6FF" },
    boolBtnText: { fontSize: 14, fontWeight: "700", color: "#6B7280" },
    boolBtnTextActive: { color: "#4A90E2" },
    leadRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", paddingVertical: 16, gap: 24 },
    stepperBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
    leadCenter: { alignItems: "center", minWidth: 60 },
    leadVal: { fontSize: 28, fontWeight: "900", color: "#111827" },
    leadSub: { fontSize: 10, color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase" },
    dateFieldRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 13, marginTop: 10, marginBottom: 4 },
    dateFieldText: { fontSize: 14, color: "#374151", fontWeight: "500", flex: 1 },
    timeBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: "#93C5FD", backgroundColor: "#EFF6FF" },
    timeBtnActive: { backgroundColor: "#4A90E2", borderColor: "#4A90E2" },
    timeBtnText: { fontSize: 12, fontWeight: "700", color: "#4A90E2" },
    timeBtnTextActive: { color: "#fff" },
    inlinePickerBox: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", padding: 8, width: "100%", marginTop: 8 },
});
