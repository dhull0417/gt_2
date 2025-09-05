// mobile/app/(tabs)/groups.tsx

import { View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignOutButton from '@/components/SignOutButton';
import { useGetGroups, Group } from '@/hooks/useGetGroups';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// Helper function to format recurrence rules into readable strings
const formatRecurrence = (group: Group): string => {
    if (!group.recurrence) {
        return 'Schedule not set';
    }
    const { recurrence, eventStartDate } = group;
    const startDate = new Date(eventStartDate);
    if (recurrence.frequency === 'weekly') {
        const weekday = startDate.toLocaleDateString('en-US', { weekday: 'long' });
        return `Repeats weekly on ${weekday}s`;
    }
    if (recurrence.frequency === 'monthly' && recurrence.daysOfMonth) {
        if(recurrence.daysOfMonth.length === 1) {
            return `Repeats monthly on day ${recurrence.daysOfMonth[0]}`;
        }
        return `Repeats monthly on multiple days`;
    }
    return 'Recurring event';
};

const GroupScreen = () => {
    const router = useRouter();
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const { data: groups, isLoading, isError } = useGetGroups();
    
    const handleOpenGroupDetail = (group: Group) => setSelectedGroup(group);
    const handleCloseGroupDetail = () => setSelectedGroup(null);

    const renderGroupList = () => {
        if (isLoading) return <ActivityIndicator size="large" color="#0000ff" className="mt-8"/>;
        if (isError) return <Text className="text-center text-red-500 mt-4">Failed to load groups.</Text>;
        if (!groups || groups.length === 0) return <Text className="text-center text-gray-500 mt-4">No groups yet. Create one!</Text>;

        // Ensure this .map() uses parentheses for an implicit return
        return groups.map((group) => (
            <TouchableOpacity
                key={group._id}
                className="bg-white p-5 my-2 rounded-lg shadow-sm border border-gray-200"
                onPress={() => handleOpenGroupDetail(group)}
            >
                <Text className="text-xl font-semibold text-gray-800">{group.name}</Text>
                <Text className="text-sm text-gray-500 mt-1">{formatRecurrence(group)}</Text>
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
                        onPress={() => router.push('/create-group')}
                    >
                        <Text className="text-white text-lg font-bold">Create Group</Text>
                    </TouchableOpacity>
                </View>
                <View>{renderGroupList()}</View>
            </ScrollView>

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
                            <Text className="mt-1 text-gray-600 text-base">{formatRecurrence(selectedGroup)}</Text>
                        </View>
                    </SafeAreaView>
                )}
            </Modal>
        </SafeAreaView>
    );
};

export default GroupScreen;