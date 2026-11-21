import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

// ReanimatedSwipeable always draws a row's actions behind it. Anything that makes the row
// translucent (the tap dim, the fade-up) would show them through, so they stay invisible
// until the row actually starts opening.
export const SwipeRowActions = ({ progress, style, testID, children }: {
  progress: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: React.ReactNode;
}) => {
  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value > 0 ? 1 : 0 }));
  return <Animated.View testID={testID} style={[style, animatedStyle]}>{children}</Animated.View>;
};
