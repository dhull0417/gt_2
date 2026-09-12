import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
    FlatList,
    ActivityIndicator,
    Share
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useInviteUser } from '@/hooks/useInviteUser';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useContactMatching, ContactEntry } from '@/hooks/useContactMatching';
import { User, useApiClient, groupApi } from '@/utils/api';

const AddMembersScreen = () => {
    const { id: groupId } = useLocalSearchParams<{ id: string }>();

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

    const handleInvite = (userToInvite: User) => {
        if (!groupId) return;

        if (groupDetails?.members.some(m => m._id === userToInvite._id)) {
            Alert.alert("Already a Member", `${userToInvite.firstName} is already in this group.`);
            return;
        }

        inviteUser({ groupId, userIdToInvite: userToInvite._id }, {
            onSuccess: (data) => {
                Alert.alert("Success", data.message);
            },
        });
    };

    const inviteLink = inviteLinkData?.link;

    const handleSmsInvite = async (contact: ContactEntry) => {
        if (!groupDetails || !inviteLink) return;
        try {
            await Share.share({
                message: `Hey ${contact.name.split(' ')[0]}! Join my group "${groupDetails.name}" on GroupThat!\n\nOpen this link to join: ${inviteLink}`,
            });
        } catch (error) {
            console.error("Share error:", error);
        }
    };

    const handleShareInvite = async () => {
        if (!groupDetails || !inviteLink) return;
        try {
            await Share.share({
                message: `Join my group "${groupDetails.name}" on GroupThat!\n\nOpen this link to join: ${inviteLink}`,
            });
        } catch (error) {
            console.error("Share error:", error);
        }
    };

    const renderContact = ({ item }: { item: ContactEntry }) => {
        const isOnApp = !!item.appUser;
        return (
            <View style={styles.resultRow}>
                <View style={styles.resultInfo}>
                    <Text style={styles.resultName}>{item.name}</Text>
                    <Text style={[styles.contactStatus, isOnApp ? styles.statusOnApp : styles.statusNotOnApp]}>
                        {isOnApp ? 'On GroupThat' : 'Invite to GroupThat'}
                    </Text>
                </View>
                {isOnApp ? (
                    <TouchableOpacity
                        style={styles.inviteButton}
                        onPress={() => handleInvite(item.appUser!)}
                        disabled={isInviting}
                    >
                        <Text style={styles.inviteButtonText}>Invite</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={styles.smsButton}
                        onPress={() => handleSmsInvite(item)}
                    >
                        <Feather name="send" size={14} color="#6B7280" />
                        <Text style={styles.smsButtonText}>SMS</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <TouchableOpacity style={[styles.shareLinkBtn, !inviteLink && styles.shareLinkBtnDisabled]} onPress={handleShareInvite} disabled={!inviteLink}>
                <Feather name="share-2" size={20} color={inviteLink ? "#4A90E2" : "#9CA3AF"} />
                <Text style={[styles.shareLinkText, !inviteLink && styles.shareLinkTextDisabled]}>Share Invite Link</Text>
            </TouchableOpacity>

            <View style={{ flex: 1, marginTop: 16 }}>
                {isLoadingContacts ? (
                    <ActivityIndicator size="small" color="#4A90E2" style={{ marginTop: 20 }} />
                ) : permissionDenied ? (
                    <Text style={styles.emptyText}>Enable contacts permission to see friends on GroupThat.</Text>
                ) : (
                    <FlatList
                        data={contacts}
                        keyExtractor={item => item.id}
                        renderItem={renderContact}
                        ListEmptyComponent={
                            <Text style={styles.emptyText}>No contacts found.</Text>
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
