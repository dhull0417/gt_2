// The one editor for a recurring schedule's "When" (frequency, days, times, monthly rules,
// quarterly/semiannual/yearly and custom rules). Used inside the When sheet by create-group's
// schedule step and by New/Edit Schedule. All edits go through utils/recurrenceDraft.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DateTime } from 'luxon';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { OptionRow, FieldError, TimeField, EndField, DateField, ChipRow, FieldLabel, AddButton, Collapsible, animateLayout } from '@/components/ui/form';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';
import type { Frequency } from '@/utils/api';
import { DAYS_OF_WEEK, ORDINAL_OCCURRENCES, uid } from '@/utils/scheduleConstants';
import { isLongFrequency, repeatChoiceLabels, type LongFrequency, type RepeatBy } from '@/utils/longInterval';
import { fieldIssue, type Issue } from '@/utils/formIssues';
import { ordSfx } from '@/utils/scheduleConstants';
import * as R from '@/utils/recurrenceDraft';
import type { ScheduleData } from '@/utils/createGroupDraft';

export const FREQUENCY_CHOICES: { value: Frequency; label: string; sub: string }[] = [
  { value: 'daily', label: 'Daily', sub: 'Every day' },
  { value: 'weekly', label: 'Weekly', sub: 'Same days each week' },
  { value: 'biweekly', label: 'Every 2 weeks', sub: 'Same days every other week' },
  { value: 'monthly', label: 'Monthly', sub: 'A date or a weekday each month' },
  { value: 'quarterly', label: 'Quarterly', sub: 'Every 3 months' },
  { value: 'semiannual', label: 'Every 6 months', sub: 'Twice a year' },
  { value: 'yearly', label: 'Yearly', sub: 'Once a year' },
  { value: 'custom', label: 'Custom', sub: 'Combine several rules' },
];
const CUSTOM_CHOICES = FREQUENCY_CHOICES.filter(c => c.value !== 'custom');
const DAY_CHIPS = DAYS_OF_WEEK.map(d => ({ value: d.value, label: d.short }));
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
const OCCURRENCES = ORDINAL_OCCURRENCES.map(o => ({ value: o, label: o }));
const MAX_RULES = 5;

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  box: { borderRadius: 14, borderWidth: 1.5, borderColor: c.borderStrong, padding: 12, marginTop: 10 },
  boxError: { borderColor: c.danger },
  boxHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boxTitle: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  ruleText: { flex: 1, fontSize: 15, fontWeight: '600', color: c.textPrimary },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border },
  btnPrimary: { backgroundColor: c.brand, borderColor: c.brand },
  btnText: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
});
const useStyles = () => { const c = useThemeColors(); return useMemo(() => makeStyles(c), [c]); };

type Update<T> = (fn: (prev: T) => T) => void;

function RemoveButton({ onPress, label }: { onPress: () => void; label: string }) {
  const c = useThemeColors();
  return (
    <PressableOpacity onPress={() => { animateLayout(); onPress(); }} hitSlop={10} accessibilityLabel={label}>
      <Feather name="trash-2" size={16} color={c.danger} />
    </PressableOpacity>
  );
}

/**
 * A single-choice list that collapses to just the chosen option once one is picked, so the details
 * below sit right under it. Tapping the chosen option (or Change) opens the full list again.
 */
