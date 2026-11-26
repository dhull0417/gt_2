import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { Keyframe, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import type { RenderProps } from 'react-native-spotlight-tour';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import type { SquircleTint } from '@/components/ui/SquircleTile';
import { useThemeColors } from '@/contexts/AppearanceContext';

type Props = RenderProps & {
  title: string;
  body: string;
  total: number;
  icon: keyof typeof Feather.glyphMap;
  /** The highlighted tile's colours, so the bubble matches it. */
  tint: SquircleTint;
};

// A small settle-in: a slight rise and a 3% grow. The tour library fades the bubble in at the same time.
const settleIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 6 }, { scale: 0.97 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(180);

// The bubble next to the highlighted item in a first-visit tour. Skip and Done both end the tour, and either one counts as seen.
export function TourTip({ title, body, current, total, isLast, next, stop, icon, tint }: Props) {
  const colors = useThemeColors();
  const advance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    (isLast ? stop : next)();
  };
  return (
    <Animated.View
      entering={settleIn}
      style={[styles.box, { backgroundColor: colors.surface, borderColor: tint.fg }]}
    >
      <View style={styles.header}>
        <View style={[styles.chip, { backgroundColor: tint.bg, borderColor: tint.border }]}>
          <Feather name={icon} size={18} color={tint.fg} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
      </View>
      <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
      <View style={styles.row}>
        <View style={styles.dots} accessible accessibilityLabel={`Step ${current + 1} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <View
              key={i}
              testID={`tour-dot-${i}`}
              style={[
                styles.dot,
                i === current
                  ? { width: 18, backgroundColor: tint.fg }
                  : { backgroundColor: i < current ? tint.border : colors.border },
              ]}
            />
          ))}
        </View>
        <View style={styles.buttons}>
          {!isLast && (
            <PressableOpacity onPress={stop} hitSlop={8} style={styles.skip} accessibilityRole="button">
              <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
            </PressableOpacity>
          )}
          <PressableOpacity onPress={advance} style={[styles.next, { backgroundColor: colors.brand }]} accessibilityRole="button">
            <Text style={styles.nextText}>{isLast ? 'Done' : 'Next'}</Text>
            <Feather name={isLast ? 'check' : 'arrow-right'} size={15} color="#fff" style={{ marginLeft: 4 }} />
          </PressableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 290, borderRadius: 20, borderCurve: 'continuous', borderWidth: 2, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  chip: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  title: { flex: 1, fontSize: 17, fontWeight: '900' },
  body: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  dots: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  buttons: { flexDirection: 'row', alignItems: 'center' },
  skip: { paddingHorizontal: 10, paddingVertical: 8, marginRight: 4 },
  skipText: { fontSize: 14, fontWeight: '700' },
  next: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12 },
  nextText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
