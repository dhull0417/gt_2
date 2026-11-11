// Saved strength rankings for teams & tournaments (owners and moderators, Premium, up to 10).
import React, { useMemo, useState } from 'react';
import { OfflineEmptyState } from '@/components/OfflineEmptyState';
import { isOfflineEmpty } from '@/utils/offlineState';
import { View, Text, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useApiClient } from '@/utils/api';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { UpgradeButton } from '@/components/UpgradeButton';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { makeStyles } from '@/components/tournament/ui';
import RankingEditor from '@/components/tournament/RankingEditor';
import { tournamentApi, apiError, RankingList } from '@/utils/tournamentApi';

const MAX_LISTS = 10;

export default function GroupRankingsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const groupQuery = useGetGroupDetails(id);
  const { data: group } = groupQuery;
  const isPremium = group?.isPremium === true;
  const listsQuery = useQuery({
    queryKey: ['rankingLists', id],
    queryFn: () => tournamentApi.listRankings(api, id!),
    enabled: !!id && isPremium,
  });
  const { data: lists, isLoading } = listsQuery;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<RankingList | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const members = group?.members ?? [];
  const label = (uid: string) => {
    const m = members.find((x) => x._id === uid);
    return m ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || 'Member' : 'Member';
  };
  const setLists = (next: RankingList[]) => queryClient.setQueryData(['rankingLists', id], next);
  const run = async (fn: () => Promise<RankingList[]>) => {
    setBusy(true);
    try { setLists(await fn()); } catch (err) { Alert.alert('Could not save', apiError(err).message); } finally { setBusy(false); }
  };

  const create = () => {
    const n = name.trim();
    if (!n) return;
    const everyone = [...members].sort((a, b) => label(a._id).localeCompare(label(b._id))).map((m) => m._id);
    run(async () => { const r = await tournamentApi.saveRanking(api, id!, n, everyone); setName(''); return r.lists; });
  };

  if (isOfflineEmpty(groupQuery) || (isPremium && isOfflineEmpty(listsQuery))) {
    return <SafeAreaView style={styles.safe}><OfflineEmptyState onBack={() => router.back()} /></SafeAreaView>;
  }

  if (!group || (isPremium && isLoading)) {
    return <SafeAreaView style={styles.safe}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><LoadingAnimation /></View></SafeAreaView>;
  }

  const editorItems = editing
    ? [...editing.order.filter((uid) => members.some((m) => m._id === uid)), ...members.map((m) => m._id).filter((uid) => !editing.order.includes(uid))]
        .map((uid) => ({ id: uid, label: label(uid), picture: members.find((m) => m._id === uid)?.profilePicture }))
    : [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerBar}>
        <PressableOpacity accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={24} color={colors.textMuted} />
        </PressableOpacity>
        <Text style={styles.headerTitle}>Strength Rankings</Text>
        <View style={styles.iconBtn}>{busy && <ActivityIndicator size="small" color={colors.brand} />}</View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.body}>Rank members by strength to balance teams and seed brackets. Only owners and moderators see these lists.</Text>
        {!isPremium ? (
          <View style={[styles.card, { marginTop: 16 }]}>
            <Text style={styles.cardTitle}>Premium</Text>
            <Text style={styles.hint}>Rankings are part of Teams & Tourneys, which require the group owner to have Premium.</Text>
            <UpgradeButton owner={group.owner} />
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Saved ({lists?.length ?? 0} of {MAX_LISTS})</Text>
            {(lists ?? []).map((l) => (
              <View key={l._id} style={[styles.card, { marginBottom: 8 }]}>
                {renaming?.id === l._id ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput value={renaming.name} onChangeText={(v) => setRenaming({ id: l._id, name: v })} maxLength={30} autoFocus
                      style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 4 }} />
                    <PressableOpacity onPress={() => { const n = renaming.name.trim(); if (!n) return; setRenaming(null); run(() => tournamentApi.updateRanking(api, id!, l._id, { name: n })); }}>
                      <Text style={styles.action}>Save</Text>
                    </PressableOpacity>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={[styles.cardTitle, { flex: 1 }]} numberOfLines={1}>{l.name}</Text>
                    <PressableOpacity accessibilityLabel={`Rename ${l.name}`} onPress={() => setRenaming({ id: l._id, name: l.name })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name="edit-2" size={16} color={colors.textMuted} />
                    </PressableOpacity>
                    <PressableOpacity accessibilityLabel={`Delete ${l.name}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => Alert.alert(`Delete "${l.name}"?`, undefined, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => run(() => tournamentApi.deleteRanking(api, id!, l._id)) },
                      ])}>
                      <Feather name="trash-2" size={16} color={colors.textFaint} />
                    </PressableOpacity>
                  </View>
                )}
                <Text style={styles.hint} numberOfLines={2}>
                  {l.order.length ? l.order.slice(0, 5).map((uid, i) => `${i + 1}. ${label(uid)}`).join('  ') + (l.order.length > 5 ? ' …' : '') : 'No one ranked yet'}
                </Text>
                <PressableOpacity onPress={() => setEditing(l)} style={{ marginTop: 8 }}>
                  <Text style={styles.action}>Edit order</Text>
                </PressableOpacity>
              </View>
            ))}
            {(lists?.length ?? 0) < MAX_LISTS && (
              <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <TextInput value={name} onChangeText={setName} maxLength={30} placeholder="New ranking name (e.g. Doubles skill)"
                  placeholderTextColor={colors.placeholder} style={{ flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 4 }} />
                <PressableOpacity onPress={create} disabled={!name.trim() || busy}>
                  <Text style={[styles.action, !name.trim() && { opacity: 0.4 }]}>Add</Text>
                </PressableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
      <RankingEditor
        visible={!!editing}
        title={editing?.name ?? ''}
        items={editorItems}
        onCancel={() => setEditing(null)}
        onDone={(order) => { const l = editing!; setEditing(null); run(() => tournamentApi.updateRanking(api, id!, l._id, { order })); }}
      />
    </SafeAreaView>
  );
}
