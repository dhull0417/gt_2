import {
  View,
  Text,
  ScrollView,
  TextInput,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SectionList,
  Modal,
  Pressable,
} from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useContentTopInset } from '@/hooks/useContentTopInset';
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
import { getDMDisplayName, getUserDisplayName } from '@/utils/groupDisplay';
import { Feather, Ionicons } from '@expo/vector-icons';
import { GroupAvatar } from '@/components/GroupAvatar';
import { useMessages } from '@/hooks/useMessages';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { ChatMessageBubble, type BubbleLayout } from '@/components/ChatMessageBubble';
import { ChatMessageInput } from '@/components/ChatMessageInput';
import { ChatSystemMessage } from '@/components/ChatSystemMessage';
import { ChatPinnedBanner, ChatPinnedModal } from '@/components/ChatPinnedMessages';
import { usePinnedMessages } from '@/hooks/usePinnedMessages';
import { computeGrouping, type BubbleGrouping } from '@/utils/chatGrouping';
import type { MentionMember } from '@/utils/chatMentions';
import { ChatDayBubble } from '@/components/ChatDayBubble';
import { ChatTypingBubble } from '@/components/ChatTypingBubble';
import { ChatScrollToBottomButton } from '@/components/ChatScrollToBottomButton';
import { ChatActionPanel } from '@/components/ChatActionPanel';
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
import { EmojiPickerSheet } from '@/components/EmojiPickerSheet';
import * as Clipboard from 'expo-clipboard';
import { isRsvpDeadlinePassed as isRsvpDeadlinePassedFn, isRsvpLockedFor } from '@/utils/meetupStatus';
import { useAppearance, useThemeColors } from '@/contexts/AppearanceContext';
import { getGroupImage } from '@/utils/groupDisplay';
import { setActiveChat } from '@/utils/activeChat';

interface ChatDaySection {
  key: string;
  title: string;
  data: ChatMessage[];
}

const getUserId = (u: User | string): string => typeof u === 'string' ? u : u._id;

const GroupChatScreen = () => {
  const { id, promptNotifications } = useLocalSearchParams<{ id: string; promptNotifications?: string }>();
  const [chatHeaderHeight, setChatHeaderHeight] = useState(0);
  const [pinnedBannerHeight, setPinnedBannerHeight] = useState(0);
  const colors = useThemeColors();
  const { scheme } = useAppearance();
  const isDark = scheme === 'dark';

  const contentTopInset = useContentTopInset();
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

  // Remember which chat is open so its own pushes stay quiet while you're reading it.
  useEffect(() => {
    if (!id) return;
    setActiveChat(id);
    return () => setActiveChat(null);
  }, [id]);

  // Tapping into a chat clears its unread dot on the groups list.
  // And leaving marks it read again: whatever arrived while you were watching has been seen.
  useEffect(() => {
    if (!id) return;
    const markRead = () => userApi.markGroupRead(api, id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['currentUser'] }))
      .catch(() => {});
    markRead();
    return () => { markRead(); };
  }, [id]);

  // Instant name/avatar/isDM fallback while the heavier group details request is in flight
  const { data: groups } = useGetGroups();
  const fallbackGroup = useMemo(() => groups?.find(g => g._id === id), [groups, id]);

  const { data: groupDetails } = useGetGroupDetails(id ?? null);

  // Full details come from a per-group network fetch that may never have completed while
  // offline (and so was never persisted). The groups list is prefetched eagerly and persisted
  // for every group, so it's a reliable cached stand-in for the fields it also carries
  // (name/image/isDM/owner/moderators) until groupDetails resolves.
  const effectiveGroup = groupDetails ?? fallbackGroup;

  const { data: currentUser } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
  });

  const canManageGroup = useMemo(() => {
    if (!effectiveGroup || !currentUser) return false;
    const userId = currentUser._id;
    const g = effectiveGroup as any;
    const isOwner = (g.owner?._id || g.owner) === userId;
    const isMod = g.moderators?.some((m: any) => (m?._id || m) === userId);
    return isOwner || isMod;
  }, [effectiveGroup, currentUser]);

  const isDM = effectiveGroup?.isDM ?? false;

  // Only the group owner/moderators can create a one-off meetup.
  const canCreateEvent = !isDM && canManageGroup;

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

  const headerName = effectiveGroup?.isDM
    ? getDMDisplayName(effectiveGroup as any, currentUser?.clerkId)
    : (effectiveGroup?.name || '');

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
    router.dismissTo('/(tabs)/groups');
  };

  // --- Message thread ---
  const senderId = currentUser?.clerkId ?? '';
  const senderName = currentUser ? getUserDisplayName(currentUser) : '';

  const {
    messages, loading, sendMessage, retrySend, discardSend, addReaction, deleteMessage, editMessage,
    fetchOlder, loadingOlder, reachedStart,
  } = useMessages(id ?? '');
  const { typingNames, handleTyping, clearTypingFor } = useTypingIndicator(id ?? '', senderId, senderName);
  const { pins, pinMessage, unpinMessage } = usePinnedMessages(id ?? '');
  const [pinnedModalVisible, setPinnedModalVisible] = useState(false);

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
    const isRsvpLocked = isRsvpLockedFor(nextMeetup, currentUser._id);
    const isRsvpDeadlinePassed = isRsvpDeadlinePassedFn(nextMeetup);
    return { isIn, isOut, isWaitlisted, isRsvpLocked, isRsvpDeadlinePassed };
  }, [nextMeetup, currentUser]);
  const nextMeetupBarColor = useMemo(() => {
    if (!nextMeetupRsvpStatus) return isDark ? colors.backgroundAlt : '#EEF6FF';
    const { isOut, isIn, isWaitlisted } = nextMeetupRsvpStatus;
    if (isDark) {
      return isOut ? '#3B1E1E' : (isIn || isWaitlisted) ? '#153226' : colors.backgroundAlt;
    }
    return isOut ? '#FEF2F2' : (isIn || isWaitlisted) ? '#EDF5F0' : '#FFFEFA';
  }, [nextMeetupRsvpStatus, isDark, colors]);
  const pollBarColor = isDark ? '#2A2140' : '#F5F3FF';

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
  const [selectedMessageLayout, setSelectedMessageLayout] = useState<BubbleLayout | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [reactionDetailMessage, setReactionDetailMessage] = useState<ChatMessage | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<{ url: string; width?: number | null; height?: number | null } | null>(null);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const msg of messages) {
      if (!map.has(msg.sender_id)) map.set(msg.sender_id, msg.sender_name);
    }
    // Members who reacted without ever posting still have a name.
    for (const m of ((groupDetails as any)?.members as User[] | undefined) ?? []) {
      if (m.clerkId && !map.has(m.clerkId)) map.set(m.clerkId, getUserDisplayName(m));
    }
    map.set(senderId, senderName);
    return map;
  }, [messages, senderId, senderName, groupDetails]);

  // Group members who can be @mentioned (everyone but me). Not offered in a one-on-one DM.
  const mentionMembers = useMemo<MentionMember[] | undefined>(() => {
    if (isDM) return undefined;
    const members = (groupDetails as any)?.members as User[] | undefined;
    if (!members) return undefined;
    return members
      .filter((m) => !!m.clerkId && m.clerkId !== senderId)
      .map((m) => ({ clerkId: m.clerkId, name: getUserDisplayName(m) }));
  }, [groupDetails, isDM, senderId]);

  // Clerk id -> name for rendering "@Name" mentions; members first, then anyone seen in the thread.
  const mentionNames = useMemo(() => {
    const out: Record<string, string> = {};
    userNameMap.forEach((name, uid) => { out[uid] = name; });
    const members = (groupDetails as any)?.members as User[] | undefined;
    for (const m of members ?? []) if (m.clerkId) out[m.clerkId] = getUserDisplayName(m);
    return out;
  }, [userNameMap, groupDetails]);

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

  // Cluster info (who gets a name label / timestamp / tail) computed per day section.
  const groupingById = useMemo(() => {
    const all = new Map<string, BubbleGrouping>();
    for (const s of sections) computeGrouping(s.data).forEach((v, k) => all.set(k, v));
    return all;
  }, [sections]);

  const [listHeight, setListHeight] = useState(0);
  // Gates first paint so a freshly opened chat never visibly animates down from the oldest message
  const [contentReady, setContentReady] = useState(false);
  const contentReadyRef = useRef(false);
  contentReadyRef.current = contentReady;
  // Snapshot of message ids visible at first reveal, so their bubbles skip the entrance
  // animation — animating a whole history's worth of bubbles in at once stalls the JS
  // thread just long enough to make the header back button feel unresponsive.
  const initialMessageIdsRef = useRef<Set<string> | null>(null);

  // --- Scroll-to-bottom FAB: only auto-scroll on new messages while already near the bottom;
  // otherwise surface the button with an unread count instead of yanking the view down.
  const NEAR_BOTTOM_THRESHOLD = 120;
  const isNearBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Scrolling near the top pulls in the previous page of history.
  const fetchOlderRef = useRef(fetchOlder);
  fetchOlderRef.current = fetchOlder;

  const handleListScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentOffset.y < 400 && contentReadyRef.current) fetchOlderRef.current();
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
    isNearBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
    if (nearBottom) setUnreadCount(0);
  }, []);

  const handleScrollToBottomPress = useCallback(() => {
    isNearBottomRef.current = true;
    setUnreadCount(0);
    setShowScrollToBottom(false);
    scrollToBottom(true);
  }, []);

  useEffect(() => {
    setContentReady(false);
    initialMessageIdsRef.current = null;
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
    initialMessageIdsRef.current = new Set(messages.map(m => m.id));
    requestAnimationFrame(() => requestAnimationFrame(() => setContentReady(true)));
  }, [messages.length, contentReady, scrollToBottom]);

  // A genuinely empty chat has nothing to position — reveal the empty state immediately.
  useEffect(() => {
    if (!loading && messages.length === 0) setContentReady(true);
  }, [loading, messages.length]);

  // Once visibly open, new messages get the usual animated scroll-into-view —
  // but only when the user is already near the bottom; otherwise surface the FAB instead.
  // Keyed on the *last* message (client_id stays the same when a "sending" placeholder becomes the saved
  // row), so loading older history at the top never counts as a new message or yanks the view.
  const lastMessage = messages[messages.length - 1];
  const lastMessageKey = lastMessage ? (lastMessage.client_id ?? lastMessage.id) : null;
  const seenLastKeyRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!contentReady) return;
    if (lastMessageKey === seenLastKeyRef.current) return;
    const firstReveal = seenLastKeyRef.current === undefined;
    seenLastKeyRef.current = lastMessageKey;
    if (firstReveal) return;
    if (isNearBottomRef.current) {
      scrollToBottom(true);
    } else {
      setUnreadCount((c) => c + 1);
    }
  }, [lastMessageKey, contentReady, scrollToBottom]);

  // Someone's message arriving means they've stopped typing.
  useEffect(() => {
    if (lastMessage && lastMessage.sender_id !== senderId) clearTypingFor(lastMessage.sender_id);
  }, [lastMessageKey]);

  // Re-anchor on list height change — the real signal a keyboard-driven resize has landed,
  // unlike guessing a delay off the keyboard event (which fires before resize finishes).
  useEffect(() => {
    if (listHeight > 0) scrollToBottom(true);
  }, [listHeight]);

  const isOwnSelected = selectedMessage?.sender_id === senderId;
  const isDeletedSelected = !!selectedMessage?.deleted_at;

  const handleSend = async (text: string, image?: PendingImage, mentions?: string[]) => {
    if (!id) return;
    const currentReply = replyingTo;
    setReplyingTo(null);
    // Sending your own message always snaps the view to it, regardless of prior scroll position.
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
    setUnreadCount(0);
    try {
      await sendMessage(
        text,
        senderId,
        senderName,
        currentReply
          ? { id: currentReply.id, content: currentReply.content, senderName: currentReply.sender_name }
          : undefined,
        image,
        mentions
      );
      const notifyText = text || '📷 Photo';
      api.patch(`/api/groups/${id}/last-message`, { text: notifyText, senderName }).catch(() => {});
      // Mark read so your own message doesn't re-trigger the unread dot after you leave
      userApi.markGroupRead(api, id).catch(() => {});
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? JSON.stringify(err));
    }
  };

  const handlePendingPressRef = useRef<(item: ChatMessage) => void>(() => {});
  const handlePendingPress = (item: ChatMessage) => {
    if (!item.mutationId) return;
    if (item.failed) {
      Alert.alert(
        "Message didn't send",
        'Connection issue — this message was saved as a draft. Try again?',
        [
          { text: 'Retry', onPress: () => retrySend(item.mutationId!) },
          { text: 'Discard', style: 'destructive', onPress: () => discardSend(item.mutationId!) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } else {
      Alert.alert(
        'Still sending…',
        'This message is waiting for a connection.',
        [
          { text: 'Discard', style: 'destructive', onPress: () => discardSend(item.mutationId!) },
          { text: 'Close', style: 'cancel' },
        ]
      );
    }
  };
  handlePendingPressRef.current = handlePendingPress;

  const closeActionPanel = () => {
    setSelectedMessage(null);
    setSelectedMessageLayout(null);
  };

  const handleReact = async (emoji: string) => {
    if (!selectedMessage || !id) return;
    const target = selectedMessage;
    closeActionPanel();
    try {
      const result = await addReaction(target.id, emoji, senderId);
      if (result.action !== 'removed') {
        api.post(`/api/groups/${id}/chat-reaction`, {
          emoji: result.emoji,
          senderName,
          // Lets the server notify just the message's author instead of the whole group.
          authorId: result.senderId || undefined,
        }).catch(() => {});
      }
    } catch (err: any) {
      Alert.alert('Reaction failed', err?.message ?? JSON.stringify(err));
    }
  };

  // Anyone can pin in a DM; in a group only owners and moderators (enforced in the app, not the database).
  const canPin = isDM || canManageGroup;
  const handlePinToggle = async () => {
    if (!selectedMessage) return;
    const target = selectedMessage;
    closeActionPanel();
    try {
      if (target.pinned_at) await unpinMessage(target, senderId);
      else await pinMessage(target, senderId);
    } catch (err: any) {
      Alert.alert('Pin failed', err?.message ?? 'Could not update the pinned message.');
    }
  };

  const handleReplyOpen = () => {
    if (!selectedMessage) return;
    setReplyingTo(selectedMessage);
    closeActionPanel();
  };

  const handleCopy = async () => {
    if (!selectedMessage) return;
    await Clipboard.setStringAsync(selectedMessage.content);
    closeActionPanel();
  };

  const handleEditOpen = () => {
    if (!selectedMessage) return;
    setEditText(selectedMessage.content);
    setEditingMessage(selectedMessage);
    closeActionPanel();
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
    closeActionPanel();
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

  const chatContentReady = contentReady && !!effectiveGroup && !!currentUser;

  // Pastel status-chip colors (icon buttons + mute options) adapt background/border by
  // scheme while keeping the same hue family, mirroring MeetupCard's RSVP tint treatment.
  const mutedChip = { backgroundColor: isDark ? '#3B1E1E' : '#FEF2F2', borderColor: isDark ? '#5C2E2E' : '#FECACA' };
  const mutedUntilNextChip = { backgroundColor: isDark ? '#3A2E12' : '#FFFBEB', borderColor: isDark ? '#5C4A1E' : '#FDE68A' };
  const activeChip = { backgroundColor: isDark ? '#132A1E' : '#F0FDF4', borderColor: isDark ? '#1F4A34' : '#BBF7D0' };
  const detailsChip = { backgroundColor: isDark ? '#1E2340' : '#EEF2FF', borderColor: isDark ? '#333B6B' : '#C7D2FE' };
  const amberText = isDark ? '#FBBF24' : '#B45309';
  const redText = isDark ? '#F87171' : '#DC2626';

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: contentTopInset }}
      edges={['left', 'right', 'bottom']}
    >
      <View
        className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800"
        onLayout={(e) => setChatHeaderHeight(e.nativeEvent.layout.height)}
      >
        <View className="flex-row items-center flex-1">
          <PressableOpacity accessibilityLabel="Go back" onPress={handleBack} className="mr-2 p-1">
            <Feather name="chevron-left" size={26} color="#FF7A6E"/>
          </PressableOpacity>
          {/* Tapping the group's photo or name opens its details (this replaces the old menu button). */}
          <PressableOpacity accessibilityLabel="Group details" onPress={handleOpenDetails} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={{ marginRight: 10 }}>
              <GroupAvatar name={headerName} imageUrl={getGroupImage(effectiveGroup as any, currentUser?.clerkId)} size={36} borderRadius={9} />
            </View>
            <Text className="text-lg font-black text-gray-900 dark:text-white flex-1" numberOfLines={1}>
              {headerName}
            </Text>
          </PressableOpacity>
        </View>

        <View className="flex-row items-center" style={{ gap: 8 }}>
          <PressableOpacity
            accessibilityLabel="Search chat"
            onPress={() => id && router.push({ pathname: '/group-chat/search/[id]', params: { id } } as any)}
            style={[styles.iconButton, detailsChip]}
          >
            <Feather name="search" size={18} color={colors.brand} />
          </PressableOpacity>

          {id && currentUser && (
            <GroupCalendarButton groupId={id} isDM={isDM} />
          )}

          <PressableOpacity
            onPress={handleMutePress}
            style={[
              styles.iconButton,
              isMutedUntilNext ? mutedUntilNextChip : isCurrentlyMuted ? mutedChip : activeChip,
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
          </PressableOpacity>

        </View>
      </View>

      {/* Measured so the keyboard offset below includes it — otherwise, with a pinned message,
          Android left the bottom of the composer hidden behind the keyboard by the banner's height. */}
      <View onLayout={(e) => setPinnedBannerHeight(e.nativeEvent.layout.height)}>
        <ChatPinnedBanner pins={pins} onPress={() => setPinnedModalVisible(true)} />
      </View>

      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1, opacity: chatContentReady ? 1 : 0 }}
          pointerEvents={chatContentReady ? 'auto' : 'none'}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={contentTopInset + chatHeaderHeight + pinnedBannerHeight}
        >
          <View style={{ flex: 1, position: 'relative' }}>
            <SectionList
              ref={sectionListRef}
              style={{ flex: 1 }}
              sections={sections}
              keyExtractor={(item) => item.client_id ?? item.id}
              renderItem={({ item }) => item.kind === 'system' ? (
                <ChatSystemMessage text={item.content} />
              ) : (
                <ChatMessageBubble
                  message={item}
                  isFirst={groupingById.get(item.id)?.isFirst ?? true}
                  isLast={groupingById.get(item.id)?.isLast ?? true}
                  mentionNames={mentionNames}
                  isOwn={item.sender_id === senderId}
                  currentUserId={senderId}
                  isHighlighted={selectedMessage?.id === item.id}
                  onLongPress={(layout) => { setSelectedMessage(item); setSelectedMessageLayout(layout); }}
                  onReactionLongPress={() => setReactionDetailMessage(item)}
                  onImagePress={(url, width, height) => setFullscreenImage({ url, width, height })}
                  onPendingPress={() => handlePendingPressRef.current(item)}
                  onSwipeReply={() => setReplyingTo(item)}
                  skipEntrance={initialMessageIdsRef.current?.has(item.id) ?? false}
                />
              )}
              renderSectionHeader={({ section }) => <ChatDayBubble label={section.title} />}
              ListHeaderComponent={
                loadingOlder ? (
                  <View style={{ paddingVertical: 12 }}>
                    <LoadingAnimation />
                  </View>
                ) : reachedStart && messages.length > 0 ? (
                  <Text style={{ textAlign: 'center', color: colors.textFaint, fontSize: 12, paddingVertical: 10 }}>
                    Start of the conversation
                  </Text>
                ) : null
              }
              // Keeps the message you were reading in place when an older page is added above it.
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              stickySectionHeadersEnabled
              contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
              ListEmptyComponent={
                <View style={chatStyles.center}>
                  <Text style={{ color: colors.textFaint, fontSize: 15 }}>No messages yet. Say hello!</Text>
                </View>
              }
              onContentSizeChange={() => {
                // Follow content growth only during the initial reveal or while the user is at the
                // bottom. Jumping down unconditionally yanked people out of history they were
                // reading whenever an image loaded, a reaction landed, or a message arrived.
                if (!contentReadyRef.current || isNearBottomRef.current) scrollToBottom(false);
              }}
              onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
              onScroll={handleListScroll}
              scrollEventThrottle={16}
            />
            <ChatScrollToBottomButton
              visible={showScrollToBottom}
              unreadCount={unreadCount}
              onPress={handleScrollToBottomPress}
            />
          </View>

          <View style={{ minHeight: 20, paddingHorizontal: 12, justifyContent: 'center' }}>
            {typingLabel ? <ChatTypingBubble label={typingLabel} /> : null}
          </View>

          {replyingTo && (
            <View style={[chatStyles.replyPreview, { backgroundColor: colors.surfaceAlt, borderTopColor: colors.border }]}>
              <View style={[chatStyles.replyPreviewBody, { borderLeftColor: colors.brand }]}>
                <Text style={[chatStyles.replyPreviewLabel, { color: colors.brand }]}>↩ {replyingTo.sender_name}</Text>
                <Text style={[chatStyles.replyPreviewText, { color: colors.textMuted }]} numberOfLines={1}>{replyingTo.content}</Text>
              </View>
              <PressableOpacity onPress={() => setReplyingTo(null)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 16, color: colors.textFaint }}>✕</Text>
              </PressableOpacity>
            </View>
          )}

          {((nextMeetup && nextMeetupLabel) || activePolls.length > 0) && (
            <View style={[chatStyles.nextEventBarRow, { borderTopColor: colors.border }]}>
              {nextMeetup && nextMeetupLabel && (
                <PressableOpacity
                  onPress={() => setNextMeetupModalVisible(true)}
                  style={[
                    chatStyles.nextEventBarHalf,
                    { backgroundColor: nextMeetupBarColor },
                    activePolls.length > 0 && chatStyles.nextEventBarHalfDivider,
                  ]}
                  activeOpacity={0.7}
                >
                  {activePolls.length === 0 && nextMeetupDay && (
                    <View style={{ width: 20, height: 20, borderRadius: 7, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>{nextMeetupDay}</Text>
                    </View>
                  )}
                  <Text style={[chatStyles.nextEventText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {activePolls.length > 0 ? 'Next Meetup' : `Next Meetup: ${nextMeetupLabel}`}
                  </Text>
                  {nextMeetupRsvpStatus && (
                    nextMeetupRsvpStatus.isIn || nextMeetupRsvpStatus.isOut ? (
                      <Text style={[chatStyles.nextEventStatusText, { color: nextMeetupRsvpStatus.isIn ? '#4FD1C5' : '#FF7A6E' }]}>
                        {nextMeetupRsvpStatus.isIn ? 'IN' : 'OUT'}
                      </Text>
                    ) : nextMeetupRsvpStatus.isRsvpLocked ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Feather name="clock" size={13} color={colors.textFaint} />
                        <Feather name="lock" size={13} color={colors.textFaint} />
                      </View>
                    ) : nextMeetupRsvpStatus.isRsvpDeadlinePassed ? (
                      <Feather name="lock" size={13} color={colors.textFaint} />
                    ) : (
                      <Ionicons name="mail-open-outline" size={16} color="#F59E0B" />
                    )
                  )}
                  {activePolls.length === 0 && <Feather name="chevron-right" size={13} color={colors.textFaint} />}
                </PressableOpacity>
              )}

              {activePolls.length > 0 && (
                <PressableOpacity
                  onPress={handlePollBarPress}
                  style={[chatStyles.nextEventBarHalf, { backgroundColor: pollBarColor }]}
                  activeOpacity={0.7}
                >
                  <Feather name="bar-chart-2" size={15} color="#7C3AED" />
                  <Text style={[chatStyles.pollBarText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {activePolls.length > 1 ? 'Active Polls' : 'Active Poll'}
                  </Text>
                  {hasUnansweredActivePoll ? (
                    <Ionicons name="mail-open-outline" size={16} color="#F59E0B" />
                  ) : (
                    <Feather name="check-circle" size={15} color="#4FD1C5" />
                  )}
                  <Feather name="chevron-right" size={13} color={colors.textFaint} />
                </PressableOpacity>
              )}
            </View>
          )}

          <ChatMessageInput
            groupId={id!}
            mentionMembers={mentionMembers}
            onSend={handleSend}
            onTyping={handleTyping}
            onCreateEvent={canCreateEvent ? () => setMeetupWizardVisible(true) : undefined}
            onCreatePoll={!isDM ? () => setCreatePollVisible(true) : undefined}
          />
        </KeyboardAvoidingView>

        {!chatContentReady && (
          <View style={[styles.loadingContainer, { backgroundColor: colors.background }, StyleSheet.absoluteFillObject]} pointerEvents="none">
            <LoadingAnimation />
          </View>
        )}
      </View>

      {/* Action sheet */}
      {/* Hidden (rather than unmounted) while the emoji picker is open — two
          simultaneously-visible RN <Modal>s fight over the native presentation
          stack and the second one silently fails to appear, so only one can
          be visible at a time. selectedMessage itself stays set so handleReact
          still has its target once an emoji is picked. */}
      <Modal visible={!!selectedMessage && !emojiPickerVisible} transparent animationType="none" onRequestClose={closeActionPanel}>
        <ChatActionPanel
          anchor={selectedMessageLayout}
          isOwn={isOwnSelected}
          showReactions={!isDeletedSelected}
          onReact={handleReact}
          onOpenEmojiPicker={() => setEmojiPickerVisible(true)}
          showReply={!isDeletedSelected}
          onReply={handleReplyOpen}
          showCopy={!isDeletedSelected && !!selectedMessage?.content?.trim()}
          onCopy={handleCopy}
          showPin={canPin && !isDeletedSelected && selectedMessage?.kind !== 'system'}
          isPinned={!!selectedMessage?.pinned_at}
          onPin={handlePinToggle}
          showEdit={isOwnSelected && !isDeletedSelected}
          onEdit={handleEditOpen}
          showDelete={isOwnSelected}
          onDelete={handleDeleteConfirm}
          onClose={closeActionPanel}
        />
      </Modal>

      <ChatPinnedModal
        visible={pinnedModalVisible}
        pins={pins}
        onClose={() => setPinnedModalVisible(false)}
        canUnpin={canPin}
        onUnpin={(m) => {
          unpinMessage(m, senderId).catch((err: any) => Alert.alert('Unpin failed', err?.message ?? 'Could not unpin.'));
        }}
      />

      <EmojiPickerSheet
        open={emojiPickerVisible}
        onClose={() => setEmojiPickerVisible(false)}
        onEmojiSelected={(item) => handleReact(item.emoji)}
      />

      {/* Reaction detail */}
      <Modal visible={!!reactionDetailMessage} transparent animationType="fade" onRequestClose={() => setReactionDetailMessage(null)}>
        <Pressable style={chatStyles.overlay} onPress={() => setReactionDetailMessage(null)}>
          <Pressable style={[chatStyles.detailPanel, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: colors.textPrimary, marginBottom: 16 }}>Reactions</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {Object.entries(reactionDetailMessage?.reactions ?? {})
                .filter(([, users]) => users.length > 0)
                .map(([emoji, users]) => (
                  <View key={emoji} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Text style={{ fontSize: 22 }}>{emoji}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textMuted }}>{users.length}</Text>
                    </View>
                    {users.map((uid) => (
                      <Text key={uid} style={{ fontSize: 15, color: colors.textPrimary, paddingVertical: 3, paddingLeft: 4 }}>
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
        {/* Modal windows aren't resized for the keyboard (edge-to-edge), so lift the panel ourselves —
            otherwise Save/Cancel sat under the keyboard on Android. */}
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={chatStyles.overlay} onPress={() => setEditingMessage(null)}>
          <Pressable style={[chatStyles.detailPanel, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: colors.textPrimary, marginBottom: 12 }}>Edit Message</Text>
            <TextInput
              style={[chatStyles.editInput, { borderColor: colors.border, backgroundColor: colors.backgroundAlt, color: colors.textPrimary }]}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              maxLength={2000}
              selectionColor={colors.brand}
              placeholderTextColor={colors.placeholder}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <PressableOpacity style={[chatStyles.cancelBtn, { backgroundColor: colors.backgroundAlt }]} onPress={() => setEditingMessage(null)}>
                <Text style={{ fontSize: 15, color: colors.textMuted, fontWeight: '600' }}>Cancel</Text>
              </PressableOpacity>
              <PressableOpacity style={[chatStyles.saveBtn, { backgroundColor: colors.brand }]} onPress={handleEditSave}>
                <Text style={{ fontSize: 15, color: '#fff', fontWeight: '600' }}>Save</Text>
              </PressableOpacity>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
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
          <Pressable style={[chatStyles.detailPanel, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: colors.textPrimary, marginBottom: 16 }}>Active Polls</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {activePolls.map(poll => {
                const hasVoted = !!currentUser && poll.options.some(opt =>
                  opt.voters.some(v => (typeof v === 'string' ? v : v._id) === currentUser._id)
                );
                return (
                  <PressableOpacity key={poll._id} style={[chatStyles.pollSelectorRow, { borderBottomColor: colors.border }]} onPress={() => handleSelectActivePoll(poll._id)}>
                    <Text style={[chatStyles.pollSelectorPrompt, { color: colors.textPrimary }]} numberOfLines={2}>{poll.prompt}</Text>
                    {!hasVoted && <View style={chatStyles.pollSelectorDot} />}
                    <Feather name="chevron-right" size={16} color={colors.textFaint} />
                  </PressableOpacity>
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
          onMeetupCreated={(groupId) => {
            setMeetupWizardVisible(false);
            router.push({ pathname: '/add-members/[id]', params: { id: groupId } });
          }}
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
          <Pressable style={[chatStyles.detailPanel, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: colors.textPrimary, marginBottom: 16 }}>Mute Notifications</Text>
            <PressableOpacity
              style={[muteStyles.option, mutedUntilNextChip]}
              onPress={() => handleMuteOptionPress('untilNext')}
              activeOpacity={0.7}
            >
              <View style={[muteStyles.iconWrap, { backgroundColor: isDark ? '#4A3A18' : '#FEF3C7' }]}>
                <Feather name="clock" size={18} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[muteStyles.untilNextText, { color: amberText }]}>Mute until next meetup</Text>
                <Text style={[muteStyles.optionSubtitle, { color: colors.textFaint }]}>We'll turn notifications back on for you</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textFaint} />
            </PressableOpacity>
            <PressableOpacity
              style={[muteStyles.option, mutedChip]}
              onPress={() => handleMuteOptionPress('indefinite')}
              activeOpacity={0.7}
            >
              <View style={[muteStyles.iconWrap, { backgroundColor: isDark ? '#4A2424' : '#FEE2E2' }]}>
                <Feather name="bell-off" size={18} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[muteStyles.indefiniteText, { color: redText }]}>Mute</Text>
                <Text style={[muteStyles.optionSubtitle, { color: colors.textFaint }]}>Stay silent until you turn it back on</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textFaint} />
            </PressableOpacity>
            <PressableOpacity style={[chatStyles.cancelBtn, { backgroundColor: colors.backgroundAlt }]} onPress={() => setMuteOptionsVisible(false)}>
              <Text style={{ fontSize: 15, color: colors.textMuted, fontWeight: '600', textAlign: 'center' }}>Cancel</Text>
            </PressableOpacity>
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
  mutedUntilNextClockIcon: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
});

const chatStyles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  detailPanel: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 360, maxHeight: '70%', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  nextEventBarRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DBEAFE' },
  nextEventBarHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 8 },
  nextEventBarHalfDivider: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: 'rgba(17,24,39,0.08)' },
  nextEventText: { fontSize: 15, fontWeight: '400', color: '#111827' },
  nextEventStatusText: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
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
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  untilNextText: { fontSize: 15, fontWeight: '800', color: '#B45309' },
  indefiniteText: { fontSize: 15, fontWeight: '800', color: '#DC2626' },
  optionSubtitle: { fontSize: 12, fontWeight: '500', color: '#9CA3AF', marginTop: 2 },
});

export default GroupChatScreen;
