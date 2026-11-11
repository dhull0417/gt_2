import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';

export function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <PressableOpacity key={String(o.value)} onPress={() => onChange(o.value)} style={[styles.segItem, on && styles.segOn]}
            accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </PressableOpacity>
        );
      })}
    </View>
  );
}

export function OptionRow({ label, sub, selected, onPress, disabled, check = 'radio' }: {
  label: string; sub?: string; selected: boolean; onPress: () => void; disabled?: boolean; check?: 'radio' | 'box';
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const icon = check === 'box' ? (selected ? 'check-square' : 'square') : (selected ? 'check-circle' : 'circle');
  return (
    <PressableOpacity onPress={onPress} disabled={disabled} style={[styles.option, disabled && { opacity: 0.5 }]}
      accessibilityRole={check === 'box' ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected, disabled }}>
      <Feather name={icon as any} size={20} color={selected ? colors.brand : colors.textFaint} />
      <View style={{ flex: 1 }}>
        <Text style={styles.optionLabel}>{label}</Text>
        {sub ? <Text style={styles.optionSub}>{sub}</Text> : null}
      </View>
    </PressableOpacity>
  );
}

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
  seg: { flexDirection: 'row', backgroundColor: colors.backgroundAlt, borderRadius: 12, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  segTextOn: { color: colors.textPrimary, fontWeight: '800' },
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
