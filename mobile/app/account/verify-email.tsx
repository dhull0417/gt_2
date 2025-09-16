import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';

const VerifyNewEmailScreen = () => {
    const { user } = useUser();
    const router = useRouter();
    const { emailId } = useLocalSearchParams<{ emailId: string }>();
    
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const onVerifyPress = async () => {
        if (!user || !emailId) return;
        setIsLoading(true);
        try {
            // Find the new email address object from the user's list
            const emailAddressToVerify = user.emailAddresses.find(e => e.id === emailId);
            if (!emailAddressToVerify) {
                throw new Error("Could not find the email address to verify.");
            }

            // 1. Attempt to verify the code
            await emailAddressToVerify.attemptVerification({ code });

            // 2. Set the newly verified email as the user's primary
            await user.update({ primaryEmailAddressId: emailAddressToVerify.id });

            Alert.alert("Success", "Your email address has been updated.");
            
            // Go back to the account menu screen
            router.back();
            router.back(); // Go back twice to get to the main menu

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
                <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} className="p-6">
                    <Text className="text-xl font-bold text-gray-800 text-center">Check your new email</Text>
                    <Text className="text-base text-gray-600 text-center mt-2 mb-8">
                        We've sent a verification code to your new email address.
                    </Text>
                    <TextInput
                        value={code}
                        onChangeText={setCode}
                        placeholder="Verification Code"
                        keyboardType="numeric"
                        className="w-full bg-white p-4 border border-gray-300 rounded-lg text-base text-center tracking-widest"
                    />
                    <TouchableOpacity
                        onPress={onVerifyPress}
                        disabled={isLoading}
                        className={`w-full py-4 mt-8 rounded-lg items-center shadow ${isLoading ? 'bg-indigo-300' : 'bg-indigo-600'}`}
                    >
                        <Text className="text-white text-lg font-bold">{isLoading ? "Verifying..." : "Verify and Save"}</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default VerifyNewEmailScreen;