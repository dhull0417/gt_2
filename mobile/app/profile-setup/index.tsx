import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import { useUserSync } from '@/hooks/useUserSync';
import { useUser } from '@clerk/expo';

const ProfileSetupScreen = () => {
    const { user: clerkUser } = useUser();
    const [firstName, setFirstName] = useState(clerkUser?.firstName ?? '');
    const [lastName, setLastName] = useState(clerkUser?.lastName ?? '');
    const [username, setUsername] = useState('');
    const { mutate: syncUser, isPending: isSyncing } = useUserSync();
    const { mutate: updateProfile, isPending: isUpdating } = useUpdateProfile();

    const isPending = isSyncing || isUpdating;

    const handleSaveProfile = () => {
        if (!firstName.trim() || !lastName.trim() || !username.trim()) {
            Alert.alert('Missing Information', 'Please fill out all fields.');
            return;
        }
        // Ensure the MongoDB user exists before updating profile.
        // onSettled fires whether sync succeeded or failed, so we always attempt the update.
        syncUser(undefined, {
            onSettled: () => updateProfile({ firstName, lastName, username }),
        });
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50 justify-center">
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
                <View className="p-8">
                    <Text className="text-3xl font-bold text-gray-800 text-center">Welcome!</Text>
                    <Text className="text-lg text-gray-600 text-center mt-2 mb-8">Let's set up your profile.</Text>

                    <TextInput
                        placeholder="First Name"
                        value={firstName}
                        onChangeText={setFirstName}
                        className="w-full bg-white p-4 border border-gray-300 rounded-lg text-base mb-4"
                        placeholderTextColor="#999"
                    />
                    <TextInput
                        placeholder="Last Name"
                        value={lastName}
                        onChangeText={setLastName}
                        className="w-full bg-white p-4 border border-gray-300 rounded-lg text-base mb-4"
                        placeholderTextColor="#999"
                    />
                    <TextInput
                        placeholder="Username"
                        value={username}
                        onChangeText={setUsername}
                        autoCapitalize="none"
                        className="w-full bg-white p-4 border border-gray-300 rounded-lg text-base mb-6"
                        placeholderTextColor="#999"
                    />

                    <TouchableOpacity
                        onPress={handleSaveProfile}
                        disabled={isPending}
                        className={`w-full py-4 rounded-lg items-center shadow ${isPending ? 'bg-[#4A90E2]' : 'bg-[#4A90E2]'}`}
                    >
                        {isPending ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text className="text-white text-lg font-bold">Save & Continue</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default ProfileSetupScreen;
