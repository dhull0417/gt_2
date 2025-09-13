import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { User, useApiClient, userApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@clerk/clerk-expo'; // 1. Import useAuth

const ProfileScreen = () => {
    const api = useApiClient();
    const { signOut } = useAuth(); // 2. Get the signOut function

    const { data: currentUser, isLoading, isError } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });

    const handleCopyId = async () => {
        if (currentUser?._id) {
            await Clipboard.setStringAsync(currentUser._id);
            Alert.alert("Copied!", "Your User ID has been copied to the clipboard.");
        }
    };

    const renderProfile = () => {
        if (isLoading) {
            return <ActivityIndicator size="large" color="#4f46e5" className="mt-16" />;
        }

        if (isError || !currentUser) {
            return <Text className="text-center text-red-500 mt-8">Failed to load profile.</Text>;
        }

        return (
            <View className="items-center p-6">
                <Image
                    source={{ uri: currentUser.profilePicture || 'https://placehold.co/200x200/EEE/31343C?text=?' }}
                    className="w-32 h-32 rounded-full border-4 border-white shadow-lg"
                />
                
                <Text className="text-3xl font-bold text-gray-800 mt-4">
                    {currentUser.firstName} {currentUser.lastName}
                </Text>
                
                <Text className="text-lg text-gray-500 mb-8">
                    {currentUser.email}
                </Text>
                
                <View className="w-full bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                    <Text className="text-sm text-gray-500 mb-1">Your Unique User ID</Text>
                    <View className="flex-row justify-between items-center">
                        <Text className="text-base text-gray-800 font-mono" selectable>{currentUser._id}</Text>
                        <TouchableOpacity onPress={handleCopyId} className="p-2 bg-gray-100 rounded-md">
                            <Feather name="copy" size={20} color="#4f46e5" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* --- 3. ADDED: New Sign Out button --- */}
                <View className="w-full mt-8">
                    <TouchableOpacity
                        onPress={() => signOut()}
                        className="py-4 bg-red-600 rounded-lg items-center shadow"
                    >
                        <Text className="text-white text-lg font-bold">Sign Out</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView className='flex-1 bg-gray-50'>
            <View className="flex-row justify-center items-center px-4 py-3 border-b border-gray-200 bg-white">
                <Text className="text-xl font-bold text-gray-900">My Account</Text>
            </View>

            <ScrollView>
                {renderProfile()}
            </ScrollView>
        </SafeAreaView>
    );
};

export default ProfileScreen;