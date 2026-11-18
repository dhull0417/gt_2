import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Alert, Share, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';
import { toast } from '@/contexts/ToastContext';
import { useApiClient, groupApi, InviteLinkInfo, User } from '@/utils/api';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { buildInviteMessage } from '@/utils/inviteMessage';
import { buildShareLink } from '@/utils/inviteLink';
import { getErrorMessage } from '@/utils/networkError';
import { haptic } from '@/utils/haptics';

const MAX_USES_CHOICES: (number | null)[] = [null, 10, 25, 50, 100];
const INVITE_HOST = 'https://invite.groupthatapp.com';

/** The group's invite link: QR code, code, share; owners/moderators also reset it and set limits. */
export default function GroupInviteScreen() {
    const { id: groupId } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const colors = useThemeColors();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const api = useApiClient();
    const queryClient = useQueryClient();
    const { data: groupDetails } = useGetGroupDetails(groupId);
    const referrerId = queryClient.getQueryData<User>(['currentUser'])?._id ?? null;

    const { data: invite, isLoading, isError, refetch } = useQuery({
        queryKey: ['inviteLink', groupId],
        queryFn: () => groupApi.generateInviteLink(api, groupId!),
        enabled: !!groupId,
        staleTime: 1000 * 60,
    });

    const setInvite = (next: InviteLinkInfo) => queryClient.setQueryData(['inviteLink', groupId], next);
    const reset = useMutation({
        mutationFn: () => groupApi.resetInviteLink(api, groupId!),
        onSuccess: (next) => { setInvite(next); haptic.success(); toast.success('New invite link created. The old link and code no longer work.'); },
        onError: (err) => toast.error(getErrorMessage(err, "Couldn't reset the link.")),
    });
    const settings = useMutation({
        mutationFn: (s: { requiresApproval?: boolean; maxUses?: number | null }) => groupApi.updateInviteSettings(api, groupId!, s),
        onSuccess: (next) => setInvite(next),
        onError: (err) => toast.error(getErrorMessage(err, "Couldn't save the invite settings.")),
    });

    const groupName = groupDetails?.name ?? '';
    const shareLink = invite ? buildShareLink(invite.link, { referrerId }) : '';

    const share = async () => {
        if (!invite) return;
        try { await Share.share({ message: buildInviteMessage({ groupName, link: invite.link, referrerId }) }); } catch {}
    };
    const copy = async (text: string, what: string) => {
        await Clipboard.setStringAsync(text);
        haptic.select();
        toast.success(`${what} copied`);
    };
    const confirmReset = () => {
        Alert.alert(
            'Reset invite link?',
            'The current link, QR code and code will stop working right away. Anyone who already joined stays in the group.',
            [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: () => reset.mutate() }]
        );
    };

    const header = (
        <View style={styles.headerBar}>
            <PressableOpacity accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconBtn}>
                <Feather name="arrow-left" size={24} color={colors.textMuted} />
            </PressableOpacity>
            <Text style={styles.headerTitle}>Invite to Group</Text>
            <View style={styles.iconBtn} />
        </View>
    );

    if (isLoading || !groupId) {
        return <SafeAreaView style={styles.safe}>{header}<View style={styles.center}><LoadingAnimation /></View></SafeAreaView>;
    }
    if (isError || !invite) {
        return (
            <SafeAreaView style={styles.safe}>
                {header}
                <View style={styles.center}>
                    <Text style={styles.sub}>Couldn't load the invite link.</Text>
                    <PressableOpacity onPress={() => refetch()} style={[styles.primary, { marginTop: 16, paddingHorizontal: 28 }]}>
                        <Text style={styles.primaryText}>Try again</Text>
                    </PressableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const qrUri = `${INVITE_HOST}/qr/${invite.token}.png${referrerId ? `?r=${referrerId}` : ''}`;
    const limitLabel = invite.maxUses == null ? null : `${invite.uses} of ${invite.maxUses} uses`;

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
            {header}
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.card}>
                    <Text style={styles.groupName} numberOfLines={2}>{groupName}</Text>
                    <View style={styles.qrWrap}>
                        <Image source={{ uri: qrUri }} style={styles.qr} accessibilityLabel="QR code for the invite link" />
                    </View>
                    <Text style={styles.sub}>Scan with a phone camera to join.</Text>

                    {invite.code ? (
                        <PressableOpacity onPress={() => copy(invite.code!, 'Code')} style={styles.codeBox} accessibilityLabel={`Invite code ${invite.code}. Tap to copy.`}>
                            <Text style={styles.codeLabel}>INVITE CODE</Text>
                            <Text style={styles.code}>{invite.code}</Text>
                        </PressableOpacity>
                    ) : null}

                    <PressableOpacity onPress={share} style={styles.primary} haptic="press">
                        <Feather name="share" size={18} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.primaryText}>Share Invite Link</Text>
                    </PressableOpacity>
                    <PressableOpacity onPress={() => copy(shareLink, 'Link')} style={styles.secondary}>
                        <Feather name="link" size={16} color={colors.brand} style={{ marginRight: 6 }} />
                        <Text style={styles.secondaryText}>Copy link</Text>
                    </PressableOpacity>
                    {limitLabel ? <Text style={styles.sub}>{limitLabel}</Text> : null}
                    {invite.requiresApproval ? <Text style={styles.sub}>Organizers approve new members.</Text> : null}
                </View>

                {invite.canManage ? (
                    <>
                        <Text style={styles.sectionLabel}>Link settings</Text>
                        <View style={styles.card}>
                            <View style={styles.row}>
                                <View style={{ flex: 1, paddingRight: 12 }}>
                                    <Text style={styles.rowTitle}>Approve new members</Text>
                                    <Text style={styles.rowSub}>People who use the link ask to join; you or a moderator accepts them.</Text>
                                </View>
                                <ToggleSwitch
                                    value={invite.requiresApproval}
                                    onValueChange={(v) => settings.mutate({ requiresApproval: v })}
                                    accessibilityLabel="Approve new members"
                                />
                            </View>
                            <View style={styles.divider} />
                            <Text style={styles.rowTitle}>Limit how many can join</Text>
                            <Text style={styles.rowSub}>Counts people who join (or ask to) with this link.</Text>
                            <View style={styles.chips}>
                                {MAX_USES_CHOICES.map((n) => {
                                    const active = (invite.maxUses ?? null) === n;
                                    return (
                                        <PressableOpacity
                                            key={String(n)}
                                            onPress={() => { if (!active) settings.mutate({ maxUses: n }); }}
                                            style={[styles.chip, active && styles.chipActive]}
                                        >
                                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{n == null ? 'Unlimited' : n}</Text>
                                        </PressableOpacity>
                                    );
                                })}
                            </View>
                            <View style={styles.divider} />
                            <PressableOpacity onPress={confirmReset} disabled={reset.isPending} style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.rowTitle, { color: colors.danger }]}>Reset link</Text>
                                    <Text style={styles.rowSub}>Turns off the current link, QR code and code, and makes new ones.</Text>
                                </View>
                                {reset.isPending ? <ActivityIndicator color={colors.danger} /> : <Feather name="refresh-cw" size={18} color={colors.danger} />}
                            </PressableOpacity>
                        </View>

                        {invite.stats ? (
                            <>
                                <Text style={styles.sectionLabel}>Last {invite.stats.days} days</Text>
                                <View style={[styles.card, styles.statsRow]}>
                                    <Stat label="Link opens" value={invite.stats.views} styles={styles} />
                                    <Stat label="Joined" value={invite.stats.joins} styles={styles} />
                                    <Stat label="Asked to join" value={invite.stats.requests} styles={styles} />
                                </View>
                                <Text style={[styles.sub, { textAlign: 'left' }]}>Opens count people who saw the invite page without the app. Joins through the app open it directly.</Text>
                            </>
                        ) : null}
                    </>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const Stat = ({ label, value, styles }: { label: string; value: number; styles: ReturnType<typeof makeStyles> }) => (
    <View style={styles.stat}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
    </View>
);

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
    iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
    scroll: { padding: 16, paddingBottom: 48 },
    card: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.border },
    groupName: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: 14 },
    qrWrap: { alignSelf: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 10 },
    qr: { width: 200, height: 200 },
    sub: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginTop: 8, textAlign: 'center' },
    codeBox: { alignSelf: 'center', alignItems: 'center', marginTop: 14, marginBottom: 6, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.background },
    codeLabel: { fontSize: 10, fontWeight: '800', color: colors.textFaint, letterSpacing: 1 },
    code: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, letterSpacing: 5, marginTop: 2 },
    primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 14, marginTop: 14 },
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
    secondaryText: { color: colors.brand, fontWeight: '600', fontSize: 15 },
    sectionLabel: { fontSize: 11, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 22, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center' },
    rowTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    rowSub: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginTop: 2 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 14 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong },
    chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    chipText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    chipTextActive: { color: '#fff' },
    statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
    stat: { alignItems: 'center', flex: 1 },
    statValue: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
    statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
});
