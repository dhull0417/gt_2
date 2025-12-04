import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MessageSimpleProps } from 'stream-chat-expo';
import { useChatContext } from 'stream-chat-expo';

const CustomMessage = (props: MessageSimpleProps) => {
  const { message, isMyMessage } = props;
  const { client } = useChatContext(); // Get the client

  // ✅ FIX: Early return if message is undefined to satisfy TypeScript
  if (!message) return null;

  const userName = message.user?.name || 'Unknown';

  return (
    <View style={[
      styles.container, 
      message.user?.id === client.userID ? styles.containerRight : styles.containerLeft
    ]}>
      {/* Name Header: Only show for OTHER users */}
      {message.user?.id !== client.userID && (
        <Text style={styles.nameText}>
          {userName}
        </Text>
      )}

      {/* Message Bubble */}
      <View style={[
        styles.bubble,
        message.user?.id === client.userID ? styles.bubbleRight : styles.bubbleLeft
      ]}>
        <Text style={message.user?.id === client.userID ? styles.textRight : styles.textLeft}>
          {message.text}
        </Text>
      </View>
      <Text style={styles.dateText}>
        {message.created_at 
          ? new Date(message.created_at as string | Date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    maxWidth: '80%',
    paddingHorizontal: 8,
  },
  containerLeft: {
    alignSelf: 'flex-start',
  },
  containerRight: {
    alignSelf: 'flex-end',
  },
  nameText: {
    fontSize: 12,
    color: '#6B7280', // Gray-500
    marginLeft: 4,
    marginBottom: 4,
    fontWeight: '600',
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  bubbleLeft: {
    backgroundColor: '#E5E7EB', // Gray-200
    borderBottomLeftRadius: 4,
  },
  bubbleRight: {
    backgroundColor: '#4F46E5', // Indigo-600
    borderBottomRightRadius: 4,
  },
  textLeft: {
    color: '#111827', // Gray-900
    fontSize: 16,
  },
  textRight: {
    color: '#FFFFFF', // White text
    fontSize: 16,
  },
  dateText: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
    alignSelf: 'flex-end',
    marginRight: 4,
  },
});

export default CustomMessage;