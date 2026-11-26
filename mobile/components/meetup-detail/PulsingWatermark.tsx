import { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

// Watermark that slowly breathes between a base and darker opacity, one full cycle every 5 seconds.
export const PulsingWatermark = ({ label, style, baseOpacity, peakOpacity }: {
    label: string;
    style: any;
    baseOpacity: number;
    peakOpacity: number;
}) => {
    const opacity = useSharedValue(baseOpacity);

    useEffect(() => {
        opacity.value = withRepeat(
            withTiming(peakOpacity, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

    return (
        <Animated.Text style={[style, animatedStyle]} pointerEvents="none">
            {label}
        </Animated.Text>
    );
};
