import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Keyboard,
  Alert,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Image,
} from 'react-native';
import React, { useState, useMemo } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useGetGroups } from '@/hooks/useGetGroups';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useRemoveMember } from '@/hooks/useRemoveMember';
import { User, useApiClient, userApi, groupApi } from '@/utils/api';
import { getDMDisplayName } from '@/utils/groupDisplay';
import { Feather } from '@expo/vector-icons';
import { useSearchUsers } from '@/hooks/useSearchUsers';
import { useInviteUser } from '@/hooks/useInviteUser';
import { GroupDetailsView } from '@/components/GroupDetailsView';
import { GroupAvatar } from '@/components/GroupAvatar';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { GroupCalendarButton } from '@/components/GroupCalendarButton';
import { TAB_BAR_HEIGHT } from '@/utils/layout';

const styles = StyleSheet.create({
  settingsButton: {
    padding: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
});

interface GroupDetailsScreenProps {
  // False when this screen is mounted outside the Groups tab (no native tab
  // bar sitting underneath it to clear) — see app/group-details/[id].tsx.
  showsTabBarBeneath?: boolean;
}

export const GroupDetailsScreen = ({ showsTabBarBeneath = true }: GroupDetailsScreenProps) => {
  const { id } = useLocalSearchParams<{ id: string }>();

  const insets = useSafeAreaInsets();
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Cached (or freshly fetched) list data gives an instant name/avatar/isDM fallback
  // while the heavier per-group details request below is still in flight.
  const { data: groups } = useGetGroups();
  const fallbackGroup = useMemo(() => groups?.find(g => g._id === id), [groups, id]);

  const { data: groupDetails, isLoading: isLoadingDetails, isError: isErrorDetails } = useGetGroupDetails(id ?? null);

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
      router.push({ pathname: '/group-chat/[id]', params: { id: group._id } });
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

  const handleOpenChat = () => {
    if (!id) return;
    router.push({ pathname: '/group-chat/[id]', params: { id } });
  };

  const headerName = groupDetails?.isDM
    ? getDMDisplayName(groupDetails as any, currentUser?.clerkId)
    : (groupDetails?.name || fallbackGroup?.name || '');

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: 'white' }}
      edges={showsTabBarBeneath ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}
    >
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200">
        <View className="flex-row items-center flex-1">
          {/* Always back to chat, regardless of how Details was entered (chat's own
              header button, or an in-app notification) — Details' only meaningful
              parent is the conversation, not whatever happens to be under it in the
              navigation stack. */}
          <TouchableOpacity onPress={handleOpenChat} className="mr-2 p-1">
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

          {canManageGroup && (
            <TouchableOpacity
              onPress={handleSettingsPress}
              style={styles.settingsButton}
              activeOpacity={0.7}
            >
              <Feather name="settings" size={22} color="#374151" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        className="flex-1 bg-gray-50"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: showsTabBarBeneath ? insets.bottom + TAB_BAR_HEIGHT : 0 }}
      >
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
              onLeaveSuccess={() => router.replace('/(tabs)/groups')}
              onMemberPress={groupDetails.isDM ? undefined : handleMemberPress}
            />
          )}
        </View>
      </ScrollView>

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

export default GroupDetailsScreen;
