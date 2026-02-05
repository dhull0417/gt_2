import { 
  View, 
  Text, 
  ScrollView, 
  ActivityIndicator, 
  TextInput, 
  Keyboard, 
  Alert, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform,
  TouchableOpacity 
} from 'react-native';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router'; 
import { useGetGroups } from '@/hooks/useGetGroups';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useDeleteGroup } from '@/hooks/useDeleteGroup';
import { useLeaveGroup } from '@/hooks/useLeaveGroup';
import { useRemoveMember } from '@/hooks/useRemoveMember';
import { Group, GroupDetails, User, useApiClient, userApi, groupApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';
import { useSearchUsers } from '@/hooks/useSearchUsers';
import { useInviteUser } from '@/hooks/useInviteUser';
import { ChatProvider, useChatClient } from '@/components/ChatProvider';
import type { Channel as StreamChannel } from 'stream-chat';
import { Chat, Channel, MessageList, OverlayProvider } from 'stream-chat-expo';
import CustomMessage from '@/components/CustomMessage';
import { useGetNotifications } from '@/hooks/useGetNotifications';
import { GroupDetailsView } from '@/components/GroupDetailsView';

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  chatContainer: {
    flex: 1,
  },
  detailsButton: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginRight: 8,
  },
  detailsButtonText: {
    color: '#4F46E5',
    fontWeight: 'bold',
    fontSize: 14,
  },
  muteButton: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginRight: 8,
  },
  muteButtonText: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 14,
  },
  unmuteButton: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginRight: 8,
  },
  unmuteButtonText: {
    color: '#10B981',
    fontWeight: 'bold',
    fontSize: 14,
  },
  settingsButton: {
    padding: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  }
});

const GroupChat = ({ group }: { group: GroupDetails }) => {
  const { client, isConnected } = useChatClient();
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!client || !group || !isConnected) return;

    const initChannel = async () => {
      try {
        const channelId = group._id;
        const newChannel = client.channel('messaging', channelId, {
          members: group.members.map(m => m._id),
          name: group.name,
        } as any);

        await newChannel.watch();
        setChannel(newChannel);
      } catch (err) {
        console.error("[Chat] Channel init error:", err);
      }
    };

    initChannel();

    return () => {
      if (channel) {
        channel.stopWatching();
      }
    };
  }, [client, group._id, group.name, isConnected]);

  const handleRawSend = async () => {
    if (!channel || !text.trim()) return;
    setIsSending(true);
    try {
        await channel.sendMessage({ text: text });
        setText('');
    } catch (error: any) {
        Alert.alert("Error", `Failed to send message: ${error.message}`);
    } finally {
        setIsSending(false);
    }
  };

  if (!client || !isConnected || !channel) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={{ marginTop: 16, color: '#6B7280' }}>Connecting to chat...</Text>
      </View>
    );
  }

  return (
    <OverlayProvider>
      <Chat client={client}>
        <Channel channel={channel}>
          <View style={styles.chatContainer}>
            <MessageList Message={CustomMessage} />
            <View className="flex-row items-center p-3 border-t border-gray-200 bg-white pb-6"> 
                <View className="flex-1 flex-row items-center bg-gray-100 rounded-2xl px-4 py-2 mr-3 border border-gray-300">
                    <TextInput 
                        value={text}
                        onChangeText={setText}
                        placeholder="Type a message..."
                        placeholderTextColor="#9CA3AF"
                        multiline
                        className="flex-1 text-base text-gray-900 max-h-24 pt-0 pb-0"
                        style={{ paddingTop: Platform.OS === 'ios' ? 6 : 0 }} 
                    />
                </View>
                <TouchableOpacity 
                    onPress={handleRawSend} 
                    disabled={isSending || !text.trim()}
                    className={`p-3 rounded-xl ${!text.trim() ? 'bg-gray-200' : 'bg-indigo-600'}`}
                >
                    {isSending ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Feather name="send" size={20} color={!text.trim() ? "#9CA3AF" : "white"} />
                    )}
                </TouchableOpacity>
            </View>
          </View>
        </Channel>
      </Chat>
    </OverlayProvider>
  );
};

