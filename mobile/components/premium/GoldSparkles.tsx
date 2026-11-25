import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
    Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useAppearance } from "@/contexts/AppearanceContext";
import { premiumGold } from "@/components/schedule/premiumColors";

const STAR = "M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z";
const TWINKLE_MS = 3500;

// Where each sparkle sits in the box (fractions), its size, and how far into the cycle it starts.
const SPARKLES = [
    { left: 0.09, top: 0.16, size: 12, delay: 0 },
    { left: 0.86, top: 0.12, size: 9, delay: 1100 },
    { left: 0.18, top: 0.68, size: 8, delay: 2200 },
    { left: 0.78, top: 0.6, size: 14, delay: 600 },
    { left: 0.64, top: 0.07, size: 7, delay: 1700 },
    { left: 0.9, top: 0.82, size: 8, delay: 2800 },
];

function Sparkle({ left, top, size, delay, color }: { left: number; top: number; size: number; delay: number; color: string }) {
    const reduceMotion = useReducedMotion();
    const t = useSharedValue(reduceMotion ? 0.8 : 0);
    useEffect(() => {
        if (reduceMotion) {
            t.value = 0.8;
            return;
        }
        const half = TWINKLE_MS / 2;
        t.value = withDelay(delay, withRepeat(withSequence(
            withTiming(1, { duration: half, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: half, easing: Easing.inOut(Easing.sin) }),
        ), -1));
        return () => cancelAnimation(t);
    }, [reduceMotion, delay, t]);
    const style = useAnimatedStyle(() => ({
        opacity: t.value,
        transform: [{ scale: 0.3 + t.value * 0.7 }, { rotate: `${t.value * 45}deg` }],
    }));
    return (
        <Animated.View style={[{ position: "absolute", left: `${left * 100}%`, top: `${top * 100}%`, width: size, height: size }, style]}>
            <Svg width={size} height={size} viewBox="0 0 24 24"><Path d={STAR} fill={color} /></Svg>
        </Animated.View>
    );
}

/** A few gold sparkles twinkling across their parent. Decoration only: hidden from screen readers and touches. */
export function GoldSparkles() {
    const { scheme } = useAppearance();
    const color = premiumGold(scheme === "dark").sparkle;
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {SPARKLES.map((s, i) => <Sparkle key={i} {...s} color={color} />)}
        </View>
    );
}
