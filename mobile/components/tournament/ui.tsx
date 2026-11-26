import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Modal, Pressable, ScrollView, useWindowDimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, useDerivedValue, withTiming, interpolateColor, Easing,
  FadeIn, FadeOut, LinearTransition, SharedValue,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';

const EASE = { duration: 260, easing: Easing.out(Easing.cubic) };
const SEG_PAD = 3;
const SEG_GAP = 3;
const SMALL = 13 / 16; // unselected text scale (16pt → 13pt)

function SegLabel({ label, index, pos, active, inactive }: { label: string; index: number; pos: SharedValue<number>; active: string; inactive: string }) {
  const style = useAnimatedStyle(() => {
    const p = Math.max(0, 1 - Math.abs(pos.value - index));
    return {
      color: interpolateColor(p, [0, 1], [inactive, active]),
      transform: [{ scale: SMALL + (1 - SMALL) * p }],
    };
  });
  return <Animated.Text numberOfLines={1} style={[{ fontSize: 16, fontWeight: '700' }, style]}>{label}</Animated.Text>;
}

/** Segmented control whose highlight slides between options; text eases between sizes and colors. */
export function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fg = colors.brand;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const pos = useSharedValue(index);
  const [width, setWidth] = useState(0);
  const n = options.length;
  const itemW = width > 0 ? (width - SEG_PAD * 2 - SEG_GAP * (n - 1)) / n : 0;

  useEffect(() => { pos.value = withTiming(index, EASE); }, [index, pos]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value * (itemW + SEG_GAP) }] }), [itemW]);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={styles.seg}>
      {itemW > 0 && (
        <Animated.View pointerEvents="none" style={[{
          position: 'absolute', left: SEG_PAD, top: SEG_PAD, bottom: SEG_PAD, width: itemW, borderRadius: 10, backgroundColor: fg,
          shadowColor: fg, shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
        }, pill]} />
      )}
      {options.map((o, i) => (
        <PressableOpacity key={String(o.value)} onPress={() => onChange(o.value)} style={styles.segItem} activeOpacity={0.8}
          accessibilityRole="radio" accessibilityState={{ selected: i === index }}>
          <SegLabel label={o.label} index={i} pos={pos} active="#FFFFFF" inactive={colors.textMuted} />
        </PressableOpacity>
      ))}
    </View>
  );
}

/** Fades in/out and lets what follows glide into place when a section appears or disappears. */
export const Reveal = ({ children, style }: { children: React.ReactNode; style?: object }) => (
  <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} layout={LinearTransition.duration(240)} style={style}>
    {children}
  </Animated.View>
);
/** Glides into its new position when content above it changes size. */
export const Glide = ({ children, style }: { children: React.ReactNode; style?: object }) => (
  <Animated.View layout={LinearTransition.duration(240)} style={style}>{children}</Animated.View>
);

export { OptionRow } from '@/components/ui/form';

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stepper}>
      <PressableOpacity accessibilityLabel={`Fewer ${label}`} disabled={value <= min} onPress={() => onChange(value - 1)} style={[styles.stepBtn, value <= min && { opacity: 0.4 }]}>
        <Feather name="minus" size={18} color={colors.textPrimary} />
      </PressableOpacity>
      <Text style={styles.stepValue}>{value}</Text>
      <PressableOpacity accessibilityLabel={`More ${label}`} disabled={value >= max} onPress={() => onChange(value + 1)} style={[styles.stepBtn, value >= max && { opacity: 0.4 }]}>
        <Feather name="plus" size={18} color={colors.textPrimary} />
      </PressableOpacity>
    </View>
  );
}

export { GroupCard, SummaryRow, SettingSheet } from '@/components/ui/form';

export const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  action: { fontSize: 16, fontWeight: '800', color: colors.brand },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 6 },
  body: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  errorText: { fontSize: 13, fontWeight: '600', color: colors.danger, marginTop: 8 },
  seg: { flexDirection: 'row', backgroundColor: colors.backgroundAlt, borderRadius: 12, padding: 3, gap: 3, position: 'relative' },
  segItem: { flex: 1, minHeight: 40, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  segTextOn: { fontSize: 16, color: '#FFFFFF', fontWeight: '800' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  optionLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  optionSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  stepValue: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, minWidth: 28, textAlign: 'center' },
  primaryBtn: { backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  secondaryBtn: { borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginTop: 10 },
  secondaryText: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextOn: { color: colors.brand, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  teamDot: { width: 10, height: 10, borderRadius: 5 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, paddingVertical: 10 },
  summaryValue: { flex: 1, textAlign: 'right', fontSize: 15, color: colors.textMuted },
});

export const TEAM_COLORS = ['#4FD1C5', '#F59E0B', '#6366F1', '#EF4444', '#10B981', '#EC4899', '#3B82F6', '#8B5CF6'];
