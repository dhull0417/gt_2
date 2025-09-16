import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';

const UpdateEmailScreen = () => {
    const { user } = useUser();
    const router = useRouter();
    const [newEmail, setNewEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const onUpdateEmailPress = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            // Step 1: Add the new email address to the user's account
            const newEmailAddress = await user.createEmailAddress({ email: newEmail });
            
            // --- THIS IS THE FIX ---
            // Step 2: Explicitly tell Clerk to send the verification code to the new email
            await newEmailAddress.prepareVerification({ strategy: 'email_code' });

            // Step 3: Navigate to the verification screen
            router.push({ 
                pathname: '/account/verify-email', 
                params: { emailId: newEmailAddress.id }
            });
        } catch (err: any) {
            Alert.alert('Error', err.errors?.[0]?.longMessage || 'An error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="flex-1"
            >
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-6">
                    <View className="mb-6">
                        <Text className="text-sm text-gray-600 mb-1">Current Email</Text>
                        <Text className="w-full bg-gray-200 text-gray-500 p-4 rounded-lg text-base">
                            {user?.primaryEmailAddress?.emailAddress}
                        </Text>
                    </View>
                    <View className="mb-8">
                        <Text className="text-sm text-gray-600 mb-1">New Email Address</Text>
                        <TextInput
                            value={newEmail}
                            onChangeText={setNewEmail}
                            placeholder="Enter your new email"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            className="w-full bg-white p-4 border border-gray-300 rounded-lg text-base"
                        />
                    </View>
                    <TouchableOpacity
                        onPress={onUpdateEmailPress}
                        disabled={isLoading}
                        className={`w-full py-4 rounded-lg items-center shadow ${isLoading ? 'bg-indigo-300' : 'bg-indigo-600'}`}
                    >
                        <Text className="text-white text-lg font-bold">{isLoading ? "Sending..." : "Continue"}</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default UpdateEmailScreen;