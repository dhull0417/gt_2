import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Keyboard } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useApiClient, User, userApi } from '@/utils/api';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useDeleteGroup } from '@/hooks/useDeleteGroup';
import { useLeaveGroup } from '@/hooks/useLeaveGroup';
import { useRemoveMember } from '@/hooks/useRemoveMember';
import { useSearchUsers } from '@/hooks/useSearchUsers';
import { useInviteUser } from '@/hooks/useInviteUser';
import { GroupDetailsView } from '@/components/GroupDetailsView';

const GroupDetailScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const api = useApiClient();
    const queryClient = useQueryClient();

    const [searchQuery, setSearchQuery] = useState('');

    const { data: group, isLoading: loadingGroup } = useGetGroupDetails(id);
    const { data: currentUser } = useQuery<User, Error>({ 
        queryKey: ['currentUser'], 
        queryFn: () => userApi.getCurrentUser(api) 
    });

    const { mutate: deleteGroup, isPending: isDeletingGroup } = useDeleteGroup();
    const { mutate: leaveGroup, isPending: isLeavingGroup } = useLeaveGroup();
    const { mutate: removeMember, isPending: isRemovingMember } = useRemoveMember();
    const { mutate: inviteUser, isPending: isInviting } = useInviteUser();
    const { data: searchResults } = useSearchUsers(searchQuery);

    const handleDeleteGroup = () => {
        if (!id || !group) return;
        Alert.alert("Delete Group", `Are you sure you want to permanently delete "${group.name}"?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => {
                deleteGroup({ groupId: id }, { 
                    onSuccess: () => router.replace('/(tabs)/groups') 
                });
            }},
        ]);
    };

    const handleLeaveGroup = () => {
        if (!id) return;
        Alert.alert("Leave Group", "Are you sure you want to leave this group?", [
            { text: "Cancel", style: "cancel" },
            { text: "Leave", style: "destructive", onPress: () => {
                leaveGroup({ groupId: id }, { 
                    onSuccess: () => router.replace('/(tabs)/groups') 
                });
            }},
        ]);
    };

    const handleRemoveMember = (memberIdToRemove: string) => {
        if (!id) return;
        Alert.alert("Remove Member", "Remove this member from the group?", [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: () => {
                removeMember({ groupId: id, memberIdToRemove }, {
                    onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: ['groupDetails', id] });
                    },
                });
            }},
        ]);
    };

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

    const handleEditSchedule = () => {
        if (!id) return;
        router.push(`/group-edit-schedule/${id}`);
    };

    const handleAddOneOffEvent = () => {
        if (!id) return;
        router.push({
            pathname: '/create-group',
            params: { existingGroupId: id, initialType: 'event' }
        });
    };

    if (loadingGroup || !group || !currentUser) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#4F46E5" />
            </View>
        );
    }

    // Permission logic: Owner or Moderator
    const isMod = group.moderators?.some((m: any) => 
        typeof m === 'string' ? m === currentUser._id : m._id === currentUser._id
    ) ?? false;
    const canManage = currentUser._id === group.owner || isMod;

    return (
        <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom', 'left', 'right']}>
            <View className="flex-row items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
                <View className="flex-1">
                    <Text className="text-2xl font-bold text-gray-900" numberOfLines={1}>{group.name}</Text>
                </View>
                {/* FIXED: Allow moderators to access settings as well */}
                {canManage && (
                    <TouchableOpacity 
                        onPress={handleEditSchedule}
                        className="bg-indigo-50 p-2 rounded-full ml-4"
                        activeOpacity={0.7}
                    >
                        <Feather name="settings" size={20} color="#4F46E5" />
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
                <View className="p-6">
                    <GroupDetailsView 
                        groupDetails={group}
                        currentUser={currentUser}
                        isRemovingMember={isRemovingMember}
                        onRemoveMember={handleRemoveMember}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        searchResults={searchResults}
                        onInvite={handleInvite}
                        isInviting={isInviting}
                        onDeleteGroup={handleDeleteGroup}
                        isDeletingGroup={isDeletingGroup}
                        onLeaveGroup={handleLeaveGroup}
                        isLeavingGroup={isLeavingGroup}
                        onEditSchedule={handleEditSchedule}
                        onAddOneOffEvent={handleAddOneOffEvent}
                    />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default GroupDetailScreen;