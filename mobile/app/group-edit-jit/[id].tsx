import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Animated,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from "react-native-safe-area-context";
import { useGetGroupDetails } from "../../hooks/useGetGroupDetails";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { useApiClient, groupApi } from "../../utils/api";
import NativeTimePicker, { timeStringToDate } from "@/components/NativeTimePicker";

// RSVP opens and RSVP deadline are each "N days before, at time of day". When both
// land on the same day-count, only the time of day keeps opens before the deadline,
// so the day-count comparison alone (leadDays >= deadlineDays) isn't sufficient.
const timeToMinutes = (time: string): number => {
    const t = timeStringToDate(time);
    return t.getHours() * 60 + t.getMinutes();
};

// ─── ToggleSwitch ─────────────────────────────────────────────────────────────

const ToggleSwitch = ({ value, onValueChange, activeColor = "#4A90E2" }: {
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
    const [leadDays, setLeadDays] = useState(5);
    const [leadTime, setLeadTime] = useState("09:00 AM");
    const [showLeadTimePicker, setShowLeadTimePicker] = useState(false);
    const [deadlineEnabled, setDeadlineEnabled] = useState(false);
    const [deadlineDays, setDeadlineDays] = useState(2);
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
                leadDays: group.generationLeadDays ?? 5,
                leadTime: group.generationLeadTime || "09:00 AM",
                deadlineEnabled: group.generationDeadlineDays != null,
                deadlineDays: group.generationDeadlineDays ?? 2,
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

    const openLeadTimePicker = () => {
        setShowDeadlineTimePicker(false);
        setShowLeadTimePicker(true);
    };

    const openDeadlineTimePicker = () => {
        setShowLeadTimePicker(false);
        setShowDeadlineTimePicker(true);
    };

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
                        <TouchableOpacity style={[s.boolBtn, !rsvpRestricted && s.boolBtnActive]}
                            onPress={() => setRsvpRestricted(false)}>
                            <Text style={[s.boolBtnText, !rsvpRestricted && s.boolBtnTextActive]}>Allow anytime</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.boolBtn, rsvpRestricted && s.boolBtnActive]}
                            onPress={() => setRsvpRestricted(true)}>
                            <Text style={[s.boolBtnText, rsvpRestricted && s.boolBtnTextActive]}>Limit RSVPs</Text>
                        </TouchableOpacity>
                    </View>

                    {rsvpRestricted && (
                        <View style={{ marginTop: 14, gap: 14 }}>
                            <View>
                                <View style={s.toggleRow}>
                                    <Text style={s.toggleRowLabel}>RSVP opens</Text>
                                    <ToggleSwitch value={leadEnabled} onValueChange={(v) => {
                                        setLeadEnabled(v);
                                        const nextLeadDays = v && deadlineEnabled && leadDays < deadlineDays ? deadlineDays : leadDays;
                                        if (nextLeadDays !== leadDays) setLeadDays(nextLeadDays);
                                        if (v && deadlineEnabled && nextLeadDays === deadlineDays && timeToMinutes(leadTime) > timeToMinutes(deadlineTime)) {
                                            setLeadTime(deadlineTime);
                                        }
                                    }} />
                                </View>
                                {leadEnabled && (
                                    <View style={{ marginTop: 10 }}>
                                        <View style={s.leadRow}>
                                            <TouchableOpacity onPress={() => {
                                                const nextLeadDays = Math.max(deadlineEnabled ? deadlineDays : 0, leadDays - 1);
                                                setLeadDays(nextLeadDays);
                                                if (deadlineEnabled && nextLeadDays === deadlineDays && timeToMinutes(leadTime) > timeToMinutes(deadlineTime)) {
                                                    setLeadTime(deadlineTime);
                                                }
                                            }} style={s.stepperBtn}>
                                                <Feather name="minus" size={18} color="#4A90E2" />
                                            </TouchableOpacity>
                                            <View style={s.leadCenter}>
                                                <Text style={s.leadVal}>{leadDays}</Text>
                                                <Text style={s.leadSub}>days before</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => setLeadDays(leadDays + 1)} style={s.stepperBtn}>
                                                <Feather name="plus" size={18} color="#4A90E2" />
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={s.fieldLabel}>Time</Text>
                                        <TouchableOpacity style={s.dateFieldRow} onPress={openLeadTimePicker}>
                                            <Feather name="clock" size={16} color="#9CA3AF" style={{ marginRight: 10 }} />
                                            <Text style={s.dateFieldText}>{leadTime}</Text>
                                            <Feather name={showLeadTimePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>

                            <View>
                                <View style={s.toggleRow}>
                                    <Text style={s.toggleRowLabel}>RSVP deadline</Text>
                                    <ToggleSwitch value={deadlineEnabled} onValueChange={(v) => {
                                        setDeadlineEnabled(v);
                                        const nextDeadlineDays = v && leadEnabled && deadlineDays > leadDays ? leadDays : deadlineDays;
                                        if (nextDeadlineDays !== deadlineDays) setDeadlineDays(nextDeadlineDays);
                                        if (v && leadEnabled && nextDeadlineDays === leadDays && timeToMinutes(deadlineTime) < timeToMinutes(leadTime)) {
                                            setDeadlineTime(leadTime);
                                        }
                                    }} />
                                </View>
                                {deadlineEnabled && (
                                    <View style={{ marginTop: 10 }}>
                                        <View style={s.leadRow}>
                                            <TouchableOpacity onPress={() => setDeadlineDays(Math.max(0, deadlineDays - 1))} style={s.stepperBtn}>
                                                <Feather name="minus" size={18} color="#4A90E2" />
                                            </TouchableOpacity>
                                            <View style={s.leadCenter}>
                                                <Text style={s.leadVal}>{deadlineDays}</Text>
                                                <Text style={s.leadSub}>days before</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => {
                                                const nextDeadlineDays = leadEnabled ? Math.min(leadDays, deadlineDays + 1) : deadlineDays + 1;
                                                setDeadlineDays(nextDeadlineDays);
                                                if (leadEnabled && nextDeadlineDays === leadDays && timeToMinutes(deadlineTime) < timeToMinutes(leadTime)) {
                                                    setDeadlineTime(leadTime);
                                                }
                                            }} style={s.stepperBtn}>
                                                <Feather name="plus" size={18} color="#4A90E2" />
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={s.fieldLabel}>Time</Text>
                                        <TouchableOpacity style={s.dateFieldRow} onPress={openDeadlineTimePicker}>
                                            <Feather name="clock" size={16} color="#9CA3AF" style={{ marginRight: 10 }} />
                                            <Text style={s.dateFieldText}>{deadlineTime}</Text>
                                            <Feather name={showDeadlineTimePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
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

            {showLeadTimePicker && (
                <NativeTimePicker value={leadTime} onChange={(t) => {
                    const capped = deadlineEnabled && leadDays === deadlineDays && timeToMinutes(t) > timeToMinutes(deadlineTime);
                    if (capped) {
                        Alert.alert(
                            "RSVP open time must happen before RSVP deadline",
                            `• Both are ${leadDays} day${leadDays === 1 ? '' : 's'} before the meetup\n• Opens can't be later than ${deadlineTime}\n• Opens set to ${deadlineTime}`
                        );
                    }
                    setLeadTime(capped ? deadlineTime : t);
                }} onClose={() => setShowLeadTimePicker(false)} />
            )}

            {showDeadlineTimePicker && (
                <NativeTimePicker value={deadlineTime} onChange={(t) => {
                    const capped = leadEnabled && deadlineDays === leadDays && timeToMinutes(t) < timeToMinutes(leadTime);
                    if (capped) {
                        Alert.alert(
                            "RSVP deadline must happen after RSVPs open",
                            `• Both are ${deadlineDays} day${deadlineDays === 1 ? '' : 's'} before the meetup\n• Deadline can't be earlier than ${leadTime}\n• Deadline set to ${leadTime}`
                        );
                    }
                    setDeadlineTime(capped ? leadTime : t);
                }} onClose={() => setShowDeadlineTimePicker(false)} />
            )}
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
    toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    toggleRowLabel: { fontSize: 14, fontWeight: "700", color: "#374151", flex: 1, marginRight: 12 },
    switchTrack: { width: 44, height: 26, borderRadius: 13, padding: 2, justifyContent: "center" },
    switchThumb: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 2, elevation: 2 },
    leadRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    stepperBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
    leadCenter: { alignItems: "center", minWidth: 60 },
    leadVal: { fontSize: 22, fontWeight: "900", color: "#111827" },
    leadSub: { fontSize: 10, color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase" },
    dateFieldRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 13, marginBottom: 4 },
    dateFieldText: { fontSize: 15, color: "#374151", fontWeight: "500" },
});
