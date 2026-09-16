import { useEffect } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import type { BubbleLayout } from './ChatMessageBubble';

const PANEL_WIDTH = 244;
const ESTIMATED_PANEL_HEIGHT = 220;
const SAFE_MARGIN = 14;
const REACTIONS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

interface Props {
  anchor: BubbleLayout | null;
  isOwn: boolean;
  showReactions: boolean;
  onReact: (emoji: string) => void;
  onOpenEmojiPicker: () => void;
  showReply: boolean;
  onReply: () => void;
  showEdit: boolean;
  onEdit: () => void;
  showDelete: boolean;
  onDelete: () => void;
  onClose: () => void;
}

function ReactionButton({ emoji, index, onPress }: { emoji: string; index: number; onPress: () => void }) {
  const entrance = useSharedValue(0);
  useEffect(() => {
    entrance.value = withDelay(index * 25, withSpring(1, { damping: 14, stiffness: 260 }));
  }, [entrance, index]);
  const style = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ scale: entrance.value }],
  }));
  return (
    <Animated.View style={style}>
      <TouchableOpacity style={styles.emojiBtn} onPress={onPress} activeOpacity={0.7}>
        <Text style={{ fontSize: 26 }}>{emoji}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function ChatActionPanel({
  anchor,
  isOwn,
  showReactions,
  onReact,
  onOpenEmojiPicker,
  showReply,
  onReply,
  showEdit,
  onEdit,
  showDelete,
  onDelete,
  onClose,
}: Props) {
  const entrance = useSharedValue(0);
  useEffect(() => {
    entrance.value = withTiming(1, { duration: 180 });
  }, [entrance]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * -10 },
      { scale: 0.88 + entrance.value * 0.12 },
    ],
  }));

  if (!anchor) return null;

  const { width: screenW, height: screenH } = Dimensions.get('window');

  let top = anchor.y + anchor.height + 10;
  if (top + ESTIMATED_PANEL_HEIGHT > screenH - SAFE_MARGIN) {
    top = anchor.y - ESTIMATED_PANEL_HEIGHT - 10;
  }
  top = Math.max(SAFE_MARGIN, Math.min(top, screenH - ESTIMATED_PANEL_HEIGHT - SAFE_MARGIN));

  let left = isOwn ? anchor.x + anchor.width - PANEL_WIDTH : anchor.x;
  left = Math.max(SAFE_MARGIN, Math.min(left, screenW - PANEL_WIDTH - SAFE_MARGIN));

  const handleReact = (emoji: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReact(emoji);
  };

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
      </Pressable>

      <Animated.View style={[styles.panel, { top, left, width: PANEL_WIDTH }, panelStyle]}>
        {showReactions && (
          <View style={styles.emojiRow}>
            {REACTIONS.map((emoji, i) => (
              <ReactionButton key={emoji} emoji={emoji} index={i} onPress={() => handleReact(emoji)} />
            ))}
            <ReactionButton emoji="＋" index={REACTIONS.length} onPress={onOpenEmojiPicker} />
          </View>
        )}

        {showReply && (
          <>
            {showReactions && <View style={styles.divider} />}
            <TouchableOpacity style={styles.actionRow} onPress={onReply}>
              <Feather name="corner-up-left" size={17} color="#111827" />
              <Text style={styles.actionLabel}>Reply</Text>
            </TouchableOpacity>
          </>
        )}

        {(showEdit || showDelete) && (
          <>
            <View style={styles.divider} />
            {showEdit && (
              <TouchableOpacity style={styles.actionRow} onPress={onEdit}>
                <Feather name="edit-2" size={16} color="#111827" />
                <Text style={styles.actionLabel}>Edit</Text>
              </TouchableOpacity>
            )}
            {showDelete && (
              <TouchableOpacity style={styles.actionRow} onPress={onDelete}>
                <Feather name="trash-2" size={16} color="#EF4444" />
                <Text style={[styles.actionLabel, { color: '#EF4444' }]}>Delete</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', paddingHorizontal: 6, paddingVertical: 10 },
  emojiBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16 },
  actionLabel: { fontSize: 15, color: '#111827', fontWeight: '600' },
});
