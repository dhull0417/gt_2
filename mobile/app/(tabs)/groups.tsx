import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput, Keyboard, Alert, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import React, { useState, useCallback, useEffect } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import type { Channel, ChannelData } from 'stream-chat';
import { Chat, Channel as ChannelContext, MessageList, MessageInput, OverlayProvider } from 'stream-chat-react-native';

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb', // The 's' has been removed from here
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

// --- 3. ADD HELPER COMPONENT ---
/**
 * Helper component: This contains the actual Stream UI.
 * It's designed to be rendered *inside* the ChatProvider.
 */
const GroupChat = ({ group }: { group: GroupDetails }) => {
  const { client } = useChatClient(); // Get the connected client from our provider
  const [channel, setChannel] = useState<Channel | null>(null);

  useEffect(() => {
    if (!client || !group) return;

    const initChannel = async () => {
      // Use your group's unique MongoDB _id as the channel ID
      const channelId = group._id;
      
      const newChannel = client.channel('messaging', channelId);

      // watch() gets channel data and listens for real-time updates
      await newChannel.watch();
      setChannel(newChannel);
    };

    initChannel();

    return () => {
      // Cleanup: stop watching channel when component unmounts
      if (channel) {
        channel.stopWatching();
      }
    };
  }, [client, group]); // Re-run if the client, group, or channel state changes

  // Show a loader until the channel is fully initialized
  if (!channel) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Joining chat...</Text>
      </View>
    );
  }

  // Render the Stream chat components
  return (
    <Chat client={client}><ChannelContext channel={channel}><View style={styles.chatContainer}><MessageList /><MessageInput /></View></ChannelContext></Chat>
  );
};
// --- END HELPER COMPONENT ---

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
            </TouchableOpacity>
        ));
    };

    return (
        <SafeAreaView className='flex-1 bg-gray-50'>
            <View className="flex-row justify-center items-center px-4 py-3 border-b border-gray-200 bg-white relative">
                <Text className="text-xl font-bold text-gray-900">Groups</Text>
            </View>
            <ScrollView className="px-4">
                <View className="my-4">
                    <TouchableOpacity 
                        className={`py-4 rounded-lg items-center shadow ${!currentUser ? 'bg-indigo-300' : 'bg-indigo-600'}`} 
                        disabled={!currentUser}
                        onPress={() => router.push('/create-group')}
                          >
                            <Text className="text-white text-lg font-bold">Create Group</Text>
                          </TouchableOpacity>
                  </View>
                <View>{renderGroupList()}</View>
            </ScrollView>
            
            {isGroupDetailVisible && selectedGroup && (
                 <View className="absolute top-0 bottom-0 left-0 right-0 bg-white" style={{ paddingTop: insets.top }}>
                    <View className="flex-row items-center px-4 py-3 border-b border-gray-200">
                        <TouchableOpacity onPress={handleCloseGroupDetail} className="mr-4">
                            <Feather name="arrow-left" size={24} color="#4f46e5" />
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
                            // This offset accounts for your modal's header and tab bar
                            // You may need to adjust the '90' slightly
                            keyboardVerticalOffset={insets.top + 90} 
                        >
                          { (isLoadingDetails || !groupDetails || !currentUser) ? (
                              <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" />
                              </View>
                       ) : (
                              // Collapsed for whitespace fix
                       <OverlayProvider><ChatProvider user={currentUser}><GroupChat group={groupDetails} /></ChatProvider></OverlayProvider>
                        ) }
                        </KeyboardAvoidingView>
                 )}

                    {activeTab === 'Details' && (
                        <ScrollView className="flex-1 p-6 bg-gray-50" keyboardShouldPersistTaps="handled">
                            <View className="flex-row justify-between items-center mb-8">
                                <Text className="text-lg text-gray-800 font-semibold">Group Details</Text>
                                {currentUser && currentUser._id === selectedGroup.owner && (
                                    <Link 
                                        href={{ pathname: "/group-edit/[id]" as any, params: { id: selectedGroup._id } }} 
                                        asChild
                                    >
                                        <TouchableOpacity className="flex-row items-center bg-gray-200 px-3 py-1 rounded-full">
                                            <Feather name="edit-2" size={14} color="#4B5563" />
                                            <Text className="text-gray-700 font-semibold ml-2">Edit</Text>
                                        </TouchableOpacity>
                                    </Link>
                                )}
                            </View>
                            <View className="space-y-2 mb-8">
                                <Text className="text-base text-gray-600">ID: {selectedGroup._id}</Text>
                                <Text className="text-base text-gray-600">Meeting Time: {selectedGroup.time}</Text>
                                {selectedGroup.schedule && (
                                    <Text className="text-base text-gray-600">Recurring: {formatSchedule(selectedGroup.schedule)}</Text>
                                )}
                            </View>
                            <View className="mb-8">
                                <Text className="text-lg text-gray-800 font-semibold mb-2">Members</Text>
                                {isLoadingDetails ? <ActivityIndicator color="#4f46e5" /> : isErrorDetails ? <Text className="text-red-500">Could not load members.</Text> : 
                                    (groupDetails?.members.map(member => {
                                        const isOwner = currentUser?._id === selectedGroup.owner;
                                        const isSelf = currentUser?._id === member._id;
                                        const canRemove = isOwner && !isSelf;
                                        return (
                                            <View key={member._id} className="flex-row items-center justify-between bg-white p-3 rounded-lg mb-2 shadow-sm">
                                                <View className="flex-row items-center flex-1">
                                                    <Image source={{ uri: member.profilePicture || 'https://placehold.co/100x100/EEE/31343C?text=?' }} className="w-10 h-10 rounded-full mr-4" />
                                                    <Text className="text-base text-gray-700 flex-1">{member.firstName} {member.lastName}</Text>
                                                </View>
                                                {canRemove && (
                                                    <TouchableOpacity onPress={() => handleRemoveMember(member._id)} disabled={isRemovingMember} className="p-2">
                                                        <Feather name="x-circle" size={24} color="#ef4444" />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        )
                                    }))
                                }
                            </View>
                            {currentUser && currentUser._id === selectedGroup.owner && (
                                <View className="mb-8">
                                    <Text className="text-lg text-gray-800 font-semibold mb-2">Invite by Username</Text>
                                    <TextInput
                                        className="w-full p-4 border border-gray-300 rounded-lg bg-white text-base"
                                        placeholder="Search for a user..."
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                        autoCapitalize="none"
                                    />
                                    {searchResults && searchResults.length > 0 && (
                                        <View className="mt-2 bg-white border border-gray-200 rounded-lg">
                                            {searchResults.map(user => (
                                                <View key={user._id} className="flex-row items-center justify-between p-2 border-b border-gray-100">
                                                    <View className="flex-row items-center">
                                                        <Image source={{ uri: user.profilePicture }} className="w-8 h-8 rounded-full mr-2" />
                                                        <Text>{user.firstName} {user.lastName} (@{user.username})</Text>
                                                    </View>
                                                    <TouchableOpacity onPress={() => handleInvite(user._id)} disabled={isInviting} className="bg-indigo-500 px-3 py-1 rounded-md">
                                                        <Text className="text-white font-bold">Invite</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            )}
                            <View className="mt-4 pt-4 border-t border-gray-300">
                                {currentUser && currentUser._id === selectedGroup.owner && (
                                    <Link href={{ pathname: `/schedule-event/[group-id]`, params: { "group-id": selectedGroup._id } }} asChild>
                                        <TouchableOpacity className="py-4 mb-4 rounded-lg items-center shadow bg-blue-500">
                                            <Text className="text-white text-lg font-bold">Schedule One-Off Event</Text>
                                        </TouchableOpacity>
                                    </Link>
                                )}
                                {currentUser && currentUser._id !== selectedGroup.owner && groupDetails?.members.some((m: User) => m._id === currentUser._id) && (
                                    <TouchableOpacity
                                        onPress={handleLeaveGroup}
                                        disabled={isLeavingGroup}
                                        className={`py-4 mb-4 rounded-lg items-center shadow ${isLeavingGroup ? 'bg-red-300' : 'bg-red-600'}`}
                                    >
                                        {isLeavingGroup ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">Leave Group</Text>}
                                    </TouchableOpacity>
                                )}
                                {currentUser && currentUser._id === selectedGroup.owner && (
                                    <TouchableOpacity
                                        onPress={handleDeleteGroup}
                                        disabled={isDeletingGroup}
                                        className={`py-4 rounded-lg items-center shadow ${isDeletingGroup ? 'bg-red-300' : 'bg-red-600'}`}
                                    >
                                        {isDeletingGroup ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">Delete Group</Text>}
                                    </TouchableOpacity>
                                )}
                            </View>
                        </ScrollView>
                    )}
                </View>
            )}
        </SafeAreaView>
    );
};

export default GroupScreen;