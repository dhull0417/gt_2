import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import { User, useApiClient, userApi } from '@/utils/api';

const UpdateNameScreen = () => {
    const api = useApiClient();
    const { data: currentUser, isLoading: isLoadingUser } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const { mutate: updateProfile, isPending } = useUpdateProfile();

    useEffect(() => {
        if (currentUser) {
            setFirstName(currentUser.firstName || '');
            setLastName(currentUser.lastName || '');
        }
    }, [currentUser]);

    const handleSave = () => {
        if (!firstName.trim() || !lastName.trim()) {
            alert('Please enter both your first and last name.');
            return;
        }
        updateProfile({ firstName, lastName });
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
                        <Text className="text-sm text-gray-600 mb-1">First Name</Text>
                        <TextInput
                            value={firstName}
                            onChangeText={setFirstName}
                            placeholder="Enter your first name"
                            className="w-full bg-white p-4 border border-gray-300 rounded-lg text-base"
                        />
                    </View>
                    <View className="mb-8">
                        <Text className="text-sm text-gray-600 mb-1">Last Name</Text>
                        <TextInput
                            value={lastName}
                            onChangeText={setLastName}
                            placeholder="Enter your last name"
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

export default UpdateNameScreen;