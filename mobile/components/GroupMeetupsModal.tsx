import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Meetup, User, useApiClient, userApi } from '@/utils/api';
import { useGetMeetups } from '@/hooks/useGetMeetups';
import MeetupDetailModal from '@/components/MeetupDetailModal';
import { MeetupCard } from '@/components/MeetupCard';
import { DayHeader, splitByDay } from '@/components/MeetupDayGroups';

interface GroupMeetupsModalProps {
    visible: boolean;
    onClose: () => void;
    groupId: string;
}

const GroupMeetupsModal = ({ visible, onClose, groupId }: GroupMeetupsModalProps) => {
    const api = useApiClient();
    const { data: allMeetups, isLoading } = useGetMeetups();
    const { data: currentUser } = useQuery<User, Error>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
    const [selectedMeetup, setSelectedMeetup] = useState<Meetup | null>(null);

    useEffect(() => {
        if (!visible) setSelectedMeetup(null);
    }, [visible]);

    const upcomingMeetups = useMemo(() => {
        if (!allMeetups) return [];
        const now = new Date();
        return allMeetups
            .filter(m => m.group._id === groupId && m.status === 'scheduled' && new Date(m.date) >= now)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [allMeetups, groupId]);

    const dayGroups = useMemo(() => splitByDay(upcomingMeetups), [upcomingMeetups]);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={selectedMeetup ? () => setSelectedMeetup(null) : onClose}
        >
            {selectedMeetup ? (
                <MeetupDetailModal meetup={selectedMeetup} onClose={() => setSelectedMeetup(null)} />
            ) : (
                // pageSheet is iOS-only; Android renders fullscreen and needs safe-area insets manually
                <SafeAreaView style={styles.modalContent} edges={['top', 'bottom']}>
                    <View style={styles.modalHeader}>
                        <View style={{ width: 24 }} />
                        <Text style={styles.modalHeaderTitle}>Upcoming Meetups</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Feather name="x" size={24} color="#374151" />
                        </TouchableOpacity>
                    </View>

                    {isLoading ? (
                        <ActivityIndicator color="#4A90E2" style={{ marginTop: 40 }} />
                    ) : upcomingMeetups.length === 0 ? (
                        <Text style={styles.emptyText}>No upcoming meetups.</Text>
                    ) : (
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {dayGroups.map(day => (
                                <View key={day.key}>
                                    <DayHeader label={day.label} />
                                    {day.items.map(meetup => (
                                        <MeetupCard
                                            key={meetup._id}
                                            meetup={meetup}
                                            onPress={() => setSelectedMeetup(meetup)}
                                            showRsvpButtons={false}
                                            onRsvp={() => {}}
                                            isRsvping={false}
                                            currentUser={currentUser}
                                        />
                                    ))}
                                </View>
                            ))}
                        </ScrollView>
                    )}
                </SafeAreaView>
            )}
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContent: { flex: 1, backgroundColor: 'white', paddingTop: 24, paddingHorizontal: 16 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 8 },
    modalHeaderTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 15 },
});

export default GroupMeetupsModal;
