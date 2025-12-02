import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput, Keyboard, Alert, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import React, { useState, useCallback, useEffect } from 'react';
import { SafeAreaView, useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { useGetGroups } from '@/hooks/useGetGroups';
import { useAddMember } from '@/hooks/useAddMember';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useDeleteGroup } from '@/hooks/useDeleteGroup';
import { useLeaveGroup } from '@/hooks/useLeaveGroup';
import { useRemoveMember } from '@/hooks/useRemoveMember';
import { Group, GroupDetails, Schedule, User, useApiClient, userApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';
import { useSearchUsers } from '@/hooks/useSearchUsers';
import { useInviteUser } from '@/hooks/useInviteUser';
import { ChatProvider, useChatClient } from '@/components/ChatProvider';
import type { Channel as StreamChannel } from 'stream-chat';
import { Chat, Channel, MessageList, MessageInput, OverlayProvider, MessageSimple } from 'stream-chat-react-native';
import CustomMessage from '@/components/CustomMessage';

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    fontSize: 18,
    color: '#6b7280',
    marginTop: 8,
  },
  chatContainer: {
    flex: 1,
  },
});

const TestMessage = (props: any) => {
  const isMyMessage = props.isMyMessage;
  const userName = props.message.user?.name || 'Unknown';

  return (
    <View style={{ marginVertical: 5, padding: 10, alignItems: isMyMessage ? 'flex-end' : 'flex-start' }}>
      {/* ALWAYS SHOW NAME FOR EVERYONE FOR THIS TEST */}
      <Text style={{ fontSize: 10, color: 'red', marginBottom: 2 }}>
        {userName}
      </Text>
      <View style={{ backgroundColor: isMyMessage ? '#DBEAFE' : '#E5E7EB', padding: 8, borderRadius: 8 }}>
        <Text>{props.message.text}</Text>
      </View>
    </View>
  );
};


const GroupChat = ({ group }: { group: GroupDetails }) => {
  const { client, isConnected } = useChatClient(); // ← Get isConnected too
  const [channel, setChannel] = useState<StreamChannel | null>(null);

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

  // SHOW LOADING UNTIL CLIENT + CHANNEL ARE READY
  if (!client || !isConnected || !channel) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Joining chat...</Text>
      </View>
    );
  }

  return (
    <OverlayProvider>
      <Chat client={client}>
        <Channel channel={channel}>
          <View style={styles.chatContainer}>
            <MessageList 
              Message={CustomMessage}
            />
            <MessageInput />
          </View>
        </Channel>
      </Chat>
    </OverlayProvider>
  );
};

