// Field pieces used inside setting sheets. Pickers open through the sheet's overlay so no second
// native Modal is ever stacked (outside a sheet they fall back to the picker's own Modal).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DateTime } from 'luxon';
import NativeTimePicker from '@/components/NativeTimePicker';
import EndTimeField from '@/components/EndTimeField';
import { InlineCalendar } from '@/components/create-group/InlineCalendar';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { addHour } from '@/utils/timeString';
import { clock } from '@/utils/formSummaries';
import type { ThemeColors } from '@/constants/theme';
import { useSheetOverlay, FieldError, animateLayout } from './index';
import { Collapsible } from './Collapsible';

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginTop: 14, marginBottom: 6 },
  field: { flexDirection: 'row', alignItems: 'center', minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.background, paddingHorizontal: 12 },
  fieldError: { borderColor: c.danger },
  text: { fontSize: 15, fontWeight: '600', color: c.textPrimary },
  placeholder: { fontSize: 15, color: c.textFaint },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  chipOn: { borderColor: c.brand, backgroundColor: c.brand },
  chipText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  chipTextOn: { color: '#fff', fontWeight: '800' },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', marginTop: 12, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  addLabel: { fontSize: 16, fontWeight: '800', color: c.brand },
  addText: { fontSize: 14, fontWeight: '700', color: c.brand },
});
const useStyles = () => { const c = useThemeColors(); return useMemo(() => makeStyles(c), [c]); };

export function FieldLabel({ children }: { children: React.ReactNode }) {
  const s = useStyles();
  return <Text style={s.label}>{children}</Text>;
}

export function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useThemeColors(); const s = useStyles();
  return (
    <PressableOpacity testID="add-button" onPress={() => { animateLayout(); onPress(); }} style={s.add} accessibilityRole="button">
      <Feather name="plus" size={18} color={c.brand} />
      <Text style={s.addLabel}>{label}</Text>
    </PressableOpacity>
  );
}

/** Opens a time picker in the sheet overlay, or as its own Modal when there's no sheet. */
function useTimePicker() {
  const overlay = useSheetOverlay();
  const [local, setLocal] = useState<null | { value: string; onChange: (t: string) => void }>(null);
  const open = (value: string, onChange: (t: string) => void) => {
    if (overlay) overlay.show(<NativeTimePicker asOverlay value={value} onChange={onChange} onClose={overlay.hide} />);
    else setLocal({ value, onChange });
  };
  const fallback = local ? <NativeTimePicker value={local.value} onChange={local.onChange} onClose={() => setLocal(null)} /> : null;
  return { open, fallback };
}

export function TimeField({ label = 'Time', value, onChange, error, testID }: {
  label?: string; value: string; onChange: (t: string) => void; error?: string | null; testID?: string;
}) {
  const c = useThemeColors(); const s = useStyles();
  const picker = useTimePicker();
  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <PressableOpacity testID={testID} style={[s.field, !!error && s.fieldError]} onPress={() => picker.open(value, onChange)} accessibilityLabel={`${label} ${clock(value)}`}>
        <Feather name="clock" size={16} color={c.textFaint} style={{ marginRight: 10 }} />
        <Text style={s.text}>{clock(value)}</Text>
      </PressableOpacity>
      <FieldError message={error} />
      {picker.fallback}
    </View>
  );
}

/** Optional end time under a start time (EndTimeField's look and clear button; picker via the overlay). */
export function EndField({ start, value, onChange }: { start: string; value: string | null | undefined; onChange: (t: string | null) => void }) {
  const s = useStyles();
  const picker = useTimePicker();
  return (
    <View>
      <EndTimeField startTime={start} endTime={value} onChange={onChange} open={false} renderPicker={false}
        onOpenChange={o => { if (o) picker.open(value || addHour(start), t => onChange(t)); }}
        labelStyle={s.label} fieldStyle={s.field} textStyle={s.text} />
      {picker.fallback}
    </View>
  );
}

/** A date that expands into an inline calendar when tapped. */
export function DateField({ label, value, onChange, minDate, maxDate, placeholder = 'Pick a date', error, testID }: {
  label: string; value: string | null; onChange: (iso: string) => void; minDate?: string; maxDate?: string;
  placeholder?: string; error?: string | null; testID?: string;
}) {
  const c = useThemeColors(); const s = useStyles();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <PressableOpacity testID={testID} style={[s.field, !!error && s.fieldError]} onPress={() => setOpen(o => !o)}>
        <Feather name="calendar" size={16} color={c.textFaint} style={{ marginRight: 10 }} />
        <Text style={value ? s.text : s.placeholder}>{value ? DateTime.fromISO(value).toFormat('ccc, LLL d, yyyy') : placeholder}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.textFaint} style={{ marginLeft: 'auto' }} />
      </PressableOpacity>
      <Collapsible open={open}>
        <View style={{ marginTop: 8 }}>
          <InlineCalendar value={value ?? DateTime.now().toISODate()!} minDate={minDate} maxDate={maxDate}
            onChange={iso => { onChange(iso); setOpen(false); }} />
        </View>
      </Collapsible>
      <FieldError message={error} />
    </View>
  );
}

/**
 * A wrapping row of single-choice chips (days of the week, occurrences, dates…).
 * `collapsible`: once a value is picked, only that chip shows, with Change to reopen the row.
 * It starts open when nothing is picked or `startOpen` is set (e.g. a just-added row).
 */
export function ChipRow<T extends string | number>({ options, value, onChange, error, testIDPrefix, collapsible, startOpen, collapsedLabel }: {
  options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; error?: string | null; testIDPrefix?: string;
  collapsible?: boolean; startOpen?: boolean; collapsedLabel?: string;
}) {
  const c = useThemeColors(); const s = useStyles();
  const [open, setOpen] = useState(!collapsible || value === null || !!startOpen);
  useEffect(() => { if (value === null) setOpen(true); }, [value]);
  const chosen = options.find(o => o.value === value);
  const grid = (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, !!error && { borderWidth: 1, borderColor: c.danger, borderRadius: 14, padding: 6 }]}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <PressableOpacity key={String(o.value)} testID={testIDPrefix ? `${testIDPrefix}-${o.value}` : undefined}
            onPress={() => { if (collapsible) setOpen(false); onChange(o.value); }} style={[s.chip, on && s.chipOn]}
            accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <Text style={[s.chipText, on && s.chipTextOn]}>{o.label}</Text>
          </PressableOpacity>
        );
      })}
    </View>
  );
  if (!collapsible) return <View>{grid}<FieldError message={error} /></View>;
  const collapsed = !open && !!chosen;
  const shown = chosen ? collapsedLabel ?? chosen.label : '';
  return (
    <View>
      <Collapsible open={collapsed}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PressableOpacity onPress={() => setOpen(true)} style={[s.chip, s.chipOn]} accessibilityRole="button">
            <Text style={[s.chipText, s.chipTextOn]}>{shown}</Text>
          </PressableOpacity>
          <PressableOpacity onPress={() => setOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Change ${shown}`}>
            <Text style={s.addText}>Change</Text>
          </PressableOpacity>
        </View>
      </Collapsible>
      <Collapsible open={!collapsed}>{grid}</Collapsible>
      <FieldError message={error} />
    </View>
  );
}
