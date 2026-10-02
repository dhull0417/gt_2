import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Switch, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useApiClient, groupApi, PriorityTierDef, User } from '@/utils/api';
import { broadcastGroupUpdate, broadcastMeetupUpdate } from '@/utils/groupRealtime';
import { getUserDisplayName } from '@/utils/groupDisplay';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import DraggableList from '@/components/DraggableList';
import NativeTimePicker from '@/components/NativeTimePicker';

const ROW_H = 60;
const DIV_H = 40;
const MAX_TIERS = 20;

interface TierDraft { key: string; size: string; hours: string }

const newKey = () => `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const minutesToHoursText = (minutes: number) => {
  const h = minutes / 60;
  return Number.isInteger(h) ? String(h) : String(Math.round(h * 100) / 100);
};

const parseHours = (text: string): number | null => {
  const n = parseFloat(text);
  if (!isFinite(n) || n <= 0) return null;
  const minutes = Math.round(n * 60);
  return minutes >= 1 && minutes <= 7 * 24 * 60 ? minutes : null;
};

const formatWindow = (text: string) => {
  const minutes = parseHours(text);
  if (minutes === null) return '?';
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export default function GroupPriorityScreen() {
  const { id, scheduleId } = useLocalSearchParams<{ id: string; scheduleId: string }>();
  const router = useRouter();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { data: group, isLoading } = useGetGroupDetails(id);

  const schedule = useMemo(() => group?.schedules?.find((s) => s._id === scheduleId) ?? null, [group, scheduleId]);

  const [enabled, setEnabled] = useState(false);
  const [tiers, setTiers] = useState<TierDraft[]>([{ key: newKey(), size: '5', hours: '12' }]);
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState('10:00 PM');
  const [quietEnd, setQuietEnd] = useState('08:00 AM');
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const membersById = useMemo(() => {
    const map = new Map<string, User>();
    (group?.members ?? []).forEach((m) => map.set(m._id, m));
    return map;
  }, [group?.members]);

  // Load the saved setup once the group arrives. Ranked members come first (in saved
  // order), then everyone else alphabetically.
  useEffect(() => {
    if (!group || !schedule || loaded) return;
    setEnabled(!!schedule.priorityEnabled);
    if (schedule.priorityTiers?.length) {
      setTiers(schedule.priorityTiers.map((t) => ({ key: newKey(), size: String(t.size), hours: minutesToHoursText(t.windowMinutes) })));
    }
    if (schedule.priorityQuiet) {
      setQuietEnabled(!!schedule.priorityQuiet.enabled);
      setQuietStart(schedule.priorityQuiet.start || '10:00 PM');
      setQuietEnd(schedule.priorityQuiet.end || '08:00 AM');
    }
    const saved = (schedule.priorityOrder ?? []).filter((mid) => membersById.has(mid));
    const savedSet = new Set(saved);
    const rest = group.members
      .filter((m) => !savedSet.has(m._id))
      .sort((a, b) => getUserDisplayName(a).localeCompare(getUserDisplayName(b)))
      .map((m) => m._id);
    setOrderIds([...saved, ...rest]);
    setLoaded(true);
  }, [group, schedule, loaded, membersById]);

  const noRsvpWindow = schedule ? schedule.generationLeadDays == null : false;
  const isPremium = group?.isPremium === true;

  // ── Layout: which slots belong to which group, and where dividers sit ───────
  const layout = useMemo(() => {
    const n = orderIds.length;
    const sizes = tiers.map((t) => Math.max(0, parseInt(t.size, 10) || 0));
    const slotTops: number[] = [];
    const decorations: { key: string; top: number; height: number; node: React.ReactNode }[] = [];
    let top = 0;
    let pos = 0;
    tiers.forEach((t, k) => {
      const count = Math.max(0, Math.min(sizes[k], n - pos));
      if (count === 0) return;
      decorations.push({
        key: `tier-${t.key}`,
        top,
        height: DIV_H,
        node: (
          <View style={styles.divider}>
            <Text style={styles.dividerTitle}>Group {k + 1}</Text>
            <Text style={styles.dividerSub}>
              {count} {count === 1 ? 'person' : 'people'} · {formatWindow(t.hours)}{quietEnabled ? ' awake time' : ''} to RSVP first
            </Text>
          </View>
        ),
      });
      top += DIV_H;
      for (let i = 0; i < count; i++) { slotTops.push(top); top += ROW_H; }
      pos += count;
    });
    if (pos < n) {
      decorations.push({
        key: 'everyone',
        top,
        height: DIV_H,
        node: (
          <View style={[styles.divider, { backgroundColor: '#F3F4F6' }]}>
            <Text style={[styles.dividerTitle, { color: '#6B7280' }]}>Everyone else</Text>
            <Text style={styles.dividerSub}>Opens at the normal RSVP time</Text>
          </View>
        ),
      });
      top += DIV_H;
      for (; pos < n; pos++) { slotTops.push(top); top += ROW_H; }
    }
    return { slotTops, decorations, height: top };
  }, [orderIds.length, tiers, quietEnabled]);

  const rankOf = (index: number) => index + 1;

  const tierErrors = (): string | null => {
    if (tiers.length === 0) return 'Add at least one group.';
    for (let k = 0; k < tiers.length; k++) {
      const size = parseInt(tiers[k].size, 10);
      if (!Number.isInteger(size) || size < 1) return `Group ${k + 1} needs at least 1 person.`;
      if (parseHours(tiers[k].hours) === null) return `Group ${k + 1} needs a time between a minute and 7 days.`;
    }
    return null;
  };
  const error = enabled ? tierErrors() : null;

  const save = async () => {
    if (!id || !scheduleId) return;
    if (enabled && error) { Alert.alert('Check your groups', error); return; }
    setSaving(true);
    try {
      const body = enabled
        ? {
            enabled: true,
            order: orderIds,
            tiers: tiers.map<PriorityTierDef>((t) => ({ size: parseInt(t.size, 10), windowMinutes: parseHours(t.hours)! })),
            quiet: { enabled: quietEnabled, start: quietStart, end: quietEnd },
          }
        : { enabled: false };
      await groupApi.updateSchedulePriority(api, id, scheduleId, body);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['groupDetails', id] }),
        queryClient.invalidateQueries({ queryKey: ['meetups'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
      ]);
      broadcastGroupUpdate(getToken, id);
      broadcastMeetupUpdate(getToken, id);
      router.back();
    } catch (err: any) {
      const data = err.response?.data;
      const status = err.response?.status;
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

  const header = (
    <View>
      <Text style={styles.sub}>
        Give some members a head start on RSVPing to "{schedule.name}". Rank members below, then choose how many people are in each group and how long each group gets before the next one opens.
      </Text>

      {!isPremium ? (
        <View style={styles.lockRow}>
          <Feather name="lock" size={16} color="#9CA3AF" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.lockTitle}>Premium</Text>
            <Text style={styles.lockText}>Priority RSVP requires the group owner to have Premium.</Text>
          </View>
        </View>
      ) : noRsvpWindow ? (
        <View style={styles.lockRow}>
          <Feather name="info" size={16} color="#9CA3AF" style={{ marginTop: 1 }} />
          <Text style={[styles.lockText, { flex: 1 }]}>
            Turn on "Limit RSVPs" and set when RSVPs open in this series' settings first. Priority groups open ahead of that time.
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.card, { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <Text style={styles.cardTitle}>Priority RSVP</Text>
            <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: '#4FD1C5' }} />
          </View>

          {enabled && (
            <>
              <Text style={styles.sectionLabel}>Groups</Text>
              <View style={styles.card}>
                {tiers.map((t, k) => (
                  <View key={t.key} style={[styles.tierRow, k > 0 && { borderTopWidth: 1, borderTopColor: '#F3F4F6' }]}>
                    <Text style={styles.tierName}>Group {k + 1}</Text>
                    <TextInput
                      style={styles.numInput}
                      keyboardType="number-pad"
                      value={t.size}
                      maxLength={3}
                      onChangeText={(v) => setTiers((cur) => cur.map((x) => (x.key === t.key ? { ...x, size: v.replace(/[^0-9]/g, '') } : x)))}
                    />
                    <Text style={styles.tierUnit}>{t.size === '1' ? 'person' : 'people'}</Text>
                    <TextInput
                      style={[styles.numInput, { width: 58 }]}
                      keyboardType="decimal-pad"
                      value={t.hours}
                      maxLength={5}
                      onChangeText={(v) => setTiers((cur) => cur.map((x) => (x.key === t.key ? { ...x, hours: v.replace(/[^0-9.]/g, '') } : x)))}
                    />
                    <Text style={styles.tierUnit}>hours</Text>
                    {tiers.length > 1 && (
                      <TouchableOpacity
                        onPress={() => setTiers((cur) => cur.filter((x) => x.key !== t.key))}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ marginLeft: 'auto' }}
                      >
                        <Feather name="trash-2" size={16} color="#9CA3AF" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {tiers.length < MAX_TIERS && (
                  <TouchableOpacity
                    onPress={() => setTiers((cur) => [...cur, { key: newKey(), size: '1', hours: '1' }])}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 12 }}
                  >
                    <Feather name="plus-circle" size={16} color="#4A90E2" />
                    <Text style={{ color: '#4A90E2', fontWeight: '700', fontSize: 14 }}>Add group</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.hint}>
                The hours are how long that group has to RSVP before the next group opens. Use groups of 1 to rank people one by one. The moment everyone in a group has answered, the next group opens automatically.
              </Text>
              {error && <Text style={styles.errorText}>{error}</Text>}

              <View style={[styles.card, { marginTop: 16 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.cardTitle}>Quiet hours</Text>
                    <Text style={styles.hint}>Don't count these hours, so no one's turn passes while they sleep.</Text>
                  </View>
                  <Switch value={quietEnabled} onValueChange={setQuietEnabled} trackColor={{ true: '#4FD1C5' }} />
                </View>
                {quietEnabled && (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity style={styles.timeBtn} onPress={() => setPicker('start')}>
                      <Text style={styles.timeLabel}>From</Text>
                      <Text style={styles.timeValue}>{quietStart}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.timeBtn} onPress={() => setPicker('end')}>
                      <Text style={styles.timeLabel}>Until</Text>
                      <Text style={styles.timeValue}>{quietEnd}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <Text style={styles.sectionLabel}>Priority order</Text>
              <Text style={[styles.hint, { marginTop: 0, marginBottom: 10 }]}>Press and hold a member, then drag to reorder. Higher up means higher priority; it also decides who keeps their spot if a meetup fills up.</Text>
            </>
          )}
        </>
      )}
    </View>
  );

  const showList = enabled && isPremium && !noRsvpWindow;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={24} color="#6B7280" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Priority RSVP</Text>
        <TouchableOpacity onPress={save} disabled={saving || !isPremium || noRsvpWindow} style={{ minWidth: 40, alignItems: 'flex-end' }}>
          {saving
            ? <ActivityIndicator size="small" color="#4A90E2" />
            : <Text style={[styles.saveText, (!isPremium || noRsvpWindow) && { opacity: 0.4 }]}>Save</Text>}
        </TouchableOpacity>
      </View>

      <DraggableList
        data={showList ? orderIds.map((mid) => ({ id: mid })) : []}
        rowHeight={ROW_H}
        slotTops={showList ? layout.slotTops : []}
        contentHeight={showList ? layout.height : 0}
        decorations={showList ? layout.decorations : []}
        onReorder={setOrderIds}
        header={header}
        footer={<View style={{ height: 120 }} />}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        renderRow={(item, index) => {
          const m = membersById.get(item.id);
          return (
            <View style={styles.row}>
              <View style={styles.rank}><Text style={styles.rankText}>{rankOf(index)}</Text></View>
              {m?.profilePicture
                ? <Image source={{ uri: m.profilePicture }} style={styles.avatar} />
                : <View style={[styles.avatar, { backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }]}><Feather name="user" size={16} color="#9CA3AF" /></View>}
              <Text style={styles.rowName} numberOfLines={1}>{m ? getUserDisplayName(m) : 'Member'}</Text>
              <Feather name="menu" size={18} color="#C4C9D4" />
            </View>
          );
        }}
      />

      {picker && (
        <NativeTimePicker
          value={picker === 'start' ? quietStart : quietEnd}
          onChange={(t) => (picker === 'start' ? setQuietStart(t) : setQuietEnd(t))}
          onClose={() => setPicker(null)}
        />
      )}
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
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', padding: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  hint: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginTop: 6 },
  errorText: { fontSize: 12, fontWeight: '600', color: '#EF4444', marginTop: 6 },
  lockRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginTop: 16 },
  lockTitle: { fontSize: 13, fontWeight: '800', color: '#374151' },
  lockText: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  tierName: { fontSize: 14, fontWeight: '700', color: '#374151', width: 64 },
  numInput: { width: 46, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', textAlign: 'center', fontSize: 15, color: '#111827', backgroundColor: '#fff' },
  tierUnit: { fontSize: 13, color: '#6B7280' },
  timeBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: 8, paddingHorizontal: 12 },
  timeLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase' },
  timeValue: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 2 },
  divider: { flex: 1, borderRadius: 10, backgroundColor: '#ECFDF5', paddingHorizontal: 12, justifyContent: 'center', marginBottom: 4 },
  dividerTitle: { fontSize: 13, fontWeight: '800', color: '#047857' },
  dividerSub: { fontSize: 11, color: '#6B7280' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, marginBottom: 6 },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 13, fontWeight: '800', color: '#0F766E' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  rowName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827' },
});
