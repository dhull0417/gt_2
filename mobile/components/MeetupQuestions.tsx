import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Alert, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useApiClient, meetupApi, Meetup } from '@/utils/api';
import { questionsActive, answerFor, hasAnsweredAny, displayAnswer } from '@/utils/questions';
import { memberName } from '@/utils/assignments';

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
        <TouchableOpacity
          onPress={() => setCollapsed((c) => !c)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 0, right: 8 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}
        >
          <Feather name={collapsed ? 'chevron-right' : 'chevron-down'} size={16} color="#9CA3AF" />
          <Text style={styles.title}>Questions</Text>
        </TouchableOpacity>
        {canAnswer && (
          <TouchableOpacity onPress={() => setSheetOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.action}>{answered ? 'Edit mine' : 'Answer'}</Text>
          </TouchableOpacity>
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{meetup.name}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color="#6B7280" />
            </TouchableOpacity>
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
                    placeholderTextColor="#9CA3AF"
                    maxLength={300}
                    multiline
                    style={styles.input}
                  />
                )}
                {q.type === 'yesno' && (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {(['yes', 'no'] as const).map((v) => (
                      <TouchableOpacity
                        key={v}
                        onPress={() => set(q._id, values[q._id] === v ? '' : v)}
                        style={[styles.choiceBtn, values[q._id] === v && styles.choiceBtnOn]}
                      >
                        <Text style={[styles.choiceText, values[q._id] === v && { color: '#fff' }]}>{v === 'yes' ? 'Yes' : 'No'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {q.type === 'choice' && q.options.map((o) => {
                  const on = values[q._id] === o;
                  return (
                    <TouchableOpacity
                      key={o}
                      onPress={() => set(q._id, on ? '' : o)}
                      style={[styles.option, on && styles.optionOn]}
                    >
                      <Feather name={on ? 'check-circle' : 'circle'} size={20} color={on ? '#4FD1C5' : '#9CA3AF'} />
                      <Text style={styles.optionText}>{o}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            onPress={save}
            disabled={saving || missingRequired}
            style={[styles.saveBtn, (saving || missingRequired) && { opacity: 0.5 }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
          </TouchableOpacity>
          {missingRequired && <Text style={styles.reqHint}>Answer the questions marked * to save.</Text>}
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingTop: 12 }}>
            <Text style={{ color: '#6B7280', fontWeight: '600' }}>Not now</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 14, marginTop: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  action: { fontSize: 14, fontWeight: '700', color: '#4A90E2' },
  prompt: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 4 },
  none: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  answerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
  who: { fontSize: 14, color: '#6B7280' },
  value: { fontSize: 14, fontWeight: '600', color: '#111827', flexShrink: 1, textAlign: 'right' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#111827', flex: 1, paddingRight: 12 },
  sheetSection: { fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 10 },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 16, color: '#111827', minHeight: 48, textAlignVertical: 'top' },
  choiceBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#4FD1C5' },
  choiceBtnOn: { backgroundColor: '#4FD1C5' },
  choiceText: { fontSize: 15, fontWeight: '700', color: '#4FD1C5' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 8 },
  optionOn: { borderColor: '#4FD1C5', backgroundColor: '#F0FDFA' },
  optionText: { fontSize: 16, fontWeight: '600', color: '#111827', flex: 1 },
  saveBtn: { backgroundColor: '#4FD1C5', borderRadius: 14, alignItems: 'center', justifyContent: 'center', height: 52, marginTop: 16 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  reqHint: { textAlign: 'center', fontSize: 12, color: '#EA580C', marginTop: 8 },
});
