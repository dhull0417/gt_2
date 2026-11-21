// Sheet bodies for the meetup and schedule forms: one-off When, RSVP rules, Capacity, Things to
// bring, and the Premium upsell. Each shows its issues in red on the field that needs fixing.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { InlineCalendar } from '@/components/create-group/InlineCalendar';
import { UpgradeButton } from '@/components/UpgradeButton';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { SettingSheet, TimeField, EndField, ChipRow, FieldLabel, FieldError, AddButton, animateLayout } from '@/components/ui/form';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';
import { fieldIssue, type Issue } from '@/utils/formIssues';
import { newBringItemKey, type BringItemDraft } from '@/utils/editScheduleDraft';
import { setDeadlineTime, setLeadTime, stepDeadline, stepLead, toggleDeadline, toggleLead, type RsvpRulesPatch, type RsvpRulesValue } from '@/utils/rsvpRules';
import { MinimumToMeetField } from './MinimumToMeetField';
import QuestionsEditor from './QuestionsEditor';
import { questionsProblems, type QuestionDraft } from '@/utils/questionDrafts';

const MAX_ITEMS = 20;

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  help: { fontSize: 13, color: c.textMuted, lineHeight: 18, marginTop: 4 },
  input: { flex: 1, fontSize: 15, color: c.textPrimary, paddingVertical: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.background, paddingHorizontal: 12, minHeight: 46 },
  inputError: { borderColor: c.danger },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: c.textPrimary, flex: 1, paddingRight: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  stepValue: { fontSize: 17, fontWeight: '800', color: c.textPrimary, minWidth: 110, textAlign: 'center' },
  divider: { height: 1, backgroundColor: c.border, marginVertical: 12 },
});
const useStyles = () => { const c = useThemeColors(); return useMemo(() => makeStyles(c), [c]); };

type SheetBase = { visible: boolean; onClose: () => void; asOverlay?: boolean; issues: Issue[] };

// ── One-off When ──────────────────────────────────────────────────────────────
export function OneOffWhenSheet({ visible, onClose, asOverlay, issues, date, time, endTime, minDate, onChange }: SheetBase & {
  date: string; time: string; endTime: string | null; minDate: string;
  onChange: (patch: { date?: string; time?: string; endTime?: string | null }) => void;
}) {
  return (
    <SettingSheet visible={visible} title="When" onClose={onClose} asOverlay={asOverlay} tall>
      <FieldLabel>Date</FieldLabel>
      <InlineCalendar value={date} minDate={minDate} onChange={iso => onChange({ date: iso })} />
      <TimeField value={time} onChange={t => onChange({ time: t })} />
      <EndField start={time} value={endTime} onChange={t => onChange({ endTime: t })} />
      <FieldError message={fieldIssue(issues, 'endTime')} />
    </SettingSheet>
  );
}

// ── RSVP rules ────────────────────────────────────────────────────────────────
export function Stepper({ value, label, onStep }: { value: string; label: string; onStep: (by: 1 | -1) => void }) {
  const c = useThemeColors(); const s = useStyles();
  return (
    <View style={s.stepper}>
      <PressableOpacity style={s.stepBtn} onPress={() => onStep(-1)} accessibilityLabel={`${label}: one day fewer`}><Feather name="minus" size={18} color={c.textPrimary} /></PressableOpacity>
      <Text style={s.stepValue}>{value}</Text>
      <PressableOpacity style={s.stepBtn} onPress={() => onStep(1)} accessibilityLabel={`${label}: one day more`}><Feather name="plus" size={18} color={c.textPrimary} /></PressableOpacity>
    </View>
  );
}

