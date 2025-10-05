import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import React, { useEffect } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';

const GroupChatScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { data: groupDetails, isLoading } = useGetGroupDetails(id);
    const navigation = useNavigation();
    const router = useRouter();

    // This effect runs when the group data is loaded to set the header
    useEffect(() => {
        if (groupDetails) {
            navigation.setOptions({ 
                // The header title is now a button
                headerTitle: () => (
                    <TouchableOpacity onPress={() => router.push({ pathname: '/group-details/[id]', params: { id: id } })}>
                        <View>
                            <Text className="text-lg font-bold text-center">{groupDetails.name}</Text>
                            {groupDetails.members && (
                                <Text className="text-sm text-gray-500 text-center">{groupDetails.members.length} members</Text>
                            )}
                        </View>
                    </TouchableOpacity>
                )
            });
        }
    }, [navigation, groupDetails, id, router]);


    if (isLoading) {
        return <ActivityIndicator size="large" className="mt-8" />;
    }

    return (
        <View className="flex-1 justify-center items-center bg-gray-100">
            <Text className="text-lg text-gray-500">Group Chat Coming Soon</Text>
        </View>
    );
};

export default GroupChatScreen;