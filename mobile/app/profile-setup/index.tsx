import { View, Text, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { User, useApiClient, userApi } from '@/utils/api';
import { PENDING_INVITE_KEY } from '@/app/join/[token]';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { haptic } from '@/utils/haptics';

const ProfileSetupScreen = () => {
    const { user: clerkUser } = useUser();
    const router = useRouter();
    const api = useApiClient();
    const queryClient = useQueryClient();
    const colors = useThemeColors();
    // This app never writes the name back to Clerk (only to our own backend via
    // syncUser/updateProfile — see useAppleAuth.ts), so clerkUser.firstName is never
    // populated for Apple sign-in. The saved name lives on our own currentUser record,
    // which app/_layout.tsx's routing already keeps warm in this same query cache.
    const { data: currentUser } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });
    const [firstName, setFirstName] = useState(currentUser?.firstName ?? clerkUser?.firstName ?? '');
    const [lastName, setLastName] = useState(currentUser?.lastName ?? clerkUser?.lastName ?? '');
    const [zipCode, setZipCode] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const lastNameRef = useRef<TextInput>(null);
    const zipRef = useRef<TextInput>(null);

    // Names can arrive after first render (the user record loads late); fill them in
    // unless the person has already started typing.
    useEffect(() => {
        if (!firstName && (currentUser?.firstName || clerkUser?.firstName)) setFirstName(currentUser?.firstName ?? clerkUser?.firstName ?? '');
        if (!lastName && (currentUser?.lastName || clerkUser?.lastName)) setLastName(currentUser?.lastName ?? clerkUser?.lastName ?? '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.firstName, currentUser?.lastName, clerkUser?.firstName, clerkUser?.lastName]);

    const isAppleUser = clerkUser?.externalAccounts?.some(a => (a.provider as string).includes('apple')) ?? false;
    // Apple only hands us a name on the account's very first authorization ever, so a
    // returning/re-created Apple account can land here with nothing on file — prompt
    // for it directly instead of leaving them stuck showing as "New Member".
    const needsName = isAppleUser && !currentUser?.firstName?.trim() && !currentUser?.lastName?.trim();

    // Plain awaited calls, not useMutation() — its onSuccess doesn't reliably fire
    // once router.replace unmounts this screen (see useUpdateProfile's history).
    const handleSaveProfile = async () => {
        if (!isAppleUser && (!firstName.trim() || !lastName.trim())) {
            Alert.alert('Missing Information', 'Please fill out all fields.');
            return;
        }
        // Required: the app won't continue without it (see the routing check in app/_layout.tsx),
        // and it is what lets us show places near you first when you pick a location.
        if (zipCode.trim().length !== 5) {
            haptic.error();
            Alert.alert('Zip Code Needed', 'Please enter your 5-digit zip code.');
            return;
        }
        // Apple users: omit firstName/lastName so syncUser populates them from Apple's token instead,
        // unless we prompted for it ourselves because Apple never gave us one.
        const appleNameOverride = needsName && (firstName.trim() || lastName.trim())
            ? { firstName: firstName.trim(), lastName: lastName.trim() }
            : {};
        const profileData = isAppleUser
            ? { ...appleNameOverride, zipCode: zipCode.trim() }
            : { firstName: firstName.trim(), lastName: lastName.trim(), zipCode: zipCode.trim() };

        setIsSaving(true);
        try {
            // Ensure the Mongo user exists first — idempotent, returns existing user if present
            await userApi.syncUser(api, { firstName: clerkUser?.firstName ?? '', lastName: clerkUser?.lastName ?? '' });
            const { data } = await userApi.updateProfile(api, profileData);
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
            haptic.error();
            const errorMessage = error.response?.data?.error || 'Failed to update profile.';
            Alert.alert('Error', errorMessage);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50 dark:bg-black">
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
                    keyboardShouldPersistTaps="handled"
                >
                <View className="p-8">
                    <Text className="text-3xl font-bold text-gray-800 dark:text-white text-center">Welcome!</Text>
                    <Text className="text-lg text-gray-600 dark:text-gray-400 text-center mt-2 mb-8">Let's set up your profile.</Text>

                    {!isAppleUser && (
                        <>
                            <TextInput
                                placeholder="First Name"
                                value={firstName}
                                onChangeText={setFirstName}
                                autoComplete="given-name"
                                textContentType="givenName"
                                returnKeyType="next"
                                onSubmitEditing={() => lastNameRef.current?.focus()}
                                className="w-full bg-white dark:bg-gray-800 p-4 border border-gray-300 dark:border-gray-700 rounded-lg text-base mb-4"
                                style={{ height: 52, paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined, color: colors.textPrimary }}
                                placeholderTextColor={colors.placeholder}
                            />
                            <TextInput
                                ref={lastNameRef}
                                placeholder="Last Name"
                                value={lastName}
                                onChangeText={setLastName}
                                autoComplete="family-name"
                                textContentType="familyName"
                                returnKeyType="next"
                                onSubmitEditing={() => zipRef.current?.focus()}
                                className="w-full bg-white dark:bg-gray-800 p-4 border border-gray-300 dark:border-gray-700 rounded-lg text-base mb-4"
                                style={{ height: 52, paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined, color: colors.textPrimary }}
                                placeholderTextColor={colors.placeholder}
                            />
                        </>
                    )}

                    <TextInput
                        ref={zipRef}
                        placeholder="Zip Code"
                        autoComplete="postal-code"
                        textContentType="postalCode"
                        returnKeyType="done"
                        onSubmitEditing={handleSaveProfile}
                        value={zipCode}
                        onChangeText={(text) => setZipCode(text.replace(/\D/g, '').slice(0, 5))}
                        keyboardType="numeric"
                        maxLength={5}
                        className="w-full bg-white dark:bg-gray-800 p-4 border border-gray-300 dark:border-gray-700 rounded-lg text-base mb-4"
                        style={{ height: 52, paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined, color: colors.textPrimary }}
                        placeholderTextColor={colors.placeholder}
                    />
                    <Text className="text-xs text-gray-500 dark:text-gray-400 mb-6 px-1">
                        Your zip code helps us show places near you first when you pick a meetup location. We never share it.
                    </Text>

                    {needsName && (
                        <View
                            className="w-full rounded-lg p-4 mb-6 border"
                            style={{ backgroundColor: colors.brandSoft, borderColor: colors.border }}
                        >
                            <Text className="text-base font-bold text-gray-800 dark:text-white mb-1">Update Name!</Text>
                            <Text className="text-sm text-gray-600 dark:text-gray-400 mb-4">Make sure your friends know who you are.</Text>
                            <TextInput
                                placeholder="First Name"
                                value={firstName}
                                onChangeText={setFirstName}
                                className="w-full bg-white dark:bg-gray-800 p-4 border border-gray-300 dark:border-gray-700 rounded-lg text-base mb-3"
                                style={{ height: 52, paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined, color: colors.textPrimary }}
                                placeholderTextColor={colors.placeholder}
                            />
                            <TextInput
                                placeholder="Last Name"
                                value={lastName}
                                onChangeText={setLastName}
                                className="w-full bg-white dark:bg-gray-800 p-4 border border-gray-300 dark:border-gray-700 rounded-lg text-base"
                                style={{ height: 52, paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined, color: colors.textPrimary }}
                                placeholderTextColor={colors.placeholder}
                            />
                        </View>
                    )}

                    {isAppleUser && !needsName && (
                        <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
                            If you would like to modify your name, visit the Profile Tab {`>`} Update Account Info.
                        </Text>
                    )}

                    <PressableOpacity
                        onPress={handleSaveProfile}
                        disabled={isSaving}
                        className="w-full py-4 rounded-lg items-center shadow"
                        style={{ backgroundColor: colors.brand }}
                    >
                        {isSaving ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text className="text-white text-lg font-bold">Save & Continue</Text>
                        )}
                    </PressableOpacity>
                </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default ProfileSetupScreen;
