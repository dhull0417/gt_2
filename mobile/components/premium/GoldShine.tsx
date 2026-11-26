import { useEffect, type ReactElement } from "react";
import Animated, {
    Easing, cancelAnimation, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from "react-native-reanimated";
import { Defs, G, LinearGradient, Mask, Rect, Stop } from "react-native-svg";
import { useAppearance } from "@/contexts/AppearanceContext";
import { premiumGold } from "@/components/schedule/premiumColors";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** One sweep of the shine, then a rest before the next. */
export const SHINE_SWEEP_MS = 2100;
export const SHINE_REST_MS = 1400;

/**
 * 0 → 1 once per sweep, then holds at 1 through the rest, forever. Stays at 1 (shine off-screen) when the
 * phone asks for reduced motion, so Premium is plain gold there.
 */
export function useShineProgress() {
    const reduceMotion = useReducedMotion();
    const progress = useSharedValue(reduceMotion ? 1 : 0);
    useEffect(() => {
        if (reduceMotion) {
            progress.value = 1;
            return;
        }
        progress.value = withRepeat(
            withSequence(
                withTiming(0, { duration: 0 }),
                withTiming(1, { duration: SHINE_SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
                withDelay(SHINE_REST_MS, withTiming(1, { duration: 0 })),
            ),
            -1,
        );
        return () => cancelAnimation(progress);
    }, [reduceMotion, progress]);
    return progress;
}

/**
 * Goes inside an <Svg>. Paints `shape` in the Premium gold, then sweeps a band of light across it,
 * masked to the shape so only the gold catches the light. `shape(paint)` is called twice (once to paint,
 * once in white for the mask), so it must draw the same thing both times. `width`/`height` are in the
 * Svg's own units (24 for a 24×24 viewBox). `id` must be unique on the screen: SVG ids are document-wide.
 */
export function GoldShine({ id, width, height, tone, shape }: {
    id: string;
    width: number;
    height: number;
    tone: "text" | "edge";
    shape: (paint: string) => ReactElement;
}) {
    const { scheme } = useAppearance();
    const gold = premiumGold(scheme === "dark");
    const stops = tone === "text" ? gold.text : gold.edge;
    const shine = tone === "text" ? gold.textShine : gold.edgeShine;
    const band = Math.max(width * 0.45, height * 1.2);
    const progress = useShineProgress();
    const animatedProps = useAnimatedProps(() => ({ x: -band + progress.value * (width + band) }));

    return (
        <>
            <Defs>
                <LinearGradient id={`${id}-base`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={width} y2={height}>
                    {stops.map((c, i) => <Stop key={i} offset={i / (stops.length - 1)} stopColor={c} />)}
                </LinearGradient>
                <LinearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="0.35">
                    <Stop offset="0" stopColor={shine} stopOpacity={0} />
                    <Stop offset="0.5" stopColor={shine} stopOpacity={0.95} />
                    <Stop offset="1" stopColor={shine} stopOpacity={0} />
                </LinearGradient>
                <Mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
                    {shape("#fff")}
                </Mask>
            </Defs>
            {shape(`url(#${id}-base)`)}
            <G mask={`url(#${id}-mask)`}>
                <AnimatedRect y={0} width={band} height={height} fill={`url(#${id}-shine)`} animatedProps={animatedProps} />
            </G>
        </>
    );
}