const GroupScreen = () => {
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isGroupDetailVisible, setIsGroupDetailVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'Chat' | 'Details'>('Chat');
  
  const insets = useSafeAreaInsets();
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { openChatId } = useLocalSearchParams<{ openChatId?: string }>();

  // FIX: Added isErrorGroups to destructuring
  const { data: groups, isLoading: isLoadingGroups, isError: isErrorGroups, refetch: refetchGroups } = useGetGroups();
  const { data: groupDetails, isLoading: isLoadingDetails, isError: isErrorDetails } = useGetGroupDetails(selectedGroup?._id || null);
  
  // Destructured isLoadingUser to use in loading checks
  const { data: currentUser, refetch: refetchUser, isLoading: isLoadingUser } = useQuery<User, Error>({ 
    queryKey: ['currentUser'], 
    queryFn: () => userApi.getCurrentUser(api),
  });

  const stableUserRef = useRef<User | null>(null);
  if (!stableUserRef.current && currentUser) stableUserRef.current = currentUser;

  useEffect(() => {
    if (!selectedGroup) stableUserRef.current = null;
  }, [selectedGroup?._id]);

  // LIVE NAME SYNC: Ensure state and header update immediately when backend name changes
  useEffect(() => {
    if (groupDetails && selectedGroup && groupDetails._id === selectedGroup._id) {
      if (groupDetails.name !== selectedGroup.name) {
        setSelectedGroup(prev => prev ? { ...prev, name: groupDetails.name } : null);
      }
    }
  }, [groupDetails?.name]);

  const canManageGroup = useMemo(() => {
    if (!groupDetails || !currentUser) return false;
    const userId = currentUser._id;
    // Direct cast to avoid TypeScript 'never' inference on populations
    const g = groupDetails as any;
    const isOwner = (g.owner?._id || g.owner) === userId;
    const isMod = g.moderators?.some((m: any) => (m?._id || m) === userId);
    return isOwner || isMod;
  }, [groupDetails, currentUser]);

  const isCurrentlyMuted = useMemo(() => {
    if (!selectedGroup || !currentUser) return false;
    return currentUser.mutedGroups?.includes(selectedGroup._id) || 
           currentUser.mutedUntilNextEvent?.includes(selectedGroup._id);
  }, [selectedGroup?._id, currentUser]);

  const performMuteUpdate = async (type: 'indefinite' | 'untilNext' | 'none') => {
    if (!selectedGroup) return;
    try {
        await userApi.toggleGroupMute(api, selectedGroup._id, type);
        queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    } catch (error: any) {
        Alert.alert("Error", "Failed to update notification settings.");
    }
  };

  const handleMutePress = () => {
    if (isCurrentlyMuted) {
      performMuteUpdate('none');
    } else {
      Alert.alert(
          "Mute Notifications",
          "How long would you like to silence this chat?",
          [
              { text: "Until Next Meeting", onPress: () => performMuteUpdate('untilNext') },
              { text: "Indefinitely", onPress: () => performMuteUpdate('indefinite') },
              { text: "Cancel", style: "cancel" }
          ]
      );
    }
  };
  
  const { mutate: deleteGroup, isPending: isDeletingGroup } = useDeleteGroup();
  const { mutate: leaveGroup, isPending: isLeavingGroup } = useLeaveGroup();
  const { mutate: removeMember, isPending: isRemovingMember } = useRemoveMember();
  
  const [searchQuery, setSearchQuery] = useState('');
  const { data: searchResults } = useSearchUsers(searchQuery);
  const { mutate: inviteUser, isPending: isInviting } = useInviteUser();
  const { data: notifications } = useGetNotifications();
  const hasUnreadNotifications = notifications?.some(n => !n.read);

  useFocusEffect(
    useCallback(() => { 
      refetchGroups(); 
      refetchUser();
    }, [refetchGroups, refetchUser])
  );

  useEffect(() => {
    if (openChatId && groups && groups.length > 0) {
      const targetGroup = groups.find(g => g._id === openChatId);
      if (targetGroup) {
        handleOpenGroupDetail(targetGroup);
        router.setParams({ openChatId: undefined });
      }
    }
  }, [openChatId, groups]);

  const handleInvite = (userIdToInvite: string) => {
    if (!selectedGroup) return;
    inviteUser({ groupId: selectedGroup._id, userIdToInvite }, {
        onSuccess: () => {
            setSearchQuery('');
            Keyboard.dismiss();
            Alert.alert("Success", "Invite sent!");
        }
    });
  };

  const handleEditSchedule = () => {
    if (!selectedGroup) return;
    setIsGroupDetailVisible(false);
    router.push({
      pathname: '/group-edit-schedule/[id]',
      params: { id: selectedGroup._id }
    });
  };

  const handleAddOneOffEvent = () => {
    if (!selectedGroup) return;
    setIsGroupDetailVisible(false);
    router.push({
        pathname: '/create-group',
        params: { existingGroupId: selectedGroup._id, initialType: 'event' }
    });
  };

  const handleDeleteGroup = () => {
    if (!selectedGroup) return;
    Alert.alert("Delete Group", `Are you sure you want to permanently delete "${selectedGroup.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        deleteGroup({ groupId: selectedGroup._id }, {
          onSuccess: () => handleCloseGroupDetail(),
        });
      }},
    ]);
  };

  const handleLeaveGroup = () => {
    if (!selectedGroup) return;
    Alert.alert("Leave Group", "Are you sure you want to leave this group?", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => {
        leaveGroup({ groupId: selectedGroup._id }, {
          onSuccess: () => handleCloseGroupDetail(),
        });
      }},
    ]);
  };

  const handleRemoveMember = (memberIdToRemove: string) => {
    if (!selectedGroup) return;
    Alert.alert("Remove Member", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        removeMember({ groupId: selectedGroup._id, memberIdToRemove }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['groupDetails', selectedGroup._id] });
          }
        });
      }},
    ]);
  };

  const handleOpenGroupDetail = (group: Group) => {
    setSelectedGroup(group);
    setIsGroupDetailVisible(true);
    setActiveTab('Chat'); 
  };

  const handleCloseGroupDetail = () => {
    setIsGroupDetailVisible(false);
    setSelectedGroup(null);
    setSearchQuery('');
    refetchGroups();
    refetchUser();
  };

  const handleSettingsPress = () => {
    if (!selectedGroup) return;
    router.push({
      pathname: '/group-settings/[id]',
      params: { id: selectedGroup._id }
    });
  };

  const renderGroupList = () => {
    // FIX: Changed (!currentUser && refetchUser) to (!currentUser && isLoadingUser) to fix code 2774
    if (isLoadingGroups || (!currentUser && isLoadingUser)) return <ActivityIndicator size="large" color="#4F46E5" className="mt-8"/>;
    // isErrorGroups is now defined from destructuring hook above, fixing code 2304
    if (isErrorGroups) return <Text className="text-center text-red-500 mt-4">Failed to load groups.</Text>;
    if (!groups || groups.length === 0) return <Text className="text-center text-gray-500 mt-4">You have no groups yet.</Text>;

    return groups.map((group) => {
      const isMuted = currentUser?.mutedGroups?.includes(group._id) || currentUser?.mutedUntilNextEvent?.includes(group._id);
      return (
        <TouchableOpacity
          key={group._id}
          className="bg-white p-5 my-2 rounded-2xl shadow-sm border border-gray-100"
          onPress={() => handleOpenGroupDetail(group)}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              <Text className="text-lg font-bold text-gray-800" numberOfLines={1}>{group.name}</Text>
              {isMuted && (
                <View className="ml-2">
                  <Feather name="bell-off" size={14} color="#9CA3AF" />
                </View>
              )}
            </View>
          </View>
          {group.lastMessage ? (
            <Text className="text-sm text-gray-500 mt-1" numberOfLines={1}>
              <Text className="font-semibold text-indigo-600">{group.lastMessage.user.name}:</Text> {group.lastMessage.text}
            </Text>
          ) : (
            <Text className="text-sm text-gray-400 italic mt-1">No messages yet</Text>
          )}
        </TouchableOpacity>
      );
    });
  };

  return (
    <SafeAreaView className='flex-1 bg-gray-50' edges={['top', 'left', 'right']}>
      <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200 bg-white">
        <TouchableOpacity onPress={() => router.push('/notifications')}>
          <Feather name="bell" size={26} color="#4F46E5" />
          {hasUnreadNotifications && (
            <View className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
          )}
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-900">Groups</Text>
        <TouchableOpacity onPress={() => router.push('/create-group')}>
          <Feather name="plus-circle" size={26} color="#4F46E5" />
        </TouchableOpacity>
      </View>
      <ScrollView className="px-4">
        {renderGroupList()}
      </ScrollView>

      {isGroupDetailVisible && selectedGroup && (
        <View className="absolute top-0 bottom-0 left-0 right-0 bg-white" style={{paddingTop:insets.top}}>
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200">
            <View className="flex-row items-center flex-1 truncate">
              <TouchableOpacity 
                onPress={() => activeTab === 'Details' ? setActiveTab('Chat') : handleCloseGroupDetail()} 
                className="mr-3 p-1"
              >
                <Feather name="arrow-left" size={24} color="#4F46E5"/>
              </TouchableOpacity>
              {/* Header Title: Use live query name primarily to avoid stale state display */}
              <Text className="text-xl font-bold text-gray-900 flex-1" numberOfLines={1}>
                {groupDetails?.name || selectedGroup.name}
              </Text>
            </View>
            
            <View className="flex-row items-center">
              {activeTab === 'Chat' ? (
                // ACTION ROW FOR CHAT TAB: No Settings Button
                <>
                  <TouchableOpacity 
                    onPress={handleMutePress}
                    style={isCurrentlyMuted ? styles.unmuteButton : styles.muteButton}
                  >
                    <Text style={isCurrentlyMuted ? styles.unmuteButtonText : styles.muteButtonText}>
                      {isCurrentlyMuted ? "Unmute" : "Mute"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    onPress={() => setActiveTab('Details')}
                    style={styles.detailsButton}
                  >
                    <Text style={styles.detailsButtonText}>Details</Text>
                  </TouchableOpacity>
                </>
              ) : (
                // ACTION ROW FOR DETAILS TAB: Settings Button only here
                canManageGroup && (
                  <TouchableOpacity 
                    onPress={handleSettingsPress}
                    style={styles.settingsButton}
                    activeOpacity={0.7}
                  >
                    <Feather name="settings" size={22} color="#374151" />
                  </TouchableOpacity>
                )
              )}
            </View>
          </View>

          {!(stableUserRef.current || currentUser) ? (
              <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 50 }} />
          ) : (
            <ChatProvider user={stableUserRef.current || currentUser!}>
               {activeTab === 'Chat' ? (
                <KeyboardAvoidingView
                  style={styles.chatContainer}
                  behavior={Platform.OS === "ios" ? "padding" : "height"}
                  keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
                >
                  {(isLoadingDetails || !groupDetails) ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color="#4F46E5" />
                    </View>
                  ) : (
                      <GroupChat group={groupDetails} />
                  )}
                </KeyboardAvoidingView>
              ) : (
                <ScrollView className="flex-1 bg-gray-50" keyboardShouldPersistTaps="handled">
                  <View className="p-6">
                    {(isLoadingDetails || !groupDetails) ? (
                        <ActivityIndicator size="large" color="#4F46E5" className="my-8" />
                    ) : isErrorDetails ? (
                        <Text className="text-center text-red-500 mt-4">Failed to load group details.</Text>
                    ) : (
                      <GroupDetailsView 
                        groupDetails={groupDetails}
                        currentUser={currentUser!}
                        isRemovingMember={isRemovingMember}
                        onRemoveMember={handleRemoveMember}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        searchResults={searchResults}
                        onInvite={handleInvite}
                        isInviting={isInviting}
                        onDeleteGroup={handleDeleteGroup}
                        isDeletingGroup={isDeletingGroup}
                        onLeaveGroup={handleLeaveGroup}
                        isLeavingGroup={isLeavingGroup}
                        onEditSchedule={handleEditSchedule}
                        onAddOneOffEvent={handleAddOneOffEvent}
                      />
                    )}
                  </View>
                </ScrollView>
              )}
            </ChatProvider>
          )}
        </View>
      )}
    </SafeAreaView>
  );
};

export default GroupScreen;