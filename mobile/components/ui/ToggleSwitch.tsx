import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Reanimated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { PressableOpacity } from './PressableOpacity';

export type ToggleSwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Track color when on. Defaults to the theme's brand color. */
  activeColor?: string;
  accessibilityLabel?: string;
};

/**
 * The app's animated on/off switch: the track color fades and the thumb slides with a small
 * bounce. Reports itself to screen readers as a switch.
 */
export function ToggleSwitch({ value, onValueChange, activeColor, accessibilityLabel }: ToggleSwitchProps) {
  const colors = useThemeColors();
  const onColor = activeColor ?? colors.brand;
  const offColor = colors.border;

  const progress = useSharedValue(value ? 1 : 0);
  const scale = useSharedValue(1);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 180 });
    scale.value = withSequence(withTiming(1.3, { duration: 90 }), withSpring(1, { damping: 6, stiffness: 220 }));
  }, [value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [offColor, onColor]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    left: 2 + progress.value * 18,
    transform: [{ scale: scale.value }],
  }));

  return (
    <PressableOpacity
      activeOpacity={0.8}
      onPress={() => onValueChange(!value)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
    >
      <Reanimated.View style={[styles.track, trackStyle]}>
        <Reanimated.View style={[styles.thumb, thumbStyle]} />
      </Reanimated.View>
    </PressableOpacity>
  );
}

const styles = StyleSheet.create({
  track: { width: 44, height: 26, borderRadius: 13, padding: 2, justifyContent: 'center' },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
});
