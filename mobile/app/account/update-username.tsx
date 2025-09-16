import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useUpdateUsername } from '@/hooks/useUpdateUsername';
import { User, useApiClient, userApi } from '@/utils/api';

const UpdateUsernameScreen = () => {
    const api = useApiClient();
    const { data: currentUser, isLoading: isLoadingUser } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });

    const [username, setUsername] = useState('');
    const { mutate: updateUsername, isPending } = useUpdateUsername();

    // Pre-fill the form with the user's current username when data loads
    useEffect(() => {
        if (currentUser) {
            setUsername(currentUser.username || '');
        }
    }, [currentUser]);

    const handleSave = () => {
        if (!username.trim()) {
            alert('Username cannot be empty.');
            return;
        }
        updateUsername({ username });
    };

    if (isLoadingUser) {
        return <ActivityIndicator size="large" className="flex-1 justify-center" />;
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="flex-1"
            >
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-6">
                    <View className="mb-6">
                        <Text className="text-sm text-gray-600 mb-1">Username</Text>
                        <TextInput
                            value={username}
                            onChangeText={setUsername}
                            placeholder="Enter your new username"
                            autoCapitalize="none"
                            className="w-full bg-white p-4 border border-gray-300 rounded-lg text-base"
                        />
                    </View>
                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={isPending}
                        className={`w-full py-4 rounded-lg items-center shadow ${isPending ? 'bg-indigo-300' : 'bg-indigo-600'}`}
                    >
                        <Text className="text-white text-lg font-bold">{isPending ? "Saving..." : "Save Changes"}</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default UpdateUsernameScreen;