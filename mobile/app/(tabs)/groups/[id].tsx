import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Keyboard,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  SectionList,
  Modal,
  Pressable,
  Image,
} from 'react-native';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useGetGroups } from '@/hooks/useGetGroups';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useRemoveMember } from '@/hooks/useRemoveMember';
import { useGetMeetups } from '@/hooks/useGetMeetups';
import { GroupDetails, Meetup, User, useApiClient, userApi, groupApi } from '@/utils/api';
import MeetupDetailModal from '@/components/MeetupDetailModal';
import { getDMDisplayName } from '@/utils/groupDisplay';
import { Feather } from '@expo/vector-icons';
import { useSearchUsers } from '@/hooks/useSearchUsers';
import { useInviteUser } from '@/hooks/useInviteUser';
import { GroupDetailsView } from '@/components/GroupDetailsView';
import { GroupAvatar } from '@/components/GroupAvatar';
import { useMessages } from '@/hooks/useMessages';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { ChatMessageBubble } from '@/components/ChatMessageBubble';
import { ChatMessageInput } from '@/components/ChatMessageInput';
import { ChatDayBubble } from '@/components/ChatDayBubble';
import { ChatImageViewer } from '@/components/ChatImageViewer';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import PollListModal from '@/components/PollListModal';
import { useGetPolls } from '@/hooks/useGetPolls';
import { getDayBucketKey, getDayBucketLabel } from '@/utils/dayBucket';
import { TAB_BAR_HEIGHT } from '@/utils/layout';
import type { ChatMessage, PendingImage } from '@/types/chat';

interface ChatDaySection {
  key: string;
  title: string;
  data: ChatMessage[];
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconButtonMuted: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  iconButtonMutedUntilNext: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  iconButtonActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  iconButtonDetails: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  iconButtonPoll: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  pollUnansweredDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: 'white',
  },
  pollTooltip: {
    position: 'absolute',
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    zIndex: 999,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  pollTooltipText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  pollTooltipArrow: {
    position: 'absolute',
    top: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#111827',
  },
  settingsButton: {
    padding: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  }
});

const REACTIONS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

const getUserId = (u: User | string): string => typeof u === 'string' ? u : u._id;

const GroupChat = ({
  group,
  currentUser,
  keyboardOffset,
  onReady,
}: {
  group: GroupDetails;
  currentUser: User;
  keyboardOffset: number;
  onReady?: () => void;
}) => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const sectionListRef = useRef<SectionList<ChatMessage, ChatDaySection>>(null);

  const senderId = currentUser.clerkId;
  const senderName = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.email;

  const { messages, loading, sendMessage, addReaction, deleteMessage, editMessage } =
    useMessages(group._id);
  const { typingNames, handleTyping } = useTypingIndicator(group._id, senderId, senderName);

  // Keeps the group "read" while its chat is open: a message from someone else arriving
  // here (via realtime) would otherwise leave the server-side lastReadAt stale, making the
  // unread dot pop back up on the groups list even though the user is looking right at it.
  const lastMarkedReadMessageId = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    const latest = messages[messages.length - 1];
    if (latest.id === lastMarkedReadMessageId.current || latest.sender_id === senderId) return;
    lastMarkedReadMessageId.current = latest.id;
    userApi.markGroupRead(api, group._id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['currentUser'] }))
      .catch(() => {});
  }, [messages, api, group._id, senderId, queryClient]);

  const { data: allMeetups } = useGetMeetups();
  const nextMeetup = useMemo<Meetup | null>(() => {
    if (!allMeetups) return null;
    const upcoming = allMeetups
      .filter(m => m.group._id === group._id && m.status === 'scheduled' && new Date(m.date) >= new Date());
    return upcoming[0] ?? null;
  }, [allMeetups, group._id]);
  const [nextMeetupModalVisible, setNextMeetupModalVisible] = useState(false);
  const nextMeetupLabel = nextMeetup
    ? new Date(nextMeetup.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: nextMeetup.timezone })
    : null;
  // Mirrors the RSVP state MeetupDetailModal and the meetup card compute, so the bar
  // previews the same tint/status the card and modal already show.
  const nextMeetupRsvpStatus = useMemo(() => {
    if (!nextMeetup) return null;
    const isOut = nextMeetup.out?.some(u => getUserId(u) === currentUser._id) || false;
    const isIn = nextMeetup.in?.some(u => getUserId(u) === currentUser._id) || false;
    const isWaitlisted = nextMeetup.waitlist?.some(u => getUserId(u) === currentUser._id) || false;
    const isRsvpLocked = nextMeetup.rsvpOpenDate ? new Date(nextMeetup.rsvpOpenDate) > new Date() : false;
    return { isIn, isOut, isWaitlisted, isRsvpLocked };
  }, [nextMeetup, currentUser._id]);
  const nextMeetupBarColor = useMemo(() => {
    if (!nextMeetupRsvpStatus) return '#EEF6FF';
    const { isOut, isIn, isWaitlisted } = nextMeetupRsvpStatus;
    return isOut ? '#FEF2F2' : (isIn || isWaitlisted) ? '#EDF5F0' : '#FFFEFA';
  }, [nextMeetupRsvpStatus]);

  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [reactionDetailMessage, setReactionDetailMessage] = useState<ChatMessage | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<{ url: string; width?: number | null; height?: number | null } | null>(null);

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const msg of messages) {
      if (!map.has(msg.sender_id)) map.set(msg.sender_id, msg.sender_name);
    }
    map.set(senderId, senderName);
    return map;
  }, [messages, senderId, senderName]);

  const sections = useMemo<ChatDaySection[]>(() => {
    const byDay = new Map<string, ChatDaySection>();
    for (const msg of messages) {
      const key = getDayBucketKey(msg.created_at);
      let section = byDay.get(key);
      if (!section) {
        section = { key, title: getDayBucketLabel(msg.created_at), data: [] };
        byDay.set(key, section);
      }
      section.data.push(msg);
    }
    return Array.from(byDay.values());
  }, [messages]);

  const [listHeight, setListHeight] = useState(0);
  // Gates the first paint of a freshly opened chat so it never visibly starts at the
  // oldest message and animates down — see the two effects below.
  const [contentReady, setContentReady] = useState(false);

  const hasNotifiedReady = useRef(false);

  useEffect(() => {
    setContentReady(false);
    hasNotifiedReady.current = false;
  }, [group._id]);

  // Tell the parent exactly once per chat-open — it owns the single, persistent loading
  // animation instance that covers this whole span, so this never mounts its own.
  useEffect(() => {
    if (contentReady && !hasNotifiedReady.current) {
      hasNotifiedReady.current = true;
      onReady?.();
    }
  }, [contentReady, onReady]);

  // scrollToLocation estimates an item's offset from average cell height for anything
  // it hasn't actually measured yet — with our wildly variable message heights (short
  // text vs. images vs. reactions) that estimate is unreliable, landing short of the
  // true end. getScrollResponder() gives the real underlying ScrollView, whose
  // scrollToEnd() uses the actual measured content size — no estimation involved.
  const scrollToBottom = useCallback((animated: boolean) => {
    sectionListRef.current?.getScrollResponder()?.scrollToEnd({ animated });
  }, []);

  // First paint for this chat: jump to the bottom instantly (not animated — an
  // animation here is exactly the visible "zip from oldest to newest" this avoids),
  // then reveal the list only once that position has actually landed.
  useEffect(() => {
    if (contentReady || messages.length === 0) return;
    scrollToBottom(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setContentReady(true)));
  }, [messages.length, contentReady, scrollToBottom]);

  // A genuinely empty chat has nothing to position — reveal the empty state immediately.
  useEffect(() => {
    if (!loading && messages.length === 0) setContentReady(true);
  }, [loading, messages.length]);

  // Once the chat is visibly open, new messages arriving get the usual animated
  // scroll-into-view.
  useEffect(() => {
    if (!contentReady) return;
    scrollToBottom(true);
  }, [messages.length, contentReady, scrollToBottom]);

  // Re-anchor to the bottom whenever the list's own measured height actually changes —
  // this is what KeyboardAvoidingView resizing it (keyboard open/close) looks like from
  // the list's point of view, and it's the real signal that the resize has landed, unlike
  // guessing a delay off the keyboard event (which fires before the resize finishes).
  useEffect(() => {
    if (listHeight > 0) scrollToBottom(true);
  }, [listHeight]);

  const isOwnSelected = selectedMessage?.sender_id === senderId;
  const isDeletedSelected = !!selectedMessage?.deleted_at;

  const handleSend = async (text: string, image?: PendingImage) => {
    const currentReply = replyingTo;
    setReplyingTo(null);
    try {
      await sendMessage(
        text,
        senderId,
        senderName,
        currentReply
          ? { id: currentReply.id, content: currentReply.content, senderName: currentReply.sender_name }
          : undefined,
        image
      );
      const notifyText = text || '📷 Photo';
      api.patch(`/api/groups/${group._id}/last-message`, { text: notifyText, senderName }).catch(() => {});
      // Sending a message means you've obviously "read" up to it — keep the unread
      // dot from lighting back up on your own message once you leave the chat.
      userApi.markGroupRead(api, group._id).catch(() => {});
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? JSON.stringify(err));
    }
  };

  const handleReact = async (emoji: string) => {
    if (!selectedMessage) return;
    const target = selectedMessage;
    setSelectedMessage(null);
    try {
      const result = await addReaction(target.id, emoji, senderId);
      if (result.action !== 'removed') {
        api.post(`/api/groups/${group._id}/chat-reaction`, {
          emoji: result.emoji,
          senderName,
        }).catch(() => {});
      }
    } catch (err: any) {
      Alert.alert('Reaction failed', err?.message ?? JSON.stringify(err));
    }
  };

  const handleReplyOpen = () => {
    if (!selectedMessage) return;
    setReplyingTo(selectedMessage);
    setSelectedMessage(null);
  };

  const handleEditOpen = () => {
    if (!selectedMessage) return;
    setEditText(selectedMessage.content);
    setEditingMessage(selectedMessage);
    setSelectedMessage(null);
  };

  const handleEditSave = async () => {
    if (!editingMessage) return;
    const trimmed = editText.trim();
    if (!trimmed || trimmed === editingMessage.content) { setEditingMessage(null); return; }
    const target = editingMessage;
    setEditingMessage(null);
    try {
      await editMessage(target.id, trimmed);
    } catch (err: any) {
      Alert.alert('Edit failed', err?.message ?? 'Failed to edit message.');
    }
  };

  const handleDeleteConfirm = () => {
    if (!selectedMessage) return;
    const target = selectedMessage;
    setSelectedMessage(null);
    Alert.alert('Delete Message', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteMessage(target.id); }
        catch (err: any) { Alert.alert('Error', err?.message ?? 'Failed to delete.'); }
      }},
    ]);
  };

  const typingLabel = typingNames.length === 0 ? null
    : typingNames.length === 1 ? `${typingNames[0]} is typing…`
    : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing…`
    : 'Several people are typing…';

  // No early return here — the parent's single persistent loading animation covers this
  // whole span, so this component just quietly finishes preparing underneath it (see the
  // opacity/pointerEvents gating below) rather than mounting its own competing instance.

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1, opacity: contentReady ? 1 : 0 }}
        pointerEvents={contentReady ? 'auto' : 'none'}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
      >
        <SectionList
          ref={sectionListRef}
          style={{ flex: 1 }}
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatMessageBubble
              message={item}
              isOwn={item.sender_id === senderId}
              currentUserId={senderId}
              onLongPress={() => setSelectedMessage(item)}
              onReactionLongPress={() => setReactionDetailMessage(item)}
              onImagePress={(url, width, height) => setFullscreenImage({ url, width, height })}
            />
          )}
          renderSectionHeader={({ section }) => <ChatDayBubble label={section.title} />}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={chatStyles.center}>
              <Text style={{ color: '#9CA3AF', fontSize: 15 }}>No messages yet. Say hello!</Text>
            </View>
          }
          onContentSizeChange={() => scrollToBottom(false)}
          onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
        />

        <View style={{ minHeight: 20, paddingHorizontal: 16, justifyContent: 'center' }}>
          {typingLabel ? <Text style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>{typingLabel}</Text> : null}
        </View>

        {replyingTo && (
          <View style={chatStyles.replyPreview}>
            <View style={chatStyles.replyPreviewBody}>
              <Text style={chatStyles.replyPreviewLabel}>↩ {replyingTo.sender_name}</Text>
              <Text style={chatStyles.replyPreviewText} numberOfLines={1}>{replyingTo.content}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={{ padding: 4 }}>
              <Text style={{ fontSize: 16, color: '#9CA3AF' }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {nextMeetup && nextMeetupLabel && (
          <TouchableOpacity
            onPress={() => setNextMeetupModalVisible(true)}
            style={[chatStyles.nextEventBar, { backgroundColor: nextMeetupBarColor }]}
            activeOpacity={0.7}
          >
            <Feather name="calendar" size={15} color="#4A90E2" />
            <Text style={chatStyles.nextEventText}>Next Meetup: {nextMeetupLabel}</Text>
            {nextMeetupRsvpStatus && (
              nextMeetupRsvpStatus.isIn || nextMeetupRsvpStatus.isOut ? (
                <Text style={[chatStyles.nextEventStatusText, { color: nextMeetupRsvpStatus.isIn ? '#4FD1C5' : '#FF7A6E' }]}>
                  {nextMeetupRsvpStatus.isIn ? 'IN' : 'OUT'}
                </Text>
              ) : nextMeetupRsvpStatus.isRsvpLocked ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Feather name="clock" size={13} color="#9CA3AF" />
                  <Feather name="lock" size={13} color="#9CA3AF" />
                </View>
              ) : (
                <Feather name="unlock" size={13} color="#F59E0B" />
              )
            )}
            <Feather name="chevron-right" size={13} color="#93C5FD" />
          </TouchableOpacity>
        )}

        <ChatMessageInput onSend={handleSend} onTyping={handleTyping} />
      </KeyboardAvoidingView>

      {/* Action sheet */}
      <Modal visible={!!selectedMessage} transparent animationType="fade" onRequestClose={() => setSelectedMessage(null)}>
        <Pressable style={chatStyles.overlay} onPress={() => setSelectedMessage(null)}>
          <View style={chatStyles.actionPanel}>
            {!isDeletedSelected && (
              <View style={chatStyles.emojiRow}>
                {REACTIONS.map((emoji) => (
                  <TouchableOpacity key={emoji} style={chatStyles.emojiBtn} onPress={() => handleReact(emoji)} activeOpacity={0.7}>
                    <Text style={{ fontSize: 28 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {!isDeletedSelected && (
              <>
                <View style={chatStyles.divider} />
                <TouchableOpacity style={chatStyles.actionRow} onPress={handleReplyOpen}>
                  <Text style={chatStyles.actionLabel}>Reply</Text>
                </TouchableOpacity>
              </>
            )}
            {isOwnSelected && (
              <>
                <View style={chatStyles.divider} />
                {!isDeletedSelected && (
                  <TouchableOpacity style={chatStyles.actionRow} onPress={handleEditOpen}>
                    <Text style={chatStyles.actionLabel}>Edit</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={chatStyles.actionRow} onPress={handleDeleteConfirm}>
                  <Text style={[chatStyles.actionLabel, { color: '#EF4444' }]}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Reaction detail */}
      <Modal visible={!!reactionDetailMessage} transparent animationType="fade" onRequestClose={() => setReactionDetailMessage(null)}>
        <Pressable style={chatStyles.overlay} onPress={() => setReactionDetailMessage(null)}>
          <Pressable style={chatStyles.detailPanel} onPress={() => {}}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: '#111827', marginBottom: 16 }}>Reactions</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {Object.entries(reactionDetailMessage?.reactions ?? {})
                .filter(([, users]) => users.length > 0)
                .map(([emoji, users]) => (
                  <View key={emoji} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Text style={{ fontSize: 22 }}>{emoji}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#6B7280' }}>{users.length}</Text>
                    </View>
                    {users.map((uid) => (
                      <Text key={uid} style={{ fontSize: 15, color: '#111827', paddingVertical: 3, paddingLeft: 4 }}>
                        {userNameMap.get(uid) ?? 'Unknown'}
                      </Text>
                    ))}
                  </View>
                ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit modal */}
      <Modal visible={!!editingMessage} transparent animationType="fade" onRequestClose={() => setEditingMessage(null)}>
        <Pressable style={chatStyles.overlay} onPress={() => setEditingMessage(null)}>
          <Pressable style={chatStyles.detailPanel} onPress={() => {}}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: '#111827', marginBottom: 12 }}>Edit Message</Text>
            <TextInput
              style={chatStyles.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              maxLength={2000}
              selectionColor="#4A90E2"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity style={chatStyles.cancelBtn} onPress={() => setEditingMessage(null)}>
                <Text style={{ fontSize: 15, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={chatStyles.saveBtn} onPress={handleEditSave}>
                <Text style={{ fontSize: 15, color: '#fff', fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ChatImageViewer
        visible={!!fullscreenImage}
        imageUrl={fullscreenImage?.url ?? null}
        imageWidth={fullscreenImage?.width}
        imageHeight={fullscreenImage?.height}
        onClose={() => setFullscreenImage(null)}
      />

      <Modal
        visible={nextMeetupModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNextMeetupModalVisible(false)}
      >
        <MeetupDetailModal meetup={nextMeetup} onClose={() => setNextMeetupModalVisible(false)} />
      </Modal>
    </View>
  );
};

const chatStyles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  actionPanel: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', width: '100%', maxWidth: 360, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8, paddingVertical: 12 },
  emojiBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB' },
  actionRow: { paddingVertical: 16, paddingHorizontal: 20 },
  actionLabel: { fontSize: 16, color: '#111827', fontWeight: '600' },
  detailPanel: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 360, maxHeight: '70%', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  nextEventBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EEF6FF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DBEAFE', paddingVertical: 6 },
  nextEventText: { fontSize: 15, fontWeight: '400', color: '#111827' },
  nextEventStatusText: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  replyPreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  replyPreviewBody: { flex: 1, borderLeftWidth: 3, borderLeftColor: '#4A90E2', paddingLeft: 8 },
  replyPreviewLabel: { fontSize: 12, fontWeight: '700', color: '#4A90E2', marginBottom: 1 },
  replyPreviewText: { fontSize: 13, color: '#6B7280' },
  editInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, padding: 12, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB', minHeight: 80, maxHeight: 200, textAlignVertical: 'top', marginBottom: 16 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F3F4F6' },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 10, backgroundColor: '#4A90E2' },
});


const GroupChatScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'Chat' | 'Details'>('Chat');
  const [chatHeaderHeight, setChatHeaderHeight] = useState(0);

  const insets = useSafeAreaInsets();
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Tapping into a chat clears its unread dot on the groups list.
  useEffect(() => {
    if (!id) return;
    userApi.markGroupRead(api, id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['currentUser'] }))
      .catch(() => {});
  }, [id]);

  // Cached (or freshly fetched) list data gives an instant name/avatar/isDM fallback
  // while the heavier per-group details request below is still in flight.
  const { data: groups } = useGetGroups();
  const fallbackGroup = useMemo(() => groups?.find(g => g._id === id), [groups, id]);

  const { data: groupDetails, isLoading: isLoadingDetails, isError: isErrorDetails } = useGetGroupDetails(id ?? null);

  const { data: currentUser } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
  });

  const stableUserRef = useRef<User | null>(null);
  if (!stableUserRef.current && currentUser) stableUserRef.current = currentUser;

  // Single source of truth for "is the chat done opening" — GroupChat reports in via
  // onReady once, so exactly one loading animation instance covers the whole span from
  // opening the screen through group-details fetch through message-list positioning.
  const [chatReady, setChatReady] = useState(false);

  const canManageGroup = useMemo(() => {
    if (!groupDetails || !currentUser) return false;
    const userId = currentUser._id;
    const g = groupDetails as any;
    const isOwner = (g.owner?._id || g.owner) === userId;
    const isMod = g.moderators?.some((m: any) => (m?._id || m) === userId);
    return isOwner || isMod;
  }, [groupDetails, currentUser]);

  const isDM = groupDetails?.isDM ?? fallbackGroup?.isDM ?? false;

  const isMutedUntilNext = useMemo(() => {
    if (!id || !currentUser) return false;
    return !!currentUser.mutedUntilNextMeetup?.includes(id);
  }, [id, currentUser]);

  const isCurrentlyMuted = useMemo(() => {
    if (!id || !currentUser) return false;
    return !!currentUser.mutedGroups?.includes(id) || isMutedUntilNext;
  }, [id, currentUser, isMutedUntilNext]);

  // --- Polls ---
  const [pollListVisible, setPollListVisible] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [pollTooltipAnchor, setPollTooltipAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const pollButtonRef = useRef<View>(null);

  const { data: polls } = useGetPolls(!isDM ? id : undefined);

  const hasUnansweredPoll = useMemo(() => {
    if (!polls || !currentUser) return false;
    return polls.some(poll =>
      poll.status === 'active' &&
      !poll.options.some(opt => opt.voters.some(v => (typeof v === 'string' ? v : v._id) === currentUser._id))
    );
  }, [polls, currentUser]);

  useEffect(() => {
    if (!hasUnansweredPoll) { setTooltipVisible(false); return; }
    setTooltipVisible(true);
    const timer = setTimeout(() => setTooltipVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [hasUnansweredPoll]);

  const handlePollButtonLayout = () => {
    pollButtonRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
      setPollTooltipAnchor({ x: pageX, y: pageY, width, height });
    });
  };

  const handlePollButtonPress = () => {
    setTooltipVisible(false);
    setPollListVisible(true);
  };

  const performMuteUpdate = async (type: 'indefinite' | 'untilNext' | 'none') => {
    if (!id) return;
    try {
        await userApi.toggleGroupMute(api, id, type);
        queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    } catch (error: any) {
        Alert.alert("Error", "Failed to update notification settings.");
    }
  };

  const [muteOptionsVisible, setMuteOptionsVisible] = useState(false);

  const handleMutePress = () => {
    if (isCurrentlyMuted) {
      performMuteUpdate('none');
    } else {
      setMuteOptionsVisible(true);
    }
  };

  const handleMuteOptionPress = (type: 'indefinite' | 'untilNext') => {
    setMuteOptionsVisible(false);
    performMuteUpdate(type);
  };

  const { mutate: removeMember, isPending: isRemovingMember } = useRemoveMember();

  const [dmTargetMember, setDmTargetMember] = useState<User | null>(null);
  const [isCreatingDM, setIsCreatingDM] = useState(false);

  const handleMemberPress = (member: User) => {
    setDmTargetMember(member);
  };

  const handleSendDM = async () => {
    if (!dmTargetMember) return;
    setIsCreatingDM(true);
    try {
      const { group } = await groupApi.createOrGetDM(api, dmTargetMember._id);
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setDmTargetMember(null);
      router.push({ pathname: '/groups/[id]', params: { id: group._id } });
    } catch {
      Alert.alert('Error', 'Could not open DM. Please try again.');
    } finally {
      setIsCreatingDM(false);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const { data: searchResults } = useSearchUsers(searchQuery);
  const { mutate: inviteUser } = useInviteUser();

  const handleInvite = (userIdToInvite: string) => {
    if (!id) return;
    inviteUser({ groupId: id, userIdToInvite }, {
        onSuccess: () => {
            setSearchQuery('');
            Keyboard.dismiss();
            Alert.alert("Success", "Invite sent!");
        }
    });
  };

  const handleRemoveMember = (memberIdToRemove: string) => {
    if (!id) return;
    Alert.alert("Remove Member", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        removeMember({ groupId: id, memberIdToRemove }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['groupDetails', id] });
          }
        });
      }},
    ]);
  };

  const handleSettingsPress = () => {
    if (!id) return;
    router.push({
      pathname: '/group-settings/[id]',
      params: { id }
    });
  };

  const headerName = groupDetails?.isDM
    ? getDMDisplayName(groupDetails as any, currentUser?.clerkId)
    : (groupDetails?.name || fallbackGroup?.name || '');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }} edges={['top', 'left', 'right']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200" onLayout={(e) => setChatHeaderHeight(e.nativeEvent.layout.height)}>
        <View className="flex-row items-center flex-1">
          <TouchableOpacity
            onPress={() => activeTab === 'Details' ? setActiveTab('Chat') : router.back()}
            className="mr-2 p-1"
          >
            <Feather name="chevron-left" size={26} color="#FF7A6E"/>
          </TouchableOpacity>
          <View style={{ marginRight: 10 }}>
            <GroupAvatar name={headerName} imageUrl={groupDetails?.image || fallbackGroup?.image} size={36} borderRadius={9} />
          </View>
          <Text className="text-lg font-black text-gray-900 flex-1" numberOfLines={1}>
            {headerName}
          </Text>
        </View>

        <View className="flex-row items-center" style={{ gap: 8 }}>
          {activeTab === 'Chat' ? (
            <>
              {!isDM && (
                <TouchableOpacity
                  ref={pollButtonRef}
                  onLayout={handlePollButtonLayout}
                  onPress={handlePollButtonPress}
                  style={[styles.iconButton, styles.iconButtonPoll]}
                >
                  <Feather name="bar-chart-2" size={18} color="#4A90E2" />
                  {hasUnansweredPoll && <View style={styles.pollUnansweredDot} />}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={handleMutePress}
                style={[
                  styles.iconButton,
                  isMutedUntilNext ? styles.iconButtonMutedUntilNext : isCurrentlyMuted ? styles.iconButtonMuted : styles.iconButtonActive,
                ]}
              >
                <Feather
                  name={isMutedUntilNext ? "clock" : isCurrentlyMuted ? "bell-off" : "bell"}
                  size={18}
                  color={isMutedUntilNext ? "#D97706" : isCurrentlyMuted ? "#EF4444" : "#10B981"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setActiveTab('Details')}
                style={[styles.iconButton, styles.iconButtonDetails]}
              >
                <Feather name="menu" size={18} color="#4A90E2" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              {!isDM && (
                <TouchableOpacity
                  ref={pollButtonRef}
                  onLayout={handlePollButtonLayout}
                  onPress={handlePollButtonPress}
                  style={[styles.iconButton, styles.iconButtonPoll]}
                >
                  <Feather name="bar-chart-2" size={18} color="#4A90E2" />
                  {hasUnansweredPoll && <View style={styles.pollUnansweredDot} />}
                </TouchableOpacity>
              )}

              {canManageGroup && (
                <TouchableOpacity
                  onPress={handleSettingsPress}
                  style={styles.settingsButton}
                  activeOpacity={0.7}
                >
                  <Feather name="settings" size={22} color="#374151" />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>

      {activeTab === 'Chat' ? (
        <View style={{ flex: 1, paddingBottom: insets.bottom + TAB_BAR_HEIGHT }}>
          {groupDetails && currentUser && (
            <GroupChat
              group={groupDetails}
              currentUser={stableUserRef.current || currentUser}
              keyboardOffset={insets.top + chatHeaderHeight}
              onReady={() => setChatReady(true)}
            />
          )}
          {(isLoadingDetails || !groupDetails || !currentUser || !chatReady) && (
            <View style={[styles.loadingContainer, StyleSheet.absoluteFillObject]} pointerEvents="none">
              <LoadingAnimation />
            </View>
          )}
        </View>
      ) : (
        <ScrollView className="flex-1 bg-gray-50" keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + TAB_BAR_HEIGHT }}>
          <View className="p-6" style={{ flex: 1 }}>
            {(isLoadingDetails || !groupDetails) ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><LoadingAnimation /></View>
            ) : isErrorDetails ? (
                <Text className="text-center text-red-500 mt-4">Failed to load group details.</Text>
            ) : (
              <GroupDetailsView
                groupDetails={groupDetails}
                currentUser={currentUser!}
                isRemovingMember={isRemovingMember}
                onRemoveMember={handleRemoveMember}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                searchResults={searchResults}
                onInvite={handleInvite}
                onLeaveSuccess={() => router.back()}
                onMemberPress={groupDetails.isDM ? undefined : handleMemberPress}
              />
            )}
          </View>
        </ScrollView>
      )}

      {tooltipVisible && pollTooltipAnchor && (
        <View
          pointerEvents="none"
          style={[
            styles.pollTooltip,
            {
              top: pollTooltipAnchor.y + pollTooltipAnchor.height + 8,
              left: pollTooltipAnchor.x + pollTooltipAnchor.width / 2 - 60,
            },
          ]}
        >
          <View style={[styles.pollTooltipArrow, { left: 60 - 6 }]} />
          <Text style={styles.pollTooltipText}>New poll open!</Text>
        </View>
      )}

      {id && currentUser && (
        <PollListModal
          visible={pollListVisible}
          onClose={() => setPollListVisible(false)}
          groupId={id}
          currentUserId={currentUser._id}
          canManage={canManageGroup}
        />
      )}

      {/* DM bottom sheet */}
      <Modal
        visible={!!dmTargetMember}
        transparent
        animationType="slide"
        onRequestClose={() => setDmTargetMember(null)}
      >
        <Pressable style={dmStyles.backdrop} onPress={() => setDmTargetMember(null)}>
          <Pressable style={dmStyles.sheet} onPress={() => {}}>
            <View style={dmStyles.dragHandle} />
            {dmTargetMember && (
              <>
                <Image
                  source={{ uri: dmTargetMember.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${dmTargetMember.firstName?.[0] ?? dmTargetMember.email?.[0]}` }}
                  style={dmStyles.avatar}
                />
                <Text style={dmStyles.name}>
                  {[dmTargetMember.firstName, dmTargetMember.lastName].filter(Boolean).join(' ') || dmTargetMember.email?.split('@')[0]}
                </Text>
                <TouchableOpacity
                  style={dmStyles.dmBtn}
                  onPress={handleSendDM}
                  disabled={isCreatingDM}
                  activeOpacity={0.8}
                >
                  {isCreatingDM
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={dmStyles.dmBtnText}>Send DM</Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Mute options */}
      <Modal visible={muteOptionsVisible} transparent animationType="fade" onRequestClose={() => setMuteOptionsVisible(false)}>
        <Pressable style={chatStyles.overlay} onPress={() => setMuteOptionsVisible(false)}>
          <Pressable style={chatStyles.detailPanel} onPress={() => {}}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: '#111827', marginBottom: 16 }}>Mute Notifications</Text>
            <TouchableOpacity
              style={[muteStyles.option, muteStyles.untilNextOption]}
              onPress={() => handleMuteOptionPress('untilNext')}
              activeOpacity={0.7}
            >
              <View style={[muteStyles.iconWrap, muteStyles.untilNextIconWrap]}>
                <Feather name="clock" size={18} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={muteStyles.untilNextText}>Mute until next meetup</Text>
                <Text style={muteStyles.optionSubtitle}>We'll turn notifications back on for you</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#D1D5DB" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[muteStyles.option, muteStyles.indefiniteOption]}
              onPress={() => handleMuteOptionPress('indefinite')}
              activeOpacity={0.7}
            >
              <View style={[muteStyles.iconWrap, muteStyles.indefiniteIconWrap]}>
                <Feather name="bell-off" size={18} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={muteStyles.indefiniteText}>Mute</Text>
                <Text style={muteStyles.optionSubtitle}>Stay silent until you turn it back on</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#D1D5DB" />
            </TouchableOpacity>
            <TouchableOpacity style={chatStyles.cancelBtn} onPress={() => setMuteOptionsVisible(false)}>
              <Text style={{ fontSize: 15, color: '#6B7280', fontWeight: '600', textAlign: 'center' }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const dmStyles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, alignItems: 'center' },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', marginBottom: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 14, backgroundColor: '#F3F4F6' },
  name: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 28 },
  dmBtn: { backgroundColor: '#4A90E2', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 16, minWidth: 160, alignItems: 'center' },
  dmBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

const muteStyles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  untilNextOption: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  indefiniteOption: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  untilNextIconWrap: { backgroundColor: '#FEF3C7' },
  indefiniteIconWrap: { backgroundColor: '#FEE2E2' },
  untilNextText: { fontSize: 15, fontWeight: '800', color: '#B45309' },
  indefiniteText: { fontSize: 15, fontWeight: '800', color: '#DC2626' },
  optionSubtitle: { fontSize: 12, fontWeight: '500', color: '#9CA3AF', marginTop: 2 },
});

export default GroupChatScreen;
