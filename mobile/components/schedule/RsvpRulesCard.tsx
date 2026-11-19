import { useMemo } from "react";
import { Alert, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import InfoBubble from "@/components/InfoBubble";
import NativeTimePicker from "@/components/NativeTimePicker";
import { makeStyles } from "@/components/create-group/styles";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { useThemeColors } from "@/contexts/AppearanceContext";
import { setDeadlineTime, setLeadTime, stepDeadline, stepLead, toggleDeadline, toggleLead, type RsvpRulesPatch, type RsvpRulesValue } from "@/utils/rsvpRules";
import { MinimumToMeetField } from "./MinimumToMeetField";

const PURPLE = "#7C3AED";
export type RsvpPicker = "lead" | "deadline" | null;

/** Time picker for the Earliest/Latest RSVP time; caps it so Earliest stays before Latest. */
export function RsvpTimePicker({ which, value, onChange, onClose, asOverlay }: {
    which: "lead" | "deadline";
    value: RsvpRulesValue;
    onChange: (patch: RsvpRulesPatch) => void;
    onClose: () => void;
    asOverlay?: boolean;
}) {
    return (
        <NativeTimePicker
            value={which === "lead" ? value.leadTime : value.deadlineTime}
            onChange={t => {
                const r = which === "lead" ? setLeadTime(value, t) : setDeadlineTime(value, t);
                if (r.alert) Alert.alert(r.alert.title, r.alert.message);
                onChange(r.patch);
            }}
            onClose={onClose}
            asOverlay={asOverlay}
        />
    );
}

/**
 * The RSVP Rules card: when people can RSVP (days before at a time) and the Premium minimum to meet.
 * Shared by the schedule screens and the meetup form. With renderPicker={false} the host draws the
 * time picker itself (as an overlay inside a Modal) from `openPicker`, using RsvpTimePicker.
 */
export function RsvpRulesCard({
    value: d, onChange, isPremium, owner, minError, openPicker, onOpenPickerChange,
    renderPicker = true, chipStyle, iconSize = 19, style,
}: {
    value: RsvpRulesValue;
    onChange: (patch: RsvpRulesPatch) => void;
    isPremium: boolean;
    owner?: string | { _id: string } | null;
    minError: string | null;
    openPicker: RsvpPicker;
    onOpenPickerChange: (picker: RsvpPicker) => void;
    renderPicker?: boolean;
    chipStyle?: StyleProp<ViewStyle>;
    iconSize?: number;
    style?: StyleProp<ViewStyle>;
}) {
    const colors = useThemeColors();
    const s = useMemo(() => makeStyles(colors), [colors]);

    const side = (which: "lead" | "deadline") => {
        const isLead = which === "lead";
        const enabled = isLead ? d.leadEnabled : d.deadlineEnabled;
        const daysValue = isLead ? d.leadDays : d.deadlineDays;
        const time = isLead ? d.leadTime : d.deadlineTime;
        const step = (by: 1 | -1) => onChange(isLead ? stepLead(d, by) : stepDeadline(d, by));
        const title = isLead ? "Earliest time to RSVP" : "Latest time to RSVP";
        return (
            <View>
                <View style={s.toggleRow}>
                    <View style={s.toggleRowLabelWrap}>
                        <Text style={s.toggleRowLabel}>{title}</Text>
                        <InfoBubble
                            title={title}
                            description={isLead
                                ? "This sets the earliest time and day people can respond.\n\nIt's a number of days before the meetup, at a specific time.\n\nTurn it off to allow RSVPs as soon as the meetup is created."
                                : "This sets the cutoff for responding.\n\nIt's a number of days before the meetup, at a specific time.\n\nTurn it off to allow RSVPs right up until the meetup starts."}
                        />
                    </View>
                    <ToggleSwitch activeColor={PURPLE} value={enabled} accessibilityLabel={title}
                        onValueChange={v => onChange(isLead ? toggleLead(d, v) : toggleDeadline(d, v))} />
                </View>
                {enabled && (
                    <View style={{ marginTop: 10 }}>
                        <View style={s.leadRow}>
                            <PressableOpacity style={s.stepperBtn} onPress={() => step(-1)} accessibilityLabel={`${title}: one day fewer`}>
                                <Feather name="minus" size={18} color={colors.brand} />
                            </PressableOpacity>
                            <View style={s.leadCenter}>
                                <Text style={s.leadVal}>{daysValue}</Text>
                                <Text style={s.leadSub}>days before</Text>
                            </View>
                            <PressableOpacity style={s.stepperBtn} onPress={() => step(1)} accessibilityLabel={`${title}: one day more`}>
                                <Feather name="plus" size={18} color={colors.brand} />
                            </PressableOpacity>
                        </View>
                        <Text style={s.fieldLabel}>Time</Text>
                        <PressableOpacity style={s.dateFieldRow} onPress={() => onOpenPickerChange(openPicker === which ? null : which)}>
                            <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                            <Text style={s.dateFieldText}>{time}</Text>
                            <Feather name={openPicker === which ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                        </PressableOpacity>
                    </View>
                )}
                {renderPicker && enabled && openPicker === which && (
                    <RsvpTimePicker which={which} value={d} onChange={onChange} onClose={() => onOpenPickerChange(null)} />
                )}
            </View>
        );
    };

    return (
        <View style={[s.sectionCard, { borderLeftWidth: 3, borderLeftColor: PURPLE }, style]}>
            <View style={s.sectionHeaderRow}>
                <View style={[s.sectionIconChip, chipStyle]}>
                    <Feather name="bell" size={iconSize} color={PURPLE} />
                </View>
                <Text style={s.sectionTitle}>RSVP Rules</Text>
            </View>

            <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Limit when people can RSVP?</Text>
            <View style={s.boolRow}>
                <PressableOpacity style={[s.boolBtn, !d.rsvpRestricted && s.boolBtnActive]} onPress={() => onChange({ rsvpRestricted: false })}>
                    <Text style={[s.boolBtnText, !d.rsvpRestricted && s.boolBtnTextActive]}>Allow anytime</Text>
                </PressableOpacity>
                <PressableOpacity style={[s.boolBtn, d.rsvpRestricted && s.boolBtnActive]} onPress={() => onChange({ rsvpRestricted: true })}>
                    <Text style={[s.boolBtnText, d.rsvpRestricted && s.boolBtnTextActive]}>Limit RSVPs</Text>
                </PressableOpacity>
            </View>

            {d.rsvpRestricted && (
                <View style={{ marginTop: 14, gap: 14 }}>
                    {side("lead")}
                    {side("deadline")}
                    <MinimumToMeetField
                        isPremium={isPremium}
                        owner={owner}
                        deadlineOn={d.deadlineEnabled}
                        value={d.minAttendeesInput}
                        onChange={v => onChange({ minAttendeesInput: v })}
                        error={minError}
                    />
                </View>
            )}
        </View>
    );
}
