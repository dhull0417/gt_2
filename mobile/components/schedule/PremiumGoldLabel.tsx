import { useId, useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import { useAppearance } from "@/contexts/AppearanceContext";
import { CROWN_PATH } from "@/components/ui/CrownIcon";
import { GoldShine } from "@/components/premium/GoldShine";
import { premiumColors } from "./premiumColors";

const CHIP = 38;
const GAP = 14;
const ICON = 21;
const FONT_SIZE = 16;

/**
 * Icon chip + label for the Premium row on Profile: the crown and the words in Premium gold, with the
 * shine sweeping across them. Drawn as SVG so the gradient can fill text without a native module.
 */
export function PremiumGoldLabel({ label }: { label: string }) {
    const { scheme } = useAppearance();
    const pc = premiumColors(scheme === "dark");
    const [width, setWidth] = useState(0);
    const id = `premiumLabel-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

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
                    <Circle cx={CHIP / 2} cy={CHIP / 2} r={CHIP / 2} fill={pc.chipBg} />
                    <GoldShine
                        id={`${id}-text`}
                        width={width}
                        height={CHIP}
                        tone="text"
                        shape={paint => (
                            <SvgText x={CHIP + GAP} y={CHIP / 2 + FONT_SIZE * 0.35} fontSize={FONT_SIZE} fontWeight="600" fill={paint}>
                                {label}
                            </SvgText>
                        )}
                    />
                </Svg>
            )}
            {width > 0 && (
                <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: CHIP, height: CHIP, alignItems: "center", justifyContent: "center" }}>
                    <Svg width={ICON} height={ICON} viewBox="0 0 24 24">
                        <GoldShine
                            id={`${id}-crown`}
                            width={24}
                            height={24}
                            tone="text"
                            shape={paint => <Path d={CROWN_PATH} fill="none" stroke={paint} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
                        />
                    </Svg>
                </View>
            )}
        </View>
    );
}
