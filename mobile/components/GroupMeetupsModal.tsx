import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Meetup, User, useApiClient, userApi } from '@/utils/api';
import { useGetMeetups } from '@/hooks/useGetMeetups';
import MeetupDetailModal from '@/components/MeetupDetailModal';
import { MeetupCard } from '@/components/MeetupCard';
import { DayHeader, splitByDay } from '@/components/MeetupDayGroups';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { DateTime } from 'luxon';

interface GroupMeetupsModalProps {
    visible: boolean;
    onClose: () => void;
    groupId: string;
}

const GroupMeetupsModal = ({ visible, onClose, groupId }: GroupMeetupsModalProps) => {
    const colors = useThemeColors();
    const api = useApiClient();
    const { data: allMeetups, isLoading } = useGetMeetups();
    const { data: currentUser } = useQuery<User, Error>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
    const [selectedMeetup, setSelectedMeetup] = useState<Meetup | null>(null);
    const [showCancelled, setShowCancelled] = useState(false);
    const { data: groupDetails } = useGetGroupDetails(visible ? groupId : null);

    // Owners and moderators can also see cancelled meetups here, so one can be restored.
    const canManage = useMemo(() => {
        if (!groupDetails || !currentUser) return false;
        const g = groupDetails as any;
        const idOf = (u: any) => u?._id || u;
        return idOf(g.owner) === currentUser._id || (g.moderators ?? []).some((m: any) => idOf(m) === currentUser._id);
    }, [groupDetails, currentUser]);

    useEffect(() => {
        if (!visible) setSelectedMeetup(null);
    }, [visible]);

    const cancelledCount = useMemo(() => {
        if (!allMeetups) return 0;
        const now = new Date();
        return allMeetups.filter(m => m.group._id === groupId && m.status === 'cancelled' && new Date(m.date) >= now).length;
    }, [allMeetups, groupId]);

    const upcomingMeetups = useMemo(() => {
        if (!allMeetups) return [];
        const now = new Date();
        const wanted = (m: Meetup) => m.status === 'scheduled' || (showCancelled && canManage && m.status === 'cancelled');
        return allMeetups
            .filter(m => m.group._id === groupId && wanted(m) && new Date(m.date) >= now)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [allMeetups, groupId, showCancelled, canManage]);

    const dayGroups = useMemo(() => splitByDay(upcomingMeetups), [upcomingMeetups]);

    // Fully unmounted (not just visible={false}) between opens — on Android, leaving this
    // Modal permanently mounted and only toggling `visible` causes the native Dialog to
    // stop re-presenting after the first reopen or two.
    if (!visible) return null;

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
                <SafeAreaView style={[styles.modalContent, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
                    <View style={styles.modalHeader}>
                        <View style={{ width: 24 }} />
                        <Text style={[styles.modalHeaderTitle, { color: colors.textPrimary }]}>Upcoming Meetups</Text>
                        <PressableOpacity accessibilityLabel="Close" onPress={onClose}>
                            <Feather name="x" size={24} color={colors.textSecondary} />
                        </PressableOpacity>
                    </View>

                    {isLoading ? (
                        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
                    ) : upcomingMeetups.length === 0 ? (
                        <Text style={[styles.emptyText, { color: colors.textFaint }]}>No upcoming meetups.</Text>
                    ) : null}
                    {canManage && cancelledCount > 0 && (
                        <PressableOpacity onPress={() => setShowCancelled(v => !v)} style={styles.cancelledToggle}>
                            <Feather name={showCancelled ? 'eye-off' : 'eye'} size={14} color={colors.textMuted} />
                            <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 13, marginLeft: 6 }}>
                                {showCancelled ? 'Hide cancelled' : `Show ${cancelledCount} cancelled`}
                            </Text>
                        </PressableOpacity>
                    )}
                    {isLoading || upcomingMeetups.length === 0 ? null : (
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {dayGroups.map((day, i) => (
                                <View key={day.key}>
                                    {(i === 0 || day.key.slice(0, 7) !== dayGroups[i - 1].key.slice(0, 7)) && (
                                        <Text style={[styles.monthHeader, { color: colors.brand, borderBottomColor: colors.border }]}>
                                            {DateTime.fromISO(day.key).toFormat('LLLL yyyy')}
                                        </Text>
                                    )}
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
    monthHeader: { fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, paddingHorizontal: 8, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
    cancelledToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
    emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 15 },
});

export default GroupMeetupsModal;
