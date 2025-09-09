import { View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Image, TextInput, Keyboard } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import SignOutButton from '@/components/SignOutButton';
import CreateGroupPopup from '@/components/CreateGroupPopup';
import { useGetGroups } from '@/hooks/useGetGroups';
import { useAddMember } from '@/hooks/useAddMember';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { Group, Schedule, User, useApiClient, userApi } from '@/utils/api'; 
import { Feather } from '@expo/vector-icons';

const GroupScreen = () => {
    const [isCreateModalVisible, setCreateIsModalVisible] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [isGroupDetailVisible, setIsGroupDetailVisible] = useState(false);
    const [userIdToAdd, setUserIdToAdd] = useState('');

    const api = useApiClient();
    const queryClient = useQueryClient();
    const { data: groups, isLoading: isLoadingGroups, isError: isErrorGroups, error: groupsError } = useGetGroups();
    
    const { data: groupDetails, isLoading: isLoadingDetails, isError: isErrorDetails } = useGetGroupDetails(selectedGroup?._id || null);
    
    const { mutate: addMember, isPending: isAddingMember } = useAddMember();
    
    const { data: currentUser } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });

    if (groupsError) console.log("Error fetching groups:", JSON.stringify(groupsError, null, 2));

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
    
    const handleOpenGroupDetail = (group: Group) => {
        console.log("--- Checking Ownership on Tap ---");
        console.log("Current User ID:", currentUser?._id);
        console.log("Group Owner ID: ", group.owner);
        console.log("-------------------------------");

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
        if (isLoadingGroups || !currentUser) {
            return <ActivityIndicator size="large" color="#4f46e5" className="mt-8"/>;
        }
        
        if (isErrorGroups) return <Text className="text-center text-red-500 mt-4">Failed to load groups.</Text>;
        if (!groups || groups.length === 0) return <Text className="text-center text-gray-500 mt-4">You are not in any groups yet.</Text>;

        return groups.map((group) => (
            <TouchableOpacity 
                key={group._id} 
                className="bg-white p-5 my-2 rounded-lg shadow-sm border border-gray-200" 
                onPress={() => handleOpenGroupDetail(group)}
            >
                <Text className="text-lg font-semibold text-gray-800">{group.name}</Text>
            </TouchableOpacity>
        ));
    };

    return (
        <SafeAreaView className='flex-1 bg-gray-50'>
            <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200 bg-white">
                <Text className="text-xl font-bold text-gray-900">Groups</Text>
                <SignOutButton />
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
            <Modal animationType="slide" transparent={true} visible={isCreateModalVisible} onRequestClose={handleCloseCreateModal}>
                <View className="flex-1 justify-center items-center bg-black bg-opacity-50">
                    <CreateGroupPopup onClose={handleCloseCreateModal} />
                </View>
            </Modal>

            <Modal visible={isGroupDetailVisible} animationType="slide" onRequestClose={handleCloseGroupDetail}>
                {selectedGroup && (
                    <SafeAreaView className="flex-1 bg-gray-50">
                        <View className="flex-row items-center px-4 py-3 border-b border-gray-200 bg-white">
                            <TouchableOpacity onPress={handleCloseGroupDetail} className="mr-4">
                                <Feather name="arrow-left" size={24} color="#4f46e5" />
                            </TouchableOpacity>
                            <Text className="text-xl font-bold text-gray-900">{selectedGroup.name}</Text>
                        </View>

                        <ScrollView className="flex-1 p-6" keyboardShouldPersistTaps="handled">
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
                                {isLoadingDetails ? (
                                    <ActivityIndicator color="#4f46e5" />
                                ) : isErrorDetails ? (
                                    <Text className="text-red-500">Could not load members.</Text>
                                ) : (
                                    groupDetails?.members.map(member => (
                                        <View key={member._id} className="flex-row items-center bg-white p-3 rounded-lg mb-2 shadow-sm">
                                            <Image 
                                                source={{ uri: member.profilePicture || 'https://placehold.co/100x100/EEE/31343C?text=?' }} 
                                                className="w-10 h-10 rounded-full mr-4"
                                            />
                                            <Text className="text-base text-gray-700">{member.firstName} {member.lastName}</Text>
                                        </View>
                                    ))
                                )}
                            </View>

                            {currentUser && currentUser._id === selectedGroup.owner && (
                                <View>
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
                                        {isAddingMember ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <Text className="text-white text-lg font-bold">Add Member</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}
                        </ScrollView>
                    </SafeAreaView>
                )}
            </Modal>
        </SafeAreaView>
    );
};

export default GroupScreen;
