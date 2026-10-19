import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useMemo } from 'react';
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
import { useThemeColors } from '@/contexts/AppearanceContext';
import { linkify, type Segment } from '@/utils/linkify';
import { openLink, copyLink } from '@/utils/openLink';
import { splitMentions } from '@/utils/chatMentions';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';

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
  // Position within a run of messages from the same person (see utils/chatGrouping). Defaults make a
  // lone bubble: name, timestamp and tail corner all shown.
  isFirst?: boolean;
  isLast?: boolean;
  // Clerk id -> display name, to render "@Name" mentions highlighted.
  mentionNames?: Record<string, string>;
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
  isFirst = true,
  isLast = true,
  mentionNames,
}: Props) {
  const colors = useThemeColors();
  const isDeleted = !!message.deleted_at;
  const isEdited = !!message.edited_at && !isDeleted;
  const hasImage = !!message.image_url && !isDeleted;
  const hasText = !!message.content && !isDeleted;
  const segments = useMemo<Segment[]>(() => (hasText ? linkify(message.content) : []), [hasText, message.content]);
  // First web link in the text gets a preview card under the message.
  const previewUrl = useMemo(() => {
    const seg = segments.find((s) => s.kind === 'url' && s.value);
    return seg?.value && /^https?:\/\//i.test(seg.value) ? seg.value : null;
  }, [segments]);
  const mentionedNames = useMemo(
    () => (message.mentions ?? []).map((id) => mentionNames?.[id]).filter((n): n is string => !!n),
    [message.mentions, mentionNames]
  );
  const selfName = currentUserId ? mentionNames?.[currentUserId] : undefined;
  const imageSize = hasImage ? getImageDisplaySize(message.image_width, message.image_height) : null;
  const canInteract = !isDeleted && !message.pending && !message.failed;
  const showTimeRow = isLast || isEdited || !!message.pending || !!message.failed || (!!message.pinned_at && !isDeleted);

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

  // Links are nested <Text onPress>, which captures touches — so long-press must be forwarded
  // explicitly or the reaction/reply menu would be unreachable on link text.
  const handleLinkPress = (seg: Segment) => {
    if (message.pending || message.failed) return onPendingPress?.();
    if (seg.kind !== 'text' && seg.value) openLink(seg.kind, seg.value);
  };
  const handleLinkLongPress = (seg: Segment) => {
    if (!canInteract) return;
    if (seg.kind === 'text') return handleLongPress();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(seg.text, undefined, [
      { text: 'Open', onPress: () => seg.value && openLink(seg.kind as any, seg.value) },
      { text: 'Copy', onPress: () => copyLink(seg.text) },
      { text: 'Message options', onPress: handleLongPress },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
    <Animated.View
      style={[styles.row, { marginTop: isFirst ? 5 : 1, marginBottom: isLast ? 5 : 1 }, isOwn && styles.rowOwn, entranceStyle]}
    >
      <Animated.View style={[styles.replyHint, replyIconStyle]} pointerEvents="none">
        <Feather name="corner-up-left" size={16} color={colors.brand} />
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.column, swipeStyle, highlightStyle]}>
          <PressableOpacity
            ref={bubbleRef}
            style={[
              styles.bubble,
              isOwn
                ? { backgroundColor: colors.brand, ...(isLast ? { borderBottomRightRadius: 4 } : null) }
                : { backgroundColor: colors.backgroundAlt, ...(isLast ? { borderBottomLeftRadius: 4 } : null) },
              hasImage && !hasText && styles.bubbleImageOnly,
              message.pending && styles.bubblePending,
              message.failed && { opacity: 0.85, borderWidth: 1, borderColor: colors.danger },
            ]}
            onPress={message.pending || message.failed ? onPendingPress : undefined}
            onLongPress={isDeleted || message.pending || message.failed ? undefined : handleLongPress}
            delayLongPress={350}
            activeOpacity={isDeleted ? 1 : message.pending || message.failed ? 0.7 : 0.85}
          >
            {!isOwn && isFirst && <Text style={[styles.senderName, { color: colors.textMuted }]}>{message.sender_name}</Text>}

            {message.reply_to_id && !isDeleted && (
              <View style={[styles.quoteBlock, isOwn && styles.quoteBlockOwn, !isOwn && { borderLeftColor: colors.brand, backgroundColor: colors.surface }]}>
                <Text style={[styles.quoteSender, isOwn && styles.quoteSenderOwn, !isOwn && { color: colors.brand }]} numberOfLines={1}>
                  {message.reply_to_sender}
                </Text>
                <Text style={[styles.quoteContent, isOwn && styles.quoteContentOwn, !isOwn && { color: colors.textSecondary }]} numberOfLines={2}>
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
              <Text style={[styles.deletedText, { color: colors.textFaint }]}>This message was deleted</Text>
            ) : hasText ? (
              <Text style={[styles.content, isOwn ? styles.contentOwn : { color: colors.textPrimary }]}>
                {segments.map((seg, i) =>
                  seg.kind === 'text' ? (
                    mentionedNames.length === 0 ? (
                      seg.text
                    ) : (
                      splitMentions(seg.text, mentionedNames).map((part, j) =>
                        part.mention ? (
                          <Text
                            key={`${i}-${j}`}
                            style={[
                              styles.mention,
                              { color: isOwn ? '#fff' : colors.brand },
                              part.mention === selfName && { backgroundColor: isOwn ? 'rgba(255,255,255,0.25)' : colors.brandSoft },
                            ]}
                          >
                            {part.text}
                          </Text>
                        ) : (
                          part.text
                        )
                      )
                    )
                  ) : (
                    <Text
                      key={i}
                      style={[styles.link, { color: isOwn ? '#fff' : colors.brand }]}
                      onPress={() => handleLinkPress(seg)}
                      onLongPress={() => handleLinkLongPress(seg)}
                      accessibilityRole="link"
                    >
                      {seg.text}
                    </Text>
                  )
                )}
              </Text>
            ) : null}

            {previewUrl && canInteract ? <LinkPreviewCard url={previewUrl} isOwn={isOwn} onLongPress={handleLongPress} /> : null}

            {showTimeRow && (
            <View style={[styles.timeRow, hasImage && !hasText && styles.timeRowImageOnly]}>
              {!!message.pinned_at && !isDeleted && (
                <Feather name="map-pin" size={11} color={isOwn ? 'rgba(255,255,255,0.8)' : colors.textFaint} style={styles.statusIcon} />
              )}
              {isEdited && <Text style={[styles.editedLabel, isOwn ? styles.editedLabelOwn : { color: colors.textFaint }]}>edited · </Text>}
              {message.failed ? (
                <Feather name="wifi-off" size={11} color={isOwn ? 'rgba(255,255,255,0.9)' : colors.danger} style={styles.statusIcon} />
              ) : message.pending ? (
                <Feather name="clock" size={11} color={isOwn ? 'rgba(255,255,255,0.7)' : colors.textFaint} style={styles.statusIcon} />
              ) : null}
              <Text style={[
                styles.time,
                isOwn ? styles.timeOwn : { color: colors.textFaint },
                hasImage && !hasText && styles.timeOnImage,
                message.failed && !isOwn && { color: colors.danger, fontWeight: '600' },
              ]}>{time}</Text>
            </View>
            )}
          </PressableOpacity>

          {reactionEntries.length > 0 && (
            <View style={[styles.reactions, isOwn && styles.reactionsOwn]}>
              {reactionEntries.map(([emoji, users]) => {
                const reacted = currentUserId ? users.includes(currentUserId) : false;
                return (
                  <PressableOpacity key={emoji} onLongPress={onReactionLongPress} delayLongPress={350} activeOpacity={0.8}>
                    <View style={[
                      styles.badge,
                      { backgroundColor: colors.backgroundAlt, borderColor: colors.border },
                      reacted && { backgroundColor: colors.brandSoft, borderColor: colors.brand },
                    ]}>
                      <Text style={styles.badgeEmoji}>{emoji}</Text>
                      <Text style={[styles.badgeCount, { color: colors.textMuted }, reacted && { color: colors.brand }]}>{users.length}</Text>
                    </View>
                  </PressableOpacity>
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
  row: { flexDirection: 'row', paddingHorizontal: 12 },
  rowOwn: { justifyContent: 'flex-end' },
  replyHint: { position: 'absolute', left: -4, top: '50%', marginTop: -12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  column: { maxWidth: '75%' },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleImageOnly: { paddingHorizontal: 4, paddingVertical: 4 },
  bubblePending: { opacity: 0.55 },
  senderName: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  messageImage: { borderRadius: 10 },
  messageImageWithText: { marginBottom: 6 },
  content: { fontSize: 15, fontWeight: '400' },
  contentOwn: { color: '#fff' },
  link: { textDecorationLine: 'underline', fontWeight: '500' },
  mention: { fontWeight: '700' },
  deletedText: { fontSize: 14, fontStyle: 'italic' },
  quoteBlock: { borderLeftWidth: 3, borderLeftColor: 'rgba(255,255,255,0.6)', paddingLeft: 8, paddingVertical: 3, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 4 },
  quoteBlockOwn: { borderLeftColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.15)' },
  quoteSender: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.9)', marginBottom: 1 },
  quoteSenderOwn: { color: 'rgba(255,255,255,0.9)' },
  quoteContent: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  quoteContentOwn: { color: 'rgba(255,255,255,0.75)' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  timeRowImageOnly: { marginTop: 2 },
  editedLabel: { fontSize: 11 },
  editedLabelOwn: { color: 'rgba(255,255,255,0.6)' },
  time: { fontSize: 11 },
  timeOwn: { color: 'rgba(255,255,255,0.7)' },
  timeOnImage: { color: 'rgba(255,255,255,0.85)' },
  statusIcon: { marginRight: 3 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 4 },
  reactionsOwn: { justifyContent: 'flex-end' },
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  badgeEmoji: { fontSize: 14 },
  badgeCount: { fontSize: 12, marginLeft: 3, fontWeight: '700' },
});
