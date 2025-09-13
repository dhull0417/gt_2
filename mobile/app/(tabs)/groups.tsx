import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput, Keyboard, Alert, Platform } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CreateGroupPopup from '@/components/CreateGroupPopup';
import { useGetGroups } from '@/hooks/useGetGroups';
import { useAddMember } from '@/hooks/useAddMember';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useDeleteGroup } from '@/hooks/useDeleteGroup';
import { useLeaveGroup } from '@/hooks/useLeaveGroup';
import { useRemoveMember } from '@/hooks/useRemoveMember';
import { Group, Schedule, User, useApiClient, userApi } from '@/utils/api'; 
import { Feather } from '@expo/vector-icons';

const GroupScreen = () => {
    const [isCreateModalVisible, setCreateIsModalVisible] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [isGroupDetailVisible, setIsGroupDetailVisible] = useState(false);
    const [userIdToAdd, setUserIdToAdd] = useState('');

    const insets = useSafeAreaInsets();
    const api = useApiClient();
    const queryClient = useQueryClient();

    const { data: groups, isLoading: isLoadingGroups, isError: isErrorGroups } = useGetGroups();
    const { data: groupDetails, isLoading: isLoadingDetails, isError: isErrorDetails } = useGetGroupDetails(selectedGroup?._id || null);
    const { data: currentUser } = useQuery<User, Error>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
    
    const { mutate: addMember, isPending: isAddingMember } = useAddMember();
    const { mutate: deleteGroup, isPending: isDeletingGroup } = useDeleteGroup();
    const { mutate: leaveGroup, isPending: isLeavingGroup } = useLeaveGroup();
    const { mutate: removeMember, isPending: isRemovingMember } = useRemoveMember();

    const formatSchedule = (schedule: Schedule): string => {
        if (schedule.frequency === 'weekly') {
            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return `Weekly on ${daysOfWeek[schedule.day]}`;
        }
        const day = schedule.day;
        let suffix = 'th';
        if ([1, 21, 31].includes(day)) suffix = 'st';
        else if ([2, 22].includes(day)) suffix = 'nd';
        else if ([3, 23].includes(day)) suffix = 'rd';
        return `Monthly on the ${day}${suffix}`;
    };

    const handleAddMember = () => {
        if (!userIdToAdd.trim() || !selectedGroup) return;
        addMember({ groupId: selectedGroup._id, userId: userIdToAdd }, {
            onSuccess: () => {
                setUserIdToAdd('');
                Keyboard.dismiss();
                queryClient.invalidateQueries({ queryKey: ['groupDetails', selectedGroup._id] });
            }
        });
    };
    
    const handleDeleteGroup = () => {
        if (!selectedGroup) return;
        Alert.alert("Delete Group", `Are you sure you want to permanently delete "${selectedGroup.name}"?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => {
                deleteGroup({ groupId: selectedGroup._id }, {
                    onSuccess: () => handleCloseGroupDetail(),
                });
            }},
        ]);
    };

    const handleLeaveGroup = () => {
        if (!selectedGroup) return;
        Alert.alert("Leave Group", "Are you sure you want to leave this group?", [
            { text: "Cancel", style: "cancel" },
            { text: "Leave", style: "destructive", onPress: () => {
                leaveGroup({ groupId: selectedGroup._id }, {
                    onSuccess: () => handleCloseGroupDetail(),
                });
            }},
        ]);
    };

    const handleRemoveMember = (memberIdToRemove: string) => {
        if (!selectedGroup) return;
        Alert.alert("Remove Member", "Are you sure you want to remove this member from the group?", [
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
    };
    const handleCloseGroupDetail = () => {
        setIsGroupDetailVisible(false);
        setSelectedGroup(null);
        setUserIdToAdd('');
    };
    const handleOpenCreateModal = () => setCreateIsModalVisible(true);
    const handleCloseCreateModal = () => setCreateIsModalVisible(false);

    const renderGroupList = () => {
        if (isLoadingGroups || !currentUser) return <ActivityIndicator size="large" color="#4f46e5" className="mt-8"/>;
        if (isErrorGroups) return <Text className="text-center text-red-500 mt-4">Failed to load groups.</Text>;
        if (!groups || groups.length === 0) return <Text className="text-center text-gray-500 mt-4">You are not in any groups yet.</Text>;
        return groups.map((group) => (
            <TouchableOpacity key={group._id} className="bg-white p-5 my-2 rounded-lg shadow-sm border border-gray-200" onPress={() => handleOpenGroupDetail(group)}>
                <Text className="text-lg font-semibold text-gray-800">{group.name}</Text>
            </TouchableOpacity>
        ));
    };

    return (
        <SafeAreaView className='flex-1 bg-gray-50'>
            <View className="flex-row justify-center items-center px-4 py-3 border-b border-gray-200 bg-white relative">
                <Text className="text-xl font-bold text-gray-900">Groups</Text>
            </View>
            <ScrollView className="px-4">
                <View className="my-4">
                    <TouchableOpacity 
                        className={`py-4 rounded-lg items-center shadow ${!currentUser ? 'bg-indigo-300' : 'bg-indigo-600'}`} 
                        onPress={handleOpenCreateModal}
                        disabled={!currentUser}
                    >
                        <Text className="text-white text-lg font-bold">Create Group</Text>
                    </TouchableOpacity>
                </View>
                <View>{renderGroupList()}</View>
            </ScrollView>

            {isCreateModalVisible && (
                <View className="absolute top-0 bottom-0 left-0 right-0 bg-black/50 justify-center items-center">
                    <CreateGroupPopup onClose={handleCloseCreateModal} />
                </View>
            )}

            {isGroupDetailVisible && selectedGroup && (
                 <View className="absolute top-0 bottom-0 left-0 right-0 bg-white" style={{ paddingTop: insets.top }}>
                    <View className="flex-row items-center px-4 py-3 border-b border-gray-200">
                        <TouchableOpacity onPress={handleCloseGroupDetail} className="mr-4">
                            <Feather name="arrow-left" size={24} color="#4f46e5" />
                        </TouchableOpacity>
                        <Text className="text-xl font-bold text-gray-900">{selectedGroup.name}</Text>
                    </View>
                    <ScrollView className="flex-1 p-6 bg-gray-50" keyboardShouldPersistTaps="handled">
                        <View className="space-y-2 mb-8">
                            <Text className="text-lg text-gray-800 font-semibold">Group Details</Text>
                            <Text className="text-base text-gray-600">ID: {selectedGroup._id}</Text>
                            <Text className="text-base text-gray-600">Meeting Time: {selectedGroup.time}</Text>
                            {selectedGroup.schedule && (
                                <Text className="text-base text-gray-600">Recurring: {formatSchedule(selectedGroup.schedule)}</Text>
                            )}
                        </View>
                        <View className="mb-8">
                            <Text className="text-lg text-gray-800 font-semibold mb-2">Members</Text>
                            {isLoadingDetails ? <ActivityIndicator color="#4f46e5" /> : isErrorDetails ? <Text className="text-red-500">Could not load members.</Text> : 
                                (groupDetails?.members.map(member => {
                                    const isOwner = currentUser?._id === selectedGroup.owner;
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
                                }))
                            }
                        </View>
                        {currentUser && currentUser._id === selectedGroup.owner && (
                            <View className="mb-8">
                                <Text className="text-lg text-gray-800 font-semibold mb-2">Add New Member</Text>
                                <TextInput
                                    className="w-full p-4 border border-gray-300 rounded-lg bg-white text-base text-gray-800"
                                    placeholder="Enter User ID to add"
                                    placeholderTextColor="#999"
                                    value={userIdToAdd}
                                    onChangeText={setUserIdToAdd}
                                />
                                <TouchableOpacity
                                    onPress={handleAddMember}
                                    disabled={isAddingMember || !userIdToAdd.trim()}
                                    className={`py-4 mt-4 rounded-lg items-center shadow ${isAddingMember || !userIdToAdd.trim() ? 'bg-indigo-300' : 'bg-indigo-600'}`}
                                >
                                    {isAddingMember ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">Add Member</Text>}
                                </TouchableOpacity>
                            </View>
                        )}
                        <View className="mt-4 pt-4 border-t border-gray-300">
                            {currentUser && currentUser._id !== selectedGroup.owner && groupDetails?.members.some(m => m._id === currentUser._id) && (
                                <TouchableOpacity
                                    onPress={handleLeaveGroup}
                                    disabled={isLeavingGroup}
                                    className={`py-4 mb-4 rounded-lg items-center shadow ${isLeavingGroup ? 'bg-red-300' : 'bg-red-600'}`}
                                >
                                    {isLeavingGroup ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">Leave Group</Text>}
                                </TouchableOpacity>
                            )}
                            {currentUser && currentUser._id === selectedGroup.owner && (
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
                </View>
            )}
        </SafeAreaView>
    );
};

export default GroupScreen;