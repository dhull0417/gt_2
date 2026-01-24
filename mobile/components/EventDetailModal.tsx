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
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Event, User, useApiClient, userApi, eventApi } from '@/utils/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRsvp } from '@/hooks/useRsvp';
import { useRouter } from 'expo-router';

interface EventDetailModalProps {
  event: Event | null;
  onClose: () => void;
}

const EventDetailModal = ({ event: initialEvent, onClose }: EventDetailModalProps) => {
    const api = useApiClient();
    const router = useRouter();
    const queryClient = useQueryClient();
    
    const [event, setEvent] = useState<Event | null>(initialEvent);
    
    // --- Edit Mode State ---
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [newCapacity, setNewCapacity] = useState('');
    const [newLocation, setNewLocation] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        setEvent(initialEvent);
    }, [initialEvent]);

    const { data: currentUser } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });

    const { mutate: rsvp, isPending: isRsvping } = useRsvp();

    if (!event || !currentUser) return null;

    // --- Permissions Logic ---
    const isOwner = typeof event.group === 'object' ? event.group.owner === currentUser._id : false; 
    const groupData = event.group as any;
    const isMod = typeof event.group === 'object' && Array.isArray(groupData.moderators)
        ? groupData.moderators.some((m: any) => typeof m === 'string' ? m === currentUser._id : m._id === currentUser._id)
        : false;

    const canManage = isOwner || isMod;
    
    const isCancelled = event.status === 'cancelled';
    const isFull = event.capacity > 0 && (event.in?.length || 0) >= event.capacity;
    const isWaitlisted = event.waitlist?.includes(currentUser._id) || false;
    const isIn = event.in?.includes(currentUser._id) || false;

    const goingUsers = (event.members || []).filter(m => event.in?.includes(m._id));

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

    /**
     * Navigates to the group chat
     */
    const handleGoToChat = () => {
        onClose(); // Close the modal first
        // Navigate to groups tab and pass the specific group ID to open
        router.push({
            pathname: '/(tabs)/groups',
            params: { openChatId: event.group._id }
        });
    };

    const handleUpdateEventDetails = async () => {
        const capInt = parseInt(newCapacity);
        if (isNaN(capInt) || capInt < 0) {
            Alert.alert("Invalid Input", "Please enter a valid capacity (0 for unlimited).");
            return;
        }

        setIsUpdating(true);
        try {
            await eventApi.updateEvent(api, { 
                eventId: event._id, 
                capacity: capInt,
                location: newLocation,
                date: new Date(event.date),
                time: event.time,
                timezone: event.timezone
            });
            
            await queryClient.invalidateQueries({ queryKey: ['events'] });
            setIsEditModalVisible(false);
            Alert.alert("Success", "Meeting details updated.");
        } catch (error: any) {
            Alert.alert("Update Failed", error.response?.data?.error || error.message);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleCancelEvent = () => {
        const action = isCancelled ? "Reactivate" : "Cancel";
        Alert.alert(`${action} Event`, `Are you sure?`, [
            { text: "No", style: "cancel" },
            { 
                text: "Yes", 
                style: isCancelled ? "default" : "destructive", 
                onPress: async () => {
                    try {
                        await eventApi.cancelEvent(api, event._id);
                        queryClient.invalidateQueries({ queryKey: ['events'] });
                        if (!isCancelled) onClose(); 
                    } catch (e: any) {
                        Alert.alert("Error", e.response?.data?.error || e.message);
                    }
                }
            }
        ]);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Feather name="chevron-down" size={32} color="#9CA3AF" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>Meeting Details</Text>
                </View>
                {canManage && !isCancelled ? (
                    <TouchableOpacity 
                        onPress={() => {
                            setNewCapacity(event.capacity.toString());
                            setNewLocation(event.location || '');
                            setIsEditModalVisible(true);
                        }}
                        style={styles.editHeaderBtn}
                    >
                        <Feather name="edit-2" size={20} color="#4F46E5" />
                    </TouchableOpacity>
                ) : <View style={{ width: 44 }} />}
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <View style={{ marginBottom: 32 }}>
                    {isCancelled && (
                        <View style={styles.cancelBanner}>
                            <Feather name="alert-triangle" size={18} color="#B91C1C" />
                            <Text style={styles.cancelBannerText}>Meeting Cancelled</Text>
                        </View>
                    )}
                    
                    <View style={styles.titleRow}>
                        <Text style={[styles.eventTitle, isCancelled && styles.strikeThrough]}>
                            {event.name}
                        </Text>
                        {/* New Chat Button Link */}
                        <TouchableOpacity 
                            onPress={handleGoToChat}
                            style={styles.chatButton}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.chatButtonText}>Chat</Text>
                            <Feather name="arrow-right" size={14} color="#4F46E5" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                    </View>
                    
                    <View style={styles.infoSection}>
                        <View style={styles.infoRow}>
                            <View style={styles.iconBox}><Feather name="calendar" size={18} color="#4F46E5" /></View>
                            <View style={styles.infoTextContainer}>
                                <Text style={styles.infoValue}>
                                    {new Date(event.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                                </Text>
                                <Text style={styles.infoLabel}>Date</Text>
                            </View>
                        </View>

                        <View style={styles.infoRow}>
                            <View style={styles.iconBox}><Feather name="clock" size={18} color="#4F46E5" /></View>
                            <View style={styles.infoTextContainer}>
                                <Text style={styles.infoValue}>{event.time}</Text>
                                <Text style={styles.infoLabel}>Time</Text>
                            </View>
                        </View>

                        <View style={styles.infoRow}>
                            <View style={styles.iconBox}><Feather name="map-pin" size={18} color="#4F46E5" /></View>
                            <View style={styles.infoTextContainer}>
                                <Text style={styles.infoValue} numberOfLines={1}>{event.location || "No location set"}</Text>
                                <Text style={styles.infoLabel}>Location</Text>
                            </View>
                        </View>
                        
                        <View style={styles.capacityCard}>
                            <View style={styles.infoRowCompact}>
                                <View style={[styles.iconBox, { backgroundColor: isFull && !isCancelled ? '#FFF7ED' : '#F5F7FF' }]}>
                                    <Feather name="users" size={18} color={isFull && !isCancelled ? "#EA580C" : "#4F46E5"} />
                                </View>
                                <View style={styles.infoTextContainer}>
                                    <Text style={[styles.infoValue, isFull && !isCancelled && { color: '#C2410C' }]}>
                                        {event.capacity === 0 ? "Unlimited" : `${event.in?.length || 0} / ${event.capacity}`}
                                    </Text>
                                    <Text style={styles.infoLabel}>Max Capacity</Text>
                                </View>
                            </View>
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
                                styles.rsvpButton, styles.rsvpIn,
                                isWaitlisted && { backgroundColor: '#2563EB', borderBottomColor: '#1E40AF' },
                                (isFull && !isIn) && { backgroundColor: '#F97316', borderBottomColor: '#C2410C' },
                                isIn && { backgroundColor: '#10B981', borderBottomColor: '#059669' }
                            ]}
                        >
                            <Text style={styles.rsvpButtonText}>
                                {isWaitlisted ? "Waitlisted" : (isFull && !isIn) ? "Join Waitlist" : "Going"}
                            </Text>
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

                <View style={{ marginBottom: 40 }}>
                    <Text style={styles.sectionTitle}>Going ({event.in?.length || 0})</Text>
                    {goingUsers.length > 0 ? goingUsers.map(user => (
                        <View key={user._id} style={styles.memberRow}>
                            <Image source={{ uri: user.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${user.username?.[0]}` }} style={styles.avatar} />
                            <View style={styles.memberInfo}>
                                <Text style={styles.memberName}>{user.firstName} {user.lastName}</Text>
                                <Text style={styles.memberUsername}>@{user.username}</Text>
                            </View>
                        </View>
                    )) : <Text style={styles.emptyText}>No one confirmed yet.</Text>}
                </View>

                {canManage && (
                    <View style={styles.ownerSection}>
                        <TouchableOpacity onPress={handleCancelEvent} style={[styles.cancelToggle, isCancelled && { backgroundColor: '#4F46E5', borderColor: '#4F46E5' }]}>
                            <Text style={[styles.cancelToggleText, isCancelled && { color: 'white' }]}>
                                {isCancelled ? "Reactivate Meeting" : "Cancel This Meeting"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>

            {/* Combined Edit Details Modal */}
            <Modal transparent visible={isEditModalVisible} animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeaderInner}>
                                <TouchableOpacity onPress={() => setIsEditModalVisible(false)}><Feather name="x" size={24} color="#9CA3AF" /></TouchableOpacity>
                                <Text style={styles.modalTitleInner}>Edit Meeting</Text>
                                <TouchableOpacity onPress={handleUpdateEventDetails} disabled={isUpdating}>
                                    {isUpdating ? <ActivityIndicator size="small" color="#4F46E5" /> : <Text style={styles.saveBtnText}>Save</Text>}
                                </TouchableOpacity>
                            </View>
                            
                            <View style={styles.modalBody}>
                                <Text style={styles.fieldLabel}>Location Override</Text>
                                <View style={styles.inputContainer}>
                                    <Feather name="map-pin" size={18} color="#4F46E5" />
                                    <TextInput 
                                        style={styles.textInput}
                                        placeholder="Specific address or link..."
                                        value={newLocation}
                                        onChangeText={setNewLocation}
                                    />
                                </View>

                                <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Attendee Limit (0 = Unlimited)</Text>
                                <TextInput
                                    style={styles.capInput}
                                    keyboardType="numeric"
                                    value={newCapacity}
                                    onChangeText={setNewCapacity}
                                />
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    closeButton: { padding: 4 },
    headerTitleContainer: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 14, fontWeight: '900', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 },
    editHeaderBtn: { padding: 8, backgroundColor: '#EEF2FF', borderRadius: 10 },
    content: { flex: 1, padding: 24 },
    cancelBanner: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#FEE2E2' },
    cancelBannerText: { color: '#B91C1C', fontWeight: '800', marginLeft: 8, fontSize: 12, textTransform: 'uppercase' },
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    eventTitle: { fontSize: 28, fontWeight: '900', color: '#111827', letterSpacing: -1, lineHeight: 32, flex: 1 },
    // Chat Button Styling
    chatButton: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#EEF2FF', 
        paddingHorizontal: 12, 
        paddingVertical: 6, 
        borderRadius: 8, 
        borderWidth: 1, 
        borderColor: '#C7D2FE',
        marginLeft: 12,
        marginTop: 2
    },
    chatButtonText: { 
        color: '#4F46E5', 
        fontWeight: 'bold', 
        fontSize: 14 
    },
    strikeThrough: { textDecorationLine: 'line-through', color: '#D1D5DB' },
    infoSection: { gap: 16 },
    infoRow: { flexDirection: 'row', alignItems: 'center' },
    infoRowCompact: { flexDirection: 'row', alignItems: 'center' },
    iconBox: { width: 40, height: 40, backgroundColor: '#F5F7FF', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    infoTextContainer: { marginLeft: 16, flex: 1 },
    infoValue: { fontSize: 16, fontWeight: '800', color: '#1F2937' },
    infoLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase' },
    capacityCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F9FAFB', padding: 4, paddingRight: 16, borderRadius: 16 },
    rsvpRow: { flexDirection: 'row', gap: 12, marginVertical: 32 },
    rsvpButton: { flex: 1, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4 },
    rsvpIn: { backgroundColor: '#F3F4F6', borderBottomColor: '#D1D5DB' },
    rsvpOut: { backgroundColor: '#F3F4F6', borderBottomColor: '#D1D5DB' },
    rsvpButtonText: { color: 'white', fontWeight: '900', fontSize: 14, textTransform: 'uppercase' },
    sectionTitle: { fontSize: 18, fontWeight: '900', color: '#111827', marginBottom: 16 },
    memberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F3F4F6' },
    memberInfo: { marginLeft: 12 },
    memberName: { fontSize: 15, fontWeight: '800', color: '#1F2937' },
    memberUsername: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
    emptyText: { color: '#9CA3AF', fontStyle: 'italic' },
    ownerSection: { marginTop: 40, paddingBottom: 60, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 24 },
    cancelToggle: { height: 50, borderRadius: 14, borderWidth: 2, borderColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    cancelToggleText: { color: '#EF4444', fontWeight: '900', textTransform: 'uppercase', fontSize: 12 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 60 },
    modalHeaderInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalTitleInner: { fontSize: 18, fontWeight: '900', color: '#111827' },
    saveBtnText: { color: '#4F46E5', fontWeight: '900', fontSize: 16 },
    modalBody: { gap: 8 },
    fieldLabel: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#E5E7EB' },
    textInput: { flex: 1, marginLeft: 12, fontSize: 16, color: '#374151' },
    capInput: { backgroundColor: '#F9FAFB', height: 64, borderRadius: 14, textAlign: 'center', fontSize: 24, fontWeight: '900', color: '#111827', borderWidth: 1, borderColor: '#E5E7EB' },
});

export default EventDetailModal;