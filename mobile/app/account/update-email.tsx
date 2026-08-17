import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

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
                    <View style={{ marginBottom: 20 }}>
                        <Text style={styles.label}>Current Email</Text>
                        <View style={styles.readOnlyBox}>
                            <Feather name="mail" size={16} color="#9CA3AF" />
                            <Text style={styles.readOnlyText}>{user?.primaryEmailAddress?.emailAddress}</Text>
                        </View>
                    </View>
                    <View style={{ marginBottom: 28 }}>
                        <Text style={styles.label}>New Email Address</Text>
                        <TextInput
                            value={newEmail}
                            onChangeText={setNewEmail}
                            placeholder="Enter your new email"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            style={styles.input}
                        />
                    </View>
                    <TouchableOpacity
                        onPress={onUpdateEmailPress}
                        disabled={isLoading}
                        style={styles.saveBtn}
                        activeOpacity={0.85}
                    >
                        {isLoading
                            ? <ActivityIndicator color="white" />
                            : <Text style={styles.saveBtnText}>Continue</Text>}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    label: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    input: { width: '100%', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 16, height: 56, fontSize: 16, color: '#1F2937' },
    readOnlyBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 16, height: 56 },
    readOnlyText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
    saveBtn: { width: '100%', height: 54, borderRadius: 16, backgroundColor: '#4A90E2', alignItems: 'center', justifyContent: 'center' },
    saveBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
});

export default UpdateEmailScreen;
