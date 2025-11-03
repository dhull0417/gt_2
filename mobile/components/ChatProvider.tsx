import React, { createContext, useContext, useEffect, useState } from 'react';
import { StreamChat } from 'stream-chat';
import { useQuery } from '@tanstack/react-query';
// Make sure to import chatApi from your api.ts file
import { User, chatApi, useApiClient } from '@/utils/api';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';

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

  const { 
    data: token,
    isLoading: isTokenLoading, // Use a separate loading state for the token
    isError,
    error,
  } = useQuery<string, Error>({
    queryKey: ['chatToken', user?._id], // Key by user ID to refetch for new user
    queryFn: () => chatApi.getClientToken(api),
    enabled: !!user, // Only run if the user is loaded
    retry: false,
  });

  // --- START: Merged useEffect ---
  useEffect(() => {
    let didConnect = false; // Flag to track if connection was successful

    const manageConnection = async () => {
      // Don't do anything if we don't have the data we need
      // Wait for token to be fetched
      if (!token || !user) {
        setIsReady(false);
        return;
      }

      try {
        // Check if a *different* user is currently connected
        if (client.userID && client.userID !== user._id) {
          console.log(`Disconnecting previous user: ${client.userID}`);
          await client.disconnectUser(); // Wait for disconnect to finish
          setIsReady(false);
        }

        // Now, only connect if no user is connected
        if (!client.userID) {
          console.log(`Connecting user: ${user._id}`);
          await client.connectUser(
            {
              id: user._id,
              name: `${user.firstName} ${user.lastName}`,
              image: user.profilePicture,
            },
            token
          );
          didConnect = true;
          setIsReady(true);
        } else if (client.userID === user._id) {
          // We are already connected as the correct user
          didConnect = true;
          setIsReady(true);
        }
      } catch (e) {
        console.error("Failed to connect user to Stream:", e);
        setIsReady(false);
      }
    };

    manageConnection();

    // This cleanup function now only handles the unmount of the component
    return () => {
      if (didConnect) {
        console.log(`Unmounting: Disconnecting user ${client.userID}...`);
        client.disconnectUser();
      }
      setIsReady(false);
    };
  }, [token, user]); // This effect correctly re-runs when the user or token changes
  // --- END: Merged useEffect ---

  // Handle token loading state
  if (isTokenLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Connecting to chat...</Text>
      </View>
    );
  }

  // Handle token error state
  if (isError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Failed to load chat:</Text>
        <Text style={styles.errorTextSmall}>{error?.message}</Text>
      </View>
    );
  }

  // Handle client connection state (after token is loaded)
  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Joining channel...</Text>
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

// --- ADDED STYLES ---
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 10,
  },
  errorText: {
    fontSize: 18,
    color: '#ef4444',
    fontWeight: '600',
    textAlign: 'center',
  },
  errorTextSmall: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 10,
  },
});