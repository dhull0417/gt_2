import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useApiClient, groupApi } from '@/utils/api';
import { broadcastGroupUpdate } from '@/utils/groupRealtime';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { useThemeColors } from '@/contexts/AppearanceContext';

export const PENDING_INVITE_KEY = 'GROUPTHAT_PENDING_INVITE';

type JoinState = 'loading' | 'success' | 'already_member' | 'error';

const Logo = () => (
    <Image
        source={require('../../assets/images/splash-icon.png')}
        style={styles.logo}
        resizeMode="contain"
    />
);

const JoinGroupScreen = () => {
    const colors = useThemeColors();
    const { token } = useLocalSearchParams<{ token: string }>();
    const { isSignedIn, getToken } = useAuth();
    const router = useRouter();
    const api = useApiClient();

    const [state, setState] = useState<JoinState>('loading');
    const [groupName, setGroupName] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!isSignedIn || !token) return;

        groupApi.redeemInviteToken(api, token)
            .then(({ groupId, groupName, alreadyMember }) => {
                setGroupName(groupName);
                setState(alreadyMember ? 'already_member' : 'success');
                if (!alreadyMember) broadcastGroupUpdate(getToken, groupId);
            })
            .catch((err) => {
                setErrorMessage(err?.response?.data?.error ?? 'Something went wrong. Please try again.');
                setState('error');
            });
    }, [isSignedIn, token]);

    const goToMeetups = () => {
        router.replace('/(tabs)');
    };

    if (!isSignedIn) {
        const handleSignIn = async () => {
            await SecureStore.setItemAsync(PENDING_INVITE_KEY, token);
            router.replace('/(auth)');
        };
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <Logo />
                <View style={styles.content}>
                    <Feather name="users" size={48} color={colors.brand} style={styles.icon} />
                    <Text style={[styles.title, { color: colors.textPrimary }]}>You're invited!</Text>
                    <Text style={[styles.subtitle, { color: colors.textMuted }]}>Sign in to GroupThat to join this group.</Text>
                    <PressableOpacity style={[styles.button, { backgroundColor: colors.brand }]} onPress={handleSignIn}>
                        <Text style={styles.buttonText}>Sign In / Sign Up</Text>
                    </PressableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    if (state === 'loading') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <Logo />
                <View style={styles.content}>
                    <LoadingAnimation />
                    <Text style={[styles.subtitle, { color: colors.textMuted }]}>Joining group...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (state === 'error') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <Logo />
                <View style={styles.content}>
                    <Feather name="alert-circle" size={48} color={colors.danger} style={styles.icon} />
                    <Text style={[styles.title, { color: colors.textPrimary }]}>Invite Invalid</Text>
                    <Text style={[styles.subtitle, { color: colors.textMuted }]}>{errorMessage}</Text>
                    <PressableOpacity style={[styles.button, { backgroundColor: colors.brand }]} onPress={() => router.replace('/(tabs)')}>
                        <Text style={styles.buttonText}>Go to Groups</Text>
                    </PressableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <Logo />
            <View style={styles.content}>
                <Feather name="check-circle" size={48} color={colors.success} style={styles.icon} />
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                    {state === 'already_member' ? 'Already a member!' : 'You joined!'}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                    {state === 'already_member'
                        ? `You're already in "${groupName}".`
                        : `Welcome to "${groupName}"!`}
                </Text>
                <PressableOpacity style={[styles.button, { backgroundColor: colors.brand }]} onPress={goToMeetups}>
                    <Text style={styles.buttonText}>See Upcoming Meetups</Text>
                </PressableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', padding: 32 },
    logo: { position: 'absolute', top: 160, width: 160, height: 98 },
    content: { width: '100%', alignItems: 'center' },
    icon: { marginBottom: 20 },
    title: { fontSize: 24, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 32 },
    button: { backgroundColor: '#4A90E2', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    buttonText: { color: 'white', fontWeight: '700', fontSize: 16, textAlign: 'center' },
});

export default JoinGroupScreen;