export function RsvpRulesSheet({ visible, onClose, asOverlay, issues, value: d, onChange, isPremium, owner }: SheetBase & {
  value: RsvpRulesValue & { maxAttendeesMode: 'unlimited' | 'limited'; maxAttendeesInput: string };
  onChange: (patch: RsvpRulesPatch) => void; isPremium: boolean; owner?: string | { _id: string } | null;
}) {
  const c = useThemeColors(); const s = useStyles();
  const sw = { trackColor: { true: c.brand, false: c.borderStrong }, thumbColor: '#fff', ios_backgroundColor: c.borderStrong };
  const daysText = (n: number) => (n === 0 ? 'Day of' : `${n} day${n === 1 ? '' : 's'} before`);
  const applyTime = (r: { patch: RsvpRulesPatch; alert?: { title: string; message: string } }) => {
    if (r.alert) Alert.alert(r.alert.title, r.alert.message);
    onChange(r.patch);
  };
  return (
    <SettingSheet visible={visible} title="RSVP rules" onClose={onClose} asOverlay={asOverlay} tall>
      <FieldLabel>When can people RSVP?</FieldLabel>
      <ChipRow<string> testIDPrefix="rsvp" value={d.rsvpRestricted ? 'limit' : 'any'}
        options={[{ value: 'any', label: 'Anytime' }, { value: 'limit', label: 'Set a window' }]}
        onChange={v => { animateLayout(); onChange({ rsvpRestricted: v === 'limit' }); }} />
      {d.rsvpRestricted && (
        <>
          <View style={s.divider} />
          <View style={s.toggleRow}>
            <Text style={s.toggleLabel}>Opens</Text>
            <Switch accessibilityLabel="Earliest time to RSVP" value={d.leadEnabled} onValueChange={v => { animateLayout(); onChange(toggleLead(d, v)); }} {...sw} />
          </View>
          {d.leadEnabled ? (
            <>
              <Stepper label="Earliest time to RSVP" value={daysText(d.leadDays)} onStep={by => onChange(stepLead(d, by))} />
              <TimeField label="At" value={d.leadTime} onChange={t => applyTime(setLeadTime(d, t))} />
            </>
          ) : <Text style={s.help}>People can RSVP as soon as the meetup is created.</Text>}
          <View style={s.divider} />
          <View style={s.toggleRow}>
            <Text style={s.toggleLabel}>Closes</Text>
            <Switch accessibilityLabel="Latest time to RSVP" value={d.deadlineEnabled} onValueChange={v => { animateLayout(); onChange(toggleDeadline(d, v)); }} {...sw} />
          </View>
          {d.deadlineEnabled ? (
            <>
              <Stepper label="Latest time to RSVP" value={daysText(d.deadlineDays)} onStep={by => onChange(stepDeadline(d, by))} />
              <TimeField label="At" value={d.deadlineTime} onChange={t => applyTime(setDeadlineTime(d, t))} />
            </>
          ) : <Text style={s.help}>People can RSVP right up until the meetup starts.</Text>}
          <View style={s.divider} />
          <MinimumToMeetField isPremium={isPremium} owner={owner} deadlineOn={d.deadlineEnabled}
            value={d.minAttendeesInput} onChange={v => onChange({ minAttendeesInput: v })} error={fieldIssue(issues, 'minAttendees')} />
        </>
      )}
    </SettingSheet>
  );
}

// ── Capacity ──────────────────────────────────────────────────────────────────
export function CapacitySheet({ visible, onClose, asOverlay, issues, mode, input, onChange }: SheetBase & {
  mode: 'unlimited' | 'limited'; input: string;
  onChange: (patch: { maxAttendeesMode?: 'unlimited' | 'limited'; maxAttendeesInput?: string }) => void;
}) {
  const s = useStyles(); const c = useThemeColors();
  const err = fieldIssue(issues, 'capacityInput');
  return (
    <SettingSheet visible={visible} title="Capacity" onClose={onClose} asOverlay={asOverlay} tall>
      <FieldLabel>How many can come?</FieldLabel>
      <ChipRow<string> testIDPrefix="capacity" value={mode}
        options={[{ value: 'unlimited', label: 'Unlimited' }, { value: 'limited', label: 'Set a limit' }]}
        onChange={v => { animateLayout(); onChange(v === 'unlimited' ? { maxAttendeesMode: 'unlimited', maxAttendeesInput: '' } : { maxAttendeesMode: 'limited' }); }} />
      {mode === 'limited' && (
        <>
          <FieldLabel>Max people</FieldLabel>
          <View style={[s.inputRow, !!err && s.inputError]}>
            <Feather name="users" size={16} color={c.textFaint} style={{ marginRight: 8 }} />
            <TextInput style={s.input} placeholder="How many?" placeholderTextColor={c.placeholder} keyboardType="number-pad"
              value={input} onChangeText={v => onChange({ maxAttendeesInput: v })} accessibilityLabel="Max attendees" />
          </View>
          <FieldError message={err} />
        </>
      )}
    </SettingSheet>
  );
}

// ── Things to bring ───────────────────────────────────────────────────────────
/**
 * `issues` are all of the list's problems; they show only after Done is tapped with something wrong
 * (the sheet then stays open) or once the form's Save/Create was tried (`showIssues`).
 */
