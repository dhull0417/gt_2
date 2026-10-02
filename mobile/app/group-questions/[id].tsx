import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Switch, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useApiClient, groupApi, RsvpQuestion } from '@/utils/api';
import { broadcastGroupUpdate, broadcastMeetupUpdate } from '@/utils/groupRealtime';
import { LoadingAnimation } from '@/components/LoadingAnimation';

const MAX_QUESTIONS = 5;
const TYPE_LABELS: Record<RsvpQuestion['type'], string> = { text: 'Text', choice: 'Choices', yesno: 'Yes / No' };

interface Draft {
  key: string;
  _id?: string;
  prompt: string;
  type: RsvpQuestion['type'];
  options: string[];
  required: boolean;
}

const newKey = () => `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const blank = (): Draft => ({ key: newKey(), prompt: '', type: 'text', options: ['', ''], required: false });

export default function GroupQuestionsScreen() {
  const { id, scheduleId } = useLocalSearchParams<{ id: string; scheduleId: string }>();
  const router = useRouter();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { data: group, isLoading } = useGetGroupDetails(id);

  const schedule = useMemo(() => group?.schedules?.find((s) => s._id === scheduleId) ?? null, [group, scheduleId]);
  const isPremium = group?.isPremium === true;

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!schedule || loaded) return;
    setDrafts((schedule.defaultQuestions ?? []).map((q) => ({
      key: newKey(), _id: q._id, prompt: q.prompt, type: q.type,
      options: q.type === 'choice' ? [...q.options] : ['', ''], required: q.required,
    })));
    setLoaded(true);
  }, [schedule, loaded]);

  const patch = (key: string, p: Partial<Draft>) => setDrafts((cur) => cur.map((d) => (d.key === key ? { ...d, ...p } : d)));

  const problem = (): string | null => {
    for (const [i, d] of drafts.entries()) {
      if (!d.prompt.trim()) return `Question ${i + 1} needs some text.`;
      if (d.type === 'choice' && d.options.map((o) => o.trim()).filter(Boolean).length < 2) {
        return `"${d.prompt.trim()}" needs at least 2 choices.`;
      }
    }
    return null;
  };

  const save = async () => {
    if (!id || !scheduleId) return;
    const err = problem();
    if (err) { Alert.alert('Check your questions', err); return; }
    setSaving(true);
    try {
      await groupApi.updateScheduleQuestions(api, id, scheduleId, drafts.map((d) => ({
        _id: d._id,
        prompt: d.prompt.trim(),
        type: d.type,
        options: d.type === 'choice' ? d.options.map((o) => o.trim()).filter(Boolean) : [],
        required: d.required,
      })));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['groupDetails', id] }),
        queryClient.invalidateQueries({ queryKey: ['meetups'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
      ]);
      broadcastGroupUpdate(getToken, id);
      broadcastMeetupUpdate(getToken, id);
      router.back();
    } catch (e: any) {
      const data = e.response?.data;
      const status = e.response?.status;
      const detail =
        (typeof data === 'object' && (data?.message || data?.error)) ||
        (status === 404 ? "The server doesn't have this feature yet (it may need to be deployed)." : null) ||
        (status ? `The server responded with an error (${status}).` : 'Could not reach the server. Check your connection.');
      Alert.alert('Could not save', detail);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !group || !schedule) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><LoadingAnimation /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={24} color="#6B7280" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>RSVP Questions</Text>
        <TouchableOpacity onPress={save} disabled={saving || !isPremium} style={{ minWidth: 40, alignItems: 'flex-end' }}>
          {saving
            ? <ActivityIndicator size="small" color="#4A90E2" />
            : <Text style={[styles.saveText, !isPremium && { opacity: 0.4 }]}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}>
          <Text style={styles.sub}>
            Ask members something when they RSVP "I'm In" to "{schedule.name}". Everyone going can see the answers on the meetup. Up to {MAX_QUESTIONS} questions.
          </Text>

          {!isPremium ? (
            <View style={styles.lockRow}>
              <Feather name="lock" size={16} color="#9CA3AF" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.lockTitle}>Premium</Text>
                <Text style={styles.lockText}>Custom RSVP questions require the group owner to have Premium.</Text>
              </View>
            </View>
          ) : (
            <>
              {drafts.map((d, i) => (
                <View key={d.key} style={[styles.card, { marginTop: 14 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={styles.qLabel}>Question {i + 1}</Text>
                    <TouchableOpacity onPress={() => setDrafts((cur) => cur.filter((x) => x.key !== d.key))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name="trash-2" size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={d.prompt}
                    onChangeText={(t) => patch(d.key, { prompt: t })}
                    placeholder="e.g. Any dietary restrictions?"
                    placeholderTextColor="#9CA3AF"
                    maxLength={140}
                  />

                  <View style={styles.segment}>
                    {(Object.keys(TYPE_LABELS) as RsvpQuestion['type'][]).map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => patch(d.key, { type: t })}
                        style={[styles.segBtn, d.type === t && styles.segBtnOn]}
                      >
                        <Text style={[styles.segText, d.type === t && { color: '#fff' }]}>{TYPE_LABELS[t]}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {d.type === 'choice' && (
                    <View style={{ marginTop: 10 }}>
                      {d.options.map((o, oi) => (
                        <View key={oi} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <TextInput
                            style={[styles.input, { flex: 1 }]}
                            value={o}
                            onChangeText={(t) => patch(d.key, { options: d.options.map((x, xi) => (xi === oi ? t : x)) })}
                            placeholder={`Choice ${oi + 1}`}
                            placeholderTextColor="#9CA3AF"
                            maxLength={60}
                          />
                          {d.options.length > 2 && (
                            <TouchableOpacity onPress={() => patch(d.key, { options: d.options.filter((_, xi) => xi !== oi) })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Feather name="x" size={18} color="#9CA3AF" />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                      {d.options.length < 10 && (
                        <TouchableOpacity onPress={() => patch(d.key, { options: [...d.options, ''] })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Feather name="plus-circle" size={16} color="#4A90E2" />
                          <Text style={{ color: '#4A90E2', fontWeight: '700', fontSize: 14 }}>Add choice</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>Required</Text>
                    <Switch value={d.required} onValueChange={(v) => patch(d.key, { required: v })} trackColor={{ true: '#4FD1C5' }} />
                  </View>
                </View>
              ))}

              {drafts.length < MAX_QUESTIONS && (
                <TouchableOpacity onPress={() => setDrafts((cur) => [...cur, blank()])} style={styles.addBtn}>
                  <Feather name="plus-circle" size={18} color="#4A90E2" />
                  <Text style={{ color: '#4A90E2', fontWeight: '700', fontSize: 15 }}>Add question</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.hint}>
                Required questions must be answered to save the answers sheet, but members can still skip it and answer later. Removing a question deletes its answers.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  saveText: { fontSize: 16, fontWeight: '800', color: '#4A90E2' },
  sub: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', padding: 14 },
  qLabel: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, fontSize: 15, color: '#111827', backgroundColor: '#fff' },
  segment: { flexDirection: 'row', gap: 8, marginTop: 10 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: '#4FD1C5' },
  segBtnOn: { backgroundColor: '#4FD1C5' },
  segText: { fontSize: 13, fontWeight: '700', color: '#4FD1C5' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#93C5FD', backgroundColor: '#fff' },
  hint: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginTop: 10 },
  lockRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginTop: 16 },
  lockTitle: { fontSize: 13, fontWeight: '800', color: '#374151' },
  lockText: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
});
