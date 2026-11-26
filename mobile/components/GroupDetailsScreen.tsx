import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Platform,
  Dimensions,
} from 'react-native';
import type { ScrollViewInstance, ViewInstance } from 'react-native';
import { useAndroidBack } from '@/hooks/useAndroidBack';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OfflineEmptyState } from '@/components/OfflineEmptyState';
import { isOfflineEmpty } from '@/utils/offlineState';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshOrToast } from '@/hooks/useRefreshOrToast';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { User, useApiClient, userApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';
import { GroupDetailsView } from '@/components/GroupDetailsView';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { tabScreenBottomPadding } from '@/utils/layout';
import { scrollIntoViewForTour } from '@/utils/scrollIntoViewForTour';
import { useThemeColors } from '@/contexts/AppearanceContext';

interface GroupDetailsScreenProps {
  // False when mounted outside the Groups tab (no tab bar underneath) — see app/group-details/[id].tsx
  showsTabBarBeneath?: boolean;
}

export const GroupDetailsScreen = ({ showsTabBarBeneath = true }: GroupDetailsScreenProps) => {
  // from=chat: Android opened Details from the chat header (see group-chat/[id].tsx handleOpenDetails).
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const colors = useThemeColors();

  const insets = useSafeAreaInsets();
  const api = useApiClient();
  const router = useRouter();

  const detailsQuery = useGetGroupDetails(id ?? null);
  const { data: groupDetails, isLoading: isLoadingDetails, isError: isErrorDetails, refetch: refetchDetails } = detailsQuery;
  const detailsOffline = isOfflineEmpty(detailsQuery);
  // If the details never arrive (a request that hangs), stop the loader after 8 seconds and offer
  // Retry instead of spinning forever. Same limit as the chat screen.
  const [detailsTimedOut, setDetailsTimedOut] = useState(false);
  // Only counts while a request is actually running (not while offline and waiting).
  const detailsFetching = detailsQuery.fetchStatus === 'fetching';
  useEffect(() => {
    setDetailsTimedOut(false);
    if (groupDetails || !detailsFetching) return;
    const t = setTimeout(() => setDetailsTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [groupDetails, detailsFetching, id]);

  const { data: currentUser } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
  });

  // Offline, this says so and stops instead of spinning until the connection is back.
  const { refreshing: isPullRefreshing, refresh: handlePullRefresh } = useRefreshOrToast([() => refetchDetails()]);

  const handleOpenChat = () => {
    if (!id) return;
    if (Platform.OS === 'android') {
      // On Android, Details sits in the Groups tab stack with no chat beneath it. Pop Details so the
      // Groups list is underneath, then open the chat, so the chat's back lands on the list.
      if (router.canGoBack()) router.back();
      router.push({ pathname: '/group-chat/[id]', params: { id } });
      return;
    }
    // Pops back to an already-open chat for this group (correct back-slide animation,
    // matching the chevron-left affordance); falls back to a push for entry points that
    // never went through chat (groups list, notifications, DM creation, meetup modal).
    router.dismissTo({ pathname: '/group-chat/[id]', params: { id } });
  };

  // For the first-visit tour: scroll a tile on screen before it's highlighted. The tour places its
  // highlight from one measurement of where the tile is on screen, so the scroll has to have fully
  // stopped first; otherwise the highlight lands where the tile was mid-scroll (below it).
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const contentH = useRef(0);
  const viewportH = useRef(0);
  const scrollIntoView = useCallback((node: ViewInstance | null, beforeScroll?: () => Promise<void>) =>
    scrollIntoViewForTour({
      node,
      scrollTo: (y) => scrollRef.current?.scrollTo({ y, animated: true }),
      getScrollY: () => scrollY.current,
      maxScrollY: contentH.current > 0 && viewportH.current > 0 ? contentH.current - viewportH.current : undefined,
      windowH: Dimensions.get('window').height,
      insetTop: insets.top,
      insetBottom: insets.bottom,
      beforeScroll,
    }), [insets.top, insets.bottom]);

  // Android back returns to the chat when Details was opened from it, like the on-screen arrow.
  useAndroidBack(from === 'chat', handleOpenChat);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.backgroundAlt }}
      edges={showsTabBarBeneath ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}
    >
      <ScrollView
        ref={scrollRef}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
        onLayout={(e) => { viewportH.current = e.nativeEvent.layout.height; }}
        onContentSizeChange={(_w, h) => { contentH.current = h; }}
        scrollEventThrottle={16}
        style={{ backgroundColor: colors.backgroundAlt }}
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isPullRefreshing} onRefresh={handlePullRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: showsTabBarBeneath ? tabScreenBottomPadding(insets.bottom) : 0 }}
      >
        <View className="p-6" style={{ flex: 1 }}>
          {detailsOffline ? (
              <OfflineEmptyState message="Connect to the internet to load this group." onRetry={handlePullRefresh} />
          ) : (isErrorDetails || detailsTimedOut) && !groupDetails ? (
              <View style={{ alignItems: 'center', marginTop: 48 }}>
                <Text style={{ color: colors.textMuted, fontSize: 16, textAlign: 'center', marginBottom: 16 }}>Couldn't load this group.</Text>
                <PressableOpacity onPress={() => { setDetailsTimedOut(false); handlePullRefresh(); }} style={{ backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Try again</Text>
                </PressableOpacity>
              </View>
          ) : (isLoadingDetails || !groupDetails) ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><LoadingAnimation /></View>
          ) : (
            <GroupDetailsView
              groupDetails={groupDetails}
              currentUser={currentUser!}
              onLeaveSuccess={() => router.dismissTo('/(tabs)/groups')}
              scrollIntoView={scrollIntoView}
            />
          )}
        </View>

        {/* No header bar: a back button at the top-left of the page, always back to chat — its only
            meaningful parent, regardless of nav stack. Inside the ScrollView so it scrolls away with
            the content instead of staying pinned to the screen corner. */}
        <PressableOpacity
          accessibilityLabel="Go back"
          onPress={handleOpenChat}
          hitSlop={8}
          style={{
            position: 'absolute', top: 8, left: 12, width: 40, height: 40, borderRadius: 20,
            alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
            shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
          }}
        >
          <Feather name="chevron-left" size={26} color="#FF7A6E" style={{ marginLeft: -2 }} />
        </PressableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

export default GroupDetailsScreen;
