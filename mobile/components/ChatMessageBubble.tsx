import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { useEffect, useRef } from 'react';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { ChatMessage } from '@/types/chat';

export interface BubbleLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  message: ChatMessage;
  isOwn: boolean;
  onLongPress: (layout: BubbleLayout) => void;
  currentUserId?: string;
  onReactionLongPress?: () => void;
  onImagePress?: (url: string, width?: number | null, height?: number | null) => void;
  // Tapping a still-sending or failed-to-send placeholder — offers cancel (pending) or retry/discard (failed).
  onPendingPress?: () => void;
  onSwipeReply?: () => void;
  isHighlighted?: boolean;
  // Initial history load renders every bubble at once — animating all of them in
  // together stalls the JS thread just long enough to make the header back button
  // feel unresponsive. Skip the entrance spring for that first batch.
  skipEntrance?: boolean;
}

const MAX_IMAGE_WIDTH = 240;
const MAX_IMAGE_HEIGHT = 300;
const MIN_IMAGE_WIDTH = 140;
const SWIPE_MAX = 64;
const SWIPE_TRIGGER = 44;

// Legacy messages sent before dimensions were captured fall back to the old fixed box.
function getImageDisplaySize(width?: number | null, height?: number | null) {
  if (!width || !height) return { width: 220, height: 165 };

  const ratio = width / height;
  let w = MAX_IMAGE_WIDTH;
  let h = w / ratio;

  if (h > MAX_IMAGE_HEIGHT) {
    h = MAX_IMAGE_HEIGHT;
    w = h * ratio;
  }
  if (w < MIN_IMAGE_WIDTH) {
    w = MIN_IMAGE_WIDTH;
    h = w / ratio;
  }
  // Cap extreme aspect ratios; contentFit="cover" crops rather than oversizing the bubble
  h = Math.min(h, MAX_IMAGE_HEIGHT);

  return { width: Math.round(w), height: Math.round(h) };
}

