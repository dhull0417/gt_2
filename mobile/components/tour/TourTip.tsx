import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { RenderProps } from 'react-native-spotlight-tour';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';

type Props = RenderProps & { title: string; body: string; total: number };

// The bubble next to the highlighted item in a first-visit tour. Skip and Done both end the tour,
// and either one counts as seen.
export function TourTip({ title, body, current, total, isLast, next, stop }: Props) {
  const colors = useThemeColors();
  return (
    <View style={[styles.box, { backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
      <View style={styles.row}>
        <Text style={[styles.count, { color: colors.textMuted }]}>{`${current + 1} of ${total}`}</Text>
        <View style={styles.buttons}>
          {!isLast && (
            <PressableOpacity onPress={stop} hitSlop={8} style={styles.skip} accessibilityRole="button">
              <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
            </PressableOpacity>
          )}
          <PressableOpacity onPress={isLast ? stop : next} style={[styles.next, { backgroundColor: colors.brand }]} accessibilityRole="button">
            <Text style={styles.nextText}>{isLast ? 'Done' : 'Next'}</Text>
          </PressableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 280, borderRadius: 16, padding: 16 },
  title: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  count: { fontSize: 12, fontWeight: '600' },
  buttons: { flexDirection: 'row', alignItems: 'center' },
  skip: { paddingHorizontal: 10, paddingVertical: 8, marginRight: 6 },
  skipText: { fontSize: 14, fontWeight: '700' },
  next: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  nextText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
