import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, SectionList, StyleSheet, RefreshControl } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/contexts/ToastContext';
import { SkeletonList } from '@/components/Skeleton';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useGetNotifications } from '@/hooks/useGetNotifications';
import { useMarkNotificationsAsRead } from '@/hooks/useMarkNotificationsAsRead';
import { Notification, User, useApiClient, userApi, notificationApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';
import { getNotificationIcon } from '@/utils/notificationIcons';
import { goToTarget, resolveNotificationTarget } from '@/utils/notificationRouting';
import { ACCEPT_INVITE_MUTATION_KEY, DECLINE_INVITE_MUTATION_KEY } from '@/utils/offlineMutations';
import { getUserDisplayName } from '@/utils/groupDisplay';
import { useAppearance, useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';

const timeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 45) return "just now";
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "just now";
};

const CHANGED_FIELD_LABELS: Record<string, string> = {
    schedule: 'date and time',
    location: 'location',
    capacity: 'capacity',
};

// Turns ['schedule', 'location'] into "date and time and location"; null if nothing to describe
const describeChangedFields = (fields?: string[]) => {
    if (!fields || fields.length === 0) return null;
    const labels = fields.map(f => CHANGED_FIELD_LABELS[f] || f);
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
    return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
};

const formatMeetupDateTime = (meetup?: { date?: string; time?: string; timezone?: string }) => {
    if (!meetup?.date) return null;
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', timeZone: meetup.timezone };
    const dateStr = new Date(meetup.date).toLocaleDateString(undefined, options);
    return meetup.time ? `${dateStr} at ${meetup.time}` : dateStr;
};

