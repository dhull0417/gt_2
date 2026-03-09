import React, { useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGetNotifications } from '@/hooks/useGetNotifications';
import { useMarkNotificationsAsRead } from '@/hooks/useMarkNotificationsAsRead';
import { Notification, User, useApiClient, userApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';

// Extended type to handle new notification types until api.ts is updated
type ExtendedNotification = Omit<Notification, 'type'> & {
    type: 'group-invite' | 'invite-accepted' | 'invite-declined' | 'group-added' | 'event-rsvp-in' | 'event-rsvp-out' | 'event-waitlist-join' | 'waitlist-promotion';
    event?: {
        _id: string;
        name: string;
    };
};

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

const NotificationItem = ({ notification, currentUser, onAccept, onDecline }: { notification: ExtendedNotification, currentUser: User, onAccept: (id: string) => void, onDecline: (id: string) => void }) => {
    const router = useRouter();

    const getIcon = () => {
        switch (notification.type) {
            case 'group-invite': return { name: 'user-plus', color: '#3B82F6' };
            case 'invite-accepted': return { name: 'check-circle', color: '#10B981' };
            case 'invite-declined': return { name: 'x-circle', color: '#EF4444' };
            case 'group-added': return { name: 'users', color: '#6366F1' };
            case 'event-rsvp-in': return { name: 'log-in', color: '#4FD1C5' };
            case 'event-rsvp-out': return { name: 'log-out', color: '#FF7A6E' };
            case 'event-waitlist-join': return { name: 'clock', color: '#F59E0B' };
            case 'waitlist-promotion': return { name: 'arrow-up-circle', color: '#A855F7' };
            default: return { name: 'bell', color: '#6B7280' };
        }
    };

    const getMessage = () => {
        const senderName = `${notification.sender.firstName} ${notification.sender.lastName}`;
        const groupName = notification.group?.name;
        const eventName = notification.event?.name;

        switch (notification.type) {
            case 'group-invite':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> invited you to join <Text style={styles.bold}>{groupName}</Text>.</Text>;
            case 'invite-accepted':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> accepted your invitation to <Text style={styles.bold}>{groupName}</Text>.</Text>;
            case 'invite-declined':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> declined your invitation to <Text style={styles.bold}>{groupName}</Text>.</Text>;
            case 'group-added':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> added you to <Text style={styles.bold}>{groupName}</Text>.</Text>;
            case 'event-rsvp-in':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> is going to <Text style={styles.bold}>{eventName || 'an event'}</Text>.</Text>;
            case 'event-rsvp-out':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> is out for <Text style={styles.bold}>{eventName || 'an event'}</Text>.</Text>;
            case 'event-waitlist-join':
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> joined the waitlist for <Text style={styles.bold}>{eventName || 'an event'}</Text>.</Text>;
            case 'waitlist-promotion':
                if (notification.recipient === currentUser._id) {
                    return <Text style={styles.messageText}>You're in! A spot opened up for <Text style={styles.bold}>{eventName || 'an event'}</Text>.</Text>;
                }
                return <Text style={styles.messageText}><Text style={styles.bold}>{senderName}</Text> was promoted to "in" for <Text style={styles.bold}>{eventName || 'an event'}</Text>.</Text>;
            default:
                return <Text style={styles.messageText}>You have a new notification.</Text>;
        }
    };

    const handlePress = () => {
        if (notification.group?._id) {
            router.push({
                pathname: '/(tabs)/groups',
                params: { openChatId: notification.group._id }
            });
        }
    };

    const icon = getIcon();

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
        refetch();
        markAsRead();
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
        return <View style={styles.center}><ActivityIndicator size="large" color="#4A90E2" /></View>;
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
                data={notifications as unknown as ExtendedNotification[]}
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