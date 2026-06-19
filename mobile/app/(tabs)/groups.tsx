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
  FlatList,
  Modal,
  Pressable,
} from 'react-native';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useGetGroups } from '@/hooks/useGetGroups';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useRemoveMember } from '@/hooks/useRemoveMember';
import { Group, GroupDetails, User, useApiClient, userApi, groupApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';
import { useSearchUsers } from '@/hooks/useSearchUsers';
import { useInviteUser } from '@/hooks/useInviteUser';
import { useGetNotifications } from '@/hooks/useGetNotifications';
import { GroupDetailsView } from '@/components/GroupDetailsView';
import { useMessages } from '@/hooks/useMessages';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { ChatMessageBubble } from '@/components/ChatMessageBubble';
import { ChatMessageInput } from '@/components/ChatMessageInput';
import type { ChatMessage } from '@/types/chat';

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  chatContainer: {
    flex: 1,
  },
  detailsButton: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A90E2',
    marginRight: 8,
  },
  detailsButtonText: {
    color: '#4A90E2',
    fontWeight: 'bold',
    fontSize: 14,
  },
  muteButton: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginRight: 8,
  },
  muteButtonText: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 14,
  },
  unmuteButton: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginRight: 8,
  },
  unmuteButtonText: {
    color: '#10B981',
    fontWeight: 'bold',
    fontSize: 14,
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

const GroupChat = ({
  group,
  currentUser,
  keyboardOffset,
}: {
  group: GroupDetails;
  currentUser: User;
  keyboardOffset: number;
}) => {
  const api = useApiClient();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const senderId = currentUser.clerkId;
  const senderName = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.email;

  const { messages, loading, sendMessage, addReaction, deleteMessage, editMessage } =
    useMessages(group._id);
  const { typingNames, handleTyping } = useTypingIndicator(group._id, senderId, senderName);

  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [reactionDetailMessage, setReactionDetailMessage] = useState<ChatMessage | null>(null);

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const msg of messages) {
      if (!map.has(msg.sender_id)) map.set(msg.sender_id, msg.sender_name);
    }
    map.set(senderId, senderName);
    return map;
  }, [messages, senderId, senderName]);

  useEffect(() => {
    if (messages.length > 0) flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(event, () => flatListRef.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);

  const isOwnSelected = selectedMessage?.sender_id === senderId;
  const isDeletedSelected = !!selectedMessage?.deleted_at;

  const handleSend = async (text: string) => {
    const currentReply = replyingTo;
    setReplyingTo(null);
    try {
      await sendMessage(
        text,
        senderId,
        senderName,
        currentReply
          ? { id: currentReply.id, content: currentReply.content, senderName: currentReply.sender_name }
          : undefined
      );
      api.patch(`/api/groups/${group._id}/last-message`, { text, senderName }).catch(() => {});
    } catch {
      Alert.alert('Error', 'Failed to send message.');
    }
  };

  const handleReact = async (emoji: string) => {
    if (!selectedMessage) return;
    const target = selectedMessage;
    setSelectedMessage(null);
    try {
      const result = await addReaction(target.id, emoji, senderId);
      void result;
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

  if (loading) {
    return (
      <View style={chatStyles.center}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatMessageBubble
              message={item}
              isOwn={item.sender_id === senderId}
              currentUserId={senderId}
              onLongPress={() => setSelectedMessage(item)}
              onReactionLongPress={() => setReactionDetailMessage(item)}
            />
          )}
          contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={chatStyles.center}>
              <Text style={{ color: '#9CA3AF', fontSize: 15 }}>No messages yet. Say hello!</Text>
            </View>
          }
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
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
                  <Text style={[chatStyles.actionLabel, { color: '#ff3b30' }]}>Delete</Text>
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
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 16 }}>Reactions</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {Object.entries(reactionDetailMessage?.reactions ?? {})
                .filter(([, users]) => users.length > 0)
                .map(([emoji, users]) => (
                  <View key={emoji} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Text style={{ fontSize: 22 }}>{emoji}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#555' }}>{users.length}</Text>
                    </View>
                    {users.map((uid) => (
                      <Text key={uid} style={{ fontSize: 15, color: '#111', paddingVertical: 3, paddingLeft: 4 }}>
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
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 12 }}>Edit Message</Text>
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
                <Text style={{ fontSize: 15, color: '#555' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={chatStyles.saveBtn} onPress={handleEditSave}>
                <Text style={{ fontSize: 15, color: '#fff', fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
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
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e5e5e5' },
  actionRow: { paddingVertical: 16, paddingHorizontal: 20 },
  actionLabel: { fontSize: 16, color: '#111' },
  detailPanel: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 360, maxHeight: '70%', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  replyPreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  replyPreviewBody: { flex: 1, borderLeftWidth: 3, borderLeftColor: '#4A90E2', paddingLeft: 8 },
  replyPreviewLabel: { fontSize: 12, fontWeight: '600', color: '#4A90E2', marginBottom: 1 },
  replyPreviewText: { fontSize: 13, color: '#555' },
  editInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, color: '#111', minHeight: 80, maxHeight: 200, textAlignVertical: 'top', marginBottom: 16 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, backgroundColor: '#f0f0f0' },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 8, backgroundColor: '#4A90E2' },
});

const GroupScreen = () => {
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isGroupDetailVisible, setIsGroupDetailVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'Chat' | 'Details'>('Chat');
  const [chatHeaderHeight, setChatHeaderHeight] = useState(0);

  const insets = useSafeAreaInsets();
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { openChatId, reset } = useLocalSearchParams<{ openChatId?: string, reset?: string }>();

  const { data: groups, isLoading: isLoadingGroups, isError: isErrorGroups, refetch: refetchGroups } = useGetGroups();
  const { data: groupDetails, isLoading: isLoadingDetails, isError: isErrorDetails } = useGetGroupDetails(selectedGroup?._id || null);

  const { data: currentUser, refetch: refetchUser, isLoading: isLoadingUser } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
  });

  const stableUserRef = useRef<User | null>(null);
  if (!stableUserRef.current && currentUser) stableUserRef.current = currentUser;

  useEffect(() => {
    if (!selectedGroup) stableUserRef.current = null;
  }, [selectedGroup?._id]);

  useEffect(() => {
    if (reset) {
      handleCloseGroupDetail();
    }
  }, [reset]);

  useEffect(() => {
    if (groupDetails && selectedGroup && groupDetails._id === selectedGroup._id) {
      if (groupDetails.name !== selectedGroup.name) {
        setSelectedGroup(prev => prev ? { ...prev, name: groupDetails.name } : null);
      }
    }
  }, [groupDetails?.name]);

  const canManageGroup = useMemo(() => {
    if (!groupDetails || !currentUser) return false;
    const userId = currentUser._id;
    const g = groupDetails as any;
    const isOwner = (g.owner?._id || g.owner) === userId;
    const isMod = g.moderators?.some((m: any) => (m?._id || m) === userId);
    return isOwner || isMod;
  }, [groupDetails, currentUser]);

  const isCurrentlyMuted = useMemo(() => {
    if (!selectedGroup || !currentUser) return false;
    return currentUser.mutedGroups?.includes(selectedGroup._id) ||
           currentUser.mutedUntilNextMeetup?.includes(selectedGroup._id);
  }, [selectedGroup?._id, currentUser]);

  const performMuteUpdate = async (type: 'indefinite' | 'untilNext' | 'none') => {
    if (!selectedGroup) return;
    try {
        await userApi.toggleGroupMute(api, selectedGroup._id, type);
        queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    } catch (error: any) {
        Alert.alert("Error", "Failed to update notification settings.");
    }
  };

  const handleMutePress = () => {
    if (isCurrentlyMuted) {
      performMuteUpdate('none');
    } else {
      Alert.alert(
          "Mute Notifications",
          "How long would you like to silence this chat?",
          [
              { text: "Until Next Meetup", onPress: () => performMuteUpdate('untilNext') },
              { text: "Indefinitely", onPress: () => performMuteUpdate('indefinite') },
              { text: "Cancel", style: "cancel" }
          ]
      );
    }
  };

  const { mutate: removeMember, isPending: isRemovingMember } = useRemoveMember();

  const [searchQuery, setSearchQuery] = useState('');
  const { data: searchResults } = useSearchUsers(searchQuery);
  const { mutate: inviteUser } = useInviteUser();
  const { data: notifications } = useGetNotifications();
  const hasUnreadNotifications = notifications?.some(n => !n.read);

  useFocusEffect(
    useCallback(() => {
      refetchGroups();
      refetchUser();
    }, [refetchGroups, refetchUser])
  );

  useEffect(() => {
    if (openChatId && groups && groups.length > 0) {
      const targetGroup = groups.find(g => g._id === openChatId);
      if (targetGroup) {
        handleOpenGroupDetail(targetGroup);
        router.setParams({ openChatId: undefined });
      }
    }
  }, [openChatId, groups]);

  const handleInvite = (userIdToInvite: string) => {
    if (!selectedGroup) return;
    inviteUser({ groupId: selectedGroup._id, userIdToInvite }, {
        onSuccess: () => {
            setSearchQuery('');
            Keyboard.dismiss();
            Alert.alert("Success", "Invite sent!");
        }
    });
  };

  const handleRemoveMember = (memberIdToRemove: string) => {
    if (!selectedGroup) return;
    Alert.alert("Remove Member", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        removeMember({ groupId: selectedGroup._id, memberIdToRemove }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['groupDetails', selectedGroup._id] });
          }
        });
      }},
    ]);
  };

  const handleOpenGroupDetail = (group: Group) => {
    setSelectedGroup(group);
    setIsGroupDetailVisible(true);
    setActiveTab('Chat');
  };

  const handleCloseGroupDetail = () => {
    setIsGroupDetailVisible(false);
    setSelectedGroup(null);
    setSearchQuery('');
    refetchGroups();
    refetchUser();
  };

  const handleSettingsPress = () => {
    if (!selectedGroup) return;
    router.push({
      pathname: '/group-settings/[id]',
      params: { id: selectedGroup._id }
    });
  };

  const renderGroupList = () => {
    if (isLoadingGroups || (!currentUser && isLoadingUser)) return <ActivityIndicator size="large" color="#4FD1C5" className="mt-8"/>;
    if (isErrorGroups) return <Text className="text-center text-red-500 mt-4">Failed to load groups.</Text>;
    if (!groups || groups.length === 0) return <Text className="text-center text-gray-500 mt-4">You have no groups yet.</Text>;

    return groups.map((group) => {
      const isMuted = currentUser?.mutedGroups?.includes(group._id) || currentUser?.mutedUntilNextMeetup?.includes(group._id);
      return (
        <TouchableOpacity
          key={group._id}
          className="bg-white p-5 my-2 rounded-2xl shadow-sm border border-gray-100"
          onPress={() => handleOpenGroupDetail(group)}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              <Text className="text-lg font-bold text-gray-800" numberOfLines={1}>{group.name}</Text>
              {isMuted && (
                <View className="ml-2">
                  <Feather name="bell-off" size={14} color="#9CA3AF" />
                </View>
              )}
            </View>
          </View>
          {group.lastMessage ? (
            <Text className="text-sm text-gray-500 mt-1" numberOfLines={1}>
              <Text style={{ color: '#4A90E2', fontWeight: '600' }}>{group.lastMessage.user.name}:</Text> {group.lastMessage.text}
            </Text>
          ) : (
            <Text className="text-sm text-gray-400 italic mt-1">No messages yet</Text>
          )}
        </TouchableOpacity>
      );
    });
  };

  return (
    <SafeAreaView className='flex-1 bg-gray-50' edges={['top', 'left', 'right']}>
      <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200 bg-white">
        <TouchableOpacity onPress={() => router.push('/notifications')}>
          <Feather name="bell" size={26} color="#4A90E2" />
          {hasUnreadNotifications && (
            <View className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
          )}
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-900">Groups</Text>
        <TouchableOpacity onPress={() => router.push('/create-group')}>
          <Feather name="plus-circle" size={26} color="#4A90E2" />
        </TouchableOpacity>
      </View>
      <ScrollView className="px-4">
        {renderGroupList()}
      </ScrollView>

      {isGroupDetailVisible && selectedGroup && (
        <View className="absolute top-0 bottom-0 left-0 right-0 bg-white" style={{paddingTop:insets.top}}>
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200" onLayout={(e) => setChatHeaderHeight(e.nativeEvent.layout.height)}>
            <View className="flex-row items-center flex-1 truncate">
              <TouchableOpacity
                onPress={() => activeTab === 'Details' ? setActiveTab('Chat') : handleCloseGroupDetail()}
                className="mr-3 p-1"
              >
                <Feather name="arrow-left" size={24} color="#FF7A6E"/>
              </TouchableOpacity>
              <Text className="text-xl font-bold text-gray-900 flex-1" numberOfLines={1}>
                {groupDetails?.name || selectedGroup.name}
              </Text>
            </View>

            <View className="flex-row items-center">
              {activeTab === 'Chat' ? (
                <>
                  <TouchableOpacity
                    onPress={handleMutePress}
                    style={isCurrentlyMuted ? styles.unmuteButton : styles.muteButton}
                  >
                    <Text style={isCurrentlyMuted ? styles.unmuteButtonText : styles.muteButtonText}>
                      {isCurrentlyMuted ? "Unmute" : "Mute"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setActiveTab('Details')}
                    style={styles.detailsButton}
                  >
                    <Text style={styles.detailsButtonText}>Details</Text>
                  </TouchableOpacity>
                </>
              ) : (
                canManageGroup && (
                  <TouchableOpacity
                    onPress={handleSettingsPress}
                    style={styles.settingsButton}
                    activeOpacity={0.7}
                  >
                    <Feather name="settings" size={22} color="#374151" />
                  </TouchableOpacity>
                )
              )}
            </View>
          </View>

          {activeTab === 'Chat' ? (
            <View style={{ flex: 1 }}>
              {(isLoadingDetails || !groupDetails || !currentUser) ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#4A90E2" />
                </View>
              ) : (
                <GroupChat
                  group={groupDetails}
                  currentUser={stableUserRef.current || currentUser}
                  keyboardOffset={insets.top + chatHeaderHeight}
                />
              )}
            </View>
          ) : (
            <ScrollView className="flex-1 bg-gray-50" keyboardShouldPersistTaps="handled">
              <View className="p-6">
                {(isLoadingDetails || !groupDetails) ? (
                    <ActivityIndicator size="large" color="#4A90E2" className="my-8" />
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
                    onLeaveSuccess={handleCloseGroupDetail}
                  />
                )}
              </View>
            </ScrollView>
          )}
        </View>
      )}
    </SafeAreaView>
  );
};

export default GroupScreen;