export function BringItemsSheet({ visible, onClose, asOverlay, issues: allIssues, showIssues, items, onChange }: SheetBase & {
  showIssues: boolean; items: BringItemDraft[]; onChange: (items: BringItemDraft[]) => void;
}) {
  const s = useStyles(); const c = useThemeColors();
  const [tried, setTried] = useState(false);
  useEffect(() => { if (visible) setTried(false); }, [visible]);
  const bringIssues = allIssues.filter(i => i.area === 'bring');
  const issues = showIssues || tried ? bringIssues : [];
  const done = () => { if (bringIssues.length) setTried(true); else onClose(); };
  const set = (key: string, patch: Partial<BringItemDraft>) => onChange(items.map(i => (i.key === key ? { ...i, ...patch } : i)));
  return (
    <SettingSheet visible={visible} title="Food/Things to bring" onClose={onClose} onDone={done} asOverlay={asOverlay} tall>
      <Text style={s.help}>People who are In pick what they're bringing. Add a number to limit how many can bring an item.</Text>
      {items.map(item => {
        const err = fieldIssue(issues, `item:${item.key}`);
        return (
          <View key={item.key} style={{ marginTop: 10 }}>
            <View testID={`item-${item.key}`} style={[s.inputRow, !!err && s.inputError]}>
              <TextInput style={s.input} placeholder="Item (e.g. Chips)" placeholderTextColor={c.placeholder} maxLength={40}
                value={item.name} onChangeText={v => set(item.key, { name: v })} accessibilityLabel="Item name" />
              <TextInput style={[s.input, { flex: 0, width: 70, textAlign: 'center', borderLeftWidth: 1, borderLeftColor: c.border }]}
                placeholder="No limit" placeholderTextColor={c.placeholder} keyboardType="number-pad" maxLength={2} value={item.max}
                accessibilityLabel={`How many can bring ${item.name || 'this item'}`}
                onChangeText={v => set(item.key, { max: v.replace(/[^0-9]/g, '') })} />
              <PressableOpacity onPress={() => { animateLayout(); onChange(items.filter(i => i.key !== item.key)); }} hitSlop={10} style={{ marginLeft: 8 }} accessibilityLabel={`Remove ${item.name || 'item'}`}>
                <Feather name="trash-2" size={16} color={c.danger} />
              </PressableOpacity>
            </View>
            <FieldError message={err} />
          </View>
        );
      })}
      {items.length < MAX_ITEMS && <AddButton label="Add item to bring" onPress={() => onChange([...items, { key: newBringItemKey(), name: '', max: '' }])} />}
    </SettingSheet>
  );
}

// ── RSVP questions (before the group / schedule / meetup exists) ─────────────
/** Same confirm rule as Food/Things to bring: problems show on Done (sheet stays open) or after Save. */
export function QuestionsSheet({ visible, onClose, asOverlay, showIssues, drafts, onChange, savedLater }: {
  visible: boolean; onClose: () => void; asOverlay?: boolean; showIssues: boolean;
  drafts: QuestionDraft[]; onChange: (next: QuestionDraft[]) => void;
  /** What gets created, for the note ("group", "schedule", "meetup"). */
  savedLater: string;
}) {
  const s = useStyles();
  const [tried, setTried] = useState(false);
  useEffect(() => { if (visible) setTried(false); }, [visible]);
  const problems = questionsProblems(drafts);
  const done = () => { if (problems.length) setTried(true); else onClose(); };
  return (
    <SettingSheet visible={visible} title="RSVP Questions" onClose={onClose} onDone={done} asOverlay={asOverlay} tall>
      <Text style={[s.help, { marginBottom: 12 }]}>Ask people something when they RSVP "I'm In". Everyone going can see the answers. They're saved when the {savedLater} is created.</Text>
      <QuestionsEditor drafts={drafts} onChange={onChange} problems={showIssues || tried ? problems : []} />
    </SettingSheet>
  );
}

// ── Premium upsell (tapping a locked row) ─────────────────────────────────────
export function PremiumUpsellSheet({ visible, onClose, asOverlay, note, owner }: {
  visible: boolean; onClose: () => void; asOverlay?: boolean; note: string; owner?: string | { _id: string } | null;
}) {
  const s = useStyles();
  return (
    <SettingSheet visible={visible} title="Premium" onClose={onClose} asOverlay={asOverlay}>
      <Text style={[s.help, { fontSize: 15 }]}>Food/things to bring, rides, a minimum to meet, Priority RSVP and RSVP questions come with Premium.</Text>
      <Text style={s.help}>{note}</Text>
      <View style={{ marginTop: 12 }}><UpgradeButton owner={owner} /></View>
    </SettingSheet>
  );
}