const NotificationItem = ({ notification, currentUser, onAccept, onDecline, onDelete, isAccepting, isDeclining, colors, unreadBg, highlight }: { notification: Notification, currentUser: User, onAccept: (id: string) => void, onDecline: (id: string) => void, onDelete: (id: string) => void, isAccepting: boolean, isDeclining: boolean, colors: ThemeColors, unreadBg: string, highlight: boolean }) => {
    const router = useRouter();
    const styles = useMemoStyles(colors);

    const getMessage = () => {
        const senderName = notification.sender ? getUserDisplayName(notification.sender) : '';
        const groupName = notification.group?.name;
        const meetupName = notification.meetup?.name;
        const pollPrompt = notification.poll?.prompt;

        switch (notification.type) {
            case 'group-invite':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> invited you to join <Text style={styles.bold}>{groupName}</Text>.</Text>;
            case 'invite-accepted':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> accepted your invitation to <Text style={styles.bold}>{groupName}</Text>.</Text>;
            case 'invite-declined':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> declined your invitation to <Text style={styles.bold}>{groupName}</Text>.</Text>;
            case 'group-added':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> added you to <Text style={styles.bold}>{groupName}</Text>.</Text>;
            case 'group-member-joined':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> has been added to <Text style={styles.bold}>{groupName}</Text>!</Text>;
            case 'group-removed':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> removed you from <Text style={styles.bold}>{groupName}</Text>.</Text>;
            case 'ownership-transferred': {
                const premiumNote = notification.meta?.premiumPaused
                    ? ' Its Premium features are paused until you have your own Premium subscription.'
                    : '';
                if (!notification.sender || notification.meta?.reason === 'owner-deleted-account') {
                    return <Text style={styles.messageText}>The previous owner of <Text style={styles.bold}>{groupName}</Text> left GroupThat, so you're now the owner.{premiumNote}</Text>;
                }
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> made you the owner of <Text style={styles.bold}>{groupName}</Text>.{premiumNote}</Text>;
            }
            case 'group-deleted':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> deleted the group <Text style={styles.bold}>{notification.meta?.groupName || 'you were in'}</Text>.</Text>;
            case 'schedule-removed':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> removed the <Text style={styles.bold}>{notification.meta?.scheduleName || 'schedule'}</Text> schedule{groupName ? <> from <Text style={styles.bold}>{groupName}</Text></> : null}. Its upcoming meetups were deleted.</Text>;
            case 'group-updated':
                return <Text style={styles.messageText}>The group <Text style={styles.bold}>{groupName}</Text> was renamed.</Text>;
            case 'meetup-rsvp-in':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> is going to <Text style={styles.bold}>{meetupName || 'a meetup'}</Text>.</Text>;
            case 'meetup-rsvp-out':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> is out for <Text style={styles.bold}>{meetupName || 'a meetup'}</Text>.</Text>;
            case 'meetup-rsvp-admin-in':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> marked you as going to <Text style={styles.bold}>{meetupName || 'a meetup'}</Text>.</Text>;
            case 'meetup-rsvp-admin-out':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> marked you as not going to <Text style={styles.bold}>{meetupName || 'a meetup'}</Text>.</Text>;
            case 'meetup-waitlist-join':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> joined the waitlist for <Text style={styles.bold}>{meetupName || 'a meetup'}</Text>.</Text>;
            case 'waitlist-promotion':
                if (notification.recipient === currentUser._id) {
                    return <Text style={styles.messageText}>You're in! A spot opened up for <Text style={styles.bold}>{meetupName || 'a meetup'}</Text>.</Text>;
                }
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> was promoted to "in" for <Text style={styles.bold}>{meetupName || 'a meetup'}</Text>.</Text>;
            case 'priority-bumped':
                return <Text style={styles.messageText}>A member with RSVP priority took a spot in <Text style={styles.bold}>{meetupName || 'a meetup'}</Text>. You're first on the waitlist.</Text>;
            case 'meetup-created':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> scheduled a new meetup{groupName ? <> for <Text style={styles.bold}>{groupName}</Text></> : null}.</Text>;
            case 'meetup-updated': {
                const changeSummary = describeChangedFields(notification.meta?.changedFields);
                const when = formatMeetupDateTime(notification.meetup);
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> updated the {changeSummary || 'details'} for <Text style={styles.bold}>{meetupName || 'a meetup'}</Text>{when ? <>{' — '}<Text style={styles.bold}>{when}</Text></> : null}.</Text>;
            }
            case 'meetup-cancelled':
                if (notification.meta?.reason === 'minimum-headcount') {
                    return <Text style={styles.messageText}><Text style={styles.bold}>{meetupName || 'A meetup'}</Text> was cancelled: only {notification.meta.count ?? 0} of the {notification.meta.needed ?? 0} needed signed up.</Text>;
                }
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> cancelled <Text style={styles.bold}>{meetupName || 'a meetup'}</Text>.{notification.meta?.reason ? <>{' '}<Text style={{ fontStyle: 'italic' }}>"{notification.meta.reason}"</Text></> : null}</Text>;
            case 'meetup-restored':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> restored <Text style={styles.bold}>{meetupName || 'a meetup'}</Text>.</Text>;
            case 'meetup-rsvp-reminder':
                return <Text style={styles.messageText}>Don't forget to RSVP for <Text style={styles.bold}>{meetupName || 'the meetup'}</Text>!</Text>;
            case 'meetup-rsvp-open':
                return <Text style={styles.messageText}>RSVPs are now open for <Text style={styles.bold}>{meetupName || 'the meetup'}</Text>.</Text>;
            case 'meetup-starting-soon':
                return <Text style={styles.messageText}><Text style={styles.bold}>{meetupName || 'Your meetup'}</Text> starts in 30 minutes!</Text>;
            case 'poll-created':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> started a new poll{groupName ? <> in <Text style={styles.bold}>{groupName}</Text></> : null}{pollPrompt ? <>: "{pollPrompt}"</> : null}.</Text>;
            case 'poll-closed':
                return <Text style={styles.messageText}>The poll{pollPrompt ? <> "{pollPrompt}"</> : null} has closed.</Text>;
            default:
                return <Text style={styles.messageText}>You have a new notification.</Text>;
        }
    };

    // Every notification leads somewhere (see utils/notificationRouting.ts), and
    // the same rules apply when the OS push for it is tapped.
    const handlePress = () => {
        goToTarget(router, resolveNotificationTarget({
            type: notification.type,
            groupId: notification.group?._id,
            meetupId: notification.meetup?._id,
            pollId: notification.poll?._id,
        }));
    };

    const icon = getNotificationIcon(notification.type);

    const canDelete = !(notification.type === 'group-invite' && notification.status === 'pending');

    const row = (
        <PressableOpacity style={[styles.itemContainer, highlight && { backgroundColor: unreadBg, borderLeftWidth: 3, borderLeftColor: colors.brand }]} onPress={handlePress} activeOpacity={0.7}>
            <View style={styles.iconContainer}>
                <Feather name={icon.name as any} size={24} color={icon.color} />
            </View>
            <View style={styles.textContainer}>
                {getMessage()}
                <Text style={styles.timeText}>{timeAgo(notification.createdAt)}</Text>
                {notification.type === 'group-invite' && notification.status === 'pending' && (
                    <View style={styles.actionContainer}>
                        <PressableOpacity
                            style={[styles.actionButton, styles.acceptButton, (isAccepting || isDeclining) && styles.actionButtonDisabled]}
                            onPress={() => onAccept(notification._id)}
                            disabled={isAccepting || isDeclining}
                        >
                            <Text style={styles.actionTextAccept}>{isAccepting ? 'Accepting…' : 'Accept'}</Text>
                        </PressableOpacity>
                        <PressableOpacity
                            style={[styles.actionButton, styles.declineButton, (isAccepting || isDeclining) && styles.actionButtonDisabled]}
                            onPress={() => onDecline(notification._id)}
                            disabled={isAccepting || isDeclining}
                        >
                            <Text style={styles.actionTextDecline}>{isDeclining ? 'Declining…' : 'Decline'}</Text>
                        </PressableOpacity>
                    </View>
                )}
            </View>
        </PressableOpacity>
    );

    if (!canDelete) return row;
    return (
        <ReanimatedSwipeable
            friction={2}
            overshootRight={false}
            renderRightActions={() => (
                <PressableOpacity
                    haptic="press"
                    accessibilityLabel="Delete notification"
                    onPress={() => onDelete(notification._id)}
                    style={{ width: 84, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Feather name="trash-2" size={20} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 4 }}>Delete</Text>
                </PressableOpacity>
            )}
        >
            {row}
        </ReanimatedSwipeable>
    );
};

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

const NotificationsScreen = () => {
    const api = useApiClient();
    const queryClient = useQueryClient();
    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const unreadBg = scheme === 'dark' ? '#152238' : '#EFF6FF';
    const styles = useMemoStyles(colors);
    const { data: notifications, isLoading, refetch } = useGetNotifications();
    const { mutate: markAsRead } = useMarkNotificationsAsRead();
    const { data: currentUser } = useQuery<User>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
    const [isPullRefreshing, setIsPullRefreshing] = useState(false);

    // mutationFn + the ['notifications']/['groups'] invalidation on success both
    // live in utils/offlineMutations.ts / app/_layout.tsx's MutationCache, so an
    // accept/decline tapped offline is queued and still resolves correctly even
    // if this screen isn't around to see it (see useRsvp.ts for the same pattern).
    const acceptMutation = useMutation<unknown, any, string>({
        mutationKey: ACCEPT_INVITE_MUTATION_KEY,
        onSuccess: () => toast.success('Invite accepted'),
        onError: (error) => console.error("Failed to accept invite", error),
    });
    const declineMutation = useMutation<unknown, any, string>({
        mutationKey: DECLINE_INVITE_MUTATION_KEY,
        onError: (error) => console.error("Failed to decline invite", error),
    });

    // The unread highlight stays for as long as you're on this screen: remember which rows were
    // unread when it opened, then mark everything read (which clears the bell and app badge).
    const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
    const snapshotTaken = useRef(false);
    const [focusTick, setFocusTick] = useState(0);
    useFocusEffect(useCallback(() => {
        setFocusTick(t => t + 1);
        return () => { snapshotTaken.current = false; setUnreadIds(new Set()); };
    }, []));
    useEffect(() => {
        if (!notifications || snapshotTaken.current) return;
        snapshotTaken.current = true;
        setUnreadIds(new Set(notifications.filter(n => !n.read).map(n => n._id)));
        markAsRead(undefined, { onSettled: () => refetch() });
    }, [notifications, focusTick, markAsRead, refetch]);

    const handleAccept = (id: string) => acceptMutation.mutate(id);
    const handleDecline = (id: string) => declineMutation.mutate(id);

    const handleDelete = async (id: string) => {
        const previous = queryClient.getQueryData<Notification[]>(['notifications']);
        queryClient.setQueryData<Notification[]>(['notifications'], (old) => old?.filter(n => n._id !== id));
        try {
            await notificationApi.deleteNotification(api, id);
        } catch {
            queryClient.setQueryData(['notifications'], previous);
            toast.error("Couldn't delete that. Try again.");
        }
    };

    const handlePullRefresh = async () => {
        setIsPullRefreshing(true);
        try { await refetch(); } finally { setIsPullRefreshing(false); }
    };

    const sections = useMemo(() => {
        const today = startOfToday();
        const list = notifications ?? [];
        const todays = list.filter(n => new Date(n.createdAt).getTime() >= today);
        const earlier = list.filter(n => new Date(n.createdAt).getTime() < today);
        return [
            ...(todays.length ? [{ title: 'Today', data: todays }] : []),
            ...(earlier.length ? [{ title: 'Earlier', data: earlier }] : []),
        ];
    }, [notifications]);

    if (isLoading || !currentUser) {
        return <View style={styles.container}><SkeletonList kind="notification" count={7} /></View>;
    }

    if (!notifications || notifications.length === 0) {
        return (
            <View style={styles.center}>
                <Feather name="bell-off" size={48} color={colors.textFaint} />
                <Text style={styles.emptyText}>No notifications yet.</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <SectionList
                sections={sections}
                renderItem={({ item }) => (
                    <NotificationItem
                        notification={item}
                        currentUser={currentUser}
                        onAccept={handleAccept}
                        onDecline={handleDecline}
                        onDelete={handleDelete}
                        isAccepting={acceptMutation.isPending && acceptMutation.variables === item._id}
                        isDeclining={declineMutation.isPending && declineMutation.variables === item._id}
                        colors={colors}
                        unreadBg={unreadBg}
                        highlight={unreadIds.has(item._id)}
                    />
                )}
                renderSectionHeader={({ section }) => (
                    <Text style={styles.sectionHeader}>{section.title}</Text>
                )}
                keyExtractor={item => item._id}
                stickySectionHeadersEnabled={false}
                contentContainerStyle={{ paddingVertical: 8 }}
                refreshControl={<RefreshControl refreshing={isPullRefreshing} onRefresh={handlePullRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
            />
        </SafeAreaView>
    );
};

// Small factory so both the screen and the row component share one token-driven
// stylesheet without recreating it on every render (memoized by theme identity).
const styleCache = new Map<ThemeColors, ReturnType<typeof buildStyles>>();
function buildStyles(colors: ThemeColors) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
        sectionHeader: { fontSize: 12, fontWeight: '800' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: colors.textFaint, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, backgroundColor: colors.background },
        emptyText: { marginTop: 16, fontSize: 16, color: colors.textMuted },
        itemContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface },
        iconContainer: { marginRight: 16, marginTop: 2 },
        textContainer: { flex: 1 },
        messageText: { fontSize: 15, color: colors.textSecondary, lineHeight: 22 },
        bold: { fontWeight: 'bold' as const },
        timeText: { fontSize: 12, color: colors.textFaint, marginTop: 4 },
        actionContainer: { flexDirection: 'row' as const, marginTop: 12, gap: 12 },
        actionButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
        actionButtonDisabled: { opacity: 0.5 },
        acceptButton: { backgroundColor: colors.success },
        declineButton: { backgroundColor: colors.backgroundAlt },
        actionTextAccept: { color: 'white', fontWeight: 'bold' as const },
        actionTextDecline: { color: colors.textSecondary, fontWeight: 'bold' as const },
    });
}
function useMemoStyles(colors: ThemeColors) {
    let s = styleCache.get(colors);
    if (!s) {
        s = buildStyles(colors);
        styleCache.set(colors, s);
    }
    return s;
}

export default NotificationsScreen;
