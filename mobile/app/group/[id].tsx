import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useQuery } from '@tanstack/react-query';
import { GroupDetails, User, userApi, useApiClient } from '@/utils/api';
import { ChatProvider, useChatClient } from '@/components/ChatProvider';

// --- FIX: Import types from the core 'stream-chat' package ---
import type { Channel, ChannelData } from 'stream-chat';

// --- FIX: Renamed 'Channel' component to avoid name conflict with the type ---
import { Chat, Channel as ChannelContext, MessageList, MessageInput } from 'stream-chat-react-native';

/**
 * Helper component: This contains the actual Stream UI.
 */
const GroupChatUI = ({ group }: { group: GroupDetails }) => {
  const { client } = useChatClient();
  
  // --- FIX #2: Explicitly type the channel state ---
  // This tells TypeScript that 'channel' can be 'Channel' or 'null'
  const [channel, setChannel] = useState<Channel | null>(null);

  useEffect(() => {
    if (!client || !group) return;

    const initChannel = async () => {
      const channelId = group._id;
      
      // --- FIX #1: Cast the data object as 'ChannelData' ---
      // This fixes the error about 'name' not existing
      const newChannel = client.channel('messaging', channelId, {
        name: group.name,
        members: group.members.map(m => m._id),
      } as ChannelData); // Cast to ChannelData

      await newChannel.watch();
      setChannel(newChannel); // This now works because of Fix #2
    };

    initChannel();

    return () => {
      // Cleanup
      if (channel) {
        // --- FIX #3: This now works because 'channel' is typed correctly ---
        channel.stopWatching();
      }
    };
  // Added 'channel' to dependency array for correct cleanup
  }, [client, group, channel]); 

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
    <Chat client={client}>
      {/* --- FIX: Use the renamed 'ChannelContext' component --- */}
      <ChannelContext channel={channel}>
        <View style={styles.chatContainer}>
          <MessageList />
          <MessageInput />
        </View>
      </ChannelContext>
    </Chat>
  );
};

/**
 * Main Screen Component: GroupChatScreen
 * (No changes needed in this part)
 */
const GroupChatScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApiClient();
  const navigation = useNavigation();
  const router = useRouter();

  const { data: groupDetails, isLoading: isLoadingGroup } = useGetGroupDetails(id);
  
  const { data: currentUser, isLoading: isLoadingUser } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
  });

  useEffect(() => {
    if (groupDetails) {
      navigation.setOptions({
        headerTitle: () => (
          <TouchableOpacity onPress={() => router.push({ pathname: '/group-details/[id]', params: { id: id } })}>
            <View>
              <Text className="text-lg font-bold text-center" numberOfLines={1}>{groupDetails.name}</Text>
              {groupDetails.members && (
                <Text className="text-sm text-gray-500 text-center">{groupDetails.members.length} members</Text>
              )}
            </View>
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, groupDetails, id, router]);

  if (isLoadingGroup || isLoadingUser || !groupDetails || !currentUser) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" className="mt-8" />
      </View>
    );
  }

  return (
    <View style={styles.chatContainer}>
      <ChatProvider user={currentUser}>
        <GroupChatUI group={groupDetails} />
      </ChatProvider>
    </View>
  );
};

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

export default GroupChatScreen;