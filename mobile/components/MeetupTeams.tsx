import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Alert, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useApiClient, meetupApi, Meetup } from '@/utils/api';
import { memberName } from '@/utils/assignments';

const TEAM_COLORS = ['#4FD1C5', '#F59E0B', '#6366F1', '#EF4444', '#10B981', '#EC4899', '#3B82F6', '#8B5CF6'];
const MAX_TEAMS = 8;

const idOf = (u: { _id: string } | string) => (typeof u === 'string' ? u : u._id);

interface Props {
  meetup: Meetup;
  currentUserId: string;
  canManage: boolean;
  onUpdated: (meetup: Meetup) => void;
}

export default function MeetupTeams({ meetup, currentUserId, canManage, onUpdated }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const teams = meetup.teams ?? [];
  const hasTeams = teams.some((t) => t.members.length > 0);
  const inIds = meetup.in.map(idOf);
  const enabled = meetup.group?.isPremium !== false;
  const showForManager = canManage && enabled && meetup.status === 'scheduled' && inIds.length >= 2;

  if (!enabled || (!hasTeams && !showForManager)) return null;

  const unassigned = inIds.filter((id) => !teams.some((t) => t.members.includes(id)));

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
          <Text style={styles.title}>Teams</Text>
        </TouchableOpacity>
        {showForManager && (
          <TouchableOpacity onPress={() => setSheetOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.action}>{hasTeams ? 'Edit teams' : 'Split into teams'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!collapsed && hasTeams && (
        <Animated.View entering={FadeIn.duration(200).delay(120)} exiting={FadeOut.duration(100)} style={{ marginTop: 10 }}>
          {teams.map((t, i) => (
            <View key={t._id ?? i} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <View style={[styles.dot, { backgroundColor: TEAM_COLORS[i % TEAM_COLORS.length] }]} />
                <Text style={styles.teamName}>{t.name}</Text>
                <Text style={styles.count}>{t.members.length}</Text>
              </View>
              <Text style={styles.members}>
                {t.members.length === 0
                  ? 'No one yet'
                  : t.members.map((id) => (id === currentUserId ? 'You' : memberName(meetup, id))).join(', ')}
              </Text>
            </View>
          ))}
          {unassigned.length > 0 && (
            <Text style={styles.unassigned}>
              Not on a team: {unassigned.map((id) => (id === currentUserId ? 'You' : memberName(meetup, id))).join(', ')}
            </Text>
          )}
        </Animated.View>
      )}

      {showForManager && (
        <TeamsSheet
          visible={sheetOpen}
          meetup={meetup}
          onClose={() => setSheetOpen(false)}
          onUpdated={onUpdated}
        />
      )}
    </Animated.View>
  );
}

function TeamsSheet({ visible, meetup, onClose, onUpdated }: {
  visible: boolean; meetup: Meetup; onClose: () => void; onUpdated: (m: Meetup) => void;
}) {
  const api = useApiClient();
  const inIds = meetup.in.map(idOf);
  const [names, setNames] = useState<string[]>([]);
  const [assign, setAssign] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const teams = meetup.teams ?? [];
    const count = Math.max(teams.length, 2);
    setNames(Array.from({ length: count }, (_, i) => teams[i]?.name ?? `Team ${i + 1}`));
    const map: Record<string, number> = {};
    teams.forEach((t, i) => t.members.forEach((id) => { map[id] = i; }));
    setAssign(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const setCount = (next: number) => {
    const n = Math.min(MAX_TEAMS, Math.max(2, next));
    setNames((cur) => Array.from({ length: n }, (_, i) => cur[i] ?? `Team ${i + 1}`));
    // anyone on a removed team becomes unassigned
    setAssign((cur) => Object.fromEntries(Object.entries(cur).filter(([, v]) => v < n)));
  };

  const shuffle = () => {
    const pool = [...inIds];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const map: Record<string, number> = {};
    pool.forEach((id, i) => { map[id] = i % names.length; });
    setAssign(map);
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await meetupApi.setTeams(api, meetup._id, {
        teams: names.map((name, i) => ({
          name: name.trim() || `Team ${i + 1}`,
          members: inIds.filter((id) => assign[id] === i),
        })),
      });
      if (result.meetup) onUpdated(result.meetup);
      onClose();
    } catch (err: any) {
      const data = err.response?.data;
      Alert.alert('Could not save', data?.message || data?.error || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      const result = await meetupApi.setTeams(api, meetup._id, { clear: true });
      if (result.meetup) onUpdated(result.meetup);
      onClose();
    } catch (err: any) {
      Alert.alert('Could not clear', err.response?.data?.error || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Teams</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity onPress={() => setCount(names.length - 1)} disabled={names.length <= 2} style={[styles.stepBtn, names.length <= 2 && styles.stepBtnOff]}>
                <Feather name="minus" size={16} color={names.length <= 2 ? '#D1D5DB' : '#4A90E2'} />
              </TouchableOpacity>
              <Text style={styles.stepCount}>{names.length} teams</Text>
              <TouchableOpacity onPress={() => setCount(names.length + 1)} disabled={names.length >= MAX_TEAMS} style={[styles.stepBtn, names.length >= MAX_TEAMS && styles.stepBtnOff]}>
                <Feather name="plus" size={16} color={names.length >= MAX_TEAMS ? '#D1D5DB' : '#4A90E2'} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={shuffle} style={styles.shuffleBtn}>
              <Feather name="shuffle" size={15} color="#fff" />
              <Text style={styles.shuffleText}>Shuffle</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.section}>Team names</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {names.map((n, i) => (
                <View key={i} style={[styles.nameBox, { borderColor: TEAM_COLORS[i % TEAM_COLORS.length] }]}>
                  <TextInput
                    value={n}
                    onChangeText={(t) => setNames((cur) => cur.map((x, xi) => (xi === i ? t : x)))}
                    maxLength={24}
                    style={styles.nameInput}
                  />
                </View>
              ))}
            </View>

            <Text style={styles.section}>Tap a number to put someone on a team</Text>
            {inIds.map((id) => (
              <View key={id} style={styles.personRow}>
                <Text style={styles.personName} numberOfLines={1}>{memberName(meetup, id)}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {names.map((_, i) => {
                    const on = assign[id] === i;
                    const color = TEAM_COLORS[i % TEAM_COLORS.length];
                    return (
                      <TouchableOpacity
                        key={i}
                        onPress={() => setAssign((cur) => {
                          const next = { ...cur };
                          if (on) delete next[id]; else next[id] = i;
                          return next;
                        })}
                        style={[styles.chip, { borderColor: color }, on && { backgroundColor: color }]}
                      >
                        <Text style={[styles.chipText, { color: on ? '#fff' : color }]}>{i + 1}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.5 }]}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save teams</Text>}
          </TouchableOpacity>
          {(meetup.teams?.length ?? 0) > 0 && (
            <TouchableOpacity onPress={clear} disabled={saving} style={{ alignItems: 'center', paddingTop: 12 }}>
              <Text style={{ color: '#EF4444', fontWeight: '600' }}>Remove teams</Text>
            </TouchableOpacity>
          )}
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
  dot: { width: 10, height: 10, borderRadius: 5 },
  teamName: { fontSize: 15, fontWeight: '800', color: '#111827' },
  count: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  members: { fontSize: 14, color: '#4B5563', lineHeight: 20, paddingLeft: 18 },
  unassigned: { fontSize: 13, color: '#9CA3AF' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  section: { fontSize: 12, fontWeight: '800', color: '#6B7280', marginBottom: 8 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EEF6FF', borderWidth: 1.5, borderColor: '#93C5FD', alignItems: 'center', justifyContent: 'center' },
  stepBtnOff: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' },
  stepCount: { fontSize: 16, fontWeight: '800', color: '#111827', minWidth: 64, textAlign: 'center' },
  shuffleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#4A90E2', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  shuffleText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  nameBox: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, minWidth: 96 },
  nameInput: { height: 38, fontSize: 14, fontWeight: '700', color: '#111827' },
  personRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, gap: 10 },
  personName: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  chip: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '800' },
  saveBtn: { backgroundColor: '#4FD1C5', borderRadius: 14, alignItems: 'center', justifyContent: 'center', height: 52, marginTop: 16 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
