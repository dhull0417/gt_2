// Smoothly grows or shrinks its content's height (and fades it) when `open` changes; content
// below glides with it. Children stay mounted while open, so their state is kept.
//
// How: the content always lays out at its natural height; the wrapper's maxHeight is animated
// between 0 and that height. Once fully open the limit is effectively removed, so later growth
// (adding a day, opening a calendar) is never cut off and the scroll area always knows the real
// size. The animated style stays attached the whole time on purpose: removing an animated style
// leaves its last value stuck on the native view, which made sheets snap back when scrolled.
import React, { useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const TIMING = { duration: 320, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };
const NO_LIMIT = 100000;

export function Collapsible({ open, appear, children, testID }: {
  open: boolean;
  /** Animate in when first shown (e.g. details that appear after a choice). */
  appear?: boolean;
  children: React.ReactNode;
  testID?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [height, setHeight] = useState(0);
  const p = useSharedValue(open && !appear ? 1 : 0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!(open && appear)) return;
    }
    if (open) setMounted(true);
    p.value = withTiming(open ? 1 : 0, TIMING, finished => {
      if (finished && !open) runOnJS(setMounted)(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const style = useAnimatedStyle(() => ({
    maxHeight: p.value >= 1 ? NO_LIMIT : height * p.value,
    opacity: p.value,
  }), [height]);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (Math.abs(h - height) > 0.5) setHeight(h);
  };
  if (!mounted) return null;
  return (
    <Animated.View testID={testID} style={[{ overflow: 'hidden' }, style]}>
      <View onLayout={onLayout}>{children}</View>
    </Animated.View>
  );
}
