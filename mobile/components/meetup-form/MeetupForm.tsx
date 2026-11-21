import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { ScrollViewInstance } from 'react-native';
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { DateTime } from "luxon";
import LocationField from "@/components/LocationField";
import LocationSearchModal from "@/components/LocationSearchModal";
import OptionPickerModal from "@/components/OptionPickerModal";
import { makeStyles } from "@/components/create-group/styles";
import { GroupCard, SummaryRow, FieldError, useFormStyles, useIssueScroll } from "@/components/ui/form";
import { OneOffWhenSheet, RsvpRulesSheet, CapacitySheet, BringItemsSheet, PremiumUpsellSheet, QuestionsSheet } from "@/components/schedule/sheets";
import { questionsSummary } from "@/utils/questionDrafts";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { useThemeColors } from "@/contexts/AppearanceContext";
import { meetupIssues, visibleIssues, fixMessage, firstArea, issueFor, type FormArea } from "@/utils/formIssues";
import { oneOffWhenSummary, rsvpSummary, capacitySummary, bringSummary } from "@/utils/formSummaries";
import type { MeetupDraft } from "@/utils/meetupFormDraft";
import { timezoneLabel, timezoneOptions } from "@/utils/timezones";

type Sheet = "when" | "rsvp" | "capacity" | "bring" | "questions" | "upsell" | null;
const ORDER: FormArea[] = ["group", "where", "when", "timezone", "rsvp", "capacity", "bring", "questions"];

/**
 * Full-screen form for one meetup (Add Meetup and Edit Meetup): typed fields inline, everything
 * else as one-line rows that open sheets. Controlled: the host keeps the draft. Sheets and pickers
 * are drawn as overlays, since a second native Modal can't open on top of this one.
 * Problems: wrong input is red right away; missing information turns red after the first
 * Create/Save tap, which also scrolls to it instead of saving.
 */
