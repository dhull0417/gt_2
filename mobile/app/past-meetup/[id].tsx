import React from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { OfflineEmptyState } from '@/components/OfflineEmptyState';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { PastMeetupDetailView } from '@/components/PastMeetupDetailView';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { useRefreshOrToast } from '@/hooks/useRefreshOrToast';
import { groupApi, useApiClient } from '@/utils/api';
import { isOfflineEmpty } from '@/utils/offlineState';

// One finished meetup, read-only. Opened from the Past Meetups list (id = meetup id, groupId param).
export default function PastMeetupScreen() {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId: string }>();
  const colors = useThemeColors();
  const api = useApiClient();
  const router = useRouter();

  const query = useQuery({
    queryKey: ['pastMeetup', groupId, id],
    enabled: !!id && !!groupId,
    queryFn: () => groupApi.getPastMeetup(api, groupId!, id!),
    staleTime: 5 * 60 * 1000, // finished meetups barely change
  });
  const { refreshing, refresh } = useRefreshOrToast([() => query.refetch()]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <PressableOpacity accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 4, marginRight: 8 }} hitSlop={8}>
          <Feather name="chevron-left" size={26} color="#FF7A6E" />
        </PressableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Past Meetup</Text>
      </View>
      <ScrollView
        style={{ backgroundColor: colors.backgroundAlt }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} colors={[colors.brand]} />}
      >
        {isOfflineEmpty(query) ? (
          <OfflineEmptyState message="Connect to the internet to load this meetup." onRetry={refresh} />
        ) : query.isError && !query.data ? (
          <View style={styles.center}>
            <Text style={{ color: colors.textMuted, fontSize: 16, marginBottom: 16 }}>Couldn't load this meetup.</Text>
            <PressableOpacity onPress={refresh} style={{ backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Try again</Text>
            </PressableOpacity>
          </View>
        ) : !query.data ? (
          <View style={styles.center}><LoadingAnimation /></View>
        ) : (
          <PastMeetupDetailView
            detail={query.data}
            onOpenTournament={(tid) => router.push({ pathname: '/tournament/[id]', params: { id: tid } })}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontWeight: '900' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
});
