import React, { createContext, useContext, useEffect, useState } from 'react';
import { StreamChat } from 'stream-chat';
import { User } from '@/utils/api';

interface ChatContextType {
  client: StreamChat | null;
  isConnected: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({
  children,
  user,
}: {
  children: React.ReactNode;
  user: User;
}) => {
  const [client, setClient] = useState<StreamChat | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const initChat = async () => {
      if (!user?._id || !user?.streamToken) {
        console.log('Missing user ID or streamToken');
        return;
      }

      const chatClient = StreamChat.getInstance(
        process.env.EXPO_PUBLIC_STREAM_API_KEY!
      );

      try {
        const displayName = user.firstName
          ? `${user.firstName} ${user.lastName ?? ''}`.trim()
          : user.email;

        await chatClient.connectUser(
          {
            id: user._id,
            name: displayName,
            ...(user.email && { email: user.email }),
          },
          user.streamToken
        );

        setClient(chatClient);
        setIsConnected(true);
        console.log('Stream connected →', user._id);
      } catch (err) {
        console.error('Stream connection error:', err);
      }
    };

    initChat();

    return () => {
      client?.disconnectUser?.();
      setIsConnected(false);
    };
  }, [user]);

  return (
    <ChatContext.Provider value={{ client, isConnected }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChatClient = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatClient must be used within ChatProvider');
  return ctx;
};