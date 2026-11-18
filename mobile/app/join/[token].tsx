import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Share } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useApiClient, groupApi, InvitePreview } from '@/utils/api';
import { broadcastGroupUpdate } from '@/utils/groupRealtime';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { savePendingInvite } from '@/utils/pendingInvite';
import type { InviteSource } from '@/utils/inviteLink';
import { haptic } from '@/utils/haptics';

// Kept for older imports; the invite helpers live in utils/pendingInvite.ts now.
export { PENDING_INVITE_KEY } from '@/utils/pendingInvite';

type JoinState = 'loading' | 'preview' | 'joining' | 'joined' | 'already_member' | 'pending' | 'error';

const SOURCES: InviteSource[] = ['link', 'install_referrer', 'clipboard', 'code', 'contact'];
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

const Logo = () => (
    <Image source={require('../../assets/images/splash-icon.png')} style={styles.logo} resizeMode="contain" />
);

const JoinGroupScreen = () => {
    const colors = useThemeColors();
    const params = useLocalSearchParams<{ token: string; m?: string; r?: string; s?: string }>();
    const token = params.token;
    const meetupParam = params.m && OBJECT_ID_RE.test(params.m) ? params.m : null;
    const referrerId = params.r && OBJECT_ID_RE.test(params.r) ? params.r : null;
    const source: InviteSource = SOURCES.includes(params.s as InviteSource) ? (params.s as InviteSource) : 'link';
    const { isSignedIn, getToken } = useAuth();
    const router = useRouter();
    const api = useApiClient();
    const queryClient = useQueryClient();

    const [state, setState] = useState<JoinState>('loading');
    const [preview, setPreview] = useState<InvitePreview | null>(null);
    const [joinedMeetupId, setJoinedMeetupId] = useState<string | null>(null);
    const [groupId, setGroupId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    // Signed out: keep the invite so it opens again right after sign-in / sign-up.
    useEffect(() => {
        if (!isSignedIn && token) savePendingInvite({ token, meetupId: meetupParam, source });
    }, [isSignedIn, token]);

    useEffect(() => {
        if (!isSignedIn || !token) return;
        setState('loading');
        groupApi.getInvitePreview(api, token, { meetupId: meetupParam, referrerId })
            .then((p) => {
                setPreview(p);
                setGroupId(p.groupId);
                if (p.alreadyMember) setState('already_member');
                else if (p.pendingRequest) setState('pending');
                else setState('preview');
            })
            .catch((err) => {
                setErrorMessage(err?.response?.data?.error ?? "Couldn't load this invite. Check your connection and try again.");
                setState('error');
            });
    }, [isSignedIn, token]);

    const join = async () => {
        if (!token) return;
        setState('joining');
        try {
            const result = await groupApi.redeemInviteToken(api, token, { meetupId: preview?.meetup?._id ?? meetupParam, source });
            setGroupId(result.groupId);
            setJoinedMeetupId(result.meetupId ?? null);
            if (result.pending) { setState('pending'); return; }
            if (result.alreadyMember) { setState('already_member'); return; }
            haptic.success();
            setState('joined');
            broadcastGroupUpdate(getToken, result.groupId);
            queryClient.invalidateQueries({ queryKey: ['groups'] });
            queryClient.invalidateQueries({ queryKey: ['meetups'] });
        } catch (err: any) {
            haptic.error();
            setErrorMessage(err?.response?.data?.error ?? 'Something went wrong. Please try again.');
            setState('error');
        }
    };

    const openMeetupOrHome = () => {
        const meetupId = joinedMeetupId ?? preview?.meetup?._id ?? null;
        if (meetupId) router.replace({ pathname: '/(tabs)', params: { openMeetupId: meetupId } });
        else router.replace('/(tabs)');
    };
    const openChat = () => {
        if (groupId) router.replace({ pathname: '/group-chat/[id]', params: { id: groupId } });
        else router.replace('/(tabs)');
    };
    const askForNewLink = () => {
        const who = preview?.inviterName ? `Hi ${preview.inviterName}! ` : 'Hi! ';
        Share.share({ message: `${who}The GroupThat invite link you sent me isn't working anymore. Could you send me a new one?` }).catch(() => {});
    };

    const Shell = ({ children }: { children: React.ReactNode }) => (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <Logo />
            <View style={styles.content}>{children}</View>
        </SafeAreaView>
    );
    const Primary = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
        <PressableOpacity style={[styles.button, { backgroundColor: colors.brand }, disabled && { opacity: 0.6 }]} onPress={onPress} disabled={disabled}>
            <Text style={styles.buttonText}>{label}</Text>
        </PressableOpacity>
    );
    const Secondary = ({ label, onPress }: { label: string; onPress: () => void }) => (
        <PressableOpacity style={styles.linkButton} onPress={onPress}>
            <Text style={[styles.linkText, { color: colors.brand }]}>{label}</Text>
        </PressableOpacity>
    );

    if (!isSignedIn) {
        return (
            <Shell>
                <Feather name="users" size={48} color={colors.brand} style={styles.icon} />
                <Text style={[styles.title, { color: colors.textPrimary }]}>You're invited!</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>Sign in or create an account and we'll take you straight to the group.</Text>
                <Primary label="Sign In / Sign Up" onPress={() => router.replace('/(auth)')} />
            </Shell>
        );
    }

    if (state === 'loading') {
        return (
            <Shell>
                <LoadingAnimation />
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>Loading invite…</Text>
            </Shell>
        );
    }

    if (state === 'error') {
        return (
            <Shell>
                <Feather name="alert-circle" size={48} color={colors.danger} style={styles.icon} />
                <Text style={[styles.title, { color: colors.textPrimary }]}>Invite not working</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>{errorMessage}</Text>
                <Primary label="Ask for a new link" onPress={askForNewLink} />
                <Secondary label="Go to Groups" onPress={() => router.replace('/(tabs)')} />
            </Shell>
        );
    }

    if (state === 'pending') {
        return (
            <Shell>
                <Feather name="clock" size={48} color={colors.brand} style={styles.icon} />
                <Text style={[styles.title, { color: colors.textPrimary }]}>Request sent</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                    {`An organizer of "${preview?.groupName ?? 'the group'}" needs to approve you. We'll notify you when you're in.`}
                </Text>
                <Primary label="OK" onPress={() => router.replace('/(tabs)')} />
            </Shell>
        );
    }

    if (state === 'joined' || state === 'already_member') {
        const name = preview?.groupName ?? 'the group';
        const meetupName = preview?.meetup?.name;
        return (
            <Shell>
                <Feather name="check-circle" size={48} color={colors.success} style={styles.icon} />
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                    {state === 'already_member' ? 'Already a member!' : 'You joined!'}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                    {state === 'already_member' ? `You're already in "${name}".` : `Welcome to "${name}"!`}
                </Text>
                <Primary label={meetupName ? `See "${meetupName}"` : 'See Upcoming Meetups'} onPress={openMeetupOrHome} />
                <Secondary label="Open group chat" onPress={openChat} />
            </Shell>
        );
    }

    // preview / joining
    const p = preview!;
    const members = `${p.memberCount} member${p.memberCount === 1 ? '' : 's'}`;
    return (
        <Shell>
            {p.image ? (
                <Image source={{ uri: p.image }} style={styles.groupImage} />
            ) : (
                <Feather name="users" size={48} color={colors.brand} style={styles.icon} />
            )}
            <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
                {p.inviterName ? `${p.inviterName} invited you to join` : "You're invited to join"}
            </Text>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{p.meetup ? p.meetup.name : p.groupName}</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                {p.meetup ? `with ${p.groupName} · ${members}` : members}
                {p.requiresApproval ? '\nAn organizer approves new members.' : ''}
            </Text>
            <Primary
                label={state === 'joining' ? (p.requiresApproval ? 'Sending…' : 'Joining…') : (p.requiresApproval ? 'Request to Join' : 'Join Group')}
                onPress={join}
                disabled={state === 'joining'}
            />
            <Secondary label="Not now" onPress={() => router.replace('/(tabs)')} />
        </Shell>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', padding: 32 },
    logo: { position: 'absolute', top: 120, width: 140, height: 86 },
    content: { width: '100%', alignItems: 'center' },
    icon: { marginBottom: 20 },
    groupImage: { width: 96, height: 96, borderRadius: 24, marginBottom: 18 },
    eyebrow: { fontSize: 14, marginBottom: 6, textAlign: 'center' },
    title: { fontSize: 24, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 28, lineHeight: 22 },
    button: { backgroundColor: '#4A90E2', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, alignItems: 'center', minWidth: 220 },
    buttonText: { color: 'white', fontWeight: '700', fontSize: 16, textAlign: 'center' },
    linkButton: { paddingVertical: 14, paddingHorizontal: 20 },
    linkText: { fontSize: 15, fontWeight: '600' },
});

export default JoinGroupScreen;