export function ChatMessageBubble({
  message,
  isOwn,
  onLongPress,
  currentUserId,
  onReactionLongPress,
  onImagePress,
  onPendingPress,
  onSwipeReply,
  isHighlighted,
  skipEntrance,
}: Props) {
  const isDeleted = !!message.deleted_at;
  const isEdited = !!message.edited_at && !isDeleted;
  const hasImage = !!message.image_url && !isDeleted;
  const hasText = !!message.content && !isDeleted;
  const imageSize = hasImage ? getImageDisplaySize(message.image_width, message.image_height) : null;
  const canInteract = !isDeleted && !message.pending && !message.failed;

  const time = message.failed
    ? "Couldn't send"
    : message.pending
    ? 'Sending…'
    : new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const reactions = (!isDeleted && message.reactions) ? message.reactions : {};
  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  const bubbleRef = useRef<View>(null);
  const handleLongPress = () => {
    if (!canInteract) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress({ x, y, width, height });
    });
  };

  // --- Entrance: slides + fades + scales in from the sender's side, once, on mount ---
  const entrance = useSharedValue(skipEntrance ? 1 : 0);
  useEffect(() => {
    if (skipEntrance) return;
    entrance.value = withSpring(1, { damping: 16, stiffness: 180 });
  }, [entrance, skipEntrance]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * 14 },
      { translateX: (1 - entrance.value) * (isOwn ? 26 : -26) },
      { scale: 0.85 + entrance.value * 0.15 },
    ],
  }));

  // --- Highlight while the press-and-hold menu is open for this message ---
  const highlight = useSharedValue(1);
  useEffect(() => {
    highlight.value = withSpring(isHighlighted ? 1.045 : 1, { damping: 14, stiffness: 260 });
  }, [isHighlighted, highlight]);

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [{ scale: highlight.value }],
    zIndex: isHighlighted ? 10 : 0,
  }));

  // --- Swipe-right-to-reply ---
  const swipeX = useSharedValue(0);
  const triggerReply = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSwipeReply?.();
  };
  const panGesture = Gesture.Pan()
    .enabled(canInteract && !!onSwipeReply)
    .activeOffsetX(12)
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      if (e.translationX <= 0) {
        swipeX.value = 0;
        return;
      }
      swipeX.value = Math.min(e.translationX, SWIPE_MAX);
    })
    .onEnd(() => {
      if (swipeX.value >= SWIPE_TRIGGER) {
        runOnJS(triggerReply)();
      }
      swipeX.value = withSpring(0, { damping: 18, stiffness: 260 });
    });

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }],
  }));

  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: Math.min(swipeX.value / SWIPE_TRIGGER, 1),
    transform: [{ scale: 0.6 + Math.min(swipeX.value / SWIPE_TRIGGER, 1) * 0.4 }],
  }));

  return (
    <Animated.View style={[styles.row, isOwn && styles.rowOwn, entranceStyle]}>
      <Animated.View style={[styles.replyHint, replyIconStyle]} pointerEvents="none">
        <Feather name="corner-up-left" size={16} color="#4A90E2" />
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.column, swipeStyle, highlightStyle]}>
          <TouchableOpacity
            ref={bubbleRef}
            style={[
              styles.bubble,
              isOwn ? styles.bubbleOwn : styles.bubbleOther,
              hasImage && !hasText && styles.bubbleImageOnly,
              message.pending && styles.bubblePending,
              message.failed && styles.bubbleFailed,
            ]}
            onPress={message.pending || message.failed ? onPendingPress : undefined}
            onLongPress={isDeleted || message.pending || message.failed ? undefined : handleLongPress}
            delayLongPress={350}
            activeOpacity={isDeleted ? 1 : message.pending || message.failed ? 0.7 : 0.85}
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

            {hasImage && (
              <Pressable
                onPress={() => onImagePress?.(message.image_url!, message.image_width, message.image_height)}
                onLongPress={handleLongPress}
                delayLongPress={350}
              >
                <Image
                  source={{ uri: message.image_url! }}
                  style={[styles.messageImage, imageSize, hasText && styles.messageImageWithText]}
                  contentFit="cover"
                  transition={150}
                />
              </Pressable>
            )}

            {isDeleted ? (
              <Text style={styles.deletedText}>This message was deleted</Text>
            ) : hasText ? (
              <Text style={[styles.content, isOwn && styles.contentOwn]}>{message.content}</Text>
            ) : null}

            <View style={[styles.timeRow, hasImage && !hasText && styles.timeRowImageOnly]}>
              {isEdited && <Text style={[styles.editedLabel, isOwn && styles.editedLabelOwn]}>edited · </Text>}
              {message.failed ? (
                <Feather name="wifi-off" size={11} color={isOwn ? 'rgba(255,255,255,0.9)' : '#DC2626'} style={styles.statusIcon} />
              ) : message.pending ? (
                <Feather name="clock" size={11} color={isOwn ? 'rgba(255,255,255,0.7)' : '#9CA3AF'} style={styles.statusIcon} />
              ) : null}
              <Text style={[styles.time, isOwn && styles.timeOwn, hasImage && !hasText && styles.timeOnImage, message.failed && !isOwn && styles.timeFailed]}>{time}</Text>
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
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 4, paddingHorizontal: 12 },
  rowOwn: { justifyContent: 'flex-end' },
  replyHint: { position: 'absolute', left: -4, top: '50%', marginTop: -12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  column: { maxWidth: '75%' },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleOwn: { backgroundColor: '#4A90E2', borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#E5E7EB', borderBottomLeftRadius: 4 },
  bubbleImageOnly: { paddingHorizontal: 4, paddingVertical: 4 },
  bubblePending: { opacity: 0.55 },
  bubbleFailed: { opacity: 0.85, borderWidth: 1, borderColor: '#DC2626' },
  senderName: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 2 },
  messageImage: { borderRadius: 10 },
  messageImageWithText: { marginBottom: 6 },
  content: { fontSize: 15, fontWeight: '400', color: '#111827' },
  contentOwn: { color: '#fff' },
  deletedText: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic' },
  quoteBlock: { borderLeftWidth: 3, borderLeftColor: 'rgba(255,255,255,0.6)', paddingLeft: 8, paddingVertical: 3, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 4 },
  quoteBlockOwn: { borderLeftColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.15)' },
  quoteSender: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.9)', marginBottom: 1 },
  quoteSenderOwn: { color: 'rgba(255,255,255,0.9)' },
  quoteContent: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  quoteContentOwn: { color: 'rgba(255,255,255,0.75)' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  timeRowImageOnly: { marginTop: 2 },
  editedLabel: { fontSize: 11, color: '#9CA3AF' },
  editedLabelOwn: { color: 'rgba(255,255,255,0.6)' },
  time: { fontSize: 11, color: '#9CA3AF' },
  timeOwn: { color: 'rgba(255,255,255,0.7)' },
  timeOnImage: { color: 'rgba(255,255,255,0.85)' },
  timeFailed: { color: '#DC2626', fontWeight: '600' },
  statusIcon: { marginRight: 3 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 4 },
  reactionsOwn: { justifyContent: 'flex-end' },
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#E5E7EB' },
  badgeActive: { backgroundColor: '#EEF6FF', borderColor: '#4A90E2' },
  badgeEmoji: { fontSize: 14 },
  badgeCount: { fontSize: 12, color: '#6B7280', marginLeft: 3, fontWeight: '700' },
  badgeCountActive: { color: '#4A90E2' },
});
