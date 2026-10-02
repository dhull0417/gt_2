import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert, ActivityIndicator, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useApiClient, groupApi, userApi, GroupStats, User } from '@/utils/api';
import { LoadingAnimation } from '@/components/LoadingAnimation';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const nameOf = (m: { firstName?: string; lastName?: string }) => `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || 'Member';

export default function GroupStatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApiClient();
  const { data: group, isLoading: loadingGroup } = useGetGroupDetails(id);
  const { data: currentUser } = useQuery<User, Error>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
  const [exporting, setExporting] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const isPremium = group?.isPremium === true;
  const canExport = useMemo(() => {
    if (!group || !currentUser) return false;
    const me = currentUser._id;
    const ownerId = typeof group.owner === 'string' ? group.owner : (group.owner as any)?._id;
    return ownerId === me || (group.moderators ?? []).some((m: any) => (m?._id ?? m) === me);
  }, [group, currentUser]);

  const { data: stats, isLoading, error, refetch } = useQuery<GroupStats, any>({
    queryKey: ['groupStats', id],
    queryFn: () => groupApi.getGroupStats(api, id!),
    enabled: !!id && isPremium,
  });

  const exportCsv = async () => {
    if (!id) return;
    setExporting(true);
    try {
      const { filename, csv } = await groupApi.exportGroupAttendance(api, id);
      await Share.share({ title: filename, message: csv });
    } catch (e: any) {
      const data = e?.response?.data;
      Alert.alert('Could not export', data?.message || data?.error || 'Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const header = (
    <View style={styles.headerBar}>
      <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
        <Feather name="arrow-left" size={24} color="#6B7280" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Stats & Attendance</Text>
      {canExport && isPremium && stats ? (
        <TouchableOpacity onPress={exportCsv} disabled={exporting} style={{ minWidth: 40, alignItems: 'flex-end' }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {exporting ? <ActivityIndicator size="small" color="#4A90E2" /> : <Feather name="download" size={22} color="#4A90E2" />}
        </TouchableOpacity>
      ) : <View style={{ width: 40 }} />}
    </View>
  );

  if (loadingGroup || !group) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><LoadingAnimation /></View></SafeAreaView>;
  }

  if (!isPremium) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={[styles.lockRow, { margin: 20 }]}>
          <Feather name="lock" size={16} color="#9CA3AF" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.lockTitle}>Premium</Text>
            <Text style={styles.lockText}>Attendance stats, history and CSV export require the group owner to have Premium.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return <SafeAreaView style={styles.safe}>{header}<View style={styles.center}><LoadingAnimation /></View></SafeAreaView>;
  }

  if (error || !stats) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}>
          <Text style={{ color: '#6B7280', marginBottom: 12 }}>Could not load stats.</Text>
          <TouchableOpacity onPress={() => refetch()}><Text style={{ color: '#4A90E2', fontWeight: '700' }}>Try again</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { summary, members, meetups } = stats;
  const ranked = members.filter((m) => m.eligible > 0);
  const visibleMeetups = showAll ? meetups : meetups.slice(0, 8);

  return (
    <SafeAreaView style={styles.safe}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
        <Text style={styles.sub}>
          Attendance counts "I'm In" on meetups that have happened. History for {group.name} builds up from when stats were turned on.
        </Text>

        {summary.totalMeetups === 0 ? (
          <View style={[styles.card, { marginTop: 16 }]}>
            <Text style={{ color: '#6B7280', lineHeight: 20 }}>
              No finished meetups yet. Once a meetup has happened, its attendance shows up here.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.tiles}>
              <View style={styles.tile}><Text style={styles.tileValue}>{summary.totalMeetups}</Text><Text style={styles.tileLabel}>Meetups held</Text></View>
              <View style={styles.tile}><Text style={styles.tileValue}>{summary.averageHeadcount}</Text><Text style={styles.tileLabel}>Avg. headcount</Text></View>
              <View style={styles.tile}>
                <Text style={styles.tileValue}>{summary.averageFill === null ? '—' : pct(summary.averageFill)}</Text>
                <Text style={styles.tileLabel}>Avg. filled</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Members</Text>
            <View style={styles.card}>
              {ranked.map((m, i) => (
                <View key={m._id} style={[styles.memberRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#F3F4F6' }]}>
                  {m.profilePicture
                    ? <Image source={{ uri: m.profilePicture }} style={styles.avatar} />
                    : <View style={[styles.avatar, { backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }]}><Feather name="user" size={16} color="#9CA3AF" /></View>}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName} numberOfLines={1}>{nameOf(m)}</Text>
                    <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round(m.rate * 100)}%` }]} /></View>
                    <Text style={styles.memberSub}>
                      {m.attended} of {m.eligible} · {m.declined} out · {m.noResponse} no reply
                      {m.streak >= 2 ? ` · ${m.streak} in a row` : ''}
                    </Text>
                  </View>
                  <Text style={styles.rate}>{pct(m.rate)}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionLabel}>History</Text>
            <View style={styles.card}>
              {visibleMeetups.map((m, i) => (
                <View key={m.id} style={[styles.histRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#F3F4F6' }]}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
                    <Text style={styles.memberSub}>{new Date(m.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                  </View>
                  <Text style={styles.histCount}>
                    {m.in + m.guests}{m.capacity > 0 ? `/${m.capacity}` : ''} <Text style={styles.memberSub}>in</Text>
                  </Text>
                </View>
              ))}
              {meetups.length > 8 && (
                <TouchableOpacity onPress={() => setShowAll((v) => !v)} style={{ paddingTop: 12 }}>
                  <Text style={{ color: '#4A90E2', fontWeight: '700', textAlign: 'center' }}>{showAll ? 'Show less' : `Show all ${meetups.length}`}</Text>
                </TouchableOpacity>
              )}
            </View>

            {canExport && (
              <TouchableOpacity onPress={exportCsv} disabled={exporting} style={styles.exportBtn}>
                {exporting ? <ActivityIndicator color="#4A90E2" /> : (<><Feather name="download" size={18} color="#4A90E2" /><Text style={styles.exportText}>Export attendance (CSV)</Text></>)}
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 13, color: '#6B7280', lineHeight: 19, marginTop: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 22, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', padding: 14 },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 16 },
  tile: { flex: 1, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: 14, alignItems: 'center' },
  tileValue: { fontSize: 24, fontWeight: '900', color: '#111827' },
  tileLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', marginTop: 2 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  memberName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  memberSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#F3F4F6', marginTop: 5, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#4FD1C5' },
  rate: { fontSize: 16, fontWeight: '800', color: '#0F766E', minWidth: 46, textAlign: 'right' },
  histRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  histCount: { fontSize: 16, fontWeight: '800', color: '#111827' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 22, borderRadius: 14, borderWidth: 1.5, borderColor: '#93C5FD', backgroundColor: '#fff' },
  exportText: { color: '#4A90E2', fontWeight: '700', fontSize: 15 },
  lockRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 12 },
  lockTitle: { fontSize: 13, fontWeight: '800', color: '#374151' },
  lockText: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
});