function CollapsingChoices<V extends string>({ choices, value, onPick }: {
  choices: { value: V; label: string; sub?: string }[]; value: V | null; onPick: (v: V) => void;
}) {
  const c = useThemeColors();
  const [open, setOpen] = useState(value === null);
  useEffect(() => { if (value === null) setOpen(true); }, [value]);
  const chosen = choices.find(ch => ch.value === value);
  const collapsed = !open && !!chosen;
  return (
    <View>
      {choices.map(ch => {
        const isChosen = ch.value === value;
        const row = (
          <OptionRow label={ch.label} sub={ch.sub} selected={isChosen}
            onPress={() => { if (collapsed) { setOpen(true); return; } onPick(ch.value); setOpen(false); }} />
        );
        if (!isChosen) return <Collapsible key={ch.value} open={!collapsed}>{row}</Collapsible>;
        return (
          <View key={ch.value} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>{row}</View>
            {collapsed && (
              <PressableOpacity onPress={() => setOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Change from ${ch.label}`}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.brand }}>Change</Text>
              </PressableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** The editor for one frequency's details (used for the main schedule and for a custom rule). */
function FrequencyDetails<T extends ScheduleData>({ frequency, value: d, update, issues, today, maxDate }: {
  frequency: Frequency; value: T; update: Update<T>; issues: Issue[]; today: string; maxDate: string;
}) {
  const c = useThemeColors();
  const s = useStyles();
  const err = (f: string) => fieldIssue(issues, f);

  if (frequency === 'daily') {
    return (
      <View>
        <FieldLabel>Same time every day?</FieldLabel>
        <ChipRow<string> testIDPrefix="daily" value={d.dailySameTime === null ? null : d.dailySameTime ? 'same' : 'varies'}
          options={[{ value: 'same', label: 'Same time' }, { value: 'varies', label: 'Varies by day' }]}
          onChange={v => update(p => ({ ...p, dailySameTime: v === 'same' }))} error={err('dailySameTime')} />
        {d.dailySameTime === true && (
          <>
            <TimeField value={d.dailySharedTime} onChange={t => update(p => ({ ...p, dailySharedTime: t }))} />
            <EndField start={d.dailySharedTime} value={d.dailySharedEndTime} onChange={t => update(p => ({ ...p, dailySharedEndTime: t }))} />
          </>
        )}
        {d.dailySameTime === false && d.dailyRows.map(row => (
          <View key={row.id} style={s.box}>
            <Text style={s.boxTitle}>{DAYS_OF_WEEK.find(w => w.value === row.day)?.label}</Text>
            <TimeField value={row.time} onChange={t => update(p => R.updateDailyRow(p, row.id, { time: t }))} />
            <EndField start={row.time} value={row.endTime} onChange={t => update(p => R.updateDailyRow(p, row.id, { endTime: t }))} />
          </View>
        ))}
      </View>
    );
  }

  if (frequency === 'weekly' || frequency === 'biweekly') {
    return (
      <View>
        {d.weekdayRows.map((row, i) => {
          const rowErr = err(`weekday:${row.id}`);
          return (
            <View key={row.id} testID={`weekday-row-${row.id}`} style={[s.box, !!rowErr && s.boxError]}>
              <View style={s.boxHeader}>
                <Text style={s.boxTitle}>Day {i + 1}</Text>
                <RemoveButton label="Remove day" onPress={() => update(p => R.removeWeekdayRow(p, row.id))} />
              </View>
              <View style={{ marginTop: 8 }}>
                <ChipRow<number> testIDPrefix={`day-${row.id}`} options={DAY_CHIPS} value={row.day} collapsible
                  collapsedLabel={row.day !== null ? DAYS_OF_WEEK.find(w => w.value === row.day)?.label : undefined}
                  onChange={day => update(p => R.updateWeekdayRow(p, row.id, { day }))} error={rowErr} />
              </View>
              <TimeField value={row.time} onChange={t => update(p => R.updateWeekdayRow(p, row.id, { time: t }))} />
              <EndField start={row.time} value={row.endTime} onChange={t => update(p => R.updateWeekdayRow(p, row.id, { endTime: t }))} />
              {frequency === 'biweekly' && (
                <DateField label="First meetup on" value={row.startDate} minDate={today} maxDate={maxDate}
                  onChange={iso => update(p => R.updateWeekdayRow(p, row.id, { startDate: iso }))} />
              )}
            </View>
          );
        })}
        <AddButton label="Add a day" onPress={() => update(p => R.addWeekdayRow(p, uid(), today))} />
        <FieldError message={err('weekdayRows')} />
      </View>
    );
  }

  if (frequency === 'monthly') {
    return (
      <View>
        <FieldLabel>Repeat on</FieldLabel>
        <ChipRow<string> testIDPrefix="monthly" value={d.monthlyMode}
          options={[{ value: 'date', label: 'Same date' }, { value: 'ordinal', label: 'Same weekday' }]}
          onChange={mode => update(p => ({ ...p, monthlyMode: mode as 'date' | 'ordinal' }))} error={err('monthlyMode')} />
        {d.monthlyMode === 'date' && (
          <>
            {d.monthlyDates.map(e => (
              <View key={e.id} style={s.box}>
                <View style={s.boxHeader}>
                  <Text style={s.boxTitle}>Date of the month</Text>
                  <RemoveButton label="Remove date" onPress={() => update(p => R.removeMonthlyDate(p, e.id))} />
                </View>
                <View style={{ marginTop: 8 }}>
                  <ChipRow<number> options={MONTH_DAYS} value={e.date} collapsible startOpen={e.expanded}
                    collapsedLabel={`The ${e.date}${ordSfx(e.date)}`}
                    onChange={date => update(p => R.updateMonthlyDate(p, e.id, { date }))} />
                </View>
                <TimeField value={e.time} onChange={t => update(p => R.updateMonthlyDate(p, e.id, { time: t }))} />
                <EndField start={e.time} value={e.endTime} onChange={t => update(p => R.updateMonthlyDate(p, e.id, { endTime: t }))} />
              </View>
            ))}
            <AddButton label="Add a date" onPress={() => update(p => R.addMonthlyDate(p, uid()))} />
            <FieldError message={err('monthlyDates')} />
          </>
        )}
        {d.monthlyMode === 'ordinal' && (
          <>
            {d.ordinalEntries.map(e => (
              <View key={e.id} style={s.box}>
                <View style={s.boxHeader}>
                  <Text style={s.boxTitle}>Weekday of the month</Text>
                  <RemoveButton label="Remove day" onPress={() => update(p => R.removeOrdinal(p, e.id))} />
                </View>
                <View style={{ marginTop: 8, gap: 8 }}>
                  <ChipRow<string> options={OCCURRENCES} value={e.occurrence} collapsible startOpen={e.expanded}
                    onChange={occurrence => update(p => R.updateOrdinal(p, e.id, { occurrence }))} />
                  <ChipRow<number> options={DAY_CHIPS} value={e.day} collapsible startOpen={e.expanded}
                    collapsedLabel={DAYS_OF_WEEK.find(w => w.value === e.day)?.label}
                    onChange={day => update(p => R.updateOrdinal(p, e.id, { day }))} />
                </View>
                <TimeField value={e.time} onChange={t => update(p => R.updateOrdinal(p, e.id, { time: t }))} />
                <EndField start={e.time} value={e.endTime} onChange={t => update(p => R.updateOrdinal(p, e.id, { endTime: t }))} />
              </View>
            ))}
            <AddButton label="Add a day" onPress={() => update(p => R.addOrdinal(p, uid()))} />
            <FieldError message={err('ordinalEntries')} />
          </>
        )}
      </View>
    );
  }

  if (isLongFrequency(frequency)) {
    const labels = repeatChoiceLabels(frequency as LongFrequency, d.longFirstDate);
    return (
      <View>
        <DateField label="First meetup on" value={d.longFirstDate} minDate={today} placeholder="Pick the first date"
          onChange={iso => update(p => ({ ...p, longFirstDate: iso }))} error={err('longFirstDate')} testID="long-first-date" />
        <TimeField value={d.longTime} onChange={t => update(p => ({ ...p, longTime: t }))} />
        <EndField start={d.longTime} value={d.longEndTime} onChange={t => update(p => ({ ...p, longEndTime: t }))} />
        <FieldLabel>Repeat on</FieldLabel>
        {labels ? (
          <CollapsingChoices<RepeatBy> value={d.longRepeatBy}
            choices={[{ value: 'date', label: 'Same date', sub: labels.date }, { value: 'weekday', label: 'Same weekday', sub: labels.weekday }]}
            onPick={v => update(p => ({ ...p, longRepeatBy: v }))} />
        ) : <Text style={{ fontSize: 13, color: c.textMuted }}>Pick the first date to choose.</Text>}
        <FieldError message={err('longRepeatBy')} />
      </View>
    );
  }
  return null;
}

/** Custom: a list of built rules, plus a builder for adding or editing one. */
function CustomRules<T extends ScheduleData>({ value: d, update, issues, today, maxDate }: {
  value: T; update: Update<T>; issues: Issue[]; today: string; maxDate: string;
}) {
  const c = useThemeColors();
  const s = useStyles();
  const editingId = d.builtRoutines.find(r => r.editing)?.id ?? null;
  return (
    <View>
      {d.builtRoutines.map(r => (
        <PressableOpacity key={r.id} style={s.ruleRow} disabled={d.customBuilding} onPress={() => { animateLayout(); update(p => R.startEditingRoutine(p, r.id)); }}>
          <Text style={[s.ruleText, r.editing && { color: c.brand }]} numberOfLines={2}>{r.label}</Text>
          {!d.customBuilding && <RemoveButton label="Remove rule" onPress={() => update(p => R.removeBuiltRoutine(p, r.id))} />}
        </PressableOpacity>
      ))}
      {d.customBuilding ? (
        <View style={s.box}>
          <Text style={s.boxTitle}>{editingId ? 'Edit rule' : 'New rule'}</Text>
          <CollapsingChoices choices={CUSTOM_CHOICES.map(({ value, label }) => ({ value, label }))} value={d.customFreq}
            onPick={v => { if (v !== d.customFreq) update(p => R.pickCustomFrequency(p, v)); }} />
          {d.customFreq && (
            <Collapsible key={d.customFreq} open appear>
              <FrequencyDetails frequency={d.customFreq} value={d} update={update} issues={[]} today={today} maxDate={maxDate} />
            </Collapsible>
          )}
          <View style={s.buttons}>
            <PressableOpacity style={s.btn} onPress={() => { animateLayout(); update(p => R.cancelCustom(p)); }}><Text style={s.btnText}>Cancel</Text></PressableOpacity>
            <PressableOpacity style={[s.btn, s.btnPrimary]} disabled={!R.routineFromDraft(d, 'check')}
              onPress={() => { animateLayout(); update(p => (editingId ? R.saveEditedRoutine(p, editingId) : R.finishCustomRoutine(p, uid()))); }}>
              <Text style={[s.btnText, { color: '#fff' }, !R.routineFromDraft(d, 'check') && { opacity: 0.5 }]}>{editingId ? 'Save rule' : 'Add rule'}</Text>
            </PressableOpacity>
          </View>
        </View>
      ) : d.builtRoutines.length < MAX_RULES && (
        <AddButton label="Add a rule" onPress={() => update(p => R.startCustom(p))} />
      )}
      <FieldError message={fieldIssue(issues, 'builtRoutines')} />
    </View>
  );
}

export default function RecurrenceEditor<T extends ScheduleData>({ value: d, update, issues, showStartDate = true }: {
  value: T;
  /** Functional update, so pickers that report later never overwrite newer edits. */
  update: Update<T>;
  issues: Issue[];
  showStartDate?: boolean;
}) {
  const today = DateTime.now().toISODate()!;
  const maxDate = DateTime.now().plus({ months: 4 }).toISODate()!;
  const f = d.frequency;
  // Details grow in only right after a pick (not every time the sheet opens).
  const [picked, setPicked] = useState<Frequency | null>(null);
  return (
    <View>
      <FieldLabel>How often?</FieldLabel>
      <CollapsingChoices choices={FREQUENCY_CHOICES} value={f} onPick={v => { if (v !== f) { setPicked(v); update(p => R.selectFrequency(p, v)); } }} />
      <FieldError message={fieldIssue(issues, 'frequency')} />
      {f && (
        <Collapsible key={f} open appear={picked === f}>
          {f === 'custom'
            ? <CustomRules value={d} update={update} issues={issues} today={today} maxDate={maxDate} />
            : <FrequencyDetails frequency={f} value={d} update={update} issues={issues} today={today} maxDate={maxDate} />}
          {showStartDate && f !== 'biweekly' && !isLongFrequency(f) && (
            <DateField label="Starting" value={d.startDate} minDate={today} maxDate={maxDate} onChange={iso => update(p => ({ ...p, startDate: iso }))} />
          )}
        </Collapsible>
      )}
      <FieldError message={fieldIssue(issues, 'endTime')} />
    </View>
  );
}
