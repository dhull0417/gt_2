import React from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { OfflineEmptyState } from '@/components/OfflineEmptyState';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { useRefreshOrToast } from '@/hooks/useRefreshOrToast';
import { groupApi, useApiClient, type PastMeetupPage, type PastMeetupRow } from '@/utils/api';
import { isOfflineEmpty } from '@/utils/offlineState';
import { attendanceLine } from '@/utils/pastMeetups';

// A group's finished meetups, newest first, opened from the Past Meetups tile on Group Details.
export default function GroupPastMeetupsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const api = useApiClient();
  const router = useRouter();

  const query = useInfiniteQuery<PastMeetupPage, Error, { pages: PastMeetupPage[] }, readonly unknown[], string | null>({
    queryKey: ['pastMeetups', id],
    enabled: !!id,
    initialPageParam: null,
    queryFn: ({ pageParam }) => groupApi.getPastMeetups(api, id!, pageParam),
    getNextPageParam: (last) => last.nextBefore,
  });
  const rows = query.data?.pages.flatMap((p) => p.meetups) ?? [];
  const { refreshing, refresh } = useRefreshOrToast([() => query.refetch()]);

  const open = (row: PastMeetupRow) =>
    router.push({ pathname: '/past-meetup/[id]', params: { id: row.id, groupId: id! } });

  const renderRow = ({ item }: { item: PastMeetupRow }) => (
    <PressableOpacity onPress={() => open(item)} activeOpacity={0.75} style={[styles.row, { backgroundColor: colors.surface }]}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
          {item.hasTournament && <Feather name="award" size={14} color="#D97706" accessibilityLabel="Had a tournament" />}
        </View>
        <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
          {new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          {item.location ? ` · ${item.location}` : ''}
        </Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>{attendanceLine(item)}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textFaint} />
    </PressableOpacity>
  );

  let body: React.ReactNode = null;
  if (isOfflineEmpty(query)) {
    body = <OfflineEmptyState message="Connect to the internet to load past meetups." onRetry={refresh} />;
  } else if (query.isError && !query.data) {
    body = (
      <View style={styles.center}>
        <Text style={{ color: colors.textMuted, fontSize: 16, marginBottom: 16 }}>Couldn't load past meetups.</Text>
        <PressableOpacity onPress={refresh} style={{ backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Try again</Text>
        </PressableOpacity>
      </View>
    );
  } else if (!query.data) {
    body = <View style={styles.center}><LoadingAnimation /></View>;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <PressableOpacity accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 4, marginRight: 8 }} hitSlop={8}>
          <Feather name="chevron-left" size={26} color="#FF7A6E" />
        </PressableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Past Meetups</Text>
      </View>
      {body ?? (
        <FlatList
          style={{ backgroundColor: colors.backgroundAlt }}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={renderRow}
          onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage(); }}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} colors={[colors.brand]} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="rotate-ccw" size={32} color={colors.textFaint} />
              <Text style={{ color: colors.textMuted, fontSize: 16, marginTop: 12 }}>No past meetups yet</Text>
            </View>
          }
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.brand} /> : undefined}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontWeight: '900' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, borderCurve: 'continuous', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  name: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  sub: { fontSize: 13, fontWeight: '600', marginTop: 2 },
});
