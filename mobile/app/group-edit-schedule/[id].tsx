// New / Edit Schedule: one recurring series of a group. Typed fields inline; everything else as
// one-line rows that open sheets. Save with problems marks them red and scrolls to the first.
// Spec: docs/specs/2026-11-19-calmer-meetup-forms-design.md
import React, { useState, useMemo, useCallback, useRef, type ReactNode } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Switch } from "react-native";
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { timezoneOptions, tzAbbr } from '@/utils/timezones';
import { toast } from '@/contexts/ToastContext';
import { haptic } from '@/utils/haptics';
import { ScheduleData, defaultSchedule, buildSchedulePayload, scheduleFromNamedSchedule } from '@/utils/editScheduleDraft';
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { useGetGroupDetails } from "../../hooks/useGetGroupDetails";
import { useApiClient, groupApi } from "../../utils/api";
import { broadcastGroupUpdate, broadcastMeetupUpdate } from "../../utils/groupRealtime";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import OptionPickerModal from "../../components/OptionPickerModal";
import LocationField from "@/components/LocationField";
import LocationSearchModal from "@/components/LocationSearchModal";
import { useThemeColors } from "@/contexts/AppearanceContext";
import type { ThemeColors } from "@/constants/theme";
import { GroupCard, SummaryRow, SettingSheet, FieldError, useFormStyles, useIssueScroll } from "@/components/ui/form";
import RecurrenceEditor from "@/components/schedule/RecurrenceEditor";
import { RsvpRulesSheet, CapacitySheet, BringItemsSheet, PremiumUpsellSheet, QuestionsSheet } from "@/components/schedule/sheets";
import { questionsSummary } from "@/utils/questionDrafts";
import { scheduleIssues, visibleIssues, fixMessage, firstArea, issueFor, fieldIssue, type FormArea } from "@/utils/formIssues";
import { recurrenceSummary, rsvpSummary, capacitySummary, bringSummary } from "@/utils/formSummaries";
import { saveDraftQuestions } from "@/utils/questionDrafts";
import { askDeleteAfterEnd, decideRemoveAfterEnd } from "@/utils/endDatePrompt";

type Sheet = "when" | "rsvp" | "capacity" | "bring" | "questions" | "upsell" | null;
const ORDER: FormArea[] = ["name", "where", "when", "timezone", "rsvp", "capacity", "bring", "questions"];

