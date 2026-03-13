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
import { Meetup, User, useApiClient, userApi, meetupApi } from '@/utils/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRsvp } from '@/hooks/useRsvp';
import { useGetMeetups } from '@/hooks/useGetMeetups';
import { useRouter } from 'expo-router';
import TimePicker from './TimePicker';
import DateTimePicker, { DateTimePickerMeetup } from '@react-native-community/datetimepicker';

interface MeetupDetailModalProps {
  meetup: Meetup | null;
  onClose: () => void;
}

const MeetupDetailModal = ({ meetup: initialMeetup, onClose }: MeetupDetailModalProps) => {
    const api = useApiClient();
    const router = useRouter();
    const queryClient = useQueryClient();
    
    const [meetup, setMeetup] = useState<Meetup | null>(initialMeetup);
    const { data: allMeetups } = useGetMeetups();
    const [activeTab, setActiveTab] = useState<'in' | 'out' | 'waitlist'>('in');
    
    // --- Edit Mode State ---
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [newDate, setNewDate] = useState(new Date());
    const [tempDate, setTempDate] = useState(new Date()); // Use a temporary state for the iOS picker
    const [newTime, setNewTime] = useState('');
    const [newCapacity, setNewCapacity] = useState('');
    const [newLocation, setNewLocation] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        setMeetup(initialMeetup);
    }, [initialMeetup]);

    // Sync with global meetup list updates (e.g. from background refresh or other mutations)
    useEffect(() => {
        if (allMeetups && meetup) {
            const updated = allMeetups.find(e => e._id === meetup._id);
            if (updated) {
                setMeetup(updated);
            }
        }
    }, [allMeetups]);

    const { data: currentUser } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });

    const { mutate: rsvp, isPending: isRsvping } = useRsvp();

    // Map waitlist IDs to user objects to preserve order (0 is first in line)
    // Calculated early to be used in useEffect safely
    const waitlistUsers = (meetup?.waitlist || [])
        .map(id => (meetup?.members || []).find(m => m._id === id))
        .filter((u): u is User => !!u);

    // Reset tab if waitlist becomes empty while selected
    useEffect(() => {
        if (activeTab === 'waitlist' && waitlistUsers.length === 0) {
            setActiveTab('in');
        }
    }, [waitlistUsers.length, activeTab]);

    if (!meetup || !currentUser) return null;

    // --- Permissions Logic ---
    const isOwner = typeof meetup.group === 'object' ? meetup.group.owner === currentUser._id : false; 
    const groupData = meetup.group as any;
    const isMod = typeof meetup.group === 'object' && Array.isArray(groupData.moderators)
        ? groupData.moderators.some((m: any) => typeof m === 'string' ? m === currentUser._id : m._id === currentUser._id)
        : false;

    const canManage = isOwner || isMod;
    
    const isCancelled = meetup.status === 'cancelled';
    const isFull = meetup.capacity > 0 && (meetup.in?.length || 0) >= meetup.capacity;
    const isWaitlisted = meetup.waitlist?.includes(currentUser._id) || false;
    const isIn = meetup.in?.includes(currentUser._id) || false;

    // Filter users based on their status
    const goingUsers = (meetup.members || []).filter(m => meetup.in?.includes(m._id));
    const outUsers = (meetup.members || []).filter(m => meetup.out?.includes(m._id));


    const handleRsvpAction = (status: 'in' | 'out') => {
        rsvp({ meetupId: meetup._id, status }, {
            onSuccess: (data: any) => {
                queryClient.invalidateQueries({ queryKey: ['meetups'] });
                if (data.meetup) {
                    setMeetup(data.meetup);
                }
                if (data.message && data.message.toLowerCase().includes('waitlist')) {
                    Alert.alert("Waitlisted", "The meetup is full. You've been added to the waitlist queue.");
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
            params: { openChatId: meetup.group._id }
        });
    };

    const handleUpdateMeetupDetails = async () => {
        // Build a payload with only the changed fields
        const payload: {
            meetupId: string;
            date?: Date;
            time?: string;
            capacity?: number;
            location?: string;
        } = { meetupId: meetup._id };

        const capInt = parseInt(newCapacity, 10);
        
        // Check for changes
        if (newDate.toISOString().split('T')[0] !== new Date(meetup.date).toISOString().split('T')[0]) {
            payload.date = newDate;
        }
        if (newTime !== meetup.time) {
            payload.time = newTime;
        }
        if (newLocation !== (meetup.location || '')) {
            payload.location = newLocation;
        }
        if (!isNaN(capInt) && capInt !== meetup.capacity) {
            payload.capacity = capInt;
        }

        // If nothing changed, just close the modal
        if (Object.keys(payload).length <= 1) {
            setIsEditModalVisible(false);
            return;
        }
        
        setIsUpdating(true);
        try {
            const response = await meetupApi.updateMeetup(api, payload);
            
            await queryClient.invalidateQueries({ queryKey: ['meetups'] });
            await queryClient.invalidateQueries({ queryKey: ['meetupDetails', meetup._id] });
            if (response && response.meetup) {
                setMeetup(response.meetup);
            }
            setIsEditModalVisible(false);
            Alert.alert("Success", "Meeting details updated.");
        } catch (error: any) {
            Alert.alert("Update Failed", error.response?.data?.error || error.message);
        } finally {
            setIsUpdating(false);
        }
    };

    // --- Date Picker Handlers ---
    const onDateChange = (meetup: DateTimePickerMeetup, selectedDate?: Date) => {
        const currentDate = selectedDate || tempDate;
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
            setNewDate(currentDate); // On Android, the change is immediate
        } else {
            setTempDate(currentDate); // On iOS, update temp state as user spins the wheel
        }
    };

    const confirmIosDate = () => {
        setNewDate(tempDate); // Finalize the date selection from the temporary state
        setShowDatePicker(false);
    };

    const handleCancelMeetup = () => {
        const action = isCancelled ? "Reactivate" : "Cancel";
        Alert.alert(`${action} Meetup`, `Are you sure?`, [
            { text: "No", style: "cancel" },
            { 
                text: "Yes", 
                style: isCancelled ? "default" : "destructive", 
                onPress: async () => {
                    try {
                        await meetupApi.cancelMeetup(api, meetup._id);
                        queryClient.invalidateQueries({ queryKey: ['meetups'] });
                        if (!isCancelled) onClose(); 
                    } catch (e: any) {
                        Alert.alert("Error", e.response?.data?.error || e.message);
                    }
                }
            }
        ]);
    };

    const renderUserList = (users: User[], isWaitlist = false) => {
        if (users.length === 0) return <Text style={styles.emptyText}>No one in this list.</Text>;
        return users.map((user, index) => (
            <View key={user._id} style={styles.memberRow}>
                {isWaitlist && <Text style={styles.waitlistIndex}>{index + 1}</Text>}
                <Image source={{ uri: user.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${user.username?.[0]}` }} style={styles.avatar} />
                <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{user.firstName} {user.lastName}</Text>
                </View>
            </View>
        ));
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
                            setNewDate(new Date(meetup.date));
                            setTempDate(new Date(meetup.date)); // Initialize temp state for the picker
                            setNewTime(meetup.time);
                            setNewCapacity(meetup.capacity.toString());
                            setNewLocation(meetup.location || '');
                            setIsEditModalVisible(true);
                        }}
                        style={styles.editHeaderBtn}
                    >
                        <Feather name="edit-2" size={20} color="#4A90E2" />
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
                        <Text style={[styles.meetupTitle, isCancelled && styles.strikeThrough]}>
                            {meetup.name}
                        </Text>
                        {/* New Chat Button Link */}
                        <TouchableOpacity 
                            onPress={handleGoToChat}
                            style={styles.chatButton}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.chatButtonText}>Chat</Text>
                            <Feather name="arrow-right" size={14} color="#4FD1C5" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                    </View>
                    
                    <View style={styles.detailsCard}>
                        <View style={styles.detailItem}>
                            <Text style={styles.detailLabel}>Date & Time</Text>
                            <Text style={styles.detailValue}>
                                {new Date(meetup.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • {meetup.time}
                            </Text>
                        </View>
                        
                        <View style={styles.detailSeparator} />

                        <View style={styles.detailRow}>
                            <View style={[styles.detailItem, { flex: 1, marginRight: 16 }]}>
                                <Text style={styles.detailLabel}>Location</Text>
                                <Text style={styles.detailValue} numberOfLines={1}>{meetup.location || "No location set"}</Text>
                            </View>
                            
                            <View style={styles.detailItem}>
                                <Text style={styles.detailLabel}>Capacity</Text>
                                <Text style={[styles.detailValue, isFull && !isCancelled && { color: '#C2410C' }]}>
                                    {meetup.capacity === 0 ? "Unlimited" : `${meetup.in?.length || 0}/${meetup.capacity}`}
                                </Text>
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
                                isIn && { backgroundColor: '#4FD1C5', borderBottomColor: '#3FABA1' }
                            ]}
                        >
                            <Text style={[
                                styles.rsvpButtonText,
                                (!isIn && !isWaitlisted && !isFull) && { color: '#4FD1C5' }
                            ]}>
                                {isWaitlisted ? "Waitlisted" : (isFull && !isIn) ? "Join Waitlist" : "I'm In"}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={() => handleRsvpAction('out')}
                            disabled={isRsvping}
                            style={[styles.rsvpButton, styles.rsvpOut, meetup.out?.includes(currentUser._id) && { backgroundColor: '#FF7A6E', borderBottomColor: '#B91C1C' }]}
                        >
                            <Text style={[styles.rsvpButtonText, !meetup.out?.includes(currentUser._id) && { color: '#FF7A6E' }]}>I'm Out</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View style={{ marginBottom: 40 }}>
                    {/* Tabs */}
                    <View style={styles.tabContainer}>
                        <TouchableOpacity 
                            onPress={() => setActiveTab('in')} 
                            style={[styles.tabItem, activeTab === 'in' && { borderBottomColor: '#4FD1C5' }]}
                        >
                            <Text style={[styles.tabText, activeTab === 'in' && { color: '#4FD1C5' }]}>In ({goingUsers.length})</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            onPress={() => setActiveTab('out')} 
                            style={[styles.tabItem, activeTab === 'out' && { borderBottomColor: '#FF7A6E' }]}
                        >
                            <Text style={[styles.tabText, activeTab === 'out' && { color: '#FF7A6E' }]}>Out ({outUsers.length})</Text>
                        </TouchableOpacity>

                        {waitlistUsers.length > 0 && (
                            <TouchableOpacity 
                                onPress={() => setActiveTab('waitlist')} 
                                style={[styles.tabItem, activeTab === 'waitlist' && { borderBottomColor: '#2563EB' }]}
                            >
                                <Text style={[styles.tabText, activeTab === 'waitlist' && { color: '#2563EB' }]}>Waitlist ({waitlistUsers.length})</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* List Content */}
                    <View style={styles.listContainer}>
                        {activeTab === 'in' && renderUserList(goingUsers)}
                        {activeTab === 'out' && renderUserList(outUsers)}
                        {activeTab === 'waitlist' && renderUserList(waitlistUsers, true)}
                    </View>
                </View>

                {canManage && (
                    <View style={styles.ownerSection}>
                        <TouchableOpacity onPress={handleCancelMeetup} style={[styles.cancelToggle, isCancelled && { backgroundColor: '#4A90E2', borderColor: '#4A90E2' }]}>
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
                                <TouchableOpacity onPress={handleUpdateMeetupDetails} disabled={isUpdating}>
                                    {isUpdating ? <ActivityIndicator size="small" color="#4A90E2" /> : <Text style={styles.saveBtnText}>Save</Text>}
                                </TouchableOpacity>
                            </View>
                            
                            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                                <Text style={styles.fieldLabel}>Date</Text>
                                <TouchableOpacity style={styles.dateInput} onPress={() => setShowDatePicker(true)}>
                                    <Feather name="calendar" size={18} color="#4A90E2" />
                                    <Text style={styles.dateInputText}>
                                        {newDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                    </Text>
                                </TouchableOpacity>

                                <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Time</Text>
                                <TimePicker onTimeChange={setNewTime} initialValue={newTime} />

                                <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Location Override</Text>
                                <View style={styles.inputContainer}>
                                    <Feather name="map-pin" size={18} color="#4A90E2" />
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
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* --- THIS IS THE NEW MODAL FOR THE DATE PICKER --- */}
            {showDatePicker && (
                Platform.OS === 'ios' ? (
                    <Modal
                        animationType="slide"
                        transparent={true}
                        visible={showDatePicker}
                        onRequestClose={() => setShowDatePicker(false)}
                    >
                        <View style={styles.datePickerOverlay}>
                            <View style={styles.datePickerContent}>
                                <DateTimePicker
                                    value={tempDate}
                                    mode="date"
                                    display="spinner"
                                    onChange={onDateChange}
                                    textColor='black'
                                />
                                <TouchableOpacity onPress={confirmIosDate} style={styles.doneButton}>
                                    <Text style={styles.doneButtonText}>Done</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Modal>
                ) : (
                    <DateTimePicker
                        value={newDate} // Android picker can use the final state directly
                        mode="date"
                        display="default"
                        onChange={onDateChange}
                    />
                )
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    closeButton: { padding: 4 },
    headerTitleContainer: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 14, fontWeight: '900', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 },
    editHeaderBtn: { padding: 8, backgroundColor: '#EEF2FF', borderRadius: 10, borderWidth: 1, borderColor: '#C7D2FE' },
    content: { flex: 1, padding: 24 },
    cancelBanner: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#FEE2E2' },
    cancelBannerText: { color: '#B91C1C', fontWeight: '800', marginLeft: 8, fontSize: 12, textTransform: 'uppercase' },
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    meetupTitle: { fontSize: 28, fontWeight: '900', color: '#111827', letterSpacing: -1, lineHeight: 32, flex: 1 },
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
        color: '#4A90E2', 
        fontWeight: 'bold', 
        fontSize: 14 
    },
    strikeThrough: { textDecorationLine: 'line-through', color: '#D1D5DB' },
    detailsCard: { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#F3F4F6' },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
    detailItem: {},
    detailLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 0 },
    detailValue: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
    detailSeparator: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 12 },
    rsvpRow: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 60},
    rsvpButton: { flex: 1, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4 },
    rsvpIn: { backgroundColor: '#F3F4F6', borderBottomColor: '#D1D5DB' },
    rsvpOut: { backgroundColor: '#F3F4F6', borderBottomColor: '#D1D5DB' },
    rsvpButtonText: { color: 'white', fontWeight: '900', fontSize: 14, textTransform: 'uppercase' },
    // Tabs
    tabContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', marginBottom: 16 },
    tabItem: { flex: 1, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent', alignItems: 'center' },
    tabText: { fontSize: 16, fontWeight: 'bold', color: '#9CA3AF' },
    listContainer: { minHeight: 50 },
    waitlistIndex: { fontSize: 16, fontWeight: 'bold', color: '#9CA3AF', marginRight: 12, width: 24, textAlign: 'center' },
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
    saveBtnText: { color: '#4A90E2', fontWeight: '900', fontSize: 16 },
    modalBody: { paddingBottom: 60 },
    fieldLabel: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#E5E7EB' },
    textInput: { flex: 1, marginLeft: 12, fontSize: 16, color: '#374151' },
    capInput: { backgroundColor: '#F9FAFB', height: 64, borderRadius: 14, textAlign: 'center', fontSize: 24, fontWeight: '900', color: '#111827', borderWidth: 1, borderColor: '#E5E7EB' },
    dateInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#E5E7EB' },
    dateInputText: { marginLeft: 12, fontSize: 16, color: '#374151', fontWeight: '600' },
    datePickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    datePickerContent: { backgroundColor: 'white', borderTopRightRadius: 20, borderTopLeftRadius: 20, padding: 16 },
    doneButton: { backgroundColor: '#4A90E2', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
    doneButtonText: { color: 'white', fontSize: 18, fontWeight: '600' },
});

export default MeetupDetailModal;