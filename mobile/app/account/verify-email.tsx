import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApiClient, userApi } from '@/utils/api';

const VerifyNewEmailScreen = () => {
    const { user } = useUser();
    const router = useRouter();
    const api = useApiClient();
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

            // 2. Make sure Mongo can accept the new email (it must be unique
            // there too) before touching Clerk's primary email, so the two
            // stores never end up disagreeing.
            try {
                await userApi.updateProfile(api, { email: emailAddressToVerify.emailAddress });
            } catch (mongoErr: any) {
                Alert.alert('Error', mongoErr.response?.data?.error || 'Could not update your email. Please try again.');
                return;
            }

            // 3. Now that Mongo accepted it, set it as the user's primary email in Clerk
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
                    <Text style={styles.title}>Check your new email</Text>
                    <Text style={styles.subtitle}>
                        We've sent a verification code to your new email address.
                    </Text>
                    <TextInput
                        value={code}
                        onChangeText={setCode}
                        placeholder="Verification Code"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="numeric"
                        style={styles.input}
                    />
                    <TouchableOpacity
                        onPress={onVerifyPress}
                        disabled={isLoading}
                        style={styles.saveBtn}
                        activeOpacity={0.85}
                    >
                        {isLoading
                            ? <ActivityIndicator color="white" />
                            : <Text style={styles.saveBtnText}>Verify and Save</Text>}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    title: { fontSize: 22, fontWeight: '900', color: '#111827', letterSpacing: -0.5, textAlign: 'center' },
    subtitle: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginTop: 8, marginBottom: 28, lineHeight: 21 },
    input: { width: '100%', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 16, height: 56, fontSize: 18, color: '#1F2937', textAlign: 'center', letterSpacing: 4 },
    saveBtn: { width: '100%', height: 54, borderRadius: 16, backgroundColor: '#4A90E2', alignItems: 'center', justifyContent: 'center', marginTop: 28 },
    saveBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
});

export default VerifyNewEmailScreen;
