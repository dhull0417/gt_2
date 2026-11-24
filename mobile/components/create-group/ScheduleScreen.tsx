// Create group, step 2: the group's recurring meetups. Typed fields inline; everything else as
// one-line rows that open sheets. Review with problems marks them red and scrolls to the first.
// Spec: docs/specs/2026-11-19-calmer-meetup-forms-design.md
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { ScrollViewInstance } from 'react-native';
import { Feather } from "@expo/vector-icons";
import LocationField from "@/components/LocationField";
import LocationSearchModal from "@/components/LocationSearchModal";
import OptionPickerModal from "@/components/OptionPickerModal";
import { StepDots } from "@/components/create-group/StepDots";
import { makeStyles } from "@/components/create-group/styles";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { GroupCard, SummaryRow, SettingSheet, useFormStyles, useIssueScroll } from "@/components/ui/form";
import RecurrenceEditor from "@/components/schedule/RecurrenceEditor";
import { RsvpRulesSheet, CapacitySheet, BringItemsSheet, QuestionsSheet } from "@/components/schedule/sheets";
import { PremiumPreviewNote } from "@/components/schedule/PremiumPreviewNote";
import { PremiumSubmitButton } from "@/components/PremiumSubmitButton";
import { questionsSummary } from "@/utils/questionDrafts";
import { usePremium } from "@/hooks/usePremium";
import { submitHint, submitMode, usesPremiumFeatures } from "@/utils/premiumGate";
import { useThemeColors } from "@/contexts/AppearanceContext";
import { defaultSchedule, type ScheduleData } from "@/utils/createGroupDraft";
import { scheduleIssues, visibleIssues, fixMessage, firstArea, issueFor, type FormArea } from "@/utils/formIssues";
import { recurrenceSummary, rsvpSummary, capacitySummary, bringSummary } from "@/utils/formSummaries";
import { deviceTimeZone, timezoneOptions, tzAbbr } from "@/utils/timezones";

type Sheet = "when" | "rsvp" | "capacity" | "bring" | "questions" | null;
const ORDER: FormArea[] = ["where", "when", "timezone", "rsvp", "capacity", "bring", "questions"];

