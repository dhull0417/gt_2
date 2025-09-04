import { View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignOutButton from '@/components/SignOutButton';
import CreateGroupPopup from '@/components/CreateGroupPopup';
import { useGetGroups } from '@/hooks/useGetGroups'; 

const GroupScreen = () => {
    const [isModalVisible, setIsModalVisible] = useState(false);

    // 2. Use the hook to fetch data
    // We rename 'data' to 'groups' for better readability
    const { data: groups, isLoading, isError, error } = useGetGroups();

    // 2. Add a check for the error and log it
    if (error) {
        console.log("Error fetching groups:", JSON.stringify(error, null, 2));
    }
    const handleOpenModal = () => {
        setIsModalVisible(true);
    };

    const handleCloseModal = () => {
        setIsModalVisible(false);
    };

    // 3. Create a helper function to render the list content
    const renderGroupList = () => {
        if (isLoading) {
            return <ActivityIndicator size="large" color="#0000ff" className="mt-8"/>;
        }

        if (isError) {
            return <Text className="text-center text-red-500 mt-4">Failed to load</Text>;
        }
        
        if (!groups || groups.length === 0) {
            return <Text className="text-center text-gray-500 mt-4">You are not in any groups yet.</Text>
        }

        return groups.map((group) => (
            <TouchableOpacity
                key={group._id} // The unique key is essential for list rendering
                className="bg-white p-5 my-2 rounded-lg shadow-sm border border-gray-200"
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
                        onPress={handleOpenModal}
                    >
                        <Text className="text-white text-lg font-bold">
                            Create Group
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* 4. This is where the list will be rendered */}
                <View>
                    {renderGroupList()}
                </View>
            </ScrollView>

            <Modal
                animationType="slide"
                transparent={true}
                visible={isModalVisible}
                onRequestClose={handleCloseModal}
            >
                <View className="flex-1 justify-center items-center bg-black bg-opacity-50">
                    <CreateGroupPopup onClose={handleCloseModal} />
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default GroupScreen;