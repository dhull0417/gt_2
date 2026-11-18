import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
  Modal,
  Pressable,
  Image,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { OfflineEmptyState } from '@/components/OfflineEmptyState';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { GroupMembersList } from '@/components/GroupMembersList';
import { ChatTimeoutSheet } from '@/components/ChatTimeoutSheet';
import { ToastPortal } from '@/contexts/ToastContext';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useRemoveMember } from '@/hooks/useRemoveMember';
import { useChatModeration } from '@/hooks/useChatModeration';
import { useRefreshOrToast } from '@/hooks/useRefreshOrToast';
import { User, useApiClient, userApi, groupApi } from '@/utils/api';
import { getUserDisplayName, getUserInitial } from '@/utils/groupDisplay';
import { isOfflineEmpty, requireOnline } from '@/utils/offlineState';
import { canTimeOut, formatTimeoutEnd, isTimeoutActive } from '@/utils/chatTimeout';

// Full member list for a group, opened from the Members tile on Group Details.
// Tap a member to DM them; owners/moderators can also time out or remove members here.
export default function GroupMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  const detailsQuery = useGetGroupDetails(id ?? null);
  const { data: groupDetails, isError, refetch } = detailsQuery;
  const offline = isOfflineEmpty(detailsQuery);

  const { data: currentUser } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
  });

  const { refreshing, refresh } = useRefreshOrToast([() => refetch()]);
  const { mutate: removeMember, isPending: isRemovingMember } = useRemoveMember();

  const [search, setSearch] = useState('');
  const [dmTargetMember, setDmTargetMember] = useState<User | null>(null);
  const [isCreatingDM, setIsCreatingDM] = useState(false);

  // Chat timeouts: owners/moderators can time a member out (or end it) from the member sheet.
  const moderation = useChatModeration(id ?? '');
  const [timeoutMember, setTimeoutMember] = useState<User | null>(null);
  const timeoutOf = (member: User | null) => {
    const t = member ? groupDetails?.chatTimeouts?.find((x) => x.userId === member._id) : undefined;
    return t && isTimeoutActive(t, Date.now()) ? t : null;
  };
  const dmTargetTimeout = timeoutOf(dmTargetMember);
  const canTimeOutDmTarget = !!dmTargetMember && canTimeOut(currentUser?._id, dmTargetMember._id, groupDetails as any);
  const openTimeoutSheet = () => {
    const member = dmTargetMember;
    if (!member || !requireOnline('time someone out')) return;
    setDmTargetMember(null);
    // Two React Native modals can't be open at once; let the member sheet finish closing first.
    setTimeout(() => setTimeoutMember(member), 350);
  };

  const handleSendDM = async () => {
    if (!dmTargetMember) return;
    setIsCreatingDM(true);
    try {
      const { group } = await groupApi.createOrGetDM(api, dmTargetMember._id);
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setDmTargetMember(null);
      router.push({ pathname: '/group-chat/[id]', params: { id: group._id } });
    } catch {
      Alert.alert('Error', 'Could not open DM. Please try again.');
    } finally {
      setIsCreatingDM(false);
    }
  };

  const handleRemoveMember = (memberIdToRemove: string) => {
    if (!id) return;
    if (!requireOnline('remove a member')) return;
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <PressableOpacity accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 4, marginRight: 8 }} hitSlop={8}>
          <Feather name="chevron-left" size={26} color="#FF7A6E" />
        </PressableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Members</Text>
      </View>

      <ScrollView
        style={{ backgroundColor: colors.backgroundAlt }}
        contentContainerStyle={{ flexGrow: 1, padding: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} colors={[colors.brand]} />}
      >
        {offline ? (
          <OfflineEmptyState message="Connect to the internet to load this group." onRetry={refresh} />
        ) : isError && !groupDetails ? (
          <View style={{ alignItems: 'center', marginTop: 48 }}>
            <Text style={{ color: colors.textMuted, fontSize: 16, textAlign: 'center', marginBottom: 16 }}>Couldn't load members.</Text>
            <PressableOpacity onPress={refresh} style={{ backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Try again</Text>
            </PressableOpacity>
          </View>
        ) : !groupDetails || !currentUser ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><LoadingAnimation /></View>
        ) : (
          <>
            {/* Invite bar, then search — both scroll with the list */}
            {!groupDetails.isDM && (
              <PressableOpacity
                onPress={() => router.push({ pathname: '/group-invite/[id]', params: { id: groupDetails._id } })}
                activeOpacity={0.75}
                style={[styles.inviteBar, { backgroundColor: colors.accentTeal }]}
              >
                <Feather name="user-plus" size={18} color="#fff" />
                <Text style={styles.inviteText}>Invite Members</Text>
              </PressableOpacity>
            )}
            <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="search" size={17} color={colors.textFaint} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search members"
                placeholderTextColor={colors.textFaint}
                style={[styles.searchInput, { color: colors.textPrimary }]}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="never"
              />
              {search.length > 0 && (
                <PressableOpacity accessibilityLabel="Clear search" onPress={() => setSearch('')} hitSlop={8}>
                  <Feather name="x-circle" size={17} color={colors.textFaint} />
                </PressableOpacity>
              )}
            </View>
            <GroupMembersList
              groupDetails={groupDetails}
              currentUser={currentUser}
              isRemovingMember={isRemovingMember}
              onRemoveMember={handleRemoveMember}
              onMemberPress={groupDetails.isDM ? undefined : setDmTargetMember}
              query={search}
            />
          </>
        )}
      </ScrollView>

      {/* DM bottom sheet */}
      <Modal
        visible={!!dmTargetMember}
        transparent
        animationType="slide"
        onRequestClose={() => setDmTargetMember(null)}
      >
        <Pressable style={dmStyles.backdrop} onPress={() => setDmTargetMember(null)}>
          <Pressable style={[dmStyles.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={[dmStyles.dragHandle, { backgroundColor: colors.borderStrong }]} />
            {dmTargetMember && (
              <>
                <Image
                  source={{ uri: dmTargetMember.profilePicture || `https://placehold.co/100x100/EEE/31343C/png?text=${getUserInitial(dmTargetMember)}` }}
                  style={[dmStyles.avatar, { backgroundColor: colors.backgroundAlt }]}
                />
                <Text style={[dmStyles.name, { color: colors.textPrimary }, canTimeOutDmTarget && dmTargetTimeout && { marginBottom: 6 }]}>
                  {getUserDisplayName(dmTargetMember)}
                </Text>
                {canTimeOutDmTarget && dmTargetTimeout && (
                  <Text style={[dmStyles.timeoutCaption, { color: colors.danger }]}>
                    Timed out · {formatTimeoutEnd(dmTargetTimeout.until, new Date())}
                  </Text>
                )}
                <PressableOpacity
                  style={[dmStyles.dmBtn, { backgroundColor: colors.brand }]}
                  onPress={handleSendDM}
                  disabled={isCreatingDM}
                  activeOpacity={0.8}
                >
                  {isCreatingDM
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={dmStyles.dmBtnText}>Send DM</Text>
                  }
                </PressableOpacity>
                {canTimeOutDmTarget && (
                  <PressableOpacity
                    style={[dmStyles.timeoutBtn, { backgroundColor: colors.backgroundAlt }]}
                    onPress={openTimeoutSheet}
                    disabled={moderation.busy}
                    activeOpacity={0.8}
                  >
                    <Feather name="clock" size={16} color={colors.danger} />
                    <Text style={[dmStyles.timeoutBtnText, { color: colors.danger }]}>Chat timeout</Text>
                  </PressableOpacity>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
        {/* A Modal covers the app-level toast ("You're offline..."); draw it in here instead. */}
        <ToastPortal />
      </Modal>

      <ChatTimeoutSheet
        visible={!!timeoutMember}
        name={timeoutMember ? (timeoutMember.firstName || getUserDisplayName(timeoutMember)) : ''}
        current={timeoutOf(timeoutMember)}
        onPick={(key) => { if (timeoutMember) moderation.timeOut(timeoutMember._id, key); setTimeoutMember(null); }}
        onEnd={() => { if (timeoutMember) moderation.endTimeout(timeoutMember._id); setTimeoutMember(null); }}
        onClose={() => setTimeoutMember(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontWeight: '900' },
  inviteBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, borderCurve: 'continuous', marginBottom: 12 },
  inviteText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
});

const dmStyles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, alignItems: 'center' },
  dragHandle: { width: 40, height: 4, borderRadius: 2, marginBottom: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 14 },
  name: { fontSize: 20, fontWeight: '800', marginBottom: 28 },
  dmBtn: { paddingHorizontal: 40, paddingVertical: 14, borderRadius: 16, minWidth: 160, alignItems: 'center' },
  dmBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  timeoutCaption: { fontSize: 13, fontWeight: '700', marginBottom: 22 },
  timeoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 16, minWidth: 160 },
  timeoutBtnText: { fontWeight: '700', fontSize: 15 },
});
