// mobile/screens/GroupScreen.tsx

import { View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignOutButton from '@/components/SignOutButton';
import { useGetGroups, Group } from '@/hooks/useGetGroups';
import { Feather } from '@expo/vector-icons';

// Import the new screen component
import CreateGroupScreen from '@/components/CreateGroupScreen'; 

// Helper function to format recurrence rules into readable strings
const formatRecurrence = (group: Group): string => {
    const { recurrence, eventStartDate } = group;
    const startDate = new Date(eventStartDate); // Ensure it's a Date object
    if (recurrence.frequency === 'weekly') {
        const weekday = startDate.toLocaleDateString('en-US', { weekday: 'long' });
        return `Repeats weekly on ${weekday}s`;
    }
    if (recurrence.frequency === 'monthly' && recurrence.daysOfMonth) {
        // Simple case for one day
        if(recurrence.daysOfMonth.length === 1) {
            return `Repeats monthly on day ${recurrence.daysOfMonth[0]}`;
        }
        return `Repeats monthly on multiple days`;
    }
    return 'Recurring event';
};

const GroupScreen = () => {
    // State is now for the full-screen modal
    const [isCreateScreenVisible, setCreateScreenVisible] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

    const { data: groups, isLoading, isError } = useGetGroups();
    
    // Handlers for the detail modal
    const handleOpenGroupDetail = (group: Group) => setSelectedGroup(group);
    const handleCloseGroupDetail = () => setSelectedGroup(null);

    const renderGroupList = () => {
        if (isLoading) return <ActivityIndicator size="large" color="#0000ff" className="mt-8"/>;
        if (isError) return <Text className="text-center text-red-500 mt-4">Failed to load groups.</Text>;
        if (!groups || groups.length === 0) return <Text className="text-center text-gray-500 mt-4">No groups yet. Create one!</Text>;

        return groups.map((group) => (
            <TouchableOpacity
                key={group._id}
                className="bg-white p-5 my-2 rounded-lg shadow-sm border border-gray-200"
                onPress={() => handleOpenGroupDetail(group)}
            >
                <Text className="text-xl font-semibold text-gray-800">{group.name}</Text>
                {/* Display the formatted recurrence rule */}
                <Text className="text-sm text-gray-500 mt-1">{formatRecurrence(group)}</Text>
            </TouchableOpacity>
        ));
    };

    return (
        <SafeAreaView className='flex-1 bg-gray-50'>
            {/* Header */}
            <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200 bg-white">
                <Text className="text-xl font-bold text-gray-900">Groups</Text>
                <SignOutButton />
            </View>

            <ScrollView className="px-4">
                {/* Create Group Button */}
                <View className="my-4">
                    <TouchableOpacity
                        className="py-4 rounded-lg bg-blue-500 items-center shadow"
                        onPress={() => setCreateScreenVisible(true)}
                    >
                        <Text className="text-white text-lg font-bold">Create Group</Text>
                    </TouchableOpacity>
                </View>
                {/* Group List */}
                <View>{renderGroupList()}</View>
            </ScrollView>

            {/* Modal for Creating a Group (NOW FULL SCREEN) */}
            <Modal
                visible={isCreateScreenVisible}
                animationType="slide"
                onRequestClose={() => setCreateScreenVisible(false)}
            >
                <CreateGroupScreen onClose={() => setCreateScreenVisible(false)} />
            </Modal>

            {/* Modal for Viewing Group Details */}
            <Modal
                visible={!!selectedGroup}
                animationType="slide"
                onRequestClose={handleCloseGroupDetail}
            >
                {selectedGroup && (
                    <SafeAreaView className="flex-1">
                        <View className="flex-row items-center px-4 py-3 border-b border-gray-200">
                            <TouchableOpacity onPress={handleCloseGroupDetail} className="mr-4">
                                <Feather name="arrow-left" size={24} color="#3b82f6" />
                            </TouchableOpacity>
                            <Text className="text-xl font-bold text-gray-900">{selectedGroup.name}</Text>
                        </View>
                        <View className="flex-1 p-4">
                            <Text className="text-lg font-semibold text-gray-700">Event Schedule</Text>
                            {/* Display formatted recurrence in the detail view */}
                            <Text className="mt-1 text-gray-600 text-base">{formatRecurrence(selectedGroup)}</Text>
                        </View>
                    </SafeAreaView>
                )}
            </Modal>
        </SafeAreaView>
    );
};

export default GroupScreen;