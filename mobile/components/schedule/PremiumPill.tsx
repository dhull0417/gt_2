import { useId, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { CrownIcon } from "@/components/ui/CrownIcon";
import { useAppearance } from "@/contexts/AppearanceContext";
import { GoldShine } from "@/components/premium/GoldShine";
import { premiumColors } from "./premiumColors";

const EDGE_WIDTH = 1.5;
const RADIUS = 999;

/** Small "PREMIUM" tag shown next to a Premium setting's label, with a gold edge the shine sweeps across. */
export function PremiumPill({ label = "Premium", icon = true }: { label?: string; icon?: boolean }) {
    const { scheme } = useAppearance();
    const pc = premiumColors(scheme === "dark");
    // Measured so the gold fills the pill exactly; SVG ids are document-wide, so each pill needs its own.
    const [size, setSize] = useState({ width: 0, height: 0 });
    const id = `premiumPill-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

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
                    <GoldShine
                        id={id}
                        width={size.width}
                        height={size.height}
                        tone="edge"
                        shape={paint => <Rect x={0} y={0} width={size.width} height={size.height} rx={size.height / 2} ry={size.height / 2} fill={paint} />}
                    />
                </Svg>
            )}
            <View style={[styles.pill, { backgroundColor: pc.chipBg }]}>
                {icon && <CrownIcon size={10} color={pc.pillText} />}
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
