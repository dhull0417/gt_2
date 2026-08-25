import React, { useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGetNotifications } from '@/hooks/useGetNotifications';
import { useMarkNotificationsAsRead } from '@/hooks/useMarkNotificationsAsRead';
import { Notification, User, useApiClient, userApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { getNotificationIcon } from '@/utils/notificationIcons';

// A simple time ago function for demonstration
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

// Turns ['schedule', 'location'] into "date and time and location"; falls
// back to null when there's nothing to describe (e.g. older notifications
// persisted before per-field change tracking existed).
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

const NotificationItem = ({ notification, currentUser, onAccept, onDecline }: { notification: Notification, currentUser: User, onAccept: (id: string) => void, onDecline: (id: string) => void }) => {
    const router = useRouter();

    const getMessage = () => {
        const senderName = notification.sender ? `${notification.sender.firstName} ${notification.sender.lastName}` : '';
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
        if (notification.group?._id) {
            router.push({
                pathname: '/groups/[id]',
                params: { id: notification.group._id }
            });
        }
    };

    const icon = getNotificationIcon(notification.type);

    return (
        <TouchableOpacity style={[styles.itemContainer, !notification.read && styles.unread]} onPress={handlePress} activeOpacity={0.7}>
            <View style={styles.iconContainer}>
                <Feather name={icon.name as any} size={24} color={icon.color} />
            </View>
            <View style={styles.textContainer}>
                {getMessage()}
                <Text style={styles.timeText}>{timeAgo(notification.createdAt)}</Text>
                {notification.type === 'group-invite' && notification.status === 'pending' && (
                    <View style={styles.actionContainer}>
                        <TouchableOpacity style={[styles.actionButton, styles.acceptButton]} onPress={() => onAccept(notification._id)}>
                            <Text style={styles.actionTextAccept}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionButton, styles.declineButton]} onPress={() => onDecline(notification._id)}>
                            <Text style={styles.actionTextDecline}>Decline</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
};

const NotificationsScreen = () => {
    const api = useApiClient();
    const queryClient = useQueryClient();
    const { data: notifications, isLoading, refetch } = useGetNotifications();
    const { mutate: markAsRead } = useMarkNotificationsAsRead();
    const { data: currentUser } = useQuery<User>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });

    useFocusEffect(useCallback(() => {
        markAsRead(undefined, { onSettled: () => refetch() });
    }, [refetch, markAsRead]));

    const handleAccept = async (id: string) => {
        try {
            await api.post(`/api/notifications/${id}/accept`);
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({ queryKey: ['groups'] });
        } catch (error) { console.error("Failed to accept invite", error); }
    };

    const handleDecline = async (id: string) => {
        try {
            await api.post(`/api/notifications/${id}/decline`);
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        } catch (error) { console.error("Failed to decline invite", error); }
    };

    if (isLoading || !currentUser) {
        return <View style={styles.center}><LoadingAnimation /></View>;
    }

    if (!notifications || notifications.length === 0) {
        return (
            <View style={styles.center}>
                <Feather name="bell-off" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>No notifications yet.</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <FlatList
                data={notifications}
                renderItem={({ item }) => <NotificationItem notification={item} currentUser={currentUser} onAccept={handleAccept} onDecline={handleDecline} />}
                keyExtractor={item => item._id}
                contentContainerStyle={{ paddingVertical: 8 }}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
    emptyText: { marginTop: 16, fontSize: 16, color: '#6B7280' },
    itemContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'white' },
    unread: { backgroundColor: '#EFF6FF', borderLeftWidth: 3, borderLeftColor: '#4A90E2' },
    iconContainer: { marginRight: 16, marginTop: 2 },
    textContainer: { flex: 1 },
    messageText: { fontSize: 15, color: '#374151', lineHeight: 22 },
    bold: { fontWeight: 'bold' },
    timeText: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
    actionContainer: { flexDirection: 'row', marginTop: 12, gap: 12 },
    actionButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
    acceptButton: { backgroundColor: '#10B981' },
    declineButton: { backgroundColor: '#F3F4F6' },
    actionTextAccept: { color: 'white', fontWeight: 'bold' },
    actionTextDecline: { color: '#4B5563', fontWeight: 'bold' },
});

export default NotificationsScreen;