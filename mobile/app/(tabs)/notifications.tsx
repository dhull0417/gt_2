import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import React, { useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, Stack } from 'expo-router';
import { useGetNotifications } from '@/hooks/useGetNotifications';
import { useAcceptInvite } from '@/hooks/useAcceptInvite';
import { useDeclineInvite } from '@/hooks/useDeclineInvite';
import { Notification } from '@/utils/api';
import { Image } from 'react-native';

const NotificationItem = ({ item }: { item: Notification }) => {
    const { mutate: acceptInvite, isPending: isAccepting } = useAcceptInvite();
    const { mutate: declineInvite, isPending: isDeclining } = useDeclineInvite();
    const isPending = isAccepting || isDeclining;

    const renderContent = () => {
        switch(item.type) {
            case 'group-invite':
                return (
                    <>
                        <Text className="text-gray-800"><Text className="font-bold">{item.sender.firstName} {item.sender.lastName}</Text> invited you to join the group <Text className="font-bold">{item.group.name}</Text>.</Text>
                        {item.status === 'pending' && (
                            <View className="flex-row space-x-2 mt-2">
                                <TouchableOpacity onPress={() => acceptInvite(item._id)} disabled={isPending} className="bg-green-500 px-4 py-2 rounded-md">
                                    <Text className="text-white font-bold">Accept</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => declineInvite(item._id)} disabled={isPending} className="bg-red-500 px-4 py-2 rounded-md">
                                    <Text className="text-white font-bold">Decline</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {item.status === 'accepted' && <Text className="text-green-600 font-semibold mt-1">You accepted this invitation.</Text>}
                        {item.status === 'declined' && <Text className="text-red-600 font-semibold mt-1">You declined this invitation.</Text>}
                    </>
                );
            case 'invite-accepted':
                 return <Text className="text-gray-800"><Text className="font-bold">{item.sender.firstName} {item.sender.lastName}</Text> accepted your invitation to join <Text className="font-bold">{item.group.name}</Text>.</Text>;
            case 'invite-declined':
                return <Text className="text-gray-800"><Text className="font-bold">{item.sender.firstName} {item.sender.lastName}</Text> declined your invitation to join <Text className="font-bold">{item.group.name}</Text>.</Text>;
            default:
                return null;
        }
    };
    
    return (
        <View className="flex-row items-start p-4 bg-white border-b border-gray-200">
            <Image source={{ uri: item.sender.profilePicture }} className="w-10 h-10 rounded-full mr-4" />
            <View className="flex-1">
                {renderContent()}
            </View>
        </View>
    );
};


const NotificationsScreen = () => {
    const { data: notifications, isLoading, refetch } = useGetNotifications();

    useFocusEffect(useCallback(() => {
        refetch();
    }, [refetch]));

    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            <Stack.Screen options={{ headerTitle: "Notifications" }} />
            {isLoading ? (
                <ActivityIndicator size="large" className="mt-8" />
            ) : (
                <FlatList
                    data={notifications}
                    renderItem={({ item }) => <NotificationItem item={item} />}
                    keyExtractor={item => item._id}
                    ListEmptyComponent={<Text className="text-center text-gray-500 mt-8">You have no notifications.</Text>}
                />
            )}
        </SafeAreaView>
    );
};

export default NotificationsScreen;