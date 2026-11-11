import { useId, useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Polygon, Stop, Text as SvgText } from "react-native-svg";
import { useAppearance } from "@/contexts/AppearanceContext";
import { premiumColors, PREMIUM_RAINBOW, PREMIUM_RAINBOW_DEEP } from "./premiumColors";

const CHIP = 38;
const GAP = 14;
const ICON = 21;
const FONT_SIZE = 16;
// Feather's "star" outline, in its 24×24 box.
const STAR_POINTS = "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2";

/**
 * Icon chip + label for the Premium row on Profile, with one rainbow gradient running across the
 * star and the words. Drawn as SVG so the gradient can fill text without a native module.
 * Light mode uses deeper shades of the Premium rainbow so the words stay readable on white.
 */
export function PremiumRainbowLabel({ label }: { label: string }) {
    const { scheme } = useAppearance();
    const isDark = scheme === "dark";
    const pc = premiumColors(isDark);
    const stops = isDark ? PREMIUM_RAINBOW : PREMIUM_RAINBOW_DEEP;
    const [width, setWidth] = useState(0);
    const gradientId = `premiumLabel-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    // The star sits in its own 24×24 box (like the Feather icon), centered in the chip.
    // Its gradient is the label's gradient mapped into that box, so the colors still run on from star to words.
    const k = ICON / 24;
    const iconOffset = (CHIP - ICON) / 2;
    const starGradientId = `${gradientId}-star`;

    return (
        <View
            style={{ flex: 1, height: CHIP }}
            onLayout={e => setWidth(Math.round(e.nativeEvent.layout.width))}
            accessible
            accessibilityRole="text"
            accessibilityLabel={label}
        >
            {width > 0 && (
                <Svg width={width} height={CHIP}>
                    <Defs>
                        <LinearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={width} y2={0}>
                            {stops.map((c, i) => <Stop key={c} offset={i / (stops.length - 1)} stopColor={c} />)}
                        </LinearGradient>
                    </Defs>
                    <Circle cx={CHIP / 2} cy={CHIP / 2} r={CHIP / 2} fill={pc.chipBg} />
                    <SvgText
                        x={CHIP + GAP}
                        y={CHIP / 2 + FONT_SIZE * 0.35}
                        fontSize={FONT_SIZE}
                        fontWeight="600"
                        fill={`url(#${gradientId})`}
                    >
                        {label}
                    </SvgText>
                </Svg>
            )}
            {width > 0 && (
                <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: CHIP, height: CHIP, alignItems: "center", justifyContent: "center" }}>
                    <Svg width={ICON} height={ICON} viewBox="0 0 24 24">
                        <Defs>
                            <LinearGradient id={starGradientId} gradientUnits="userSpaceOnUse" x1={-iconOffset / k} y1={0} x2={(width - iconOffset) / k} y2={0}>
                                {stops.map((c, i) => <Stop key={c} offset={i / (stops.length - 1)} stopColor={c} />)}
                            </LinearGradient>
                        </Defs>
                        <Polygon
                            points={STAR_POINTS}
                            fill="none"
                            stroke={`url(#${starGradientId})`}
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                    </Svg>
                </View>
            )}
        </View>
    );
}
