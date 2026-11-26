// Edit a list of RSVP questions (prompt, type, choices, required). Used by the RSVP Questions
// screen and by the questions sheet while creating a group, schedule or meetup.
import React, { useMemo } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { AddButton, FieldError, animateLayout } from '@/components/ui/form';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';
import type { RsvpQuestion } from '@/utils/api';
import { blankQuestion, MAX_QUESTIONS, QUESTION_TYPE_LABELS, type QuestionDraft } from '@/utils/questionDrafts';

export default function QuestionsEditor({ drafts, onChange, problems = [] }: {
  drafts: QuestionDraft[];
  onChange: (next: QuestionDraft[]) => void;
  /** Problems to show (by question key); pass [] until the person confirms. */
  problems?: { key: string; message: string }[];
}) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const patch = (key: string, p: Partial<QuestionDraft>) => onChange(drafts.map(d => (d.key === key ? { ...d, ...p } : d)));
  return (
    <View>
      {drafts.map((d, i) => {
        const problem = problems.find(p => p.key === d.key)?.message;
        return (
          <View key={d.key} testID={`question-${d.key}`} style={[s.card, { marginTop: i === 0 ? 0 : 14 }, !!problem && { borderColor: c.danger }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={s.qLabel}>Question {i + 1}</Text>
              <PressableOpacity accessibilityLabel={`Delete question ${i + 1}`} hitSlop={8}
                onPress={() => { animateLayout(); onChange(drafts.filter(x => x.key !== d.key)); }}>
                <Feather name="trash-2" size={16} color={c.danger} />
              </PressableOpacity>
            </View>
            <TextInput style={s.input} value={d.prompt} onChangeText={t => patch(d.key, { prompt: t })}
              placeholder="e.g. Any dietary restrictions?" placeholderTextColor={c.textFaint} maxLength={140} accessibilityLabel={`Question ${i + 1}`} />
            <View style={s.segment}>
              {(Object.keys(QUESTION_TYPE_LABELS) as RsvpQuestion['type'][]).map(t => (
                <PressableOpacity key={t} onPress={() => { animateLayout(); patch(d.key, { type: t }); }} style={[s.segBtn, d.type === t && s.segBtnOn]}>
                  <Text style={[s.segText, d.type === t && { color: '#fff' }]}>{QUESTION_TYPE_LABELS[t]}</Text>
                </PressableOpacity>
              ))}
            </View>
            {d.type === 'choice' && (
              <View style={{ marginTop: 10 }}>
                {d.options.map((o, oi) => (
                  <View key={oi} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <TextInput style={[s.input, { flex: 1 }]} value={o} placeholder={`Choice ${oi + 1}`} placeholderTextColor={c.textFaint} maxLength={60}
                      onChangeText={t => patch(d.key, { options: d.options.map((x, xi) => (xi === oi ? t : x)) })} />
                    {d.options.length > 2 && (
                      <PressableOpacity accessibilityLabel="Remove choice" hitSlop={8}
                        onPress={() => { animateLayout(); patch(d.key, { options: d.options.filter((_, xi) => xi !== oi) }); }}>
                        <Feather name="x" size={18} color={c.textFaint} />
                      </PressableOpacity>
                    )}
                  </View>
                ))}
                {d.options.length < 10 && (
                  <PressableOpacity onPress={() => patch(d.key, { options: [...d.options, ''] })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="plus-circle" size={16} color={c.brand} />
                    <Text style={{ color: c.brand, fontWeight: '700', fontSize: 14 }}>Add choice</Text>
                  </PressableOpacity>
                )}
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.textSecondary }}>Required</Text>
              <Switch accessibilityLabel={`Question ${i + 1} required`} value={d.required} onValueChange={v => patch(d.key, { required: v })}
                trackColor={{ true: c.brand, false: c.borderStrong }} thumbColor="#fff" ios_backgroundColor={c.borderStrong} />
            </View>
            <FieldError message={problem} />
          </View>
        );
      })}
      {drafts.length < MAX_QUESTIONS && <AddButton label="Add question" onPress={() => onChange([...drafts, blankQuestion()])} />}
      <Text style={s.hint}>Required questions must be answered to save the answers sheet, but members can still skip it and answer later.</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.surface, borderRadius: 14, borderWidth: 1.5, borderColor: c.borderStrong, padding: 14 },
  qLabel: { fontSize: 11, fontWeight: '800', color: c.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, fontSize: 15, color: c.textPrimary, backgroundColor: c.background },
  segment: { flexDirection: 'row', gap: 8, marginTop: 10 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: c.brand },
  segBtnOn: { backgroundColor: c.brand },
  segText: { fontSize: 13, fontWeight: '700', color: c.brand },
  hint: { fontSize: 12, color: c.textMuted, lineHeight: 17, marginTop: 10 },
});
