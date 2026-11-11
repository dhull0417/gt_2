import { StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import InfoBubble from "@/components/InfoBubble";
import { UpgradeButton } from "@/components/UpgradeButton";
import { useThemeColors } from "@/contexts/AppearanceContext";
import { PremiumPill } from "./PremiumPill";

/**
 * Premium minimum headcount, shown inside RSVP Rules under the RSVP times. The minimum is
 * checked when RSVPs close, so it only takes a value once a latest RSVP time is set.
 */
export function MinimumToMeetField({ isPremium, owner, deadlineOn, value, onChange, error }: {
    isPremium: boolean;
    /** Group owner (id or populated user); only they see the Get Premium button. */
    owner?: string | { _id: string } | null;
    /** Whether "Latest time to RSVP" is on. */
    deadlineOn: boolean;
    value: string;
    onChange: (v: string) => void;
    error: string | null;
}) {
    const colors = useThemeColors();
    return (
        <View style={[styles.wrap, { borderTopColor: colors.border }]}>
            <View style={styles.labelRow}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Minimum to Meet</Text>
                <InfoBubble
                    title="Minimum to Meet"
                    description={"If fewer than this many people (counting guests) are in when RSVPs close, the meetup is cancelled and everyone is told.\n\nLeave it blank for no minimum."}
                />
                <View style={{ marginLeft: "auto" }}><PremiumPill /></View>
            </View>

            {!isPremium ? (
                <View>
                    <Text style={[styles.help, { color: colors.textMuted }]}>
                        Cancel a meetup automatically if too few people are in by the RSVP deadline.
                    </Text>
                    <UpgradeButton owner={owner} />
                </View>
            ) : !deadlineOn ? (
                <Text style={[styles.help, { color: colors.textMuted }]}>
                    Turn on "Latest time to RSVP" to set a minimum.
                </Text>
            ) : (
                <View style={{ marginTop: 10 }}>
                    <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border }]}>
                        <Feather name="flag" size={16} color={colors.textFaint} style={{ marginRight: 8 }} />
                        <TextInput
                            style={[styles.input, { color: colors.textSecondary }]}
                            placeholder="No minimum"
                            placeholderTextColor={colors.placeholder}
                            keyboardType="number-pad"
                            maxLength={3}
                            value={value}
                            onChangeText={onChange}
                            accessibilityLabel="Minimum to meet"
                        />
                        {value !== "" && <Text style={[styles.suffix, { color: colors.textFaint }]}>people</Text>}
                    </View>
                    {error
                        ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
                        : <Text style={[styles.help, { color: colors.textMuted }]}>Too few people in when RSVPs close? The meetup is cancelled and everyone is told.</Text>}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { borderTopWidth: 1, paddingTop: 14 },
    labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    label: { fontSize: 14, fontWeight: "700" },
    help: { fontSize: 12, lineHeight: 17, marginTop: 6 },
    inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
    input: { flex: 1, fontSize: 15 },
    suffix: { fontSize: 13, fontWeight: "600", marginLeft: 8 },
    error: { fontSize: 12, fontWeight: "600", marginTop: 6, marginLeft: 2 },
});
