import { useId, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { CrownIcon } from "@/components/ui/CrownIcon";
import { useAppearance } from "@/contexts/AppearanceContext";
import { GoldShine } from "@/components/premium/GoldShine";
import { premiumGold } from "./premiumColors";

const EDGE = 2;
const RADIUS = 12;
const TAB_W = 20;
const TAB_H = 16;

/**
 * Marks a form row that uses a Premium feature the group doesn't have: a gold edge around the row
 * (with the Premium shine) and a gold crown tab on its top-right corner. Shown while the footer button
 * reads "Premium", so the user can see which settings are asking for it. With `active` off it renders the
 * row as is (same tree either way, so a switch inside doesn't remount when the highlight comes and goes).
 */
export function PremiumHighlight({ active, children }: { active: boolean; children: ReactNode }) {
    const { scheme } = useAppearance();
    const gold = premiumGold(scheme === "dark");
    // Measured so the edge fits the row exactly; SVG ids are document-wide, so each row needs its own.
    const [size, setSize] = useState({ width: 0, height: 0 });
    const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const edgeId = `premiumEdge-${id}`;
    const tabId = `premiumTab-${id}`;

    return (
        <View
            style={active ? styles.active : undefined}
            onLayout={e => {
                const { width, height } = e.nativeEvent.layout;
                setSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
            }}
        >
            {children}
            {active && size.width > 0 && (
                <Svg testID="premium-highlight" style={StyleSheet.absoluteFill} width={size.width} height={size.height} pointerEvents="none">
                    <GoldShine
                        id={edgeId}
                        width={size.width}
                        height={size.height}
                        tone="edge"
                        shape={paint => (
                            <Rect
                                x={EDGE / 2} y={EDGE / 2}
                                width={size.width - EDGE} height={size.height - EDGE}
                                rx={RADIUS} ry={RADIUS}
                                fill="none" stroke={paint} strokeWidth={EDGE}
                            />
                        )}
                    />
                </Svg>
            )}
            {active && (
                <View testID="premium-crown" pointerEvents="none" style={styles.tab}>
                    <Svg style={StyleSheet.absoluteFill} width={TAB_W} height={TAB_H}>
                        <Defs>
                            <LinearGradient id={tabId} x1="0" y1="0" x2="1" y2="1">
                                {gold.edge.map((c, i) => <Stop key={i} offset={i / (gold.edge.length - 1)} stopColor={c} />)}
                            </LinearGradient>
                        </Defs>
                        <Rect x={0} y={0} width={TAB_W} height={TAB_H} fill={`url(#${tabId})`} />
                    </Svg>
                    <CrownIcon size={11} color={gold.onGold} strokeWidth={2.4} />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    active: { margin: 2, borderRadius: RADIUS },
    tab: {
        position: "absolute", top: 0, right: 0, width: TAB_W, height: TAB_H,
        borderTopRightRadius: RADIUS, borderBottomLeftRadius: 8, overflow: "hidden",
        alignItems: "center", justifyContent: "center",
    },
});
