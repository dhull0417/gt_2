import React, { useState, useEffect } from 'react';
import { 
    View, 
    Text, 
    TouchableOpacity, 
    ScrollView, 
    Image, 
    Alert, 
    ActivityIndicator,
    TextInput,
    Modal,
    StyleSheet,
    TextStyle,
    ViewStyle,
    ImageStyle
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Event, User, useApiClient, userApi, eventApi } from '@/utils/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRsvp } from '@/hooks/useRsvp';

/**
 * PROJECT 2 & 3: EVENT MANAGEMENT & MODERATOR PERMISSIONS
 * Allowing both owners and assigned moderators to manage specific 
 * event instances (capacity, cancellation, etc.)
 */

interface EventDetailModalProps {
  event: Event | null;
  onClose: () => void;
}

const EventDetailModal = ({ event: initialEvent, onClose }: EventDetailModalProps) => {
    const api = useApiClient();
    const queryClient = useQueryClient();
    
    // Internal state to track local updates before a full refetch
    const [event, setEvent] = useState<Event | null>(initialEvent);
    const [isCapModalVisible, setIsCapModalVisible] = useState(false);
    const [newCapacity, setNewCapacity] = useState('');
    const [isUpdatingCap, setIsUpdatingCap] = useState(false);

    // Sync state if the prop changes
    useEffect(() => {
        setEvent(initialEvent);
    }, [initialEvent]);

    const { data: currentUser } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });

    const { mutate: rsvp, isPending: isRsvping } = useRsvp();

    if (!event || !currentUser) return null;

    // --- Logic Helpers ---
    
    // Check if user is the group owner
    const isOwner = typeof event.group === 'object' 
        ? event.group.owner === currentUser._id 
        : false; 

    // FIXED: Added type casting to resolve 'moderators' property missing on Event.group type
    const groupData = event.group as any;
    const isMod = typeof event.group === 'object' && Array.isArray(groupData.moderators)
        ? groupData.moderators.some((m: any) => 
            typeof m === 'string' ? m === currentUser._id : m._id === currentUser._id
          )
        : false;

    // New permission constant for UI visibility
    const canManage = isOwner || isMod;
    
    const isCancelled = event.status === 'cancelled';
    const isFull = event.capacity > 0 && (event.in?.length || 0) >= event.capacity;
    const isWaitlisted = event.waitlist?.includes(currentUser._id) || false;
    const isIn = event.in?.includes(currentUser._id) || false;

    const goingUsers = (event.members || []).filter(m => event.in?.includes(m._id));
    const waitlistedUsers = (event.members || []).filter(m => event.waitlist?.includes(m._id));

    const handleRsvpAction = (status: 'in' | 'out') => {
        rsvp({ eventId: event._id, status }, {
            onSuccess: (data: any) => {
                queryClient.invalidateQueries({ queryKey: ['events'] });
                if (data.message && data.message.toLowerCase().includes('waitlist')) {
                    Alert.alert("Waitlisted", "The event is full. You've been added to the waitlist queue.");
                }
            }
        });
    };

    const handleUpdateEventCapacity = async () => {
        const capInt = parseInt(newCapacity);
        if (isNaN(capInt) || capInt < 0 || capInt > 1000000) {
            Alert.alert("Invalid Input", "Please enter a number between 0 and 1,000,000 (0 for unlimited).");
            return;
        }

        setIsUpdatingCap(true);
        try {
            await eventApi.updateEvent(api, { 
                eventId: event._id, 
                capacity: capInt,
                date: new Date(event.date),
                time: event.time,
                timezone: event.timezone
            });
            
            await queryClient.invalidateQueries({ queryKey: ['events'] });
            
            setIsCapModalVisible(false);
            setNewCapacity('');
            Alert.alert("Success", "Event capacity updated.");
        } catch (error: any) {
            const serverMessage = error.response?.data?.error || error.message;
            Alert.alert("Update Failed", `Reason: ${serverMessage}`);
        } finally {
            setIsUpdatingCap(false);
        }
    };

    const handleCancelEvent = () => {
        const action = isCancelled ? "Reactivate" : "Cancel";
        Alert.alert(`${action} Event`, `Are you sure you want to ${action.toLowerCase()} this meeting?`, [
            { text: "No", style: "cancel" },
            { 
                text: `Yes, ${action}`, 
                style: isCancelled ? "default" : "destructive", 
                onPress: async () => {
                    try {
                        await eventApi.cancelEvent(api, event._id);
                        queryClient.invalidateQueries({ queryKey: ['events'] });
                        if (!isCancelled) onClose(); 
                    } catch (e: any) {
                        const serverMessage = e.response?.data?.error || e.message;
                        Alert.alert("Error", `Could not ${action.toLowerCase()} event: ${serverMessage}`);
                    }
                }
            }
        ]);
    };

    return (
        <View style={styles.container}>
            {/* Header / Safe Handle Bar */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Feather name="chevron-down" size={32} color="#9CA3AF" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>Meeting Details</Text>
                </View>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <View style={{ marginBottom: 32 }}>
                    {isCancelled && (
                        <View style={styles.cancelBanner}>
                            <Feather name="alert-triangle" size={18} color="#B91C1C" />
                            <Text style={styles.cancelBannerText}>Meeting Cancelled</Text>
                        </View>
                    )}
                    
                    <Text style={[styles.eventTitle, isCancelled && styles.strikeThrough]}>
                        {event.name}
                    </Text>
                    
                    <View style={styles.infoSection}>
                        <View style={styles.infoRow}>
                            <View style={styles.iconBox}>
                                <Feather name="calendar" size={18} color="#4F46E5" />
                            </View>
                            <View style={styles.infoTextContainer}>
                                <Text style={styles.infoValue}>
                                    {new Date(event.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                                </Text>
                                <Text style={styles.infoLabel}>Date</Text>
                            </View>
                        </View>

                        <View style={styles.infoRow}>
                            <View style={styles.iconBox}>
                                <Feather name="clock" size={18} color="#4F46E5" />
                            </View>
                            <View style={styles.infoTextContainer}>
                                <Text style={styles.infoValue}>{event.time}</Text>
                                <Text style={styles.infoLabel}>Time</Text>
                            </View>
                        </View>
                        
                        {/* Max Capacity Section */}
                        <View style={styles.capacityCard}>
                            <View style={styles.infoRowCompact}>
                                <View 
                                    style={[
                                        styles.iconBox, 
                                        { backgroundColor: isFull && !isCancelled ? '#FFF7ED' : '#F5F7FF' }
                                    ]}
                                >
                                    <Feather name="users" size={18} color={isFull && !isCancelled ? "#EA580C" : "#4F46E5"} />
                                </View>
                                <View style={styles.infoTextContainer}>
                                    <Text style={[styles.infoValue, isFull && !isCancelled && { color: '#C2410C' }]}>
                                        {event.capacity === 0 ? "Unlimited" : `${event.in?.length || 0} / ${event.capacity}`}
                                    </Text>
                                    <Text style={styles.infoLabel}>Max Capacity</Text>
                                </View>
                            </View>
                            {/* FIXED: Using canManage instead of isOwner */}
                            {canManage && !isCancelled && (
                                <TouchableOpacity 
                                    onPress={() => {
                                        setNewCapacity(event.capacity.toString());
                                        setIsCapModalVisible(true);
                                    }}
                                    style={styles.adjustButton}
                                >
                                    <Feather name="settings" size={18} color="#4F46E5" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>

                {/* RSVP Actions */}
                {!isCancelled && (
                    <View style={styles.rsvpRow}>
                        <TouchableOpacity 
                            onPress={() => handleRsvpAction('in')}
                            disabled={isRsvping}
                            style={[
                                styles.rsvpButton,
                                styles.rsvpIn,
                                isWaitlisted && { backgroundColor: '#2563EB', borderBottomColor: '#1E40AF' },
                                (isFull && !isIn) && { backgroundColor: '#F97316', borderBottomColor: '#C2410C' },
                                isIn && { backgroundColor: '#10B981', borderBottomColor: '#059669' }
                            ]}
                        >
                            {isRsvping ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.rsvpButtonText}>
                                    {isWaitlisted ? "Waitlisted" : (isFull && !isIn) ? "Join Waitlist" : "Going"}
                                </Text>
                            )}
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            onPress={() => handleRsvpAction('out')}
                            disabled={isRsvping}
                            style={[styles.rsvpButton, styles.rsvpOut, event.out?.includes(currentUser._id) && { backgroundColor: '#EF4444', borderBottomColor: '#B91C1C' }]}
                        >
                            <Text style={[styles.rsvpButtonText, !event.out?.includes(currentUser._id) && { color: '#6B7280' }]}>I'm Out</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Attendee Lists */}
                <View style={{ marginBottom: 40 }}>
                    <Text style={styles.sectionTitle}>Going ({event.in?.length || 0})</Text>
                    {goingUsers.length > 0 ? goingUsers.map(user => (
                        <View key={user._id} style={styles.memberRow}>
                            <Image 
                                source={{ uri: user.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${user.username?.[0]}` }} 
                                style={styles.avatar}
                            />
                            <View style={styles.memberInfo}>
                                <Text style={styles.memberName}>{user.firstName} {user.lastName}</Text>
                                <Text style={styles.memberUsername}>@{user.username}</Text>
                            </View>
                        </View>
                    )) : (
                        <Text style={styles.emptyText}>No one confirmed yet.</Text>
                    )}

                    {event.waitlist && event.waitlist.length > 0 && (
                        <View style={{ marginTop: 32 }}>
                            <Text style={[styles.sectionTitle, { color: '#EA580C' }]}>Waitlist ({event.waitlist.length})</Text>
                            {waitlistedUsers.map((user, index) => (
                                <View key={user._id} style={[styles.memberRow, { opacity: 0.7 }]}>
                                    <View style={styles.waitlistBadge}>
                                        <Text style={styles.waitlistBadgeText}>{index + 1}</Text>
                                    </View>
                                    <Image 
                                        source={{ uri: user.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${user.username?.[0]}` }} 
                                        style={styles.avatarSmall}
                                    />
                                    <View style={styles.memberInfo}>
                                        <Text style={styles.memberName}>{user.firstName}</Text>
                                        <Text style={[styles.memberUsername, { color: '#F97316' }]}>In Queue</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* Management Specific Actions */}
                {/* FIXED: Using canManage instead of isOwner */}
                {canManage && (
                    <View style={styles.ownerSection}>
                        <TouchableOpacity 
                            onPress={handleCancelEvent}
                            style={[styles.cancelToggle, isCancelled && { backgroundColor: '#4F46E5', borderColor: '#4F46E5' }]}
                        >
                            <Text style={[styles.cancelToggleText, isCancelled && { color: 'white' }]}>
                                {isCancelled ? "Reactivate Meeting" : "Cancel This Meeting"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>

            {/* Capacity Adjustment Modal */}
            <Modal transparent visible={isCapModalVisible} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Adjust Capacity</Text>
                            <Text style={styles.modalSub}>Only affects this specific meeting.</Text>
                        </View>
                        <View style={styles.modalBody}>
                            <TextInput
                                style={styles.capInput}
                                keyboardType="numeric"
                                placeholder="0 = Unlimited"
                                value={newCapacity}
                                onChangeText={setNewCapacity}
                                autoFocus
                            />
                            <View style={styles.modalActions}>
                                <TouchableOpacity 
                                    onPress={() => setIsCapModalVisible(false)}
                                    style={[styles.modalBtn, styles.modalBtnSecondary]}
                                >
                                    <Text style={styles.modalBtnTextSec}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    onPress={handleUpdateEventCapacity}
                                    disabled={isUpdatingCap}
                                    style={[styles.modalBtn, styles.modalBtnPrimary]}
                                >
                                    {isUpdatingCap ? <ActivityIndicator color="white" /> : <Text style={styles.modalBtnTextPri}>Save</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

// Styles remain identical to previous version
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    closeButton: { padding: 4 },
    headerTitleContainer: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 14, fontWeight: '900', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 },
    content: { flex: 1, padding: 24 },
    cancelBanner: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#FEE2E2' },
    cancelBannerText: { color: '#B91C1C', fontWeight: '800', marginLeft: 8, fontSize: 12, textTransform: 'uppercase' },
    eventTitle: { fontSize: 36, fontWeight: '900', color: '#111827', letterSpacing: -1, lineHeight: 40, marginBottom: 24 },
    strikeThrough: { textDecorationLine: 'line-through', color: '#D1D5DB' },
    infoSection: { gap: 20 },
    infoRow: { flexDirection: 'row', alignItems: 'center' },
    infoRowCompact: { flexDirection: 'row', alignItems: 'center' },
    iconBox: { width: 44, height: 44, backgroundColor: '#F5F7FF', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    infoTextContainer: { marginLeft: 16 },
    infoValue: { fontSize: 18, fontWeight: '800', color: '#1F2937' },
    infoLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
    capacityCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F9FAFB', padding: 4, paddingRight: 16, borderRadius: 20 },
    adjustButton: { width: 40, height: 40, backgroundColor: 'white', borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    rsvpRow: { flexDirection: 'row', gap: 12, marginBottom: 40 },
    rsvpButton: { flex: 1, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4 },
    rsvpIn: { backgroundColor: '#F3F4F6', borderBottomColor: '#D1D5DB' },
    rsvpOut: { backgroundColor: '#F3F4F6', borderBottomColor: '#D1D5DB' },
    rsvpButtonText: { color: 'white', fontWeight: '900', fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5 },
    sectionTitle: { fontSize: 20, fontWeight: '900', color: '#111827', marginBottom: 16, letterSpacing: -0.5 },
    memberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#F3F4F6', borderWidth: 2, borderColor: 'white' },
    avatarSmall: { width: 40, height: 40, borderRadius: 16, backgroundColor: '#F3F4F6', borderWidth: 2, borderColor: 'white' },
    memberInfo: { marginLeft: 12 },
    memberName: { fontSize: 16, fontWeight: '800', color: '#1F2937' },
    memberUsername: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
    waitlistBadge: { width: 24, height: 24, backgroundColor: '#FFEDD5', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    waitlistBadgeText: { color: '#EA580C', fontSize: 12, fontWeight: '900' },
    emptyText: { color: '#9CA3AF', fontStyle: 'italic', fontWeight: '500' },
    ownerSection: { marginTop: 40, paddingBottom: 60, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 32 },
    cancelToggle: { height: 56, borderRadius: 16, borderWidth: 2, borderColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    cancelToggleText: { color: '#EF4444', fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, fontSize: 13 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalContent: { backgroundColor: 'white', width: '100%', borderRadius: 32, overflow: 'hidden' },
    modalHeader: { backgroundColor: '#4F46E5', padding: 32, alignItems: 'center' },
    modalTitle: { color: 'white', fontSize: 24, fontWeight: '900' },
    modalSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4, fontWeight: '600' },
    modalBody: { padding: 32 },
    capInput: { backgroundColor: '#F9FAFB', height: 80, borderRadius: 20, textAlign: 'center', fontSize: 32, fontWeight: '900', color: '#111827' },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
    modalBtn: { flex: 1, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    modalBtnSecondary: { backgroundColor: '#F3F4F6' },
    modalBtnPrimary: { backgroundColor: '#4F46E5' },
    modalBtnTextSec: { color: '#6B7280', fontWeight: '800', textTransform: 'uppercase' },
    modalBtnTextPri: { color: 'white', fontWeight: '800', textTransform: 'uppercase' },
});

export default EventDetailModal;