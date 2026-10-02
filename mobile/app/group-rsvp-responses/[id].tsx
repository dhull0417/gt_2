import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import EmojiPicker from 'rn-emoji-keyboard';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolateColor } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useApiClient, groupApi } from '@/utils/api';
import { broadcastGroupUpdate, broadcastMeetupUpdate } from '@/utils/groupRealtime';
import { LoadingAnimation } from '@/components/LoadingAnimation';

type Status = 'in' | 'out';
interface Draft { key: string; _id?: string; status: Status; text: string; emoji: string }

const MAX_PER_STATUS = 20;
const ACCENT: Record<Status, string> = { in: '#4FD1C5', out: '#FF7A6E' };
const SUGGESTED: Record<Status, string[]> = {
  in: ['🎉', '🔥', '🚀', '🙌', '💪', '😎', '🤝', '⭐', '🍻', '🏆', '💥', '🥳'],
  out: ['😢', '😬', '🫡', '🙈', '💤', '🤒', '✌️', '🏖️', '😅', '👋', '🥲', '🫣'],
};
const newKey = () => `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Static look-alike of the popup players see (no movement). */
function ReactionCard({ status, emoji, text, onPress, onDelete, selected }: {
  status: Status; emoji: string; text: string; onPress?: () => void; onDelete?: () => void; selected?: boolean;
}) {
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.8 : 1} onPress={onPress} style={[styles.card, { borderColor: ACCENT[status] }, selected && styles.cardSelected]}>
      <Text style={styles.emoji}>{emoji || '🙂'}</Text>
      <Text style={[styles.cardText, { color: ACCENT[status] }]}>{text || 'Your catchphrase'}</Text>
      {onDelete && (
        <TouchableOpacity onPress={onDelete} style={styles.trash} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="trash-2" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

/** Two-sided slider: knob slides to I'm In (green) or I'm Out (red). */
function StatusSlider({ status, onChange, disabled }: { status: Status; onChange: (s: Status) => void; disabled?: boolean }) {
  const W = 220;
  const KNOB = W / 2 - 4;
  const pos = useSharedValue(status === 'in' ? 0 : 1);
  useEffect(() => { pos.value = withTiming(status === 'in' ? 0 : 1, { duration: 200 }); }, [status]);
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * (W - KNOB - 8) }],
    backgroundColor: interpolateColor(pos.value, [0, 1], [ACCENT.in, ACCENT.out]),
  }));
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(pos.value, [0, 1], ['#E6FAF8', '#FFECEA']),
  }));
  return (
    <TouchableOpacity activeOpacity={0.9} disabled={disabled} onPress={() => onChange(status === 'in' ? 'out' : 'in')} style={{ opacity: disabled ? 0.6 : 1 }}>
      <Animated.View style={[{ width: W, height: 44, borderRadius: 22, padding: 4, justifyContent: 'center' }, trackStyle]}>
        <Animated.View style={[{ position: 'absolute', left: 4, top: 4, width: KNOB, height: 36, borderRadius: 18 }, knobStyle]} />
        <View style={{ flexDirection: 'row' }} pointerEvents="none">
          <Text style={[styles.sliderLabel, { color: status === 'in' ? '#fff' : '#6B7280' }]}>I'm In</Text>
          <Text style={[styles.sliderLabel, { color: status === 'out' ? '#fff' : '#6B7280' }]}>I'm Out</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function GroupRsvpResponsesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { data: group, isLoading } = useGetGroupDetails(id);
  const isPremium = group?.isPremium === true;

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // composer
  const [composeStatus, setComposeStatus] = useState<Status | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [emoji, setEmoji] = useState('');
  const [text, setText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!group || loaded) return;
    setDrafts((group.rsvpResponses ?? []).map((r) => ({ key: newKey(), _id: r._id, status: r.status, text: r.text, emoji: r.emoji })));
    setLoaded(true);
  }, [group, loaded]);

  const openComposer = (status: Status, existing?: Draft) => {
    setComposeStatus(status);
    setEditingKey(existing?.key ?? null);
    setEmoji(existing?.emoji ?? SUGGESTED[status][0]);
    setText(existing?.text ?? '');
  };
  const closeComposer = () => { setComposeStatus(null); setEditingKey(null); setEmoji(''); setText(''); };

  const commit = () => {
    if (!composeStatus) return;
    if (!text.trim()) { Alert.alert('Add a catchphrase', 'Type what players will see.'); return; }
    if (!emoji.trim()) { Alert.alert('Pick an emoji', 'Choose or type an emoji.'); return; }
    if (editingKey) {
      setDrafts((cur) => cur.map((d) => (d.key === editingKey ? { ...d, text: text.trim(), emoji: emoji.trim() } : d)));
    } else {
      setDrafts((cur) => [...cur, { key: newKey(), status: composeStatus, text: text.trim(), emoji: emoji.trim() }]);
    }
    closeComposer();
  };

  const save = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await groupApi.updateRsvpResponses(api, id, drafts.map(({ _id, status, text: t, emoji: e }) => ({ _id, status, text: t, emoji: e })));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['groupDetails', id] }),
        queryClient.invalidateQueries({ queryKey: ['meetups'] }),
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

  if (isLoading || !group) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><LoadingAnimation /></View></SafeAreaView>;
  }

  const countOf = (st: Status) => drafts.filter((d) => d.status === st).length;
  const composerStatus: Status = composeStatus ?? 'in';
  const atLimit = countOf(composerStatus) >= MAX_PER_STATUS && !editingKey;
  // Newest first: new reactions are appended, so the list is shown reversed.
  const ordered = [...drafts].reverse();

  const composer = (
    <View style={styles.composer}>
      <Text style={styles.composerLabel}>{editingKey ? 'Edit reaction' : 'New reaction'}</Text>
      <View style={{ alignItems: 'center', marginTop: 12 }}>
        <StatusSlider status={composerStatus} onChange={(st) => { setComposeStatus(st); if (!editingKey) setEmoji((cur) => (SUGGESTED.in.includes(cur) || SUGGESTED.out.includes(cur) ? SUGGESTED[st][0] : cur)); }} disabled={!!editingKey} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {SUGGESTED[composerStatus].map((e) => (
          <TouchableOpacity key={e} onPress={() => setEmoji(e)} style={[styles.emojiChip, emoji === e && { borderColor: ACCENT[composerStatus], backgroundColor: '#F9FAFB' }]}>
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => setPickerOpen(true)} style={styles.emojiChip} accessibilityLabel="Search all emoji">
          <Feather name="search" size={20} color="#4A90E2" />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <TouchableOpacity
          onPress={() => setPickerOpen(true)}
          style={[styles.input, { width: 64, alignItems: 'center', justifyContent: 'center' }]}
          accessibilityLabel="Choose emoji"
        >
          <Text style={{ fontSize: 26 }}>{emoji || '🙂'}</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={text}
          onChangeText={setText}
          maxLength={80}
          placeholder={composerStatus === 'in' ? 'e.g. Look who showed up!' : "e.g. We'll miss you!"}
          placeholderTextColor="#9CA3AF"
        />
      </View>
      <Text style={[styles.composerLabel, { marginTop: 14 }]}>Preview</Text>
      <ReactionCard status={composerStatus} emoji={emoji} text={text} />
      {atLimit && <Text style={[styles.hint, { color: '#EF4444' }]}>That's the most you can add for {composerStatus === 'in' ? "I'm In" : "I'm Out"} ({MAX_PER_STATUS}).</Text>}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <TouchableOpacity onPress={closeComposer} style={[styles.btn, { backgroundColor: '#F3F4F6' }]}><Text style={[styles.btnText, { color: '#6B7280' }]}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity onPress={commit} disabled={atLimit} style={[styles.btn, { backgroundColor: ACCENT[composerStatus] }, atLimit && { opacity: 0.4 }]}><Text style={styles.btnText}>{editingKey ? 'Update' : 'Add'}</Text></TouchableOpacity>
      </View>
    </View>
  );

  const body = (
    <View>
      {composeStatus ? composer : (
        <TouchableOpacity onPress={() => openComposer('in')} style={[styles.addBtn, { marginTop: 18 }]}>
          <Feather name="plus-circle" size={18} color="#4A90E2" />
          <Text style={{ color: '#4A90E2', fontWeight: '700', fontSize: 15 }}>Add reaction</Text>
        </TouchableOpacity>
      )}

      <View style={{ marginTop: 22 }}>
        {ordered.length === 0 ? (
          <Text style={styles.hint}>No reactions yet, so the app's built-in ones play. Once you add any for I'm In or I'm Out, only yours play for that choice.</Text>
        ) : (
          <>
            <View style={styles.legend}>
              <View style={[styles.legendDot, { backgroundColor: ACCENT.in }]} /><Text style={styles.legendText}>I'm In</Text>
              <View style={[styles.legendDot, { backgroundColor: ACCENT.out, marginLeft: 14 }]} /><Text style={styles.legendText}>I'm Out</Text>
            </View>
            {ordered.map((d) => (
              <ReactionCard
                key={d.key}
                status={d.status}
                emoji={d.emoji}
                text={d.text}
                selected={editingKey === d.key}
                onPress={() => openComposer(d.status, d)}
                onDelete={() => { if (editingKey === d.key) closeComposer(); setDrafts((cur) => cur.filter((x) => x.key !== d.key)); }}
              />
            ))}
          </>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={24} color="#6B7280" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>RSVP Reactions</Text>
        <TouchableOpacity onPress={save} disabled={saving || !isPremium} style={{ minWidth: 40, alignItems: 'flex-end' }}>
          {saving ? <ActivityIndicator size="small" color="#4A90E2" /> : <Text style={[styles.saveText, !isPremium && { opacity: 0.4 }]}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}>
          <Text style={styles.sub}>
            Create your own catchphrase and emoji for the popup that plays when a member of {group.name} taps I'm In or I'm Out. Once you've made any for In or Out, only yours play for that choice.
          </Text>
          {!isPremium ? (
            <View style={styles.lockRow}>
              <Feather name="lock" size={16} color="#9CA3AF" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.lockTitle}>Premium</Text>
                <Text style={styles.lockText}>Custom RSVP reactions require the group owner to have Premium.</Text>
              </View>
            </View>
          ) : (
            <>
              {body}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <EmojiPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onEmojiSelected={(item) => setEmoji(item.emoji)}
        enableSearchBar
        enableRecentlyUsed
        defaultHeight="75%"
        expandedHeight="90%"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  saveText: { fontSize: 16, fontWeight: '800', color: '#4A90E2' },
  sub: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginTop: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 22, marginBottom: 10 },
  hint: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginBottom: 10 },
  // Matches RsvpResponseOverlay's card.
  card: {
    backgroundColor: 'white', borderRadius: 28, borderWidth: 3, paddingVertical: 28, paddingHorizontal: 28,
    alignItems: 'center', marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4,
  },
  cardSelected: { opacity: 0.6 },
  emoji: { fontSize: 56, marginBottom: 14 },
  cardText: { fontSize: 19, fontWeight: '900', textAlign: 'center', lineHeight: 26 },
  trash: { position: 'absolute', top: 12, right: 14 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#93C5FD', backgroundColor: '#fff' },
  composer: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 14 },
  composerLabel: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  emojiChip: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  input: { height: 48, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, fontSize: 15, color: '#111827', backgroundColor: '#fff' },
  sliderLabel: { flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 14 },
  legend: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  btn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  lockRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginTop: 16 },
  lockTitle: { fontSize: 13, fontWeight: '800', color: '#374151' },
  lockText: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
});
