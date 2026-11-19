import { useMemo } from "react";
import { Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { makeStyles } from "@/components/create-group/styles";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { useThemeColors } from "@/contexts/AppearanceContext";
import { getMaxAttendeesError } from "@/utils/scheduleConstants";

const TEAL = "#0D9488";

/** The Capacity card (max attendees), shared by the schedule screens and the meetup form. */
export function CapacityCard({ mode, input, onChange, chipStyle, iconSize = 19, style }: {
    mode: "unlimited" | "limited";
    input: string;
    onChange: (patch: { maxAttendeesMode?: "unlimited" | "limited"; maxAttendeesInput?: string }) => void;
    chipStyle?: StyleProp<ViewStyle>;
    iconSize?: number;
    style?: StyleProp<ViewStyle>;
}) {
    const colors = useThemeColors();
    const s = useMemo(() => makeStyles(colors), [colors]);
    const error = getMaxAttendeesError(mode, input);
    return (
        <View style={[s.sectionCard, { borderLeftWidth: 3, borderLeftColor: TEAL }, style]}>
            <View style={s.sectionHeaderRow}>
                <View style={[s.sectionIconChip, chipStyle]}>
                    <Feather name="users" size={iconSize} color={TEAL} />
                </View>
                <Text style={s.sectionTitle}>Capacity</Text>
            </View>

            <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Max Attendees</Text>
            <View style={s.boolRow}>
                <PressableOpacity style={[s.boolBtn, mode === "unlimited" && s.boolBtnActive]}
                    onPress={() => onChange({ maxAttendeesMode: "unlimited", maxAttendeesInput: "" })}>
                    <Text style={[s.boolBtnText, mode === "unlimited" && s.boolBtnTextActive]}>Unlimited</Text>
                </PressableOpacity>
                <PressableOpacity style={[s.boolBtn, mode === "limited" && s.boolBtnActive]}
                    onPress={() => onChange({ maxAttendeesMode: "limited" })}>
                    <Text style={[s.boolBtnText, mode === "limited" && s.boolBtnTextActive]}>Limited</Text>
                </PressableOpacity>
            </View>
            {mode === "limited" && (
                <View style={{ marginTop: 10 }}>
                    <View style={[s.inputRow, { marginBottom: 0 }, error && s.inputRowError]}>
                        <Feather name="users" size={16} color={colors.textFaint} style={{ marginRight: 8 }} />
                        <TextInput
                            style={s.inlineInput}
                            placeholder="How many?"
                            placeholderTextColor={colors.placeholder}
                            keyboardType="number-pad"
                            value={input}
                            onChangeText={v => onChange({ maxAttendeesInput: v })}
                            accessibilityLabel="Max attendees"
                        />
                    </View>
                    {error && <Text style={s.errorText}>{error}</Text>}
                </View>
            )}
        </View>
    );
}
