import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, cancelAnimation, Easing,
} from 'react-native-reanimated';

// A pulsing outline drawn on the item a tour is highlighting. It sits on the screen itself, under
// the tour's dark overlay, so it shows through the cut-out around the item.
export function TourGlow({ active, color, borderRadius }: { active: boolean; color: string; borderRadius: number }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (active) {
      pulse.value = 0;
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 750, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 750, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
    }
    return () => cancelAnimation(pulse);
  }, [active, pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: active ? 0.55 + pulse.value * 0.45 : 0,
    transform: [{ scale: 1 + pulse.value * 0.025 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      testID={active ? 'tour-glow-active' : undefined}
      style={[StyleSheet.absoluteFill, { borderRadius, borderCurve: 'continuous', borderWidth: 3, borderColor: color }, style]}
    />
  );
}
