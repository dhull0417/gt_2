import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Modal, ScrollView, StyleSheet, Alert, ActivityIndicator,
  TextInput, KeyboardAvoidingView,
} from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useApiClient, meetupApi, Meetup } from '@/utils/api';
import { questionsActive, answerFor, hasAnsweredAny, displayAnswer } from '@/utils/questions';
import { memberName } from '@/utils/assignments';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  meetup: Meetup;
  currentUserId: string;
  /** Whether the current user is In or on the waitlist (only they can answer). */
  canAnswer: boolean;
  /** Bump to open the sheet (e.g. right after the user RSVPs "I'm In"). */
  openSignal?: number;
  onUpdated: (meetup: Meetup) => void;
}

export default function MeetupQuestions({ meetup, currentUserId, canAnswer, openSignal = 0, onUpdated }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (openSignal > 0 && canAnswer && questionsActive(meetup)) setSheetOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  if (!questionsActive(meetup)) return null;

  const questions = meetup.questions ?? [];
  const answered = hasAnsweredAny(meetup, currentUserId);
  const goingIds = new Set<string>([
    ...meetup.in.map((u) => (typeof u === 'string' ? u : u._id)),
    ...meetup.waitlist.map((u) => (typeof u === 'string' ? u : u._id)),
  ]);

  return (
    <Animated.View layout={LinearTransition.duration(260)} style={[styles.card, { overflow: 'hidden' }]}>
      <View style={styles.headerRow}>
        <PressableOpacity
          onPress={() => setCollapsed((c) => !c)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 0, right: 8 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}
        >
          <Feather name={collapsed ? 'chevron-right' : 'chevron-down'} size={16} color={colors.textFaint} />
          <Text style={styles.title}>Questions</Text>
        </PressableOpacity>
        {canAnswer && (
          <PressableOpacity onPress={() => setSheetOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.action}>{answered ? 'Edit mine' : 'Answer'}</Text>
          </PressableOpacity>
        )}
      </View>

      {!collapsed && (
        <Animated.View entering={FadeIn.duration(200).delay(120)} exiting={FadeOut.duration(100)} style={{ marginTop: 10 }}>
          {questions.map((q) => {
            const rows = (meetup.answers ?? []).filter((a) => a.question === q._id && goingIds.has(a.user));
            const waiting = [...goingIds].filter((id) => !rows.some((r) => r.user === id));
            return (
              <View key={q._id} style={{ marginBottom: 12 }}>
                <Text style={styles.prompt}>
                  {q.prompt}
                  {q.required ? <Text style={{ color: '#EA580C' }}> *</Text> : null}
                </Text>
                {rows.length === 0 ? (
                  <Text style={styles.none}>No answers yet</Text>
                ) : (
                  rows.map((r) => (
                    <View key={r.user} style={styles.answerRow}>
                      <Text style={styles.who}>{r.user === currentUserId ? 'You' : memberName(meetup, r.user)}</Text>
                      <Text style={styles.value} numberOfLines={4}>{displayAnswer(q.type, r.value)}</Text>
                    </View>
                  ))
                )}
                {q.required && waiting.length > 0 && rows.length > 0 && (
                  <Text style={styles.none}>
                    Waiting on: {waiting.map((id) => (id === currentUserId ? 'You' : memberName(meetup, id))).join(', ')}
                  </Text>
                )}
              </View>
            );
          })}
        </Animated.View>
      )}

      <QuestionsSheet
        visible={sheetOpen}
        meetup={meetup}
        currentUserId={currentUserId}
        onClose={() => setSheetOpen(false)}
        onUpdated={onUpdated}
      />
    </Animated.View>
  );
}

export function QuestionsSheet({
  visible, meetup, currentUserId, onClose, onUpdated,
}: {
  visible: boolean; meetup: Meetup; currentUserId: string; onClose: () => void; onUpdated: (m: Meetup) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 3-button Android navigation is taller than the fixed 34pt pad, which hid the sheet's last row.
  const insets = useSafeAreaInsets();
  const api = useApiClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const questions = meetup.questions ?? [];

  useEffect(() => {
    if (!visible) return;
    const start: Record<string, string> = {};
    for (const q of questions) start[q._id] = answerFor(meetup, currentUserId, q._id) ?? '';
    setValues(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const missingRequired = questions.some((q) => q.required && !(values[q._id] ?? '').trim());

  const save = async () => {
    setSaving(true);
    try {
      const result = await meetupApi.setAnswers(
        api,
        meetup._id,
        questions.map((q) => ({ question: q._id, value: (values[q._id] ?? '').trim() })),
      );
      if (result.meetup) onUpdated(result.meetup);
      onClose();
    } catch (err: any) {
      const data = err.response?.data;
      Alert.alert('Could not save', data?.message || data?.error || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const set = (id: string, v: string) => setValues((cur) => ({ ...cur, [id]: v }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(34, insets.bottom + 16) }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{meetup.name}</Text>
            <PressableOpacity accessibilityLabel="Close" onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </PressableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            {questions.map((q) => (
              <View key={q._id} style={{ marginBottom: 18 }}>
                <Text style={styles.sheetSection}>
                  {q.prompt}
                  {q.required ? <Text style={{ color: '#EA580C' }}> *</Text> : null}
                </Text>
                {q.type === 'text' && (
                  <TextInput
                    value={values[q._id] ?? ''}
                    onChangeText={(t) => set(q._id, t)}
                    placeholder="Your answer"
                    placeholderTextColor={colors.textFaint}
                    maxLength={300}
                    multiline
                    style={styles.input}
                  />
                )}
                {q.type === 'yesno' && (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {(['yes', 'no'] as const).map((v) => (
                      <PressableOpacity
                        key={v}
                        onPress={() => set(q._id, values[q._id] === v ? '' : v)}
                        style={[styles.choiceBtn, values[q._id] === v && styles.choiceBtnOn]}
                      >
                        <Text style={[styles.choiceText, values[q._id] === v && { color: '#fff' }]}>{v === 'yes' ? 'Yes' : 'No'}</Text>
                      </PressableOpacity>
                    ))}
                  </View>
                )}
                {q.type === 'choice' && q.options.map((o) => {
                  const on = values[q._id] === o;
                  return (
                    <PressableOpacity
                      key={o}
                      onPress={() => set(q._id, on ? '' : o)}
                      style={[styles.option, on && styles.optionOn]}
                    >
                      <Feather name={on ? 'check-circle' : 'circle'} size={20} color={on ? colors.accentTeal : colors.textFaint} />
                      <Text style={styles.optionText}>{o}</Text>
                    </PressableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <PressableOpacity
            onPress={save}
            disabled={saving || missingRequired}
            style={[styles.saveBtn, (saving || missingRequired) && { opacity: 0.5 }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
          </PressableOpacity>
          {missingRequired && <Text style={styles.reqHint}>Answer the questions marked * to save.</Text>}
          <PressableOpacity onPress={onClose} style={{ alignItems: 'center', paddingTop: 12 }}>
            <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Not now</Text>
          </PressableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 11, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
  action: { fontSize: 14, fontWeight: '700', color: colors.brand },
  prompt: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  none: { fontSize: 13, color: colors.textFaint, marginTop: 2 },
  answerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
  who: { fontSize: 14, color: colors.textMuted },
  value: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, flexShrink: 1, textAlign: 'right' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, flex: 1, paddingRight: 12 },
  sheetSection: { fontSize: 14, fontWeight: '800', color: colors.textSecondary, marginBottom: 10 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.textPrimary, minHeight: 48, textAlignVertical: 'top' },
  choiceBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.accentTeal },
  choiceBtnOn: { backgroundColor: colors.accentTeal },
  choiceText: { fontSize: 15, fontWeight: '700', color: colors.accentTeal },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, marginBottom: 8 },
  optionOn: { borderColor: colors.accentTeal, backgroundColor: 'rgba(79,209,197,0.16)' },
  optionText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  saveBtn: { backgroundColor: colors.accentTeal, borderRadius: 14, alignItems: 'center', justifyContent: 'center', height: 52, marginTop: 16 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  reqHint: { textAlign: 'center', fontSize: 12, color: '#EA580C', marginTop: 8 },
});
