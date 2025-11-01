import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useQuery } from '@tanstack/react-query';
import { GroupDetails, User, userApi, useApiClient } from '@/utils/api';

// --- CHAT IMPORTS ---
import { ChatProvider, useChatClient } from '@/components/ChatProvider';
import { Chat, Channel, MessageList, MessageInput } from 'stream-chat-react-native';

/**
 * Helper component: This contains the actual Stream UI.
 * It's designed to be rendered *inside* the ChatProvider.
 */
const GroupChatUI = ({ group }: { group: GroupDetails }) => {
  const { client } = useChatClient(); // Get the connected client from our provider
  const [channel, setChannel] = useState(null);

  useEffect(() => {
    if (!client || !group) return;

    const initChannel = async () => {
      // Use your group's unique MongoDB _id as the channel ID
      const channelId = group._id;
      
      const newChannel = client.channel('messaging', channelId, {
        name: group.name,
        // Ensure all members from your DB are in the Stream channel
        members: group.members.map(m => m._id),
      });

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
  }, [client, group]); // Re-run if the client or group changes

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
    <Chat client={client}>
      <Channel channel={channel}>
        <View style={styles.chatContainer}>
          <MessageList />
          <MessageInput />
        </View>
      </Channel>
    </Chat>
  );
};

/**
 * Main Screen Component: GroupChatScreen
 * This fetches all required data (group and user) and sets up the provider.
 */
const GroupChatScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApiClient();
  const navigation = useNavigation();
  const router = useRouter();

  // Fetch Group Details (you already had this)
  const { data: groupDetails, isLoading: isLoadingGroup } = useGetGroupDetails(id);
  
  // Fetch Current User (this is new, needed for ChatProvider)
  const { data: currentUser, isLoading: isLoadingUser } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
  });

  // Your existing effect to set the header (no changes)
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

  // Show a loading indicator until *all* data is ready
  if (isLoadingGroup || isLoadingUser || !groupDetails || !currentUser) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" className="mt-8" />
      </View>
    );
  }

  // --- Render the Chat ---
  // All data is loaded, so we can render the chat.
  return (
    <View style={styles.chatContainer}>
      {/* 1. ChatProvider takes the user and connects to Stream.
           It will show its own loading spinner until connected.
      */}
      <ChatProvider user={currentUser}>
        {/* 2. Once connected, it renders its children: our GroupChatUI component.
        */}
        <GroupChatUI group={groupDetails} />
      </ChatProvider>
    </View>
  );
};

// --- STYLES (new) ---
// Added some styles to replace Tailwind classes
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb', // from "bg-gray-100"
  },
  loadingText: {
    fontSize: 18,
    color: '#6b7280', // from "text-gray-500"
    marginTop: 8,
  },
  chatContainer: {
    flex: 1,
  },
});

export default GroupChatScreen;