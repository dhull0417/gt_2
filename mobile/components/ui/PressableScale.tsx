import React from 'react';
import { Pressable, type View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** React 19 passes ref as a normal prop; forwarded to the underlying Pressable. */
  ref?: React.Ref<View>;
  /** Scale while pressed (1 = no change). */
  scaleTo?: number;
};

/** Pressable that springs down slightly while pressed. Defaults `accessibilityRole` to "button". */
export function PressableScale({
  scaleTo = 0.97,
  style,
  disabled,
  onPressIn,
  onPressOut,
  accessibilityRole = 'button',
  accessibilityState,
  ref,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      ref={ref}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
      disabled={disabled}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, { damping: 20, stiffness: 400 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 20, stiffness: 400 });
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
      {...rest}
    />
  );
}
