import React, { createContext, useContext, useEffect, useState } from 'react';
import { StreamChat } from 'stream-chat';
import { useQuery } from '@tanstack/react-query';
// Make sure to import chatApi from your api.ts file
import { User, chatApi, useApiClient } from '@/utils/api';
import { ActivityIndicator, View } from 'react-native';

// Get your Stream API key from your environment variables
const STREAM_API_KEY = process.env.EXPO_PUBLIC_STREAM_API_KEY;
if (!STREAM_API_KEY) {
  throw new Error("Missing EXPO_PUBLIC_STREAM_API_KEY");
}

// Initialize the client
const client = StreamChat.getInstance(STREAM_API_KEY);

interface ChatContextValue {
  client: StreamChat;
  isReady: boolean;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

/**
 * This provider component does all the heavy lifting:
 * 1. Fetches the chat token from your backend
 * 2. Connects the user to Stream
 * 3. Provides the connected client to any children components
 */
export const ChatProvider = ({ 
  user, 
  children 
}: { 
  user: User; 
  children: React.ReactNode 
}) => {
  const [isReady, setIsReady] = useState(false);
  const api = useApiClient();

  // 1. Fetch the token from your backend using the hook from Step 2
  const { data: token } = useQuery({
    queryKey: ['chatToken'],
    queryFn: () => chatApi.getClientToken(api),
    enabled: !!user, // Only run if the user is loaded
  });

  useEffect(() => {
    // Don't run until we have the token AND user
    if (!token || !user || isReady) return;

    const connectUser = async () => {
      try {
        // 2. Connect the user to Stream
        await client.connectUser(
          {
            id: user._id, // User ID from your MongoDB
            name: `${user.firstName} ${user.lastName}`,
            image: user.profilePicture,
          },
          token // The token from your backend
        );
        // 3. Set ready state
        setIsReady(true);
      } catch (e) {
        console.error("Failed to connect user to Stream:", e);
      }
    };

    connectUser();

    return () => {
      // Cleanup on unmount
      if (isReady) {
        client.disconnectUser();
      }
      setIsReady(false);
    };
  }, [token, user]); // Re-run if token or user changes

  // Show a spinner until the connection is complete
  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Provide the client to children
  return (
    <ChatContext.Provider value={{ client, isReady }}>
      {children}
    </ChatContext.Provider>
  );
};

// Custom hook to easily access the client
export const useChatClient = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChatClient must be used within a ChatProvider');
  }
  return context;
};