import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useGetGroups } from '@/hooks/useGetGroups';
import { Group, User, useApiClient, userApi, groupApi } from '@/utils/api';
import { getDMDisplayName } from '@/utils/groupDisplay';
import { Feather } from '@expo/vector-icons';
import { GroupAvatar } from '@/components/GroupAvatar';
import { NotificationBell } from '@/components/NotificationBell';
import { SkeletonList } from '@/components/Skeleton';
import { tabScreenBottomPadding } from '@/utils/layout';
import { promptForNotificationPermission } from '@/hooks/usePushNotifications';
import { useContentTopInset } from '@/hooks/useContentTopInset';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { formatListTime } from '@/utils/listTime';
import { haptic } from '@/utils/haptics';
import { toast } from '@/contexts/ToastContext';
import { getGroupImage } from '@/utils/groupDisplay';

const ACTION_WIDTH = 76;

/** A swipeable row that registers itself so opening one row closes the others. */
const SwipeRow = ({ id, registry, renderRightActions, children }: {
  id: string;
  registry: React.RefObject<Map<string, React.RefObject<SwipeableMethods | null>>>;
  renderRightActions: () => React.ReactNode;
  children: React.ReactNode;
}) => {
  const ref = useRef<SwipeableMethods>(null);
  useEffect(() => {
    registry.current.set(id, ref);
    return () => { registry.current.delete(id); };
  }, [id, registry]);
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      overshootRight={false}
      rightThreshold={40}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={() => {
        haptic.select();
        registry.current.forEach((r, otherId) => { if (otherId !== id) r.current?.close(); });
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
};

const GroupScreen = () => {
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const contentTopInset = useContentTopInset();
  const colors = useThemeColors();
  const { promptNotifications } = useLocalSearchParams<{ promptNotifications?: string }>();
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [creatingSample, setCreatingSample] = useState(false);

  // M7: a ready-made group so someone brand new can poke around (RSVP, chat) before committing to their own.
  const handleTrySample = async () => {
    setCreatingSample(true);
    try {
      const { group } = await groupApi.createDemoGroup(api);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
        queryClient.invalidateQueries({ queryKey: ['meetups'] }),
      ]);
      router.push({ pathname: '/group-chat/[id]', params: { id: group._id } });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Couldn't set up the sample group. Try again.");
    } finally {
      setCreatingSample(false);
    }
  };
  const swipeRefs = useRef(new Map<string, React.RefObject<SwipeableMethods | null>>());
  const closeAllSwipes = () => swipeRefs.current.forEach((r) => r.current?.close());

  // Ask once after group creation, then drop the param so revisiting this tab doesn't re-ask
  useEffect(() => {
    if (promptNotifications !== '1') return;
    promptForNotificationPermission(api);
    router.setParams({ promptNotifications: undefined });
  }, [promptNotifications]);

  const { data: groups, isLoading: isLoadingGroups, isError: isErrorGroups, refetch: refetchGroups, dataUpdatedAt: groupsUpdatedAt } = useGetGroups();

  const { data: currentUser, refetch: refetchUser, isLoading: isLoadingUser } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
  });

  // Pinned groups first; then most recently active chats. A group with no messages yet is
  // ordered by when it was created, so a brand-new group lands near the top instead of sinking.
  const pinnedSet = useMemo(() => new Set(currentUser?.pinnedGroups ?? []), [currentUser?.pinnedGroups]);
  const sortedGroups = useMemo(() => {
    if (!groups) return groups;
    const activity = (g: Group) => {
      const t = g.lastMessage?.createdAt || g.createdAt;
      return t ? new Date(t).getTime() : 0;
    };
    return [...groups].sort((a, b) => {
      const pinDiff = Number(pinnedSet.has(b._id)) - Number(pinnedSet.has(a._id));
      return pinDiff !== 0 ? pinDiff : activity(b) - activity(a);
    });
  }, [groups, pinnedSet]);

  // Realtime keeps this fresh; only refetch on focus when the data is a little old.
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - groupsUpdatedAt > 30_000) refetchGroups();
      refetchUser();
    }, [refetchGroups, refetchUser, groupsUpdatedAt])
  );

  const handlePullRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    try {
      await Promise.all([refetchGroups(), refetchUser()]);
    } finally {
      setIsPullRefreshing(false);
    }
  }, [refetchGroups, refetchUser]);

  // Groups the existing check (lastMessage newer than lastReadAt, not sent by me) marks unread —
  // only those are asked for a real count.
  const unreadCandidates = useMemo(
    () =>
      (sortedGroups ?? [])
        .filter((g) => {
          const lastReadAt = currentUser?.lastReadAt?.[g._id];
          const own = !!g.lastMessage?.user?.clerkId && g.lastMessage.user.clerkId === currentUser?.clerkId;
          return !own && !!g.lastMessage?.createdAt &&
            (!lastReadAt || new Date(lastReadAt) < new Date(g.lastMessage.createdAt));
        })
        .map((g) => ({ groupId: g._id, lastReadAt: currentUser?.lastReadAt?.[g._id] ?? '' })),
    [sortedGroups, currentUser]
  );
  const unreadCounts = useUnreadCounts(unreadCandidates);

  const handleOpenGroupDetail = (group: Group) => {
    router.push({ pathname: '/group-chat/[id]', params: { id: group._id } });
  };

  // --- Swipe actions: pin and mute ---

  const setUserField = (patch: (u: User) => User) => {
    queryClient.setQueryData<User>(['currentUser'], (old) => (old ? patch(old) : old));
  };

  const togglePin = async (group: Group) => {
    const nowPinned = !pinnedSet.has(group._id);
    closeAllSwipes();
    haptic.press();
    setUserField((u) => ({
      ...u,
      pinnedGroups: nowPinned ? [...(u.pinnedGroups ?? []), group._id] : (u.pinnedGroups ?? []).filter((id) => id !== group._id),
    }));
    try {
      await userApi.togglePinGroup(api, group._id, nowPinned);
      toast.success(nowPinned ? 'Pinned to the top' : 'Unpinned');
    } catch {
      refetchUser();
      toast.error("Couldn't update the pin. Try again.");
    }
  };

  const applyMute = async (group: Group, muteType: 'indefinite' | 'untilNext' | 'none') => {
    closeAllSwipes();
    setUserField((u) => ({
      ...u,
      mutedGroups: muteType === 'indefinite' ? [...(u.mutedGroups ?? []).filter((id) => id !== group._id), group._id] : (u.mutedGroups ?? []).filter((id) => id !== group._id),
      mutedUntilNextMeetup: muteType === 'untilNext' ? [...(u.mutedUntilNextMeetup ?? []).filter((id) => id !== group._id), group._id] : (u.mutedUntilNextMeetup ?? []).filter((id) => id !== group._id),
    }));
    try {
      await userApi.toggleGroupMute(api, group._id, muteType);
      if (muteType === 'none') {
        toast.success('Notifications back on');
      } else {
        toast.show({
          message: muteType === 'untilNext' ? 'Muted until the next meetup' : 'Muted',
          kind: 'success',
          actionLabel: 'Undo',
          onAction: () => { applyMute(group, 'none'); },
        });
      }
    } catch {
      refetchUser();
      toast.error("Couldn't change notifications. Try again.");
    }
  };

  const handleMutePress = (group: Group, isMuted: boolean) => {
    haptic.press();
    if (isMuted) {
      applyMute(group, 'none');
      return;
    }
    closeAllSwipes();
    Alert.alert('Mute notifications', 'Stop notifications from this group?', [
      { text: 'Mute', onPress: () => applyMute(group, 'indefinite') },
      { text: 'Mute until next meetup', onPress: () => applyMute(group, 'untilNext') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const renderRightActions = (group: Group, isMuted: boolean, isPinned: boolean) => () => (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', marginVertical: 8, marginLeft: 8, gap: 8 }}>
      <PressableOpacity
        haptic={false}
        onPress={() => togglePin(group)}
        accessibilityLabel={isPinned ? 'Unpin group' : 'Pin group'}
        style={{ width: ACTION_WIDTH, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}
      >
        <Feather name={isPinned ? 'x-circle' : 'bookmark'} size={20} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 4 }}>{isPinned ? 'Unpin' : 'Pin'}</Text>
      </PressableOpacity>
      <PressableOpacity
        haptic={false}
        onPress={() => handleMutePress(group, isMuted)}
        accessibilityLabel={isMuted ? 'Unmute group' : 'Mute group'}
        style={{ width: ACTION_WIDTH, borderRadius: 16, backgroundColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' }}
      >
        <Feather name={isMuted ? 'bell' : 'bell-off'} size={20} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 4 }}>{isMuted ? 'Unmute' : 'Mute'}</Text>
      </PressableOpacity>
    </View>
  );

  const renderGroup = ({ item: group }: { item: Group }) => {
    const isMuted = !!(currentUser?.mutedGroups?.includes(group._id) || currentUser?.mutedUntilNextMeetup?.includes(group._id));
    const isPinned = pinnedSet.has(group._id);
    const displayName = group.isDM ? getDMDisplayName(group, currentUser?.clerkId) : group.name;
    const lastReadAt = currentUser?.lastReadAt?.[group._id];
    const isOwnLastMessage = !!group.lastMessage?.user?.clerkId &&
      group.lastMessage.user.clerkId === currentUser?.clerkId;
    const isUnread = !isOwnLastMessage && !!group.lastMessage?.createdAt &&
      (!lastReadAt || new Date(lastReadAt) < new Date(group.lastMessage.createdAt));
    // Real count when available; until then (or if it can't be fetched) the plain dot shows.
    const info = isUnread ? unreadCounts[group._id] : undefined;
    const unreadInfo = info && info.unread > 0 ? info : null;
    const timeLabel = formatListTime(group.lastMessage?.createdAt);

    return (
      <Animated.View layout={LinearTransition.duration(220)}>
        <SwipeRow
          id={group._id}
          registry={swipeRefs}
          renderRightActions={renderRightActions(group, isMuted, isPinned)}
        >
          <PressableOpacity
            className="relative bg-white dark:bg-gray-900 px-4 py-4 my-2 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800"
            onPress={() => handleOpenGroupDetail(group)}
            haptic="tap"
          >
            {isUnread && !unreadInfo && (
              <View className="absolute top-3 right-3 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-900" />
            )}
            <View className="flex-row items-center">
              <View style={{ marginRight: 12 }}>
                <GroupAvatar name={displayName} imageUrl={getGroupImage(group, currentUser?.clerkId)} size={44} borderRadius={12} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center">
                  {isPinned && <Feather name="bookmark" size={13} color={colors.brand} style={{ marginRight: 5 }} />}
                  <Text className="text-lg font-bold text-gray-800 dark:text-gray-100 flex-1" numberOfLines={1}>
                    {displayName}
                  </Text>
                  {isMuted && <Feather name="bell-off" size={14} color={colors.textFaint} style={{ marginLeft: 6 }} />}
                  {!!timeLabel && (
                    <Text style={{ marginLeft: 8, fontSize: 12, color: isUnread ? colors.brand : colors.textFaint, fontWeight: isUnread ? '700' : '500' }}>
                      {timeLabel}
                    </Text>
                  )}
                </View>
                {group.lastMessage ? (
                  <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5" numberOfLines={1}>
                    <Text style={{ color: colors.brand, fontWeight: '600' }}>{group.lastMessage.user.name}:</Text> {group.lastMessage.text}
                  </Text>
                ) : (
                  <Text className="text-sm text-gray-400 dark:text-gray-500 italic mt-0.5">No messages yet</Text>
                )}
              </View>
              {unreadInfo && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                  {unreadInfo.mentioned > 0 && (
                    <View style={{ backgroundColor: colors.brand, borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>@</Text>
                    </View>
                  )}
                  <View style={{ backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{unreadInfo.unread > 99 ? '99+' : unreadInfo.unread}</Text>
                  </View>
                </View>
              )}
            </View>
          </PressableOpacity>
        </SwipeRow>
      </Animated.View>
    );
  };

  const showSkeleton = isLoadingGroups || (!currentUser && isLoadingUser);

  return (
    <SafeAreaView
      className='flex-1 bg-gray-50 dark:bg-black'
      edges={['left', 'right']}
      style={{ paddingTop: contentTopInset }}
    >
      <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <NotificationBell />
        <Text className="text-xl font-black text-gray-900 dark:text-gray-100">Groups</Text>
        <PressableOpacity
          onPress={() => router.push('/create-group')}
          style={{ alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather name="plus-circle" size={26} color={colors.brand} />
        </PressableOpacity>
      </View>

      {showSkeleton ? (
        <View style={{ flex: 1, paddingHorizontal: 16 }}><SkeletonList kind="group" count={5} /></View>
      ) : isErrorGroups && !groups ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ color: colors.textMuted, fontSize: 16, marginBottom: 16 }}>Couldn't load your groups.</Text>
          <PressableOpacity onPress={() => refetchGroups()} style={{ backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Try again</Text>
          </PressableOpacity>
        </View>
      ) : (
        <FlatList
          data={sortedGroups ?? []}
          keyExtractor={(g) => g._id}
          renderItem={renderGroup}
          style={{ paddingHorizontal: 16 }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: tabScreenBottomPadding(insets.bottom) }}
          refreshControl={<RefreshControl refreshing={isPullRefreshing} onRefresh={handlePullRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 64 }}>
              <Text className="text-center text-gray-500 dark:text-gray-400" style={{ fontSize: 16, marginBottom: 16 }}>You have no groups yet.</Text>
              <PressableOpacity
                onPress={() => router.push('/create-group')}
                haptic="press"
                style={{ backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Create a group</Text>
              </PressableOpacity>
              <PressableOpacity onPress={handleTrySample} disabled={creatingSample} style={{ marginTop: 18, padding: 8 }}>
                {creatingSample
                  ? <ActivityIndicator color={colors.brand} />
                  : <Text style={{ color: colors.brand, fontWeight: '700', fontSize: 14 }}>or look around a sample group</Text>}
              </PressableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

export default GroupScreen;