export const ScheduleScreen = ({ groupName, initialSchedules, initialTimezone, onNext, onBack, onSkip }: {
    groupName?: string;
    initialSchedules?: ScheduleData[];
    initialTimezone?: string;
    onNext: (schedules: ScheduleData[], timezone: string) => void;
    onBack: () => void;
    onSkip: () => void;
}) => {
    const colors = useThemeColors();
    const { isPremium } = usePremium();
    const s = useMemo(() => makeStyles(colors), [colors]);
    const f = useFormStyles();
    // One shared timezone for the whole group — not per-schedule (the backend
    // only stores one Group.timezone), so it lives outside the schedules array.
    const [timezone, setTimezone] = useState(initialTimezone ?? deviceTimeZone());
    const [showTZPicker, setShowTZPicker] = useState(false);
    const scrollViewRef = useRef<ScrollViewInstance>(null);
    const { register, scrollTo } = useIssueScroll(scrollViewRef);

    // Starts with one blank series already in place so its fields are immediately visible.
    const [schedules, setSchedules] = useState<ScheduleData[]>(
        initialSchedules && initialSchedules.length > 0 ? initialSchedules : [defaultSchedule(groupName ?? "")]
    );
    const d = schedules[0] ?? defaultSchedule();
    const setD = useCallback((updater: (prev: ScheduleData) => ScheduleData) => {
        setSchedules(prev => prev.map((sch, i) => (i === 0 ? updater(sch) : sch)));
    }, []);
    const upd = useCallback((patch: Partial<ScheduleData>) => setD(prev => ({ ...prev, ...patch })), [setD]);

    const [sheet, setSheet] = useState<Sheet>(null);
    const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false);
    const [attempted, setAttempted] = useState(false);

    // The series takes the group's name automatically, so no name check here. A series with no
    // frequency is "not set up" and fine (same as Skip).
    const allIssues = schedules.flatMap(sch => scheduleIssues(sch, { requireName: false, emptyIsValid: true }));
    const issues = visibleIssues(allIssues, attempted);
    const close = () => setSheet(null);

    const review = () => {
        if (allIssues.length) {
            setAttempted(true);
            scrollTo(firstArea(allIssues, ORDER));
            return;
        }
        onNext(schedules.filter(sch => sch.frequency), timezone);
    };

    // Premium settings are open to everyone so they can see how they work; saving them needs Premium
    // (see premiumGate). You are the owner of the group you're creating.
    const premiumRow = (label: string, value: string, open: () => void, right?: ReactNode, error?: string | null) =>
        <SummaryRow label={label} value={value} onPress={open} right={right} error={error} />;
    const footerMode = submitMode({ usesPremium: usesPremiumFeatures(d), isPremium, isOwner: true });

    return (
        <View style={s.screen}>
            <View style={s.screenHeader}>
                <PressableOpacity onPress={onBack} style={s.iconBtn} accessibilityLabel="Back">
                    <Feather name="arrow-left" size={24} color={colors.textMuted} />
                </PressableOpacity>
                <StepDots total={4} current={1} />
                <View style={{ width: 36 }} />
            </View>
            <ScrollView
                ref={scrollViewRef}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                automaticallyAdjustKeyboardInsets
            >
                <Text style={s.screenTitle}>Set Recurring Meetups</Text>
                <Text style={s.screenSub}>Set up when, where, and how you meet</Text>

                {schedules.length === 0 ? (
                    <View style={s.reviewEmptyCard}>
                        <Feather name="calendar" size={18} color={colors.textFaint} />
                        <Text style={s.reviewMuted}>No series — continue without any</Text>
                    </View>
                ) : (
                <>
                    <View onLayout={register("where")}>
                        <Text style={f.sectionLabel}>Details</Text>
                        <View style={[f.card, { padding: 14 }]}>
                            <TextInput
                                style={[styles.description, { color: colors.textPrimary }]}
                                placeholder="Add any extra details for this series..."
                                placeholderTextColor={colors.placeholder}
                                value={d.description}
                                onChangeText={t => upd({ description: t })}
                                multiline
                                textAlignVertical="top"
                                accessibilityLabel="Description"
                            />
                            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
                            <LocationField variant="wizard" placeholder="Where? e.g. 123 Main St or zoom.us/j/..." value={d.location} onPress={() => setIsLocationSearchOpen(true)} />
                        </View>
                    </View>

                    <View onLayout={register("when", "timezone")}>
                        <Text style={f.sectionLabel}>Date &amp; time</Text>
                        <GroupCard>
                            <SummaryRow testID="row-when" label="When" value={recurrenceSummary(d)} onPress={() => setSheet("when")} error={issueFor(issues, "when")} />
                            <SummaryRow label="Timezone" value={tzAbbr(timezone)} onPress={() => setShowTZPicker(true)} />
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
                        {!isPremium && <PremiumPreviewNote />}
                        <GroupCard>
                            {premiumRow("Food/Things to bring", bringSummary(d.bringItems), () => setSheet("bring"), undefined, issueFor(issues, "bring"))}
                            {premiumRow("Rides", d.ridesEnabled ? "On" : "Off", () => upd({ ridesEnabled: !d.ridesEnabled }),
                                <Switch accessibilityLabel="Coordinate rides" value={d.ridesEnabled} onValueChange={v => upd({ ridesEnabled: v })}
                                    trackColor={{ true: colors.brand, false: colors.borderStrong }} thumbColor="#fff" ios_backgroundColor={colors.borderStrong} />)}
                            <SummaryRow label="Priority RSVP" value="" onPress={() => {}} disabledReason="Set up after the group is created" />
                            {premiumRow("RSVP Questions", questionsSummary(d.questions ?? []), () => setSheet("questions"), undefined, issueFor(issues, "questions"))}
                        </GroupCard>
                    </View>
                </>
                )}
            </ScrollView>
            <View style={s.screenFooter}>
                <PressableOpacity style={[s.skipBtn, { marginLeft: 12 }]} onPress={onSkip}>
                    <Text style={s.skipBtnText}>Skip</Text>
                </PressableOpacity>
                {footerMode !== "confirm" ? (
                    <>
                        <Text style={{ flex: 1, textAlign: "right", marginRight: 10, color: colors.textMuted, fontSize: 13, fontWeight: "600" }} numberOfLines={2}>
                            {submitHint(footerMode)}
                        </Text>
                        <PremiumSubmitButton mode={footerMode} style={s.primaryBtn} />
                    </>
                ) : (
                    <>
                        <Text style={{ flex: 1, textAlign: "right", marginRight: 10, color: colors.danger, fontSize: 13, fontWeight: "700" }} numberOfLines={2}>
                            {attempted ? fixMessage(issues.length) : ""}
                        </Text>
                        <PressableOpacity style={s.reviewBtnGhost} onPress={review} accessibilityLabel="Review">
                            <Text style={s.reviewBtnGhostText}>Review</Text>
                            <Feather name="arrow-right" size={16} color={colors.brand} style={{ marginLeft: 4 }} />
                        </PressableOpacity>
                    </>
                )}
            </View>

            <SettingSheet visible={sheet === "when"} title="When" onClose={close} tall>
                <RecurrenceEditor value={d} update={setD} issues={issues} />
            </SettingSheet>
            <RsvpRulesSheet visible={sheet === "rsvp"} onClose={close} issues={issues} value={d} onChange={upd} />
            <CapacitySheet visible={sheet === "capacity"} onClose={close} issues={issues} mode={d.maxAttendeesMode} input={d.maxAttendeesInput} onChange={upd} />
            <BringItemsSheet visible={sheet === "bring"} onClose={close} issues={allIssues} showIssues={attempted} items={d.bringItems} onChange={bringItems => upd({ bringItems })} />
            <QuestionsSheet visible={sheet === "questions"} onClose={close} showIssues={attempted} savedLater="group"
                drafts={d.questions ?? []} onChange={questions => upd({ questions })} />

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
                    options={timezoneOptions(timezone)}
                    selectedKey={timezone}
                    onSelect={key => { setTimezone(key); setShowTZPicker(false); }}
                    onClose={() => setShowTZPicker(false)}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    description: { minHeight: 64, fontSize: 15, padding: 0 },
});
