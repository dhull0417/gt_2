import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput, Keyboard, Alert } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useAddMember } from '@/hooks/useAddMember';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useDeleteGroup } from '@/hooks/useDeleteGroup';
import { useLeaveGroup } from '@/hooks/useLeaveGroup';
import { useRemoveMember } from '@/hooks/useRemoveMember';
import { Group, Schedule, User, useApiClient, userApi } from '@/utils/api'; 
import { Feather } from '@expo/vector-icons';
import { useSearchUsers } from '@/hooks/useSearchUsers';
import { useInviteUser } from '@/hooks/useInviteUser';

const GroupDetailScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const [userIdToAdd, setUserIdToAdd] = useState('');
    const api = useApiClient();
    const queryClient = useQueryClient();
    
    const { data: groupDetails, isLoading: isLoadingDetails, isError: isErrorDetails } = useGetGroupDetails(id);
    const { data: currentUser } = useQuery<User, Error>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
    
    const { mutate: addMember, isPending: isAddingMember } = useAddMember();
    const { mutate: deleteGroup, isPending: isDeletingGroup } = useDeleteGroup();
    const { mutate: leaveGroup, isPending: isLeavingGroup } = useLeaveGroup();
    const { mutate: removeMember, isPending: isRemovingMember } = useRemoveMember();
    
    const [searchQuery, setSearchQuery] = useState('');
    const { data: searchResults } = useSearchUsers(searchQuery);
    const { mutate: inviteUser, isPending: isInviting } = useInviteUser();
    
    const formatSchedule = (schedule: Schedule): string => {
        if (schedule.frequency === 'weekly') {
            const daysOfWeek = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
            const selectedDays = schedule.days.map(dayIndex => daysOfWeek[dayIndex]).join(', ');
            return `Weekly on ${selectedDays}`;
        }
        const day = schedule.days[0];
        let suffix = 'th';
        if ([1, 21, 31].includes(day)) suffix = 'st';
        else if ([2, 22].includes(day)) suffix = 'nd';
        else if ([3, 23].includes(day)) suffix = 'rd';
        return `Monthly on the ${day}${suffix}`;
    };

    const handleAddMember = () => {
        if (!userIdToAdd.trim() || !id) return;
        addMember({ groupId: id, userId: userIdToAdd }, {
            onSuccess: () => {
                setUserIdToAdd('');
                Keyboard.dismiss();
                queryClient.invalidateQueries({ queryKey: ['groupDetails', id] });
            }
        });
    };

    const handleDeleteGroup = () => {
        if (!id || !groupDetails) return;
        Alert.alert("Delete Group", `Are you sure you want to permanently delete "${groupDetails.name}"?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => {
                deleteGroup({ groupId: id }, {
                    onSuccess: () => router.replace('/(tabs)/groups'),
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
                    onSuccess: () => router.replace('/(tabs)/groups'),
                });
            }},
        ]);
    };

    const handleRemoveMember = (memberIdToRemove: string) => {
        if (!id) return;
        Alert.alert("Remove Member", "Are you sure you want to remove this member from the group?", [
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
    
    const handleInvite = (userIdToInvite: string) => {
        if (!id) return;
        inviteUser({ groupId: id, userIdToInvite });
    };

    if (isLoadingDetails || !groupDetails) {
        return <ActivityIndicator size="large" className="mt-8" />;
    }

    return (
        <SafeAreaView className='flex-1 bg-gray-50'>
            <ScrollView className="flex-1 p-6" keyboardShouldPersistTaps="handled">
                <View className="flex-row justify-between items-center mb-8">
                    <Text className="text-lg text-gray-800 font-semibold">Group Details</Text>
                    {currentUser && currentUser._id === groupDetails.owner && (
                        <Link href={{ pathname: `/group-edit/[id]`, params: { id } }} asChild>
                            <TouchableOpacity className="flex-row items-center bg-gray-200 px-3 py-1 rounded-full">
                                <Feather name="edit-2" size={14} color="#4B5563" />
                                <Text className="text-gray-700 font-semibold ml-2">Edit</Text>
                            </TouchableOpacity>
                        </Link>
                    )}
                </View>
                <View className="space-y-2 mb-8">
                    <Text className="text-base text-gray-600">ID: {groupDetails._id}</Text>
                    <Text className="text-base text-gray-600">Meeting Time: {groupDetails.time}</Text>
                    {groupDetails.schedule && (
                        <Text className="text-base text-gray-600">Recurring: {formatSchedule(groupDetails.schedule)}</Text>
                    )}
                </View>
                <View className="mb-8">
                    <Text className="text-lg text-gray-800 font-semibold mb-2">Members</Text>
                    {groupDetails?.members.map(member => {
                        const isOwner = currentUser?._id === groupDetails.owner;
                        const isSelf = currentUser?._id === member._id;
                        const canRemove = isOwner && !isSelf;
                        return (
                            <View key={member._id} className="flex-row items-center justify-between bg-white p-3 rounded-lg mb-2 shadow-sm">
                                <View className="flex-row items-center flex-1">
                                    <Image source={{ uri: member.profilePicture || 'https://placehold.co/100x100/EEE/31343C?text=?' }} className="w-10 h-10 rounded-full mr-4" />
                                    <Text className="text-base text-gray-700 flex-1">{member.firstName} {member.lastName}</Text>
                                </View>
                                {canRemove && (
                                    <TouchableOpacity onPress={() => handleRemoveMember(member._id)} disabled={isRemovingMember} className="p-2">
                                        <Feather name="x-circle" size={24} color="#ef4444" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        )
                    })}
                </View>
                {currentUser && currentUser._id === groupDetails.owner && (
                    <View className="mb-8">
                        <Text className="text-lg text-gray-800 font-semibold mb-2">Invite by Username</Text>
                        <TextInput
                            className="w-full p-4 border border-gray-300 rounded-lg bg-white text-base"
                            placeholder="Search for a user..."
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoCapitalize="none"
                        />
                        {searchResults && searchResults.length > 0 && (
                            <View className="mt-2 bg-white border border-gray-200 rounded-lg">
                                {searchResults.map(user => (
                                    <View key={user._id} className="flex-row items-center justify-between p-2 border-b border-gray-100">
                                        <View className="flex-row items-center">
                                            <Image source={{ uri: user.profilePicture }} className="w-8 h-8 rounded-full mr-2" />
                                            <Text>{user.firstName} {user.lastName} (@{user.username})</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => handleInvite(user._id)} disabled={isInviting} className="bg-indigo-500 px-3 py-1 rounded-md">
                                            <Text className="text-white font-bold">Invite</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )}
                 <View className="mt-4 pt-4 border-t border-gray-300">
                    {currentUser && currentUser._id === groupDetails.owner && (
                        <Link href={{ pathname: `/schedule-event/[group-id]`, params: { "group-id": id } }} asChild>
                            <TouchableOpacity className="py-4 mb-4 rounded-lg items-center shadow bg-blue-500">
                                <Text className="text-white text-lg font-bold">Schedule One-Off Event</Text>
                            </TouchableOpacity>
                        </Link>
                    )}
                    {currentUser && currentUser._id !== groupDetails.owner && groupDetails?.members.some(m => m._id === currentUser._id) && (
                        <TouchableOpacity
                            onPress={handleLeaveGroup}
                            disabled={isLeavingGroup}
                            className={`py-4 mb-4 rounded-lg items-center shadow ${isLeavingGroup ? 'bg-red-300' : 'bg-red-600'}`}
                        >
                            {isLeavingGroup ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">Leave Group</Text>}
                        </TouchableOpacity>
                    )}
                    {currentUser && currentUser._id === groupDetails.owner && (
                        <TouchableOpacity
                            onPress={handleDeleteGroup}
                            disabled={isDeletingGroup}
                            className={`py-4 rounded-lg items-center shadow ${isDeletingGroup ? 'bg-red-300' : 'bg-red-600'}`}
                        >
                            {isDeletingGroup ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">Delete Group</Text>}
                        </TouchableOpacity>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};
export default GroupDetailScreen;