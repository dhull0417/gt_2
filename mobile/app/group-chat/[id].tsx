import {
  View,
  Text,
  ScrollView,
  TextInput,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  SectionList,
  Modal,
  Pressable,
} from 'react-native';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useGetGroups } from '@/hooks/useGetGroups';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useGetMeetups } from '@/hooks/useGetMeetups';
import { Meetup, User, useApiClient, userApi } from '@/utils/api';
import { useGetPolls } from '@/hooks/useGetPolls';
import MeetupDetailModal from '@/components/MeetupDetailModal';
import AddMeetupWizard from '@/components/AddMeetupWizard';
import CreatePollModal from '@/components/CreatePollModal';
import PollListModal from '@/components/PollListModal';
import { getDMDisplayName } from '@/utils/groupDisplay';
import { Feather, Ionicons } from '@expo/vector-icons';
import { GroupAvatar } from '@/components/GroupAvatar';
import { useMessages } from '@/hooks/useMessages';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { ChatMessageBubble } from '@/components/ChatMessageBubble';
import { ChatMessageInput } from '@/components/ChatMessageInput';
import { ChatDayBubble } from '@/components/ChatDayBubble';
import { ChatImageViewer } from '@/components/ChatImageViewer';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { GroupCalendarButton } from '@/components/GroupCalendarButton';
import {
  promptForNotificationPermission,
  promptForNotificationPermissionOnFirstChatOpen,
  markNotificationPromptShown,
} from '@/hooks/usePushNotifications';
import { getDayBucketKey, getDayBucketLabel } from '@/utils/dayBucket';
import type { ChatMessage, PendingImage } from '@/types/chat';

interface ChatDaySection {
  key: string;
  title: string;
  data: ChatMessage[];
}

const REACTIONS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

const getUserId = (u: User | string): string => typeof u === 'string' ? u : u._id;

const GroupChatScreen = () => {
  const { id, promptNotifications } = useLocalSearchParams<{ id: string; promptNotifications?: string }>();
  const [chatHeaderHeight, setChatHeaderHeight] = useState(0);

  const insets = useSafeAreaInsets();
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const sectionListRef = useRef<SectionList<ChatMessage, ChatDaySection>>(null);

  // Ask once after joining (see join/[token]'s goToChat), then drop the param.
  // Also counts as first-ever chat open, so mark that trigger consumed too.
  useEffect(() => {
    if (promptNotifications !== '1') return;
    promptForNotificationPermission(api);
    router.setParams({ promptNotifications: undefined });
    markNotificationPromptShown('firstChatOpen');
  }, [promptNotifications]);

  // Covers first-ever chat open when it wasn't right after a join
  useEffect(() => {
    if (promptNotifications === '1') return;
    promptForNotificationPermissionOnFirstChatOpen(api);
  }, []);

  // Tapping into a chat clears its unread dot on the groups list.
  useEffect(() => {
    if (!id) return;
    userApi.markGroupRead(api, id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['currentUser'] }))
      .catch(() => {});
  }, [id]);

  // Instant name/avatar/isDM fallback while the heavier group details request is in flight
  const { data: groups } = useGetGroups();
  const fallbackGroup = useMemo(() => groups?.find(g => g._id === id), [groups, id]);

  const { data: groupDetails, isLoading: isLoadingDetails } = useGetGroupDetails(id ?? null);

  const { data: currentUser } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
  });

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

  const performMuteUpdate = async (type: 'indefinite' | 'untilNext' | 'none') => {
    if (!id) return;
    try {
      await userApi.toggleGroupMute(api, id, type);
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    } catch {
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

  const headerName = groupDetails?.isDM
    ? getDMDisplayName(groupDetails as any, currentUser?.clerkId)
    : (groupDetails?.name || fallbackGroup?.name || '');

  const handleOpenDetails = () => {
    if (!id) return;
    if (Platform.OS === 'ios') {
      // iOS uses its own root-level copy, outside (tabs) — see group-details/[id].tsx
      router.push({ pathname: '/group-details/[id]', params: { id } });
      return;
    }
    // Android: land on the Groups list first so Details pushes on top of it,
    // not as the nested stack's only screen (else the tab has nothing to reset to)
    router.navigate('/(tabs)/groups');
    router.push({ pathname: '/groups/[id]', params: { id } });
  };

  // Always the groups list, regardless of entry point — chat has no consistent screen underneath it
  const handleBack = () => {
    router.replace('/(tabs)/groups');
  };

  // --- Message thread ---
  const senderId = currentUser?.clerkId ?? '';
  const senderName = currentUser
    ? [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.email
    : '';

  const { messages, loading, sendMessage, addReaction, deleteMessage, editMessage } =
    useMessages(id ?? '');
  const { typingNames, handleTyping } = useTypingIndicator(id ?? '', senderId, senderName);

  const { data: allMeetups } = useGetMeetups();
  const nextMeetup = useMemo<Meetup | null>(() => {
    if (!allMeetups || !id) return null;
    const upcoming = allMeetups
      .filter(m => m.group._id === id && m.status === 'scheduled' && new Date(m.date) >= new Date());
    return upcoming[0] ?? null;
  }, [allMeetups, id]);
  const [nextMeetupModalVisible, setNextMeetupModalVisible] = useState(false);
  const [meetupWizardVisible, setMeetupWizardVisible] = useState(false);
  const [createPollVisible, setCreatePollVisible] = useState(false);
  const nextMeetupLabel = nextMeetup
    ? new Date(nextMeetup.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: nextMeetup.timezone })
    : null;
  const nextMeetupDay = nextMeetup
    ? new Date(nextMeetup.date).toLocaleDateString(undefined, { day: 'numeric', timeZone: nextMeetup.timezone })
    : null;
  // Mirrors MeetupDetailModal/meetup card RSVP state so the bar shows the same tint/status
  const nextMeetupRsvpStatus = useMemo(() => {
    if (!nextMeetup || !currentUser) return null;
    const isOut = nextMeetup.out?.some(u => getUserId(u) === currentUser._id) || false;
    const isIn = nextMeetup.in?.some(u => getUserId(u) === currentUser._id) || false;
    const isWaitlisted = nextMeetup.waitlist?.some(u => getUserId(u) === currentUser._id) || false;
    const isRsvpLocked = nextMeetup.rsvpOpenDate ? new Date(nextMeetup.rsvpOpenDate) > new Date() : false;
    const isRsvpDeadlinePassed = nextMeetup.rsvpCloseDate ? new Date(nextMeetup.rsvpCloseDate) < new Date() : false;
    return { isIn, isOut, isWaitlisted, isRsvpLocked, isRsvpDeadlinePassed };
  }, [nextMeetup, currentUser]);
  const nextMeetupBarColor = useMemo(() => {
    if (!nextMeetupRsvpStatus) return '#EEF6FF';
    const { isOut, isIn, isWaitlisted } = nextMeetupRsvpStatus;
    return isOut ? '#FEF2F2' : (isIn || isWaitlisted) ? '#EDF5F0' : '#FFFEFA';
  }, [nextMeetupRsvpStatus]);

  // Right side of the next-event bar: currently open polls for this group
  const { data: polls } = useGetPolls(!isDM ? id : undefined);
  const activePolls = useMemo(() => (polls ?? []).filter(p => p.status === 'active'), [polls]);
  const hasUnansweredActivePoll = useMemo(() => {
    if (!currentUser) return false;
    return activePolls.some(poll =>
      !poll.options.some(opt => opt.voters.some(v => (typeof v === 'string' ? v : v._id) === currentUser._id))
    );
  }, [activePolls, currentUser]);
  const [pollSelectorVisible, setPollSelectorVisible] = useState(false);
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);
  const [pollVoteModalVisible, setPollVoteModalVisible] = useState(false);

  // One active poll opens straight to voting; more than one shows a selector popup first
  const handlePollBarPress = () => {
    if (activePolls.length === 0) return;
    if (activePolls.length === 1) {
      setSelectedPollId(activePolls[0]._id);
      setPollVoteModalVisible(true);
    } else {
      setPollSelectorVisible(true);
    }
  };

  const handleSelectActivePoll = (pollId: string) => {
    setSelectedPollId(pollId);
    setPollSelectorVisible(false);
    setPollVoteModalVisible(true);
  };

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
  // Gates first paint so a freshly opened chat never visibly animates down from the oldest message
  const [contentReady, setContentReady] = useState(false);

  useEffect(() => {
    setContentReady(false);
  }, [id]);

  // scrollToLocation estimates offset from average cell height, unreliable with our variable
  // message heights. getScrollResponder().scrollToEnd() uses real measured content size instead.
  const scrollToBottom = useCallback((animated: boolean) => {
    sectionListRef.current?.getScrollResponder()?.scrollToEnd({ animated });
  }, []);

  // First paint: jump to bottom instantly (animating here is the exact visual glitch we're avoiding),
  // then reveal the list once that position has landed.
  useEffect(() => {
    if (contentReady || messages.length === 0) return;
    scrollToBottom(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setContentReady(true)));
  }, [messages.length, contentReady, scrollToBottom]);

  // A genuinely empty chat has nothing to position — reveal the empty state immediately.
  useEffect(() => {
    if (!loading && messages.length === 0) setContentReady(true);
  }, [loading, messages.length]);

  // Once visibly open, new messages get the usual animated scroll-into-view
  useEffect(() => {
    if (!contentReady) return;
    scrollToBottom(true);
  }, [messages.length, contentReady, scrollToBottom]);

  // Re-anchor on list height change — the real signal a keyboard-driven resize has landed,
  // unlike guessing a delay off the keyboard event (which fires before resize finishes).
  useEffect(() => {
    if (listHeight > 0) scrollToBottom(true);
  }, [listHeight]);

  const isOwnSelected = selectedMessage?.sender_id === senderId;
  const isDeletedSelected = !!selectedMessage?.deleted_at;

  const handleSend = async (text: string, image?: PendingImage) => {
    if (!id) return;
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
      api.patch(`/api/groups/${id}/last-message`, { text: notifyText, senderName }).catch(() => {});
      // Mark read so your own message doesn't re-trigger the unread dot after you leave
      userApi.markGroupRead(api, id).catch(() => {});
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? JSON.stringify(err));
    }
  };

  const handleReact = async (emoji: string) => {
    if (!selectedMessage || !id) return;
    const target = selectedMessage;
    setSelectedMessage(null);
    try {
      const result = await addReaction(target.id, emoji, senderId);
      if (result.action !== 'removed') {
        api.post(`/api/groups/${id}/chat-reaction`, {
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

  const chatContentReady = contentReady && !isLoadingDetails && !!groupDetails && !!currentUser;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }} edges={['top', 'left', 'right', 'bottom']}>
      <View
        className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200"
        onLayout={(e) => setChatHeaderHeight(e.nativeEvent.layout.height)}
      >
        <View className="flex-row items-center flex-1">
          <TouchableOpacity onPress={handleBack} className="mr-2 p-1">
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
          {id && currentUser && (
            <GroupCalendarButton groupId={id} isDM={isDM} />
          )}

          <TouchableOpacity
            onPress={handleMutePress}
            style={[
              styles.iconButton,
              isMutedUntilNext ? styles.iconButtonMutedUntilNext : isCurrentlyMuted ? styles.iconButtonMuted : styles.iconButtonActive,
            ]}
          >
            {isMutedUntilNext ? (
              <>
                <Feather name="bell-off" size={18} color="#D97706" />
                <Feather name="clock" size={10} color="#D97706" style={styles.mutedUntilNextClockIcon} />
              </>
            ) : (
              <Feather
                name={isCurrentlyMuted ? "bell-off" : "bell"}
                size={18}
                color={isCurrentlyMuted ? "#EF4444" : "#10B981"}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOpenDetails}
            style={[styles.iconButton, styles.iconButtonDetails]}
          >
            <Feather name="menu" size={18} color="#4A90E2" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1, opacity: chatContentReady ? 1 : 0 }}
          pointerEvents={chatContentReady ? 'auto' : 'none'}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={insets.top + chatHeaderHeight}
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

          {((nextMeetup && nextMeetupLabel) || activePolls.length > 0) && (
            <View style={chatStyles.nextEventBarRow}>
              {nextMeetup && nextMeetupLabel && (
                <TouchableOpacity
                  onPress={() => setNextMeetupModalVisible(true)}
                  style={[
                    chatStyles.nextEventBarHalf,
                    { backgroundColor: nextMeetupBarColor },
                    activePolls.length > 0 && chatStyles.nextEventBarHalfDivider,
                  ]}
                  activeOpacity={0.7}
                >
                  {activePolls.length === 0 && nextMeetupDay && (
                    <View style={{ width: 20, height: 20, borderRadius: 7, backgroundColor: '#4A90E2', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>{nextMeetupDay}</Text>
                    </View>
                  )}
                  <Text style={chatStyles.nextEventText} numberOfLines={1}>
                    {activePolls.length > 0 ? 'Next Meetup' : `Next Meetup: ${nextMeetupLabel}`}
                  </Text>
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
                    ) : nextMeetupRsvpStatus.isRsvpDeadlinePassed ? (
                      <Feather name="lock" size={13} color="#9CA3AF" />
                    ) : (
                      <Ionicons name="mail-open-outline" size={16} color="#F59E0B" />
                    )
                  )}
                  {activePolls.length === 0 && <Feather name="chevron-right" size={13} color="#93C5FD" />}
                </TouchableOpacity>
              )}

              {activePolls.length > 0 && (
                <TouchableOpacity
                  onPress={handlePollBarPress}
                  style={[chatStyles.nextEventBarHalf, chatStyles.pollBarHalf]}
                  activeOpacity={0.7}
                >
                  <Feather name="bar-chart-2" size={15} color="#7C3AED" />
                  <Text style={chatStyles.pollBarText} numberOfLines={1}>
                    {activePolls.length > 1 ? 'Active Polls' : 'Active Poll'}
                  </Text>
                  {hasUnansweredActivePoll ? (
                    <Ionicons name="mail-open-outline" size={16} color="#F59E0B" />
                  ) : (
                    <Feather name="check-circle" size={15} color="#4FD1C5" />
                  )}
                  <Feather name="chevron-right" size={13} color="#C4B5FD" />
                </TouchableOpacity>
              )}
            </View>
          )}

          <ChatMessageInput
            onSend={handleSend}
            onTyping={handleTyping}
            onCreateEvent={canManageGroup && !isDM ? () => setMeetupWizardVisible(true) : undefined}
            onCreatePoll={canManageGroup && !isDM ? () => setCreatePollVisible(true) : undefined}
          />
        </KeyboardAvoidingView>

        {!chatContentReady && (
          <View style={[styles.loadingContainer, StyleSheet.absoluteFillObject]} pointerEvents="none">
            <LoadingAnimation />
          </View>
        )}
      </View>

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

      {/* Poll picker — only shown when the bar's poll side is tapped with more than one active poll */}
      <Modal visible={pollSelectorVisible} transparent animationType="fade" onRequestClose={() => setPollSelectorVisible(false)}>
        <Pressable style={chatStyles.overlay} onPress={() => setPollSelectorVisible(false)}>
          <Pressable style={chatStyles.detailPanel} onPress={() => {}}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: '#111827', marginBottom: 16 }}>Active Polls</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {activePolls.map(poll => {
                const hasVoted = !!currentUser && poll.options.some(opt =>
                  opt.voters.some(v => (typeof v === 'string' ? v : v._id) === currentUser._id)
                );
                return (
                  <TouchableOpacity key={poll._id} style={chatStyles.pollSelectorRow} onPress={() => handleSelectActivePoll(poll._id)}>
                    <Text style={chatStyles.pollSelectorPrompt} numberOfLines={2}>{poll.prompt}</Text>
                    {!hasVoted && <View style={chatStyles.pollSelectorDot} />}
                    <Feather name="chevron-right" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <PollListModal
        visible={pollVoteModalVisible}
        onClose={() => setPollVoteModalVisible(false)}
        groupId={id ?? ''}
        currentUserId={currentUser?._id ?? ''}
        canManage={canManageGroup}
        initialPollId={selectedPollId ?? undefined}
      />

      {groupDetails && (
        <AddMeetupWizard
          visible={meetupWizardVisible}
          onClose={() => setMeetupWizardVisible(false)}
          groupDetails={groupDetails}
        />
      )}

      {groupDetails && (
        <CreatePollModal
          visible={createPollVisible}
          onClose={() => setCreatePollVisible(false)}
          groupId={groupDetails._id}
          timezone={groupDetails.timezone}
        />
      )}

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
  mutedUntilNextClockIcon: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  iconButtonActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  iconButtonDetails: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
});

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
  nextEventBarRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DBEAFE' },
  nextEventBarHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 8 },
  nextEventBarHalfDivider: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: 'rgba(17,24,39,0.08)' },
  nextEventText: { fontSize: 15, fontWeight: '400', color: '#111827' },
  nextEventStatusText: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  pollBarHalf: { backgroundColor: '#F5F3FF' },
  pollBarText: { fontSize: 15, fontWeight: '400', color: '#111827' },
  pollSelectorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6' },
  pollSelectorPrompt: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  pollSelectorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  replyPreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  replyPreviewBody: { flex: 1, borderLeftWidth: 3, borderLeftColor: '#4A90E2', paddingLeft: 8 },
  replyPreviewLabel: { fontSize: 12, fontWeight: '700', color: '#4A90E2', marginBottom: 1 },
  replyPreviewText: { fontSize: 13, color: '#6B7280' },
  editInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, padding: 12, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB', minHeight: 80, maxHeight: 200, textAlignVertical: 'top', marginBottom: 16 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F3F4F6' },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 10, backgroundColor: '#4A90E2' },
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
