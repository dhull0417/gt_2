import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { ChatMessage } from '@/types/chat';

interface Props {
  message: ChatMessage;
  isOwn: boolean;
  onLongPress: () => void;
  currentUserId?: string;
  onReactionLongPress?: () => void;
}

export function ChatMessageBubble({ message, isOwn, onLongPress, currentUserId, onReactionLongPress }: Props) {
  const isDeleted = !!message.deleted_at;
  const isEdited = !!message.edited_at && !isDeleted;

  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const reactions = (!isDeleted && message.reactions) ? message.reactions : {};
  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  return (
    <View style={[styles.row, isOwn && styles.rowOwn]}>
      <View style={styles.column}>
        <TouchableOpacity
          style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}
          onLongPress={isDeleted ? undefined : onLongPress}
          delayLongPress={350}
          activeOpacity={isDeleted ? 1 : 0.85}
        >
          {!isOwn && <Text style={styles.senderName}>{message.sender_name}</Text>}

          {message.reply_to_id && !isDeleted && (
            <View style={[styles.quoteBlock, isOwn && styles.quoteBlockOwn]}>
              <Text style={[styles.quoteSender, isOwn && styles.quoteSenderOwn]} numberOfLines={1}>
                {message.reply_to_sender}
              </Text>
              <Text style={[styles.quoteContent, isOwn && styles.quoteContentOwn]} numberOfLines={2}>
                {message.reply_to_content}
              </Text>
            </View>
          )}

          {isDeleted ? (
            <Text style={styles.deletedText}>This message was deleted</Text>
          ) : (
            <Text style={[styles.content, isOwn && styles.contentOwn]}>{message.content}</Text>
          )}

          <View style={styles.timeRow}>
            {isEdited && <Text style={[styles.editedLabel, isOwn && styles.editedLabelOwn]}>edited · </Text>}
            <Text style={[styles.time, isOwn && styles.timeOwn]}>{time}</Text>
          </View>
        </TouchableOpacity>

        {reactionEntries.length > 0 && (
          <View style={[styles.reactions, isOwn && styles.reactionsOwn]}>
            {reactionEntries.map(([emoji, users]) => {
              const reacted = currentUserId ? users.includes(currentUserId) : false;
              return (
                <TouchableOpacity key={emoji} onLongPress={onReactionLongPress} delayLongPress={350} activeOpacity={0.8}>
                  <View style={[styles.badge, reacted && styles.badgeActive]}>
                    <Text style={styles.badgeEmoji}>{emoji}</Text>
                    <Text style={[styles.badgeCount, reacted && styles.badgeCountActive]}>{users.length}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 4, paddingHorizontal: 12 },
  rowOwn: { justifyContent: 'flex-end' },
  column: { maxWidth: '75%' },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleOwn: { backgroundColor: '#4A90E2', borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#E5E7EB', borderBottomLeftRadius: 4 },
  senderName: { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 2 },
  content: { fontSize: 15, color: '#111827' },
  contentOwn: { color: '#fff' },
  deletedText: { fontSize: 14, color: '#aaa', fontStyle: 'italic' },
  quoteBlock: { borderLeftWidth: 3, borderLeftColor: 'rgba(255,255,255,0.6)', paddingLeft: 8, paddingVertical: 3, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 4 },
  quoteBlockOwn: { borderLeftColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.15)' },
  quoteSender: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.9)', marginBottom: 1 },
  quoteSenderOwn: { color: 'rgba(255,255,255,0.9)' },
  quoteContent: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  quoteContentOwn: { color: 'rgba(255,255,255,0.75)' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  editedLabel: { fontSize: 11, color: '#888' },
  editedLabelOwn: { color: 'rgba(255,255,255,0.6)' },
  time: { fontSize: 11, color: '#888' },
  timeOwn: { color: 'rgba(255,255,255,0.7)' },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 4 },
  reactionsOwn: { justifyContent: 'flex-end' },
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#e0e0e0' },
  badgeActive: { backgroundColor: '#e8f0ff', borderColor: '#4A90E2' },
  badgeEmoji: { fontSize: 14 },
  badgeCount: { fontSize: 12, color: '#555', marginLeft: 3, fontWeight: '600' },
  badgeCountActive: { color: '#4A90E2' },
});
