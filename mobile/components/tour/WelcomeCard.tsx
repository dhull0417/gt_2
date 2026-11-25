import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { Keyframe, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import type { RenderProps } from 'react-native-spotlight-tour';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useAppearance, useThemeColors } from '@/contexts/AppearanceContext';

const settleIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 6 }, { scale: 0.97 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(180);

type Props = RenderProps & { body: string; cta: string };

// The first step of the first-run tour: a centred welcome before anything is highlighted. The CTA
// moves to the first highlight; Skip ends the tour (it still counts as seen).
export function WelcomeCard({ body, cta, next, stop }: Props) {
  const colors = useThemeColors();
  const { scheme } = useAppearance();
  return (
    <Animated.View entering={settleIn} style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.brand }]}>
      <Text style={styles.title} accessibilityRole="header" accessibilityLabel="Welcome to GroupThat!">
        <Text style={{ color: colors.textPrimary }}>Welcome to </Text>
        <Text style={{ color: scheme === 'dark' ? '#94A3B8' : '#64748B' }}>Group</Text>
        <Text style={{ color: colors.brand }}>That</Text>
        <Text style={{ color: colors.textPrimary }}>!</Text>
      </Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
      <PressableOpacity
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); next(); }}
        style={[styles.cta, { backgroundColor: colors.brand }]}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>{cta}</Text>
        <Feather name="arrow-right" size={16} color="#fff" style={{ marginLeft: 6 }} />
      </PressableOpacity>
      <PressableOpacity onPress={stop} hitSlop={8} style={styles.skip} accessibilityRole="button">
        <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
      </PressableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 310, borderRadius: 24, borderCurve: 'continuous', borderWidth: 2, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 14,
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  title: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 22, textAlign: 'center', marginTop: 10 },
  cta: { flexDirection: 'row', alignItems: 'center', marginTop: 20, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  skip: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 8 },
  skipText: { fontSize: 14, fontWeight: '700' },
});