const EditScheduleScreen = () => {
    const { id, scheduleId: rawScheduleId } = useLocalSearchParams<{ id: string; scheduleId?: string }>();
    const colors = useThemeColors();
    const s = useMemo(() => makeStyles(colors), [colors]);
    const f = useFormStyles();
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

    const upd = useCallback((patch: Partial<ScheduleData>) => setD(prev => ({ ...prev, ...patch })), []);
    const [sheet, setSheet] = useState<Sheet>(null);
    const [showTZPicker, setShowTZPicker] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const scrollRef = useRef<ScrollView>(null);
    const { register, scrollTo } = useIssueScroll(scrollRef);
    const allIssues = scheduleIssues(d, { requireName: true, emptyIsValid: false });
    const issues = visibleIssues(allIssues, attempted);
    const close = () => setSheet(null);
    const isPremium = group?.isPremium === true;

    const hasChanged = useMemo(() => {
        if (!originalRef.current) return false;
        return JSON.stringify(buildSchedulePayload(d)) !== JSON.stringify(buildSchedulePayload(originalRef.current));
    }, [d]);

    // Nothing to save on an unchanged existing schedule; otherwise Save is always tappable and
    // explains any problems instead of saving.
    const unchanged = !isNew && !hasChanged;

    // ── Save ──────────────────────────────────────────────────────────────────

    const handleSave = async () => {
        if (allIssues.length) {
            setAttempted(true);
            scrollTo(firstArea(allIssues, ORDER));
            return;
        }
        const payload = buildSchedulePayload(d);
        if (!payload || !id) return;
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        setIsSaving(true);
        try {
            // A new end date with meetups already after it: ask Delete or Keep first.
            const removeAfterEnd = await decideRemoveAfterEnd({
                isNew,
                previous: originalRef.current?.endDate ?? null,
                next: d.endDate ?? null,
                countAfter: date => groupApi.countMeetupsAfter(api, id, scheduleId!, date),
                ask: askDeleteAfterEnd,
            });
            if (removeAfterEnd === 'cancel') return;
            if (isNew) {
                const created = await groupApi.createSchedule(api, id, payload);
                // RSVP questions written before the schedule existed.
                const ok = await saveDraftQuestions([d.questions], [created.scheduleId],
                    (sid, questions) => groupApi.updateScheduleQuestions(api, id, sid, { questions }));
                if (!ok) Alert.alert("Schedule created", "Your RSVP questions couldn't be saved. You can add them from this schedule's RSVP Questions.");
            } else {
                await groupApi.updateSchedule(api, id, scheduleId!, { ...payload, removeAfterEnd });
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

    if (isLoading || !group) {
        return (
            <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                    <LoadingAnimation />
                </View>
            </SafeAreaView>
        );
    }

    const premiumRow = (label: string, value: string, open: () => void, right?: ReactNode, error?: string | null) => isPremium
        ? <SummaryRow label={label} value={value} onPress={open} right={right} error={error} />
        : <SummaryRow label={label} value={value} onPress={() => setSheet("upsell")} locked />;
    const questionCount = targetSchedule?.defaultQuestions?.length ?? 0;
    const nameError = fieldIssue(issues, "name");

    return (
        <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
            <View style={{ flex: 1 }}>
                <View style={s.header}>
                    <PressableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="Back">
                        <Feather name="arrow-left" size={24} color={colors.textMuted} />
                    </PressableOpacity>
                    <Text style={s.headerTitle}>{isNew ? "New Schedule" : "Edit Schedule"}</Text>
                    <View style={{ width: 36 }} />
                </View>

                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
                <ScrollView
                    ref={scrollRef}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={s.sub}>
                        {isNew
                            ? "Give this schedule a name (e.g. \"Monthly Camping\") and set its recurrence — it shares this group's members and chat."
                            : "Changes will delete future meetups and regenerate them from the updated schedule."}
                    </Text>

                    <View onLayout={register("name", "where")}>
                        <Text style={f.sectionLabel}>Details</Text>
                        <View style={[f.card, { padding: 14 }, !!nameError && { borderColor: colors.danger }]}>
                            <TextInput
                                style={[s.name, { color: colors.textPrimary }]}
                                value={d.name}
                                onChangeText={t => upd({ name: t })}
                                placeholder="Schedule name, e.g. Sunday Dinner"
                                placeholderTextColor={nameError ? colors.danger : colors.placeholder}
                                maxLength={60}
                                accessibilityLabel="Schedule name"
                            />
                            <FieldError message={nameError} />
                            <View style={s.divider} />
                            <TextInput
                                style={[s.description, { color: colors.textPrimary }]}
                                placeholder="Add any extra details for this series..."
                                placeholderTextColor={colors.placeholder}
                                value={d.description}
                                onChangeText={t => upd({ description: t })}
                                multiline
                                textAlignVertical="top"
                                accessibilityLabel="Description"
                            />
                            <View style={s.divider} />
                            <LocationField variant="wizard" placeholder="Where? e.g. 123 Main St or zoom.us/j/..." value={d.location} onPress={() => setIsLocationSearchOpen(true)} />
                        </View>
                    </View>

                    <View onLayout={register("when", "timezone")}>
                        <Text style={f.sectionLabel}>Date &amp; time</Text>
                        <GroupCard>
                            <SummaryRow testID="row-when" label="When" value={recurrenceSummary(d)} onPress={() => setSheet("when")} error={issueFor(issues, "when")} />
                            <SummaryRow label="Timezone" value={tzAbbr(d.timezone)} onPress={() => setShowTZPicker(true)} />
                        </GroupCard>
                    </View>

                    <View onLayout={register("rsvp", "capacity")}>
                        <Text style={f.sectionLabel}>RSVPs</Text>
                        <GroupCard>
                            <SummaryRow label="RSVP rules" value={rsvpSummary(d)} onPress={() => setSheet("rsvp")} error={issueFor(issues, "rsvp")} />
                            <SummaryRow label="Capacity" value={capacitySummary(d.maxAttendeesMode, d.maxAttendeesInput)} onPress={() => setSheet("capacity")} error={issueFor(issues, "capacity")} />
                        </GroupCard>
                    </View>

                    <View onLayout={register("bring", "questions")}>
                        <Text style={f.sectionLabel}>Premium</Text>
                        <GroupCard>
                            {premiumRow("Food/Things to bring", bringSummary(d.bringItems), () => setSheet("bring"), undefined, issueFor(issues, "bring"))}
                            {premiumRow("Rides", d.ridesEnabled ? "On" : "Off", () => upd({ ridesEnabled: !d.ridesEnabled }),
                                <Switch accessibilityLabel="Coordinate rides" value={d.ridesEnabled} onValueChange={v => upd({ ridesEnabled: v })}
                                    trackColor={{ true: colors.brand, false: colors.borderStrong }} thumbColor="#fff" ios_backgroundColor={colors.borderStrong} />)}
                            {/* Priority RSVP and questions rank members and edit open meetups, so they need a saved series. */}
                            {!isPremium ? <SummaryRow label="Priority RSVP" value="" onPress={() => setSheet("upsell")} locked />
                                : <SummaryRow label="Priority RSVP" value={targetSchedule?.priorityEnabled ? "On" : "Off"}
                                    disabledReason={isNew ? "Set up after the schedule is created" : undefined}
                                    onPress={() => router.push({ pathname: "/group-priority/[id]", params: { id: id!, scheduleId: scheduleId! } })} />}
                            {!isPremium ? <SummaryRow label="RSVP Questions" value="" onPress={() => setSheet("upsell")} locked />
                                : isNew
                                    ? <SummaryRow label="RSVP Questions" value={questionsSummary(d.questions ?? [])} onPress={() => setSheet("questions")} error={issueFor(issues, "questions")} />
                                    : <SummaryRow label="RSVP Questions" value={questionCount ? `${questionCount} question${questionCount === 1 ? "" : "s"}` : "None"}
                                        onPress={() => router.push({ pathname: "/group-questions/[id]", params: { id: id!, scheduleId: scheduleId! } })} />}
                        </GroupCard>
                    </View>
                </ScrollView>
                </KeyboardAvoidingView>

                <View style={s.footer}>
                    {!isNew && (
                        <PressableOpacity style={s.deleteBtn} onPress={handleDelete} disabled={isDeleting} accessibilityLabel="Remove schedule">
                            {isDeleting
                                ? <ActivityIndicator color={colors.danger} size="small" />
                                : <Feather name="trash-2" size={18} color={colors.danger} />}
                        </PressableOpacity>
                    )}
                    <Text style={[s.hint, attempted && issues.length > 0 && { color: colors.danger, fontWeight: "700" }]} numberOfLines={2}>
                        {attempted && issues.length ? fixMessage(issues.length) : unchanged ? "No changes yet" : ""}
                    </Text>
                    <PressableOpacity
                        style={[s.primaryBtn, (unchanged || isSaving) && { opacity: 0.5 }]}
                        onPress={handleSave}
                        disabled={unchanged || isSaving}
                        accessibilityLabel={isNew ? "Create Schedule" : "Save Changes"}
                    >
                        {isSaving
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <><Text style={s.primaryBtnText}>{isNew ? "Create Schedule" : "Save Changes"}</Text><Feather name="check" size={18} color="#fff" style={{ marginLeft: 6 }} /></>}
                    </PressableOpacity>
                </View>

                <SettingSheet visible={sheet === "when"} title="When" onClose={close} tall>
                    <RecurrenceEditor value={d} update={fn => setD(prev => fn(prev))} issues={issues} />
                </SettingSheet>
                <RsvpRulesSheet visible={sheet === "rsvp"} onClose={close} issues={issues} value={d} onChange={upd} isPremium={isPremium} owner={group?.owner} />
                <CapacitySheet visible={sheet === "capacity"} onClose={close} issues={issues} mode={d.maxAttendeesMode} input={d.maxAttendeesInput} onChange={upd} />
                <BringItemsSheet visible={sheet === "bring"} onClose={close} issues={allIssues} showIssues={attempted} items={d.bringItems} onChange={bringItems => upd({ bringItems })} />
                <QuestionsSheet visible={sheet === "questions"} onClose={close} showIssues={attempted} savedLater="schedule"
                    drafts={d.questions ?? []} onChange={questions => upd({ questions })} />
                <PremiumUpsellSheet visible={sheet === "upsell"} onClose={close} note="Requires the group owner to have Premium." owner={group?.owner} />

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
                        options={timezoneOptions(d.timezone)}
                        selectedKey={d.timezone}
                        onSelect={key => { upd({ timezone: key }); setShowTZPicker(false); }}
                        onClose={() => setShowTZPicker(false)}
                    />
                )}
            </View>
        </SafeAreaView>
    );
};

export default EditScheduleScreen;

const makeStyles = (c: ThemeColors) => StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface },
    headerTitle: { fontSize: 17, fontWeight: "800", color: c.textPrimary },
    iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    sub: { fontSize: 13, color: c.textMuted, marginTop: 12, lineHeight: 18 },
    name: { fontSize: 16, fontWeight: "700", padding: 0, minHeight: 28 },
    description: { minHeight: 56, fontSize: 15, padding: 0 },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 10 },
    footer: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
    hint: { flex: 1, textAlign: "right", fontSize: 13, color: c.textFaint, fontWeight: "600" },
    deleteBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
    primaryBtn: { flexDirection: "row", alignItems: "center", backgroundColor: c.brand, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13 },
    primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
