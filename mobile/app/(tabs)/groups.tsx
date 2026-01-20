import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Keyboard, Alert, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import React, { useState, useCallback, useEffect } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router'; 
import { useGetGroups } from '@/hooks/useGetGroups';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useDeleteGroup } from '@/hooks/useDeleteGroup';
import { useLeaveGroup } from '@/hooks/useLeaveGroup';
import { useRemoveMember } from '@/hooks/useRemoveMember';
import { Group, GroupDetails, User, useApiClient, userApi } from '@/utils/api';
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
});

const GroupChat = ({ group }: { group: GroupDetails }) => {
  const { client, isConnected } = useChatClient();
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!client || !group) return;

    const initChannel = async () => {
      const channelId = group._id;
      const newChannel = client.channel('messaging', channelId, {
        members: group.members.map(m => m._id),
      } as any);

      await newChannel.watch();
      setChannel(newChannel);
    };

    initChannel();

    return () => {
      channel?.stopWatching();
    };
  }, [client, group]);

  const handleRawSend = async () => {
    if (!channel || !text.trim()) return;
    
    setIsSending(true);
    try {
        await channel.sendMessage({ text: text });
        setText('');
    } catch (error: any) {
        Alert.alert("FAILED", `Raw send error: ${error.message}`);
    } finally {
        setIsSending(false);
    }
  };

  if (!client || !isConnected || !channel) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text className="mt-4 text-gray-500">Connecting to chat...</Text>
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
                <View className="flex-1 flex-row items-center bg-gray-100 rounded-full px-4 py-2 mr-3 border border-gray-300">
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
                    className={`p-3 rounded-full ${!text.trim() ? 'bg-gray-200' : 'bg-indigo-600'}`}
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

  const { data: groups, isLoading: isLoadingGroups, isError: isErrorGroups, refetch } = useGetGroups();
  const { data: groupDetails, isLoading: isLoadingDetails, isError: isErrorDetails } = useGetGroupDetails(selectedGroup?._id || null);
  const { data: currentUser } = useQuery<User, Error>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
  
  const { mutate: deleteGroup, isPending: isDeletingGroup } = useDeleteGroup();
  const { mutate: leaveGroup, isPending: isLeavingGroup } = useLeaveGroup();
  const { mutate: removeMember, isPending: isRemovingMember } = useRemoveMember();
  
  const [searchQuery, setSearchQuery] = useState('');
  const { data: searchResults } = useSearchUsers(searchQuery);
  const { mutate: inviteUser, isPending: isInviting } = useInviteUser();
  const { data: notifications } = useGetNotifications();
  const hasUnreadNotifications = notifications?.some(n => !n.read);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

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
    refetch();
  };

  /**
   * PROJECT 4: Mute Indicator Logic
   * We render the group list and include a bell-off icon if the user has silenced the chat.
   */
  const renderGroupList = () => {
    if (isLoadingGroups || !currentUser) return <ActivityIndicator size="large" color="#4F46E5" className="mt-8"/>;
    if (isErrorGroups) return <Text className="text-center text-red-500 mt-4">Failed to load groups.</Text>;
    if (!groups || groups.length === 0) return <Text className="text-center text-gray-500 mt-4">You have no groups yet.</Text>;

    return groups.map((group) => {
      // Logic for mute indicators
      const isIndefinitelyMuted = currentUser.mutedGroups?.includes(group._id);
      const isTemporarilyMuted = currentUser.mutedUntilNextEvent?.includes(group._id);
      const isMuted = isIndefinitelyMuted || isTemporarilyMuted;

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
                  <Feather 
                    name="bell-off" 
                    size={14} 
                    color={isTemporarilyMuted ? "#6366F1" : "#9CA3AF"} 
                  />
                </View>
              )}
            </View>
          </View>
          
          {group.lastMessage ? (
            <Text className="text-sm text-gray-500 mt-1" numberOfLines={1}>
              <Text className="font-semibold text-indigo-600">{group.lastMessage.user.name}:</Text> {group.lastMessage.text}
            </Text>
          ) : (
            <Text className="text-sm text-gray-400 italic mt-1">
              No messages yet
            </Text>
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
          <View className="flex-row items-center px-4 py-3 border-b border-gray-200">
            <TouchableOpacity onPress={handleCloseGroupDetail} className="mr-4">
              <Feather name="arrow-left" size={24} color="#4F46E5"/>
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900">{selectedGroup.name}</Text>
          </View>

          <View className="flex-row border-b border-gray-200">
            <TouchableOpacity
              onPress={() => setActiveTab('Chat')}
              className={`flex-1 items-center py-3 ${activeTab === 'Chat' ? 'border-b-2 border-indigo-600' : ''}`}
            >
              <Text className={`font-semibold ${activeTab === 'Chat' ? 'text-indigo-600' : 'text-gray-500'}`}>Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('Details')}
              className={`flex-1 items-center py-3 ${activeTab === 'Details' ? 'border-b-2 border-indigo-600' : ''}`}
            >
              <Text className={`font-semibold ${activeTab === 'Details' ? 'text-indigo-600' : 'text-gray-500'}`}>Details</Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'Chat' && (
            <KeyboardAvoidingView
              style={styles.chatContainer}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
            >
              {(isLoadingDetails || !groupDetails || !currentUser) ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#4F46E5" />
                </View>
              ) : (
                <ChatProvider user={currentUser}>
                  <GroupChat group={groupDetails} />
                </ChatProvider>
              )}
            </KeyboardAvoidingView>
          )}

          {activeTab === 'Details' && (
            <ScrollView className="flex-1 p-6 bg-gray-50" keyboardShouldPersistTaps="handled">
              {(isLoadingDetails || !groupDetails || !currentUser) ? (
                  <ActivityIndicator size="large" color="#4F46E5" className="my-8" />
              ) : isErrorDetails ? (
                  <Text className="text-center text-red-500 mt-4">Failed to load group details.</Text>
              ) : (
                <GroupDetailsView 
                  groupDetails={groupDetails}
                  currentUser={currentUser}
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
            </ScrollView>
          )}
        </View>
      )}
    </SafeAreaView>
  );
};

export default GroupScreen;