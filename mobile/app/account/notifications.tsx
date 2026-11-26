import { View, Text, ScrollView, StyleSheet, Linking, AppState } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { NotificationPrefs, User, useApiClient, userApi } from '@/utils/api';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import NativeTimePicker from '@/components/NativeTimePicker';
import { toast } from '@/contexts/ToastContext';
import { haptic } from '@/utils/haptics';
import { requestNotificationPermission } from '@/hooks/usePushNotifications';

const DEFAULT_PREFS: NotificationPrefs = {
    chat: true,
    rsvps: true,
    reminders: true,
    polls: true,
    quietHours: { enabled: false, start: '10:00 PM', end: '08:00 AM' },
};

const ROWS: { key: 'chat' | 'rsvps' | 'reminders' | 'polls'; label: string; hint: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
    { key: 'chat', label: 'Chat messages', hint: 'New messages, replies and @mentions', icon: 'message-circle' },
    { key: 'rsvps', label: "Who's coming", hint: "When someone says they're in, out or joins a waitlist", icon: 'users' },
    { key: 'reminders', label: 'Meetup reminders', hint: 'RSVP reminders, RSVPs opening, and "starting soon"', icon: 'bell' },
    { key: 'polls', label: 'Polls', hint: 'New polls and their results', icon: 'bar-chart-2' },
];

const NotificationSettingsScreen = () => {
    const api = useApiClient();
    const colors = useThemeColors();
    const queryClient = useQueryClient();
    const { data: currentUser } = useQuery<User, Error>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
    const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined' | null>(null);
    const [picker, setPicker] = useState<null | 'start' | 'end'>(null);

    const prefs: NotificationPrefs = {
        ...DEFAULT_PREFS,
        ...(currentUser?.notificationPrefs ?? {}),
        quietHours: { ...DEFAULT_PREFS.quietHours, ...(currentUser?.notificationPrefs?.quietHours ?? {}) },
    };

    const checkPermission = useCallback(() => {
        Notifications.getPermissionsAsync().then((p) => setPermission(p.status as any)).catch(() => {});
    }, []);
    useEffect(() => {
        checkPermission();
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') checkPermission(); });
        return () => sub.remove();
    }, [checkPermission]);

    const save = async (patch: Partial<NotificationPrefs>) => {
        haptic.select();
        const previous = currentUser?.notificationPrefs;
        queryClient.setQueryData<User>(['currentUser'], (old) => old ? {
            ...old,
            notificationPrefs: { ...prefs, ...patch, quietHours: { ...prefs.quietHours, ...(patch.quietHours ?? {}) } },
        } : old);
        try {
            await userApi.updateNotificationPrefs(api, patch);
        } catch {
            queryClient.setQueryData<User>(['currentUser'], (old) => old ? { ...old, notificationPrefs: previous } : old);
            toast.error("Couldn't save that. Try again.");
        }
    };

    const enablePush = async () => {
        if (permission === 'undetermined') {
            await requestNotificationPermission(api);
            checkPermission();
        } else {
            Linking.openSettings().catch(() => {});
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-100 dark:bg-black" edges={['bottom', 'left', 'right']}>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
                {permission && permission !== 'granted' && (
                    <PressableOpacity
                        onPress={enablePush}
                        style={[styles.banner, { backgroundColor: colors.brandSoft, borderColor: colors.border }]}
                    >
                        <Feather name="bell-off" size={20} color={colors.brand} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 15 }}>Notifications are off</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                                {permission === 'undetermined' ? 'Tap to turn them on.' : 'Tap to open Settings and allow notifications for GroupThat.'}
                            </Text>
                        </View>
                        <Feather name="chevron-right" size={18} color={colors.textFaint} />
                    </PressableOpacity>
                )}

                <Text style={[styles.sectionLabel, { color: colors.textFaint }]}>What to notify me about</Text>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {ROWS.map((row, i) => (
                        <View key={row.key} style={[styles.row, i < ROWS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                            <Feather name={row.icon} size={20} color={colors.brand} />
                            <View style={{ flex: 1, marginHorizontal: 12 }}>
                                <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}>{row.label}</Text>
                                <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 2 }}>{row.hint}</Text>
                            </View>
                            <ToggleSwitch accessibilityLabel={row.label} value={prefs[row.key]} onValueChange={(v) => save({ [row.key]: v })} />
                        </View>
                    ))}
                </View>
                <Text style={[styles.footnote, { color: colors.textFaint }]}>
                    Cancellations, group invites and “starting soon” alerts always come through. You can also mute a single group by swiping it on the Groups tab.
                </Text>

                <Text style={[styles.sectionLabel, { color: colors.textFaint, marginTop: 24 }]}>Quiet hours</Text>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.row}>
                        <Feather name="moon" size={20} color={colors.brand} />
                        <View style={{ flex: 1, marginHorizontal: 12 }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}>Pause notifications</Text>
                            <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 2 }}>No pushes during these hours, except cancellations</Text>
                        </View>
                        <ToggleSwitch accessibilityLabel="Quiet hours" value={prefs.quietHours.enabled} onValueChange={(v) => save({ quietHours: { ...prefs.quietHours, enabled: v } })} />
                    </View>
                    {prefs.quietHours.enabled && (
                        <View style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 10 }]}>
                            <PressableOpacity style={[styles.timeBtn, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]} onPress={() => setPicker('start')}>
                                <Text style={{ color: colors.textFaint, fontSize: 11, fontWeight: '800' }}>FROM</Text>
                                <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>{prefs.quietHours.start}</Text>
                            </PressableOpacity>
                            <PressableOpacity style={[styles.timeBtn, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]} onPress={() => setPicker('end')}>
                                <Text style={{ color: colors.textFaint, fontSize: 11, fontWeight: '800' }}>UNTIL</Text>
                                <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>{prefs.quietHours.end}</Text>
                            </PressableOpacity>
                        </View>
                    )}
                </View>
                <Text style={[styles.footnote, { color: colors.textFaint }]}>
                    Quiet hours use your phone's time zone.
                </Text>
            </ScrollView>

            {picker && (
                <NativeTimePicker
                    value={picker === 'start' ? prefs.quietHours.start : prefs.quietHours.end}
                    onChange={(t) => save({ quietHours: { ...prefs.quietHours, [picker]: t } })}
                    onClose={() => setPicker(null)}
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    banner: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 20 },
    sectionLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
    card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
    footnote: { fontSize: 12, lineHeight: 17, marginTop: 8, marginLeft: 4 },
    timeBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
});

export default NotificationSettingsScreen;
