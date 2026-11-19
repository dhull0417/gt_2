import { useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { DateTime } from "luxon";
import EndTimeField from "@/components/EndTimeField";
import LocationField from "@/components/LocationField";
import LocationSearchModal from "@/components/LocationSearchModal";
import NativeTimePicker from "@/components/NativeTimePicker";
import OptionPickerModal from "@/components/OptionPickerModal";
import { InlineCalendar } from "@/components/create-group/InlineCalendar";
import { makeStyles } from "@/components/create-group/styles";
import { CapacityCard } from "@/components/schedule/CapacityCard";
import { PremiumFeaturesCard } from "@/components/schedule/PremiumFeaturesCard";
import { RsvpRulesCard, RsvpTimePicker, type RsvpPicker } from "@/components/schedule/RsvpRulesCard";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { useThemeColors } from "@/contexts/AppearanceContext";
import { getMinAttendeesError } from "@/utils/editScheduleDraft";
import { validateDraft, type MeetupDraft } from "@/utils/meetupFormDraft";
import { addHour } from "@/utils/timeString";
import { timezoneLabel, timezoneOptions } from "@/utils/timezones";

type Overlay = "time" | "endTime" | "timezone" | "location" | null;

/**
 * Full-screen form for one meetup, laid out like Set Recurring Meetups: Description, Where, When,
 * RSVP Rules, Capacity and the Premium card. Used by Add Meetup and Edit Meetup. Controlled: the
 * host keeps the draft. Pickers are drawn as overlays (siblings of the ScrollView), since a second
 * native Modal can't open on top of this one.
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
    const scrollRef = useRef<ScrollView>(null);
    const [overlay, setOverlay] = useState<Overlay>(null);
    const [rsvpPicker, setRsvpPicker] = useState<RsvpPicker>(null);

    const error = validateDraft(draft) ?? extraError ?? null;
    const today = DateTime.now().setZone(draft.timezone).toISODate()!;

    const open = (o: Overlay) => { setRsvpPicker(null); setOverlay(prev => (prev === o ? null : o)); };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            // Android back closes an open picker first instead of discarding the whole form.
            onRequestClose={() => {
                if (overlay) setOverlay(null);
                else if (rsvpPicker) setRsvpPicker(null);
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
                        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={s.screenTitle}>{mode === "create" ? "Add Meetup" : "Edit Meetup"}</Text>
                        <Text style={s.screenSub}>{mode === "create" ? "Set up when, where, and how you meet" : "Changes apply to this meetup only"}</Text>

                        {topSection}

                        {/* Description */}
                        <View style={[s.sectionCard, { borderLeftWidth: 3, borderLeftColor: colors.brand }]}>
                            <View style={s.sectionHeaderRow}>
                                <View style={s.sectionIconChip}><Feather name="align-left" size={19} color={colors.brand} /></View>
                                <Text style={s.sectionTitle}>Description</Text>
                            </View>
                            <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Description (optional)</Text>
                            <View style={[s.inputRow, s.descriptionInputRow, { marginBottom: 0 }]}>
                                <TextInput
                                    style={[s.inlineInput, s.descriptionInput]}
                                    placeholder="Add any extra details for this meetup..."
                                    placeholderTextColor={colors.placeholder}
                                    value={draft.description}
                                    onChangeText={t => onChange({ description: t })}
                                    multiline
                                    textAlignVertical="top"
                                />
                            </View>
                        </View>

                        {/* Where */}
                        <View style={[s.sectionCard, { borderLeftWidth: 3, borderLeftColor: colors.danger }]}>
                            <View style={s.sectionHeaderRow}>
                                <View style={s.sectionIconChip}><Feather name="map-pin" size={19} color={colors.danger} /></View>
                                <Text style={s.sectionTitle}>Where</Text>
                            </View>
                            <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Location or link</Text>
                            <LocationField variant="wizard" placeholder="e.g. Starbucks or Zoom link..." value={draft.location} onPress={() => open("location")} />
                        </View>

                        {/* When */}
                        <View style={[s.sectionCard, { borderLeftWidth: 3, borderLeftColor: colors.warning }]}>
                            <View style={s.sectionHeaderRow}>
                                <View style={s.sectionIconChip}><Feather name="calendar" size={19} color={colors.warning} /></View>
                                <Text style={s.sectionTitle}>When</Text>
                            </View>
                            <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Date</Text>
                            <InlineCalendar value={draft.date} minDate={today} onChange={iso => onChange({ date: iso })} />

                            <Text style={s.fieldLabel}>Time</Text>
                            <PressableOpacity style={s.dateFieldRow} onPress={() => open("time")}>
                                <Feather name="clock" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                                <Text style={s.dateFieldText}>{draft.time}</Text>
                                <Feather name={overlay === "time" ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                            </PressableOpacity>

                            {/* Optional end time (an end earlier than the start is the next day) */}
                            <EndTimeField
                                startTime={draft.time}
                                endTime={draft.endTime}
                                onChange={endTime => onChange({ endTime })}
                                open={overlay === "endTime"}
                                onOpenChange={o => (o ? open("endTime") : setOverlay(null))}
                                renderPicker={false}
                                labelStyle={s.fieldLabel}
                                fieldStyle={s.dateFieldRow}
                                textStyle={s.dateFieldText}
                            />

                            <Text style={s.fieldLabel}>Timezone</Text>
                            {timezoneEditable ? (
                                <PressableOpacity style={s.dateFieldRow} onPress={() => open("timezone")}>
                                    <Feather name="globe" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                                    <Text style={s.dateFieldText}>{timezoneLabel(draft.timezone)}</Text>
                                    <Feather name="chevron-down" size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                                </PressableOpacity>
                            ) : (
                                // The server always uses the group's timezone for an existing meetup.
                                <View style={[s.dateFieldRow, { opacity: 0.7 }]}>
                                    <Feather name="globe" size={16} color={colors.textFaint} style={{ marginRight: 8 }} />
                                    <Text style={s.dateFieldText}>{timezoneLabel(draft.timezone)}</Text>
                                </View>
                            )}
                        </View>

                        <RsvpRulesCard
                            value={draft}
                            onChange={onChange}
                            isPremium={isPremium}
                            owner={owner}
                            minError={getMinAttendeesError(draft.minAttendeesInput, draft.maxAttendeesMode, draft.maxAttendeesInput)}
                            openPicker={rsvpPicker}
                            onOpenPickerChange={p => { setOverlay(null); setRsvpPicker(p); }}
                            renderPicker={false}
                        />

                        <CapacityCard style={{ marginBottom: 8 }} mode={draft.maxAttendeesMode} input={draft.maxAttendeesInput} onChange={onChange} />

                        <PremiumFeaturesCard
                            collapsible
                            style={{ marginTop: 10, marginBottom: 8 }}
                            isPremium={isPremium}
                            owner={owner}
                            lockedNote={lockedNote}
                            bringItems={draft.bringItems}
                            ridesEnabled={draft.ridesEnabled}
                            onChange={onChange}
                            links={[{
                                key: "questions",
                                icon: "help-circle",
                                title: "RSVP Questions",
                                subtitle: questionsLink ? "Ask people a few questions when they say they're in." : "Set up after the meetup is created.",
                                onPress: questionsLink,
                            }]}
                        />
                    </ScrollView>

                    <View style={s.screenFooter}>
                        <Text style={{ flex: 1, marginRight: 12, color: colors.danger, fontSize: 12, fontWeight: "600" }} numberOfLines={2}>
                            {error ?? ""}
                        </Text>
                        <PressableOpacity
                            style={[s.primaryBtn, (error || saving) && s.primaryBtnDisabled]}
                            onPress={onSubmit}
                            disabled={!!error || saving}
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

                <LocationSearchModal
                    visible={overlay === "location"}
                    initialValue={draft.location}
                    placeholder="e.g. Starbucks or Zoom link..."
                    onDone={text => { onChange({ location: text }); setOverlay(null); }}
                    onCancel={() => setOverlay(null)}
                    asOverlay
                />
                {overlay === "time" && (
                    <NativeTimePicker value={draft.time} onChange={time => onChange({ time })} onClose={() => setOverlay(null)} asOverlay />
                )}
                {overlay === "endTime" && (
                    <NativeTimePicker value={draft.endTime || addHour(draft.time)} onChange={endTime => onChange({ endTime })} onClose={() => setOverlay(null)} asOverlay />
                )}
                {rsvpPicker && (
                    <RsvpTimePicker which={rsvpPicker} value={draft} onChange={onChange} onClose={() => setRsvpPicker(null)} asOverlay />
                )}
                {overlay === "timezone" && (
                    <OptionPickerModal
                        title="Timezone"
                        options={timezoneOptions(draft.timezone)}
                        selectedKey={draft.timezone}
                        onSelect={key => { onChange({ timezone: key }); setOverlay(null); }}
                        onClose={() => setOverlay(null)}
                    />
                )}
                {overlays}
            </SafeAreaView>
        </Modal>
    );
}
