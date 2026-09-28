import React, { useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useGetNotifications } from '@/hooks/useGetNotifications';
import { useMarkNotificationsAsRead } from '@/hooks/useMarkNotificationsAsRead';
import { Notification, User, useApiClient, userApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { getNotificationIcon } from '@/utils/notificationIcons';
import { ACCEPT_INVITE_MUTATION_KEY, DECLINE_INVITE_MUTATION_KEY } from '@/utils/offlineMutations';
import { getUserDisplayName } from '@/utils/groupDisplay';
import { useAppearance, useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';

const timeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
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
    return Math.floor(seconds) + "s ago";
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

const NotificationItem = ({ notification, currentUser, onAccept, onDecline, isAccepting, isDeclining, colors, unreadBg }: { notification: Notification, currentUser: User, onAccept: (id: string) => void, onDecline: (id: string) => void, isAccepting: boolean, isDeclining: boolean, colors: ThemeColors, unreadBg: string }) => {
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
            case 'meetup-created':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> scheduled a new meetup{groupName ? <> for <Text style={styles.bold}>{groupName}</Text></> : null}.</Text>;
            case 'meetup-updated': {
                const changeSummary = describeChangedFields(notification.meta?.changedFields);
                const when = formatMeetupDateTime(notification.meetup);
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> updated the {changeSummary || 'details'} for <Text style={styles.bold}>{meetupName || 'a meetup'}</Text>{when ? <>{' — '}<Text style={styles.bold}>{when}</Text></> : null}.</Text>;
            }
            case 'meetup-cancelled':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> cancelled <Text style={styles.bold}>{meetupName || 'a meetup'}</Text>.</Text>;
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

    const handlePress = () => {
        // The user is no longer a member, so the group details screen isn't reachable.
        if (notification.type === 'group-removed') return;
        // Meetup-related notifications deep-link straight to that meetup's detail
        // modal — mirrors the OS push-tap handling in usePushNotifications.ts.
        if (notification.meetup?._id) {
            router.push({
                pathname: '/(tabs)',
                params: { openMeetupId: notification.meetup._id }
            });
            return;
        }
        if (notification.group?._id) {
            // See the matching branch in group-chat/[id].tsx's handleOpenDetails.
            if (Platform.OS === 'ios') {
                router.push({
                    pathname: '/group-details/[id]',
                    params: { id: notification.group._id }
                });
                return;
            }
            router.navigate('/(tabs)/groups');
            router.push({
                pathname: '/groups/[id]',
                params: { id: notification.group._id }
            });
        }
    };

    const icon = getNotificationIcon(notification.type);

    return (
        <TouchableOpacity style={[styles.itemContainer, !notification.read && { backgroundColor: unreadBg, borderLeftWidth: 3, borderLeftColor: colors.brand }]} onPress={handlePress} activeOpacity={0.7}>
            <View style={styles.iconContainer}>
                <Feather name={icon.name as any} size={24} color={icon.color} />
            </View>
            <View style={styles.textContainer}>
                {getMessage()}
                <Text style={styles.timeText}>{timeAgo(notification.createdAt)}</Text>
                {notification.type === 'group-invite' && notification.status === 'pending' && (
                    <View style={styles.actionContainer}>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.acceptButton, (isAccepting || isDeclining) && styles.actionButtonDisabled]}
                            onPress={() => onAccept(notification._id)}
                            disabled={isAccepting || isDeclining}
                        >
                            <Text style={styles.actionTextAccept}>{isAccepting ? 'Accepting…' : 'Accept'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.declineButton, (isAccepting || isDeclining) && styles.actionButtonDisabled]}
                            onPress={() => onDecline(notification._id)}
                            disabled={isAccepting || isDeclining}
                        >
                            <Text style={styles.actionTextDecline}>{isDeclining ? 'Declining…' : 'Decline'}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
};

const NotificationsScreen = () => {
    const api = useApiClient();
    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const unreadBg = scheme === 'dark' ? '#152238' : '#EFF6FF';
    const styles = useMemoStyles(colors);
    const { data: notifications, isLoading, refetch } = useGetNotifications();
    const { mutate: markAsRead } = useMarkNotificationsAsRead();
    const { data: currentUser } = useQuery<User>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });

    // mutationFn + the ['notifications']/['groups'] invalidation on success both
    // live in utils/offlineMutations.ts / app/_layout.tsx's MutationCache, so an
    // accept/decline tapped offline is queued and still resolves correctly even
    // if this screen isn't around to see it (see useRsvp.ts for the same pattern).
    const acceptMutation = useMutation<unknown, any, string>({
        mutationKey: ACCEPT_INVITE_MUTATION_KEY,
        onError: (error) => console.error("Failed to accept invite", error),
    });
    const declineMutation = useMutation<unknown, any, string>({
        mutationKey: DECLINE_INVITE_MUTATION_KEY,
        onError: (error) => console.error("Failed to decline invite", error),
    });

    useFocusEffect(useCallback(() => {
        markAsRead(undefined, { onSettled: () => refetch() });
    }, [refetch, markAsRead]));

    const handleAccept = (id: string) => acceptMutation.mutate(id);
    const handleDecline = (id: string) => declineMutation.mutate(id);

    if (isLoading || !currentUser) {
        return <View style={styles.center}><LoadingAnimation /></View>;
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
            <FlatList
                data={notifications}
                renderItem={({ item }) => (
                    <NotificationItem
                        notification={item}
                        currentUser={currentUser}
                        onAccept={handleAccept}
                        onDecline={handleDecline}
                        isAccepting={acceptMutation.isPending && acceptMutation.variables === item._id}
                        isDeclining={declineMutation.isPending && declineMutation.variables === item._id}
                        colors={colors}
                        unreadBg={unreadBg}
                    />
                )}
                keyExtractor={item => item._id}
                contentContainerStyle={{ paddingVertical: 8 }}
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
