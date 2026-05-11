import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useApiClient, groupApi } from '@/utils/api';

export const PENDING_INVITE_KEY = 'GROUPTHAT_PENDING_INVITE';

type JoinState = 'loading' | 'success' | 'already_member' | 'error';

const JoinGroupScreen = () => {
    const { token } = useLocalSearchParams<{ token: string }>();
    const { isSignedIn } = useAuth();
    const router = useRouter();
    const api = useApiClient();

    const [state, setState] = useState<JoinState>('loading');
    const [groupName, setGroupName] = useState('');
    const [groupId, setGroupId] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!isSignedIn || !token) return;

        groupApi.redeemInviteToken(api, token)
            .then(({ groupId, groupName, alreadyMember }) => {
                setGroupId(groupId);
                setGroupName(groupName);
                setState(alreadyMember ? 'already_member' : 'success');
            })
            .catch((err) => {
                setErrorMessage(err?.response?.data?.error ?? 'Something went wrong. Please try again.');
                setState('error');
            });
    }, [isSignedIn, token]);

    const goToChat = () => {
        router.replace({ pathname: '/(tabs)/groups', params: { openChatId: groupId } });
    };

    if (!isSignedIn) {
        const handleSignIn = async () => {
            await SecureStore.setItemAsync(PENDING_INVITE_KEY, token);
            router.replace('/(auth)');
        };
        return (
            <SafeAreaView style={styles.container}>
                <Feather name="users" size={48} color="#4A90E2" style={styles.icon} />
                <Text style={styles.title}>You're invited!</Text>
                <Text style={styles.subtitle}>Sign in to GroupThat to join this group.</Text>
                <TouchableOpacity style={styles.button} onPress={handleSignIn}>
                    <Text style={styles.buttonText}>Sign In / Sign Up</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    if (state === 'loading') {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color="#4A90E2" />
                <Text style={styles.subtitle}>Joining group...</Text>
            </SafeAreaView>
        );
    }

    if (state === 'error') {
        return (
            <SafeAreaView style={styles.container}>
                <Feather name="alert-circle" size={48} color="#EF4444" style={styles.icon} />
                <Text style={styles.title}>Invite Invalid</Text>
                <Text style={styles.subtitle}>{errorMessage}</Text>
                <TouchableOpacity style={styles.button} onPress={() => router.replace('/(tabs)')}>
                    <Text style={styles.buttonText}>Go to Groups</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <Feather name="check-circle" size={48} color="#22C55E" style={styles.icon} />
            <Text style={styles.title}>
                {state === 'already_member' ? 'Already a member!' : 'You joined!'}
            </Text>
            <Text style={styles.subtitle}>
                {state === 'already_member'
                    ? `You're already in "${groupName}".`
                    : `Welcome to "${groupName}"!`}
            </Text>
            <TouchableOpacity style={styles.button} onPress={goToChat}>
                <Text style={styles.buttonText}>Open Group Chat</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', padding: 32 },
    icon: { marginBottom: 20 },
    title: { fontSize: 24, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 32 },
    button: { backgroundColor: '#4A90E2', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
    buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },
});

export default JoinGroupScreen;
