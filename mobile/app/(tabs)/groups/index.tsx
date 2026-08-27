import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useGetGroups } from '@/hooks/useGetGroups';
import { Group, User, useApiClient, userApi } from '@/utils/api';
import { getDMDisplayName } from '@/utils/groupDisplay';
import { Feather } from '@expo/vector-icons';
import { useGetNotifications } from '@/hooks/useGetNotifications';
import { GroupAvatar } from '@/components/GroupAvatar';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { TAB_BAR_HEIGHT } from '@/utils/layout';
import { promptForNotificationPermission } from '@/hooks/usePushNotifications';

const GroupScreen = () => {
  const api = useApiClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { promptNotifications } = useLocalSearchParams<{ promptNotifications?: string }>();

  // Landed here right after creating a group (see create-group's onDone) — ask
  // once, then drop the param so revisiting this tab doesn't ask again.
  useEffect(() => {
    if (promptNotifications !== '1') return;
    promptForNotificationPermission(api);
    router.setParams({ promptNotifications: undefined });
  }, [promptNotifications]);

  const { data: groups, isLoading: isLoadingGroups, isError: isErrorGroups, refetch: refetchGroups } = useGetGroups();

  // Most recently active chats first; groups with no messages yet sink to the bottom.
  const sortedGroups = useMemo(() => {
    if (!groups) return groups;
    return [...groups].sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [groups]);

  const { data: currentUser, refetch: refetchUser, isLoading: isLoadingUser } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
  });

  const { data: notifications } = useGetNotifications();
  const hasUnreadNotifications = notifications?.some(n => !n.read);

  useFocusEffect(
    useCallback(() => {
      refetchGroups();
      refetchUser();
    }, [refetchGroups, refetchUser])
  );

  const handleOpenGroupDetail = (group: Group) => {
    router.push({ pathname: '/group-chat/[id]', params: { id: group._id } });
  };

  const renderGroupList = () => {
    if (isLoadingGroups || (!currentUser && isLoadingUser)) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><LoadingAnimation /></View>;
    if (isErrorGroups) return <Text className="text-center text-red-500 mt-4">Failed to load groups.</Text>;
    if (!sortedGroups || sortedGroups.length === 0) return <Text className="text-center text-gray-500 mt-4">You have no groups yet.</Text>;

    return sortedGroups.map((group) => {
      const isMuted = currentUser?.mutedGroups?.includes(group._id) || currentUser?.mutedUntilNextMeetup?.includes(group._id);
      const displayName = group.isDM ? getDMDisplayName(group, currentUser?.clerkId) : group.name;
      const lastReadAt = currentUser?.lastReadAt?.[group._id];
      const isUnread = !!group.lastMessage?.createdAt &&
        (!lastReadAt || new Date(lastReadAt) < new Date(group.lastMessage.createdAt));
      return (
        <TouchableOpacity
          key={group._id}
          className="relative bg-white px-4 py-4 my-2 rounded-2xl shadow-sm border border-gray-100"
          onPress={() => handleOpenGroupDetail(group)}
        >
          {isUnread && (
            <View className="absolute top-3 right-3 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
          )}
          <View className="flex-row items-center">
            <View style={{ marginRight: 12 }}>
              <GroupAvatar name={displayName} imageUrl={group.image} size={44} borderRadius={12} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="text-lg font-bold text-gray-800 flex-1" numberOfLines={1}>
                  {displayName}
                </Text>
                {isMuted && <Feather name="bell-off" size={14} color="#9CA3AF" style={{ marginLeft: 6 }} />}
              </View>
              {group.lastMessage ? (
                <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
                  <Text style={{ color: '#4A90E2', fontWeight: '600' }}>{group.lastMessage.user.name}:</Text> {group.lastMessage.text}
                </Text>
              ) : (
                <Text className="text-sm text-gray-400 italic mt-0.5">No messages yet</Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    });
  };

  return (
    <SafeAreaView className='flex-1 bg-gray-50' edges={['top', 'left', 'right']}>
      <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200 bg-white">
        <TouchableOpacity onPress={() => router.push('/notifications')}>
          <Feather name="bell" size={26} color="#4A90E2" />
          {hasUnreadNotifications && (
            <View className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
          )}
        </TouchableOpacity>
        <Text className="text-xl font-black text-gray-900">Groups</Text>
        <TouchableOpacity
          onPress={() => router.push('/create-group')}
          style={{ alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather name="plus-circle" size={26} color="#4A90E2" />
        </TouchableOpacity>
      </View>
      <ScrollView className="px-4" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + TAB_BAR_HEIGHT }}>
        {renderGroupList()}
      </ScrollView>
    </SafeAreaView>
  );
};

export default GroupScreen;
