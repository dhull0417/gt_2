import { useId, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { useAppearance } from "@/contexts/AppearanceContext";
import { premiumColors, PREMIUM_RAINBOW } from "./premiumColors";

const EDGE_WIDTH = 1.5;
const RADIUS = 999;

/** Small "PREMIUM" tag shown next to a Premium setting's label, with the same rainbow edge as the Premium card. */
export function PremiumPill({ label = "Premium", icon = true }: { label?: string; icon?: boolean }) {
    const { scheme } = useAppearance();
    const isDark = scheme === "dark";
    const pc = premiumColors(isDark);
    // Measured so the gradient fills the pill exactly; SVG gradient ids are document-wide, so each pill needs its own.
    const [size, setSize] = useState({ width: 0, height: 0 });
    const gradientId = `premiumPill-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

    return (
        <View
            style={styles.edge}
            onLayout={e => {
                const { width, height } = e.nativeEvent.layout;
                setSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
            }}
        >
            {size.width > 0 && (
                <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height} pointerEvents="none">
                    <Defs>
                        <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                            {PREMIUM_RAINBOW.map((c, i) => (
                                <Stop key={c} offset={i / (PREMIUM_RAINBOW.length - 1)} stopColor={c} stopOpacity={isDark ? 0.85 : 1} />
                            ))}
                        </LinearGradient>
                    </Defs>
                    <Rect x={0} y={0} width={size.width} height={size.height} rx={size.height / 2} ry={size.height / 2} fill={`url(#${gradientId})`} />
                </Svg>
            )}
            <View style={[styles.pill, { backgroundColor: pc.chipBg }]}>
                {icon && <Feather name="star" size={10} color={pc.pillText} />}
                <Text style={[styles.text, { color: pc.pillText }]}>{label}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    edge: { borderRadius: RADIUS, padding: EDGE_WIDTH, overflow: "hidden" },
    pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: RADIUS },
    text: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
});