const GroupScreen = () => {
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isGroupDetailVisible, setIsGroupDetailVisible] = useState(false);
  const [userIdToAdd, setUserIdToAdd] = useState('');
  const [activeTab, setActiveTab] = useState('Chat');
  const insets = useSafeAreaInsets();
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: groups, isLoading: isLoadingGroups, isError: isErrorGroups, refetch } = useGetGroups();
  const { data: groupDetails, isLoading: isLoadingDetails, isError: isErrorDetails } = useGetGroupDetails(selectedGroup?._id || null);
  const { data: currentUser } = useQuery<User, Error>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
  const { mutate: addMember, isPending: isAddingMember } = useAddMember();
  const { mutate: deleteGroup, isPending: isDeletingGroup } = useDeleteGroup();
  const { mutate: leaveGroup, isPending: isLeavingGroup } = useLeaveGroup();
  const { mutate: removeMember, isPending: isRemovingMember } = useRemoveMember();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: searchResults } = useSearchUsers(searchQuery);
  const { mutate: inviteUser, isPending: isInviting } = useInviteUser();

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const handleInvite = (userIdToInvite: string) => {
    if (!selectedGroup) return;
    inviteUser({ groupId: selectedGroup._id, userIdToInvite });
  };

  const formatSchedule = (schedule: Schedule): string => {
    if (schedule.frequency === 'weekly') {
      const daysOfWeek = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
      const selectedDays = schedule.days.map(dayIndex => daysOfWeek[dayIndex]).join(', ');
      return `Weekly on ${selectedDays}`;
    }
    const day = schedule.days[0];
    let suffix = 'th';
    if ([1, 21, 31].includes(day)) suffix = 'st';
    else if ([2, 22].includes(day)) suffix = 'nd';
    else if ([3, 23].includes(day)) suffix = 'rd';
    return `Monthly on the ${day}${suffix}`;
  };

  const handleAddMember = () => {
    if (!userIdToAdd.trim() || !selectedGroup) return;
    addMember({ groupId: selectedGroup._id, userId: userIdToAdd }, {
      onSuccess: () => {
        setUserIdToAdd('');
        Keyboard.dismiss();
        queryClient.invalidateQueries({ queryKey: ['groupDetails', selectedGroup._id] });
      }
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
    Alert.alert("Remove Member", "Are you sure you want to remove this member from the group?", [
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
    setUserIdToAdd('');
    setSearchQuery('');
    refetch();
  };

  const renderGroupList = () => {
    if (isLoadingGroups || !currentUser) return <ActivityIndicator size="large" color="#4f46e5" className="mt-8"/>;
    if (isErrorGroups) return <Text className="text-center text-red-500 mt-4">Failed to load groups.</Text>;
    if (!groups || groups.length === 0) return <Text className="text-center text-gray-500 mt-4">You have no groups yet.</Text>;

    return groups.map((group) => (
      <TouchableOpacity
        key={group._id}
        className="bg-white p-5 my-2 rounded-lg shadow-sm border border-gray-200"
        onPress={() => handleOpenGroupDetail(group)}
      >
        <Text className="text-lg font-semibold text-gray-800">{group.name}</Text>
        {group.lastMessage ? (
          <Text className="text-sm text-gray-500 mt-1" numberOfLines={1}>
            <Text className="font-semibold">{group.lastMessage.user.name}:</Text> {group.lastMessage.text}
          </Text>
        ) : (
          <Text className="text-sm text-gray-400 italic mt-1">
            No messages yet
          </Text>
        )}
      </TouchableOpacity>
    ));
  };

  return (
    <SafeAreaView className='flex-1 bg-gray-50'>
      <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200 bg-white">
        <View className="w-7" />
        <Text className="text-xl font-bold text-gray-900">Groups</Text>
        <TouchableOpacity onPress={() => router.push('/create-group')}>
          <Feather name="plus-circle" size={28} color="#4f46e5" />
        </TouchableOpacity>
      </View>
      <ScrollView className="px-4">
        {renderGroupList()}
      </ScrollView>

      {isGroupDetailVisible && selectedGroup && (
        <View className="absolute top-0 bottom-0 left-0 right-0 bg-white" style={{paddingTop:insets.top}}>
          <View className="flex-row items-center px-4 py-3 border-b border-gray-200">
            <TouchableOpacity onPress={handleCloseGroupDetail} className="mr-4">
              <Feather name="arrow-left" size={24} color="#4f46e5"/>
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
                keyboardVerticalOffset={insets.top + 90}
            >
                {(isLoadingDetails || !groupDetails || !currentUser) ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" />
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
            {/* --- Loading / Error States --- */}
            {isLoadingDetails && <ActivityIndicator size="large" color="#4f46e5" className="my-8" />}
            {isErrorDetails && <Text className="text-center text-red-500">Failed to load group details.</Text>}

            {/* --- Main Details Content --- */}
            {groupDetails && currentUser && (
              <View className="pb-32">
                {/* --- Schedule Info --- */}
                {groupDetails.schedule && (
                  <View className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
                    <Text className="text-lg font-semibold text-gray-800 mb-2">Schedule</Text>
                    <View className="flex-row items-center">
                      <Feather name="calendar" size={20} color="#6B7280" />
                      <Text className="text-base text-gray-700 ml-3">{formatSchedule(groupDetails.schedule)}</Text>
                    </View>
                  </View>
                )}

                {/* --- Member List --- */}
                <View className="mb-6">
                  <Text className="text-xl font-bold text-gray-800 mb-3">Members</Text>
                  {groupDetails.members.map(member => (
                    <View key={member._id} className="flex-row items-center justify-between bg-white p-3 rounded-lg shadow-sm border border-gray-200 mb-2">
                      <View className="flex-row items-center">
                        <Image source={{ uri: member.profilePicture || 'https://placehold.co/100x100/EEE/31343C?text=?' }} className="w-10 h-10 rounded-full mr-3" />
                        <Text className="text-base text-gray-700">{member.firstName} {member.lastName}</Text>
                      </View>
                      {/* Show Remove button if user is owner AND this is not them */}
                      {currentUser._id === groupDetails.owner && member._id !== currentUser._id && (
                        <TouchableOpacity onPress={() => handleRemoveMember(member._id)} disabled={isRemovingMember}>
                          <Feather name="x-circle" size={22} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>

                {/* --- Owner: Invite Members --- */}
                {currentUser._id === groupDetails.owner && (
                  <View className="mb-8">
                    <Text className="text-xl font-bold text-gray-800 mb-3">Invite Members</Text>
                    <TextInput
                      className="bg-white border border-gray-300 rounded-lg p-3 text-base"
                      placeholder="Search for users by email..."
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {searchResults && searchResults.length > 0 && (
                      <View className="mt-2 border border-gray-200 rounded-lg bg-white">
                        {searchResults.map(user => (
                          <TouchableOpacity
                            key={user._id}
                            className="flex-row items-center justify-between p-3 border-b border-gray-100"
                            onPress={() => handleInvite(user._id)}
                            disabled={isInviting}
                          >
                            <Text className="text-base text-gray-700">{user.firstName} {user.lastName} ({user.email})</Text>
                            {isInviting ? <ActivityIndicator /> : <Feather name="plus" size={22} color="#4f46e5" />}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* --- Danger Zone --- */}
                <View className="border-t border-gray-300 pt-6">
                  {currentUser._id === groupDetails.owner ? (
                    // --- Owner Actions ---
                    <TouchableOpacity
                      onPress={handleDeleteGroup}
                      disabled={isDeletingGroup}
                      className="bg-red-600 rounded-lg p-4 items-center shadow-lg"
                    >
                      {isDeletingGroup ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-lg">Delete Group</Text>}
                    </TouchableOpacity>
                  ) : (
                    // --- Member Actions ---
                    <TouchableOpacity
                      onPress={handleLeaveGroup}
                      disabled={isLeavingGroup}
                      className="bg-red-600 rounded-lg p-4 items-center shadow-lg"
                    >
                      {isLeavingGroup ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-lg">Leave Group</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        )}
        </View>
      )}
    </SafeAreaView>
  );
};

export default GroupScreen;