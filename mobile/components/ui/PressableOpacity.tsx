import React from 'react';
import { Pressable, StyleSheet, type View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableOpacityProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** React 19 passes ref as a normal prop; forwarded to the underlying Pressable. */
  ref?: React.Ref<View>;
  /** Opacity while pressed. Same meaning and default as TouchableOpacity's `activeOpacity`. */
  activeOpacity?: number;
};

/**
 * Drop-in replacement for TouchableOpacity, built on Pressable + Reanimated.
 * - Same `activeOpacity` / `style` / `disabled` / `hitSlop` / `onPress` props.
 * - Like TouchableOpacity, it fades from the style's own opacity (so `opacity: 0.5` on a
 *   disabled button still works) down to `activeOpacity` while pressed.
 * - Defaults `accessibilityRole` to "button" and reports `disabled` to screen readers.
 */
export function PressableOpacity({
  activeOpacity = 0.2,
  style,
  disabled,
  onPressIn,
  onPressOut,
  accessibilityRole = 'button',
  accessibilityState,
  ref,
  ...rest
}: PressableOpacityProps) {
  const pressed = useSharedValue(0);
  const styleOpacity = StyleSheet.flatten(style)?.opacity;
  const base = typeof styleOpacity === 'number' ? styleOpacity : 1;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: base + pressed.value * (activeOpacity - base),
  }));

  return (
    <AnimatedPressable
      ref={ref}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: 80 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withTiming(0, { duration: 160 });
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
      {...rest}
    />
  );
}
