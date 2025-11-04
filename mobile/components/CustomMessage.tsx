import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { MessageSimpleProps } from 'stream-chat-react-native';

const CustomMessage: React.FC<MessageSimpleProps> = ({ message, groupStyles }) => {
  // Early return if message or groupStyles is undefined
  if (!message || !groupStyles) return null;

  const senderName = message.user?.name || 'Unknown';
  const senderImage = message.user?.image || null;

  return (
    <View style={styles.messageContainer}>
      {(groupStyles[0] === 'single' || groupStyles[0] === 'top') && (
        <View style={styles.senderRow}>
          {senderImage && <Image source={{ uri: senderImage }} style={styles.avatar} />}
          <Text style={styles.senderName}>{senderName}</Text>
        </View>
      )}
      <Text style={styles.textMessage}>{message.text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    marginVertical: 2,
    paddingHorizontal: 8,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  avatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 4,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  textMessage: {
    fontSize: 14,
    padding: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
  },
});

export default CustomMessage;
