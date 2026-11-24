import { StyleSheet, Text } from "react-native";
import { useThemeColors } from "@/contexts/AppearanceContext";

/** Shown under the Premium section label while the group doesn't have Premium. */
export function PremiumPreviewNote() {
    const colors = useThemeColors();
    return <Text style={[styles.note, { color: colors.textMuted }]}>Set these up now. Premium is needed to save them.</Text>;
}

const styles = StyleSheet.create({
    note: { fontSize: 13, lineHeight: 18, marginBottom: 8, marginTop: -2, paddingHorizontal: 4 },
});