export function MeetupForm({
    visible, mode, draft, onChange, isPremium, owner, lockedNote, questionsLink, topSection, overlays,
    timezoneEditable, saving, extraError, onSubmit, onClose,
}: {
    visible: boolean;
    mode: "create" | "edit";
    draft: MeetupDraft;
    onChange: (patch: Partial<MeetupDraft>) => void;
    /** Does this meetup's group have Premium (the owner's)? */
    isPremium: boolean;
    owner?: string | { _id: string } | null;
    lockedNote: string;
    /** Opens the RSVP questions for this meetup; left out when it doesn't exist yet. */
    questionsLink?: () => void;
    /** Shown above the cards (Add Meetup's "Which group?"). */
    topSection?: ReactNode;
    /** The host's own overlays (e.g. its group picker), drawn above the form. */
    overlays?: ReactNode;
    timezoneEditable: boolean;
    saving: boolean;
    /** A problem outside the draft that blocks saving (e.g. a missing group name). */
    extraError?: string | null;
    onSubmit: () => void;
    onClose: () => void;
}) {
    const colors = useThemeColors();
    const s = useMemo(() => makeStyles(colors), [colors]);
    const f = useFormStyles();
    const scrollRef = useRef<ScrollViewInstance>(null);
    const { register, scrollTo } = useIssueScroll(scrollRef);
    const [sheet, setSheet] = useState<Sheet>(null);
    const [locationOpen, setLocationOpen] = useState(false);
    const [timezoneOpen, setTimezoneOpen] = useState(false);
    const [attempted, setAttempted] = useState(false);
    useEffect(() => { if (visible) { setAttempted(false); setSheet(null); } }, [visible]);

    const allIssues = meetupIssues(draft, extraError);
    const issues = visibleIssues(allIssues, attempted);
    const today = DateTime.now().setZone(draft.timezone).toISODate()!;
    const close = () => setSheet(null);

    const submit = () => {
        if (allIssues.length) {
            setAttempted(true);
            scrollTo(firstArea(allIssues, ORDER));
            return;
        }
        onSubmit();
    };

    const premiumRow = (label: string, value: string, open: () => void, right?: ReactNode, error?: string | null) => isPremium
        ? <SummaryRow label={label} value={value} onPress={open} right={right} error={error} />
        : <SummaryRow label={label} value={value} onPress={() => setSheet("upsell")} locked />;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            // Android back closes an open sheet or picker first instead of discarding the whole form.
            onRequestClose={() => {
                if (sheet) setSheet(null);
                else if (locationOpen) setLocationOpen(false);
                else if (timezoneOpen) setTimezoneOpen(false);
                else onClose();
            }}
        >
            {/* pageSheet is iOS-only; Android renders fullscreen and needs safe-area insets manually */}
            <SafeAreaView style={[s.screen, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
                <View style={s.screenHeader}>
                    <PressableOpacity accessibilityLabel="Close" onPress={onClose} style={s.iconBtn}>
                        <Feather name="x" size={24} color={colors.textMuted} />
                    </PressableOpacity>
                    <View style={{ width: 36 }} />
                </View>

                {/* Android edge-to-edge doesn't resize Modal windows for the keyboard, so pad manually on both platforms */}
                <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                    <ScrollView
                        ref={scrollRef}
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={s.screenTitle}>{mode === "create" ? "Add Meetup" : "Edit Meetup"}</Text>
                        <Text style={s.screenSub}>{mode === "create" ? "Set up when, where, and how you meet" : "Changes apply to this meetup only"}</Text>

                        {topSection && (
                            <View onLayout={register("group")}>
                                {topSection}
                                <FieldError message={issueFor(issues, "group")} />
                            </View>
                        )}

                        <View onLayout={register("where")}>
                            <Text style={f.sectionLabel}>Details</Text>
                            <View style={[f.card, { padding: 14 }]}>
                                <TextInput
                                    style={[styles.description, { color: colors.textPrimary }]}
                                    placeholder="Add any extra details for this meetup..."
                                    placeholderTextColor={colors.placeholder}
                                    value={draft.description}
                                    onChangeText={t => onChange({ description: t })}
                                    multiline
                                    textAlignVertical="top"
                                    accessibilityLabel="Description"
                                />
                                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
                                <LocationField variant="wizard" placeholder="Where? e.g. Starbucks or Zoom link..." value={draft.location} onPress={() => setLocationOpen(true)} />
                            </View>
                        </View>

                        <View onLayout={register("when", "timezone")}>
                            <Text style={f.sectionLabel}>Date &amp; time</Text>
                            <GroupCard>
                                <SummaryRow label="When" value={oneOffWhenSummary(draft.date, draft.time, draft.endTime)}
                                    onPress={() => setSheet("when")} error={issueFor(issues, "when")} />
                                <SummaryRow label="Timezone" value={timezoneLabel(draft.timezone)} onPress={() => setTimezoneOpen(true)}
                                    disabledReason={timezoneEditable ? undefined : "Set by the group"} />
                            </GroupCard>
                        </View>

                        <View onLayout={register("rsvp", "capacity")}>
                            <Text style={f.sectionLabel}>RSVPs</Text>
                            <GroupCard>
                                <SummaryRow label="RSVP rules" value={rsvpSummary(draft)} onPress={() => setSheet("rsvp")} error={issueFor(issues, "rsvp")} />
                                <SummaryRow label="Capacity" value={capacitySummary(draft.maxAttendeesMode, draft.maxAttendeesInput)}
                                    onPress={() => setSheet("capacity")} error={issueFor(issues, "capacity")} />
                            </GroupCard>
                        </View>

                        <View onLayout={register("bring", "questions")}>
                            <Text style={f.sectionLabel}>Premium</Text>
                            <GroupCard>
                                {premiumRow("Food/Things to bring", bringSummary(draft.bringItems), () => setSheet("bring"), undefined, issueFor(issues, "bring"))}
                                {premiumRow("Rides", draft.ridesEnabled ? "On" : "Off", () => onChange({ ridesEnabled: !draft.ridesEnabled }),
                                    <Switch accessibilityLabel="Coordinate rides" value={draft.ridesEnabled} onValueChange={v => onChange({ ridesEnabled: v })}
                                        trackColor={{ true: colors.brand, false: colors.borderStrong }} thumbColor="#fff" ios_backgroundColor={colors.borderStrong} />)}
                                {!isPremium
                                    ? <SummaryRow label="RSVP Questions" value="" onPress={() => setSheet("upsell")} locked />
                                    : questionsLink
                                        // An existing meetup: its questions (and answers) live on their own screen.
                                        ? <SummaryRow label="RSVP Questions" value="Manage" onPress={questionsLink} />
                                        : <SummaryRow label="RSVP Questions" value={questionsSummary(draft.questions ?? [])} onPress={() => setSheet("questions")} error={issueFor(issues, "questions")} />}
                            </GroupCard>
                        </View>
                    </ScrollView>

                    <View style={s.screenFooter}>
                        <Text style={{ flex: 1, marginRight: 12, color: colors.danger, fontSize: 13, fontWeight: "700" }} numberOfLines={2}>
                            {attempted ? fixMessage(issues.length) : ""}
                        </Text>
                        <PressableOpacity
                            style={[s.primaryBtn, saving && s.primaryBtnDisabled]}
                            onPress={submit}
                            disabled={saving}
                            accessibilityLabel={mode === "create" ? "Create Meetup" : "Save"}
                        >
                            {saving ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <>
                                    <Text style={s.primaryBtnText}>{mode === "create" ? "Create Meetup" : "Save"}</Text>
                                    <Feather name="check" size={18} color="#fff" style={{ marginLeft: 6 }} />
                                </>
                            )}
                        </PressableOpacity>
                    </View>
                </KeyboardAvoidingView>

                <OneOffWhenSheet asOverlay visible={sheet === "when"} onClose={close} issues={issues}
                    date={draft.date} time={draft.time} endTime={draft.endTime} minDate={today} onChange={onChange} />
                <RsvpRulesSheet asOverlay visible={sheet === "rsvp"} onClose={close} issues={issues}
                    value={draft} onChange={onChange} isPremium={isPremium} owner={owner} />
                <CapacitySheet asOverlay visible={sheet === "capacity"} onClose={close} issues={issues}
                    mode={draft.maxAttendeesMode} input={draft.maxAttendeesInput} onChange={onChange} />
                <BringItemsSheet asOverlay visible={sheet === "bring"} onClose={close} issues={allIssues} showIssues={attempted}
                    items={draft.bringItems} onChange={bringItems => onChange({ bringItems })} />
                <QuestionsSheet asOverlay visible={sheet === "questions"} onClose={close} showIssues={attempted} savedLater="meetup"
                    drafts={draft.questions ?? []} onChange={questions => onChange({ questions })} />
                <PremiumUpsellSheet asOverlay visible={sheet === "upsell"} onClose={close} note={lockedNote} owner={owner} />

                <LocationSearchModal
                    visible={locationOpen}
                    initialValue={draft.location}
                    placeholder="e.g. Starbucks or Zoom link..."
                    onDone={text => { onChange({ location: text }); setLocationOpen(false); }}
                    onCancel={() => setLocationOpen(false)}
                    asOverlay
                />
                {timezoneOpen && (
                    <OptionPickerModal
                        title="Timezone"
                        options={timezoneOptions(draft.timezone)}
                        selectedKey={draft.timezone}
                        onSelect={key => { onChange({ timezone: key }); setTimezoneOpen(false); }}
                        onClose={() => setTimezoneOpen(false)}
                    />
                )}
                {overlays}
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    description: { minHeight: 64, fontSize: 15, padding: 0 },
});
