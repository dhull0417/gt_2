import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGetEvents } from '@/hooks/useGetEvents';
import { useRsvp } from '@/hooks/useRsvp'; // 1. Import the RSVP hook
import { Event, User, useApiClient, userApi } from '@/utils/api';
import { useFocusEffect } from 'expo-router';
import EventDetailModal from '@/components/EventDetailModal';

// --- MODIFIED: EventCard now handles RSVP buttons ---
const EventCard = ({ 
    event, 
    onPress, 
    showRsvpButtons, 
    onRsvp, 
    isRsvping 
}: { 
    event: Event; 
    onPress: () => void;
    showRsvpButtons: boolean;
    onRsvp: (status: 'in' | 'out') => void;
    isRsvping: boolean;
}) => {
    const formatDate = (dateString: string, timezone: string) => {
        const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone };
        return new Date(dateString).toLocaleDateString(undefined, options);
    };

    const getTimezoneAbbreviation = (dateString: string, timezone: string) => {
        try {
            const options: Intl.DateTimeFormatOptions = { timeZone: timezone, timeZoneName: 'shortGeneric' };
            const date = new Date(dateString);
            const formatter = new Intl.DateTimeFormat('en-US', options);
            const parts = formatter.formatToParts(date);
            const tzPart = parts.find(part => part.type === 'timeZoneName');
            return tzPart ? tzPart.value : '';
        } catch (e) { return timezone.split('/').pop()?.replace('_', ' ') || ''; }
    };

    return (
        <View className="bg-white p-5 my-2 rounded-lg shadow-sm border border-gray-200">
            <TouchableOpacity onPress={onPress}>
                <Text className="text-xl font-bold text-gray-800">{event.name}</Text>
                <Text className="text-base text-gray-600 mt-1">{formatDate(event.date, event.timezone)}</Text>
                <Text className="text-base text-gray-600">{event.time} {getTimezoneAbbreviation(event.date, event.timezone)}</Text>
            </TouchableOpacity>

            {/* Conditionally render RSVP buttons */}
            {showRsvpButtons && (
                <View className="flex-row space-x-4 mt-4 pt-4 border-t border-gray-100">
                    <TouchableOpacity 
                        onPress={() => onRsvp('in')}
                        disabled={isRsvping}
                        className="flex-1 py-3 bg-green-500 rounded-lg items-center justify-center shadow"
                    >
                        <Text className="text-white font-bold text-base">I'm In</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => onRsvp('out')}
                        disabled={isRsvping}
                        className="flex-1 py-3 bg-red-500 rounded-lg items-center justify-center shadow"
                    >
                        <Text className="text-white font-bold text-base">I'm Out</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
};

const DashboardScreen = () => {
    const api = useApiClient();
    const queryClient = useQueryClient();
    const { data: events, isLoading, isError, refetch } = useGetEvents();
    const { data: currentUser } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });

    // 2. Instantiate the RSVP hook
    const { mutate: rsvp, isPending: isRsvping } = useRsvp();

    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [isModalVisible, setIsModalVisible] = useState(false);

    useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

    const { nextUndecidedEvent, nextOverallEvents } = useMemo(() => {
        if (!events || !currentUser) {
            return { nextUndecidedEvent: null, nextOverallEvents: [] };
        }
        const nextUndecided = events.find(event => event.undecided.includes(currentUser._id));
        const nextOverall = events.slice(0, 3);
        return { nextUndecidedEvent: nextUndecided, nextOverallEvents: nextOverall };
    }, [events, currentUser]);
    
    const handleOpenModal = (event: Event) => {
        setSelectedEvent(event);
        setIsModalVisible(true);
    };
    const handleCloseModal = () => {
        setIsModalVisible(false);
        setSelectedEvent(null);
    };

    // 3. Create the RSVP handler function
    const handleDashboardRsvp = (eventId: string, status: 'in' | 'out') => {
        if (!currentUser) return;
        rsvp({ eventId, status }, {
            onSuccess: () => {
                // Invalidate the events query to automatically refresh the dashboard
                queryClient.invalidateQueries({ queryKey: ['events'] });
            }
        });
    };

    return (
        <SafeAreaView className='flex-1 bg-gray-100'>
            <View className="flex-row justify-center items-center px-4 py-3 border-b border-gray-200 bg-white">
                <Text className="text-xl font-bold text-gray-900">Dashboard</Text>
            </View>

            <ScrollView className="p-4">
                {isLoading ? (
                    <ActivityIndicator size="large" color="#4f46e5" className="mt-16" />
                ) : isError ? (
                    <Text className="text-center text-red-500 mt-8">Failed to load events.</Text>
                ) : (
                    <>
                        <View className="mb-8">
                            <Text className="text-3xl font-bold text-gray-800 px-2 mb-2">You coming?</Text>
                            {nextUndecidedEvent ? (
                                <EventCard 
                                    event={nextUndecidedEvent} 
                                    onPress={() => handleOpenModal(nextUndecidedEvent)}
                                    showRsvpButtons={true}
                                    onRsvp={(status) => handleDashboardRsvp(nextUndecidedEvent._id, status)}
                                    isRsvping={isRsvping}
                                />
                            ) : (
                                <View className="bg-white p-5 my-2 rounded-lg items-center">
                                    <Text className="text-base text-gray-500">You're all caught up! No pending RSVPs.</Text>
                                </View>
                            )}
                        </View>

                        <View>
                            <Text className="text-3xl font-bold text-gray-800 px-2 mb-2">Up Next</Text>
                            {nextOverallEvents && nextOverallEvents.length > 0 ? (
                                nextOverallEvents.map(event => (
                                    <EventCard 
                                        key={event._id} 
                                        event={event} 
                                        onPress={() => handleOpenModal(event)}
                                        showRsvpButtons={false}
                                        onRsvp={() => {}}
                                        isRsvping={false}
                                    />
                                ))
                            ) : (
                                <View className="bg-white p-5 my-2 rounded-lg items-center">
                                    <Text className="text-base text-gray-500">No upcoming events.</Text>
                                </View>
                            )}
                        </View>
                    </>
                )}
            </ScrollView>
            <Modal
                visible={isModalVisible}
                animationType="slide"
                onRequestClose={handleCloseModal}
            >
                <EventDetailModal event={selectedEvent} onClose={handleCloseModal} />
            </Modal>
        </SafeAreaView>
    );
};

export default DashboardScreen;