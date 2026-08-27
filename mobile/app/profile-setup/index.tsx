import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { useApiClient, userApi } from '@/utils/api';
import { PENDING_INVITE_KEY } from '@/app/join/[token]';

const ProfileSetupScreen = () => {
    const { user: clerkUser } = useUser();
    const router = useRouter();
    const api = useApiClient();
    const queryClient = useQueryClient();
    const [firstName, setFirstName] = useState(clerkUser?.firstName ?? '');
    const [lastName, setLastName] = useState(clerkUser?.lastName ?? '');
    const [zipCode, setZipCode] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const isAppleUser = clerkUser?.externalAccounts?.some(a => (a.provider as string).includes('apple')) ?? false;

    // Plain awaited calls, same shape as the dashboard's "One quick thing" zip
    // modal (app/(tabs)/index.tsx) — not a useMutation(). A per-call mutate()
    // onSuccess doesn't reliably fire once router.replace unmounts this screen
    // (see useUpdateProfile's history).
    const handleSaveProfile = async () => {
        if (!isAppleUser && (!firstName.trim() || !lastName.trim())) {
            Alert.alert('Missing Information', 'Please fill out all fields.');
            return;
        }
        if (zipCode.trim() && zipCode.trim().length !== 5) {
            Alert.alert('Invalid Zip Code', 'Zip code must be exactly 5 digits.');
            return;
        }
        // For Apple users, omit firstName/lastName entirely — syncUser's backend Clerk API
        // call will populate them from Apple's token, and we don't want to overwrite with
        // potentially empty client-side values.
        const profileData = isAppleUser
            ? { ...(zipCode.trim() ? { zipCode: zipCode.trim() } : {}) }
            : { firstName, lastName, ...(zipCode.trim() ? { zipCode: zipCode.trim() } : {}) };

        setIsSaving(true);
        try {
            // Ensure the MongoDB user exists before updating profile — idempotent,
            // syncUser just returns the existing user if one's already there.
            const syncRes = await userApi.syncUser(api, { firstName: clerkUser?.firstName ?? '', lastName: clerkUser?.lastName ?? '' });
            // TEMP DEBUG — remove once the profile-setup redirect-loop bug is diagnosed.
            console.log('[profile-setup] syncUser response', syncRes.data);
            const { data } = await userApi.updateProfile(api, profileData);
            console.log('[profile-setup] updateProfile response', data);
            if (data?.user) {
                queryClient.setQueryData(['currentUser'], data.user);
            } else {
                queryClient.invalidateQueries({ queryKey: ['currentUser'] });
            }

            const pendingToken = await SecureStore.getItemAsync(PENDING_INVITE_KEY);
            if (pendingToken) {
                await SecureStore.deleteItemAsync(PENDING_INVITE_KEY);
                router.replace({ pathname: '/join/[token]', params: { token: pendingToken } });
            } else {
                router.replace('/(tabs)');
            }
        } catch (error: any) {
            const errorMessage = error.response?.data?.error || 'Failed to update profile.';
            Alert.alert('Error', errorMessage);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
                    keyboardShouldPersistTaps="handled"
                >
                <View className="p-8">
                    <Text className="text-3xl font-bold text-gray-800 text-center">Welcome!</Text>
                    <Text className="text-lg text-gray-600 text-center mt-2 mb-8">Let's set up your profile.</Text>

                    {!isAppleUser && (
                        <>
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
                        </>
                    )}

                    <TextInput
                        placeholder="Zip Code"
                        value={zipCode}
                        onChangeText={(text) => setZipCode(text.replace(/\D/g, '').slice(0, 5))}
                        keyboardType="numeric"
                        maxLength={5}
                        className="w-full bg-white p-4 border border-gray-300 rounded-lg text-base mb-4"
                        placeholderTextColor="#999"
                    />

                    {isAppleUser && (
                        <Text className="text-sm text-gray-500 text-center mb-6">
                            If you would like to modify your name, visit the Profile Tab {`>`} Update Account Info.
                        </Text>
                    )}

                    {!isAppleUser && <View className="mb-6" />}

                    <TouchableOpacity
                        onPress={handleSaveProfile}
                        disabled={isSaving}
                        className={`w-full py-4 rounded-lg items-center shadow ${isSaving ? 'bg-[#4A90E2]' : 'bg-[#4A90E2]'}`}
                    >
                        {isSaving ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text className="text-white text-lg font-bold">Save & Continue</Text>
                        )}
                    </TouchableOpacity>
                </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default ProfileSetupScreen;
