import { View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignOutButton from '@/components/SignOutButton';
import CreateGroupPopup from '@/components/CreateGroupPopup';
// --- IMPORT CHANGE IS HERE ---
import { useGetGroups } from '@/hooks/useGetGroups'; 
import { Group } from '@/utils/api'; // Import Group type from its source
import { Feather } from '@expo/vector-icons';

const GroupScreen = () => {
    // State for the "Create Group" popup
    const [isCreateModalVisible, setCreateIsModalVisible] = useState(false);

    // State for the group detail view
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [isGroupDetailVisible, setIsGroupDetailVisible] = useState(false);

    const { data: groups, isLoading, isError, error } = useGetGroups();

    if (error) {
        console.log("Error fetching groups:", JSON.stringify(error, null, 2));
    }

    const handleOpenCreateModal = () => {
        setCreateIsModalVisible(true);
    };

    const handleCloseCreateModal = () => {
        setCreateIsModalVisible(false);
    };

    const handleOpenGroupDetail = (group: Group) => {
        setSelectedGroup(group);
        setIsGroupDetailVisible(true);
    };

    const handleCloseGroupDetail = () => {
        setIsGroupDetailVisible(false);
        setSelectedGroup(null); // Clear the selected group
    };

    const renderGroupList = () => {
        if (isLoading) {
            return <ActivityIndicator size="large" color="#0000ff" className="mt-8"/>;
        }

        if (isError) {
            return <Text className="text-center text-red-500 mt-4">Failed to load groups.</Text>;
        }
        
        if (!groups || groups.length === 0) {
            return <Text className="text-center text-gray-500 mt-4">You are not in any groups yet.</Text>
        }

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
                        className="py-4 rounded-lg bg-blue-500 items-center shadow"
                        onPress={handleOpenCreateModal}
                    >
                        <Text className="text-white text-lg font-bold">
                            Create Group
                        </Text>
                    </TouchableOpacity>
                </View>

                <View>
                    {renderGroupList()}
                </View>
            </ScrollView>

            {/* Modal for Creating a Group */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isCreateModalVisible}
                onRequestClose={handleCloseCreateModal}
            >
                <View className="flex-1 justify-center items-center bg-black bg-opacity-50">
                    <CreateGroupPopup onClose={handleCloseCreateModal} />
                </View>
            </Modal>

            {/* Modal for the Group Detail View */}
            <SafeAreaView>
            <Modal
                visible={isGroupDetailVisible}
                animationType="slide"
                onRequestClose={handleCloseGroupDetail}
            >
                {selectedGroup && (
                    <SafeAreaView className="flex-1">
                        {/* Custom Header for the Group Detail */}
                        <View className="flex-row items-center px-4 py-3 border-b border-gray-200">
                            <TouchableOpacity onPress={handleCloseGroupDetail} className="mr-4">
                                <Feather name="arrow-left" size={24} color="#3b82f6" />
                            </TouchableOpacity>
                            <Text className="text-xl font-bold text-gray-900">{selectedGroup.name}</Text>
                        </View>

                        {/* Content for the individual group page */}
                        <View className="flex-1 p-4">
                            <Text className="text-lg text-gray-700">
                                Welcome to the {selectedGroup.name} group page!
                            </Text>
                            <Text className="mt-2 text-gray-500">
                                Group ID: {selectedGroup._id}
                            </Text>
                             <Text className="mt-2 text-gray-500">
                                Meeting Time: {selectedGroup.time}
                            </Text>
                            <Text className="mt-4 text-gray-600">
                                More specific information about this group will be displayed here soon.
                            </Text>
                        </View>
                    </SafeAreaView>
                )}
            </Modal>
            </SafeAreaView>
        </SafeAreaView>
    );
};

export default GroupScreen;