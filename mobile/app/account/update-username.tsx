import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useUpdateUsername } from '@/hooks/useUpdateUsername';
import { User, useApiClient, userApi } from '@/utils/api';
import { LoadingAnimation } from '@/components/LoadingAnimation';

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
        return <View className="flex-1 justify-center items-center"><LoadingAnimation /></View>;
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="flex-1"
            >
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-6">
                    <View style={{ marginBottom: 28 }}>
                        <Text style={styles.label}>Username</Text>
                        <TextInput
                            value={username}
                            onChangeText={setUsername}
                            placeholder="Enter your new username"
                            placeholderTextColor="#9CA3AF"
                            autoCapitalize="none"
                            style={styles.input}
                        />
                    </View>
                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={isPending}
                        style={styles.saveBtn}
                        activeOpacity={0.85}
                    >
                        {isPending
                            ? <ActivityIndicator color="white" />
                            : <Text style={styles.saveBtnText}>Save Changes</Text>}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    label: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    input: { width: '100%', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 16, height: 56, fontSize: 16, color: '#1F2937' },
    saveBtn: { width: '100%', height: 54, borderRadius: 16, backgroundColor: '#4A90E2', alignItems: 'center', justifyContent: 'center' },
    saveBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
});

export default UpdateUsernameScreen;
