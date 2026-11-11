import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useDerivedValue, withTiming, interpolateColor, Easing,
  FadeIn, FadeOut, LinearTransition, SharedValue,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors, useAppearance } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';

export interface Accent { fg: string; bg: string; border: string }

/** Section colors, in the same pastel-chip style as Group Settings (with dark variants). */
export function useAccents() {
  const { scheme } = useAppearance();
  const dark = scheme === 'dark';
  const a = (fg: string, light: string, darkBg: string, lightBorder: string, darkBorder: string): Accent =>
    ({ fg, bg: dark ? darkBg : light, border: dark ? darkBorder : lightBorder });
  return {
    indigo: a('#6366F1', '#EEF2FF', '#1E2340', '#C7D2FE', '#2E3566'),
    cyan: a('#0891B2', '#ECFEFF', '#123338', '#A5F3FC', '#1C4A52'),
    purple: a('#8B5CF6', '#F5F3FF', '#241B3D', '#DDD6FE', '#372A5C'),
    orange: a('#F97316', '#FFF7ED', '#3A2712', '#FED7AA', '#57391A'),
    green: a('#10B981', '#ECFDF5', '#12301F', '#A7F3D0', '#1C4A30'),
    pink: a('#EC4899', '#FDF2F8', '#3A1B2E', '#FBCFE8', '#572845'),
    blue: a('#3B82F6', '#EFF6FF', '#1A2A42', '#BFDBFE', '#283F63'),
  };
}

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
export function Segmented<T extends string | number>({ value, options, onChange, accent }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; accent?: Accent;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fg = accent?.fg ?? colors.brand;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const pos = useSharedValue(index);
  const [width, setWidth] = useState(0);
  const n = options.length;
  const itemW = width > 0 ? (width - SEG_PAD * 2 - SEG_GAP * (n - 1)) / n : 0;

  useEffect(() => { pos.value = withTiming(index, EASE); }, [index, pos]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value * (itemW + SEG_GAP) }] }), [itemW]);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.seg, accent && { backgroundColor: accent.bg, borderWidth: 1, borderColor: accent.border }]}>
      {itemW > 0 && (
        <Animated.View pointerEvents="none" style={[{
          position: 'absolute', left: SEG_PAD, top: SEG_PAD, bottom: SEG_PAD, width: itemW, borderRadius: 10, backgroundColor: fg,
          shadowColor: fg, shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
        }, pill]} />
      )}
      {options.map((o, i) => (
        <PressableOpacity key={String(o.value)} onPress={() => onChange(o.value)} style={styles.segItem} activeOpacity={0.8}
          accessibilityRole="radio" accessibilityState={{ selected: i === index }}>
          <SegLabel label={o.label} index={i} pos={pos} active="#FFFFFF" inactive={accent ? fg : colors.textMuted} />
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

/** A colored icon chip plus an uppercase label, like the section headers elsewhere in the app. */
export function SectionHeader({ icon, label, accent }: { icon: string; label: string; accent: Accent }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 8 }}>
      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: accent.bg, borderWidth: 1, borderColor: accent.border, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon as any} size={14} color={accent.fg} />
      </View>
      <Text style={{ fontSize: 12, fontWeight: '800', color: accent.fg, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Text>
    </View>
  );
}

function Tile({ on, label, sub, icon, disabled, onPress, accent }: {
  on: boolean; label: string; sub: string; icon: string; disabled?: boolean; onPress: () => void; accent: Accent;
}) {
  const colors = useThemeColors();
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => { p.value = withTiming(on ? 1 : 0, EASE); }, [on, p]);
  const box = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [colors.surface, accent.bg]),
    borderColor: interpolateColor(p.value, [0, 1], [colors.border, accent.fg]),
    transform: [{ scale: 0.98 + 0.02 * p.value }],
  }));
  const chip = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(p.value, [0, 1], [accent.bg, accent.fg]) }));
  const iconOn = useAnimatedStyle(() => ({ opacity: p.value }));
  const iconOff = useAnimatedStyle(() => ({ opacity: 1 - p.value }));
  const check = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: 0.6 + 0.4 * p.value }] }));
  const title = useAnimatedStyle(() => ({ color: interpolateColor(p.value, [0, 1], [colors.textPrimary, accent.fg]) }));
  return (
    <PressableOpacity disabled={disabled} onPress={onPress} activeOpacity={0.85}
      accessibilityRole="radio" accessibilityState={{ selected: on, disabled }}
      style={{ width: '48%', flexGrow: 1, opacity: disabled ? 0.45 : 1 }}>
      <Animated.View style={[{ minHeight: 104, borderRadius: 14, padding: 12, borderWidth: 2 }, box]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Animated.View style={[{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, chip]}>
            <Animated.View style={[{ position: 'absolute' }, iconOff]}><Feather name={icon as any} size={16} color={accent.fg} /></Animated.View>
            <Animated.View style={iconOn}><Feather name={icon as any} size={16} color="#FFFFFF" /></Animated.View>
          </Animated.View>
          <Animated.View style={check}><Feather name="check-circle" size={18} color={accent.fg} /></Animated.View>
        </View>
        <Animated.Text style={[{ fontSize: 15, fontWeight: '800', marginTop: 8 }, title]}>{label}</Animated.Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{sub}</Text>
      </Animated.View>
    </PressableOpacity>
  );
}

/** Two-column grid of selectable tiles (icon, title, one line), e.g. the Format choice. */
export function TileGrid<T extends string>({ value, tiles, onChange, accent }: {
  value: T;
  tiles: { value: T; label: string; sub: string; icon: string; disabled?: boolean; note?: string }[];
  onChange: (v: T) => void;
  accent: Accent;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {tiles.map((t) => (
        <Tile key={t.value} on={t.value === value} label={t.label} sub={t.disabled && t.note ? t.note : t.sub} icon={t.icon}
          disabled={t.disabled} onPress={() => onChange(t.value)} accent={accent} />
      ))}
    </View>
  );
}

export function OptionRow({ label, sub, selected, onPress, disabled, check = 'radio', accent }: {
  label: string; sub?: string; selected: boolean; onPress: () => void; disabled?: boolean; check?: 'radio' | 'box'; accent?: Accent;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const icon = check === 'box' ? (selected ? 'check-square' : 'square') : (selected ? 'check-circle' : 'circle');
  return (
    <PressableOpacity onPress={onPress} disabled={disabled} style={[styles.option, disabled && { opacity: 0.5 }]}
      accessibilityRole={check === 'box' ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected, disabled }}>
      <Feather name={icon as any} size={20} color={selected ? (accent?.fg ?? colors.brand) : colors.textFaint} />
      <View style={{ flex: 1 }}>
        <Text style={styles.optionLabel}>{label}</Text>
        {sub ? <Text style={styles.optionSub}>{sub}</Text> : null}
      </View>
    </PressableOpacity>
  );
}

export function Stepper({ value, min, max, onChange, label, accent }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string; accent?: Accent }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stepper}>
      <PressableOpacity accessibilityLabel={`Fewer ${label}`} disabled={value <= min} onPress={() => onChange(value - 1)} style={[styles.stepBtn, accent && { backgroundColor: accent.fg, borderColor: accent.fg }, value <= min && { opacity: 0.4 }]}>
        <Feather name="minus" size={18} color={accent ? '#FFFFFF' : colors.textPrimary} />
      </PressableOpacity>
      <Text style={[styles.stepValue, accent && { color: accent.fg }]}>{value}</Text>
      <PressableOpacity accessibilityLabel={`More ${label}`} disabled={value >= max} onPress={() => onChange(value + 1)} style={[styles.stepBtn, accent && { backgroundColor: accent.fg, borderColor: accent.fg }, value >= max && { opacity: 0.4 }]}>
        <Feather name="plus" size={18} color={accent ? '#FFFFFF' : colors.textPrimary} />
      </PressableOpacity>
    </View>
  );
}

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
});

export const TEAM_COLORS = ['#4FD1C5', '#F59E0B', '#6366F1', '#EF4444', '#10B981', '#EC4899', '#3B82F6', '#8B5CF6'];
