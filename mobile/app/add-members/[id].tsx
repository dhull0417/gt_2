import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Alert,
    FlatList,
    ActivityIndicator,
    Share
} from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useInviteUser } from '@/hooks/useInviteUser';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useContactMatching, ContactEntry } from '@/hooks/useContactMatching';
import { User, useApiClient, groupApi } from '@/utils/api';
import { useThemeColors, useAppearance } from '@/contexts/AppearanceContext';
import { buildInviteMessage } from '@/utils/inviteMessage';
import { toast } from '@/contexts/ToastContext';

const AddMembersScreen = () => {
    const { id: groupId } = useLocalSearchParams<{ id: string }>();
    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const isDark = scheme === 'dark';

    const api = useApiClient();
    const { data: groupDetails } = useGetGroupDetails(groupId);
    const { mutate: inviteUser, isPending: isInviting } = useInviteUser();
    const { contacts, isLoading: isLoadingContacts, permissionDenied } = useContactMatching();
    const { data: inviteLinkData } = useQuery({
        queryKey: ['inviteLink', groupId],
        queryFn: () => groupApi.generateInviteLink(api, groupId!),
        enabled: !!groupId,
        staleTime: 1000 * 60 * 5,
    });

    // People invited during this visit, so the button flips to "Invited" instead of inviting twice.
    const [invitedIds, setInvitedIds] = useState<string[]>([]);

    const handleInvite = (userToInvite: User) => {
        if (!groupId) return;

        if (groupDetails?.members.some(m => m._id === userToInvite._id)) {
            Alert.alert("Already a Member", `${userToInvite.firstName} is already in this group.`);
            return;
        }

        inviteUser({ groupId, userIdToInvite: userToInvite._id }, {
            onSuccess: (data) => {
                setInvitedIds((ids) => [...ids, userToInvite._id]);
                toast.success(data.message);
            },
        });
    };

    const inviteLink = inviteLinkData?.link;

    const handleSmsInvite = async (contact: ContactEntry) => {
        if (!groupDetails || !inviteLink) return;
        try {
            await Share.share({
                message: buildInviteMessage({ groupName: groupDetails.name, link: inviteLink, recipientFirstName: contact.name.split(' ')[0] }),
            });
        } catch (error) {
            console.error("Share error:", error);
        }
    };

    const handleShareInvite = async () => {
        if (!groupDetails || !inviteLink) return;
        try {
            await Share.share({
                message: buildInviteMessage({ groupName: groupDetails.name, link: inviteLink }),
            });
        } catch (error) {
            console.error("Share error:", error);
        }
    };

    const renderContact = ({ item }: { item: ContactEntry }) => {
        const isOnApp = !!item.appUser;
        const isMember = !!item.appUser && !!groupDetails?.members.some((m) => m._id === item.appUser!._id);
        const isInvited = !!item.appUser && invitedIds.includes(item.appUser._id);
        return (
            <View style={[styles.resultRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <View style={styles.resultInfo}>
                    <Text style={[styles.resultName, { color: colors.textSecondary }]}>{item.name}</Text>
                    <Text style={[styles.contactStatus, { color: isOnApp ? colors.success : colors.textFaint }]}>
                        {isMember ? 'Already in this group' : isOnApp ? 'On GroupThat' : 'Invite to GroupThat'}
                    </Text>
                </View>
                {isMember ? (
                    <Feather name="check" size={18} color={colors.success} />
                ) : isOnApp ? (
                    <PressableOpacity
                        style={[styles.inviteButton, { backgroundColor: isDark ? '#1A2A42' : '#EEF2FF' }, isInvited && { opacity: 0.6 }]}
                        onPress={() => handleInvite(item.appUser!)}
                        disabled={isInviting || isInvited}
                    >
                        <Text style={[styles.inviteButtonText, { color: colors.brand }]}>{isInvited ? 'Invited' : 'Invite'}</Text>
                    </PressableOpacity>
                ) : (
                    <PressableOpacity
                        style={[styles.smsButton, { backgroundColor: colors.backgroundAlt }]}
                        onPress={() => handleSmsInvite(item)}
                    >
                        <Feather name="send" size={14} color={colors.textMuted} />
                        <Text style={[styles.smsButtonText, { color: colors.textMuted }]}>SMS</Text>
                    </PressableOpacity>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom', 'left', 'right']}>
            <PressableOpacity
                style={[
                    styles.shareLinkBtn,
                    { backgroundColor: isDark ? '#1A2A42' : '#F5F7FF', borderColor: colors.brand },
                    !inviteLink && { backgroundColor: colors.backgroundAlt, borderColor: colors.borderStrong },
                ]}
                onPress={handleShareInvite}
                disabled={!inviteLink}
            >
                <Feather name="share-2" size={20} color={inviteLink ? colors.brand : colors.textFaint} />
                <Text style={[styles.shareLinkText, { color: inviteLink ? colors.brand : colors.textFaint }]}>Share Invite Link</Text>
            </PressableOpacity>

            <View style={{ flex: 1, marginTop: 16 }}>
                {isLoadingContacts ? (
                    <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: 20 }} />
                ) : permissionDenied ? (
                    <View style={{ alignItems: 'center' }}>
                        <Text style={[styles.emptyText, { color: colors.textMuted }]}>Allow contacts access to see which of your friends are already on GroupThat. You can still share the invite link above.</Text>
                        <PressableOpacity onPress={() => Linking.openSettings()} style={[styles.inviteButton, { marginTop: 16, backgroundColor: isDark ? '#1A2A42' : '#EEF2FF' }]}>
                            <Text style={[styles.inviteButtonText, { color: colors.brand }]}>Open Settings</Text>
                        </PressableOpacity>
                    </View>
                ) : (
                    <FlatList
                        data={contacts}
                        keyExtractor={item => item.id}
                        renderItem={renderContact}
                        ListEmptyComponent={
                            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No contacts found.</Text>
                        }
                    />
                )}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB', padding: 24 },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: 'white', borderRadius: 12, marginBottom: 8 },
    resultInfo: { flex: 1, marginRight: 12 },
    resultName: { fontSize: 16, fontWeight: '600', color: '#374151' },
    contactStatus: { fontSize: 12, marginTop: 2 },
    statusOnApp: { color: '#22C55E' },
    statusNotOnApp: { color: '#9CA3AF' },
    inviteButton: { backgroundColor: '#EEF2FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
    inviteButtonText: { color: '#4A90E2', fontWeight: 'bold' },
    smsButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    smsButtonText: { color: '#6B7280', fontWeight: '600', fontSize: 13 },
    emptyText: { textAlign: 'center', marginTop: 32, color: '#6B7280', fontSize: 16 },
    shareLinkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#F5F7FF', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#4A90E2' },
    shareLinkBtnDisabled: { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' },
    shareLinkText: { color: '#4A90E2', fontWeight: '700', fontSize: 16, marginLeft: 10 },
    shareLinkTextDisabled: { color: '#9CA3AF' },
});

export default AddMembersScreen;
