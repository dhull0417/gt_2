import { View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Image, Alert } from 'react-native';
import React, { useState, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useFocusEffect } from 'expo-router';
import { useGetEvents } from '@/hooks/useGetEvents';
import { Event, User, useApiClient, userApi } from '@/utils/api';
import { DateTime } from 'luxon';
import EventDetailModal from '@/components/EventDetailModal';

type GroupedEvents = {
    'Within 3 days': Event[];
    'Within 1 week': Event[];
    'Within 2 weeks': Event[];
    'Future': Event[];
};

const EventsScreen = () => {
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const { data: events, isLoading, isError, refetch } = useGetEvents();

    useFocusEffect(
        useCallback(() => { refetch(); }, [refetch])
    );
    
    const groupedEvents = useMemo(() => {
        const groups: GroupedEvents = {
            'Within 3 days': [],
            'Within 1 week': [],
            'Within 2 weeks': [],
            'Future': [],
        };
        if (!events) return groups;
        const today = DateTime.now().startOf('day');
        events.forEach(event => {
            const eventDate = DateTime.fromISO(event.date);
            const diffInDays = eventDate.diff(today, 'days').days;
            if (diffInDays <= 3) {
                groups['Within 3 days'].push(event);
            } else if (diffInDays <= 7) {
                groups['Within 1 week'].push(event);
            } else if (diffInDays <= 14) {
                groups['Within 2 weeks'].push(event);
            } else {
                groups['Future'].push(event);
            }
        });
        return groups;
    }, [events]);

    const formatDate = (dateString: string, timezone: string) => {
        const options: Intl.DateTimeFormatOptions = {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
            timeZone: timezone,
        };
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
        } catch (e) {
            return timezone.split('/').pop()?.replace('_', ' ') || '';
        }
    };

    const handleOpenModal = (event: Event) => { setSelectedEvent(event); setIsModalVisible(true); };
    const handleCloseModal = () => { setIsModalVisible(false); setSelectedEvent(null); };

    return (
        <SafeAreaView className='flex-1 bg-gray-50'>
            <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200 bg-white">
                <Text className="text-xl font-bold text-gray-900">Upcoming Events</Text>
            </View>
            <ScrollView className="px-4 mt-4" contentContainerStyle={{ paddingBottom: 20 }}>
                {isLoading && <ActivityIndicator size="large" color="#4f46e5" className="mt-8"/>}
                {isError && <Text className="text-center text-red-500 mt-4">Failed to load events.</Text>}
                {!isLoading && events?.length === 0 && <Text className="text-center text-gray-500 mt-4">You have no upcoming events.</Text>}
                
                {!isLoading && Object.entries(groupedEvents).map(([groupTitle, groupEvents]) => {
                    if (groupEvents.length === 0) return null;
                    return (
                        <View key={groupTitle}>
                            <Text className="text-lg font-bold text-gray-700 mt-4 mb-2 px-2">{groupTitle}</Text>
                            {groupEvents.map((event: Event) => (
                                <TouchableOpacity
                                    key={event._id}
                                    onPress={() => handleOpenModal(event)}
                                    className="bg-white p-5 my-2 rounded-lg shadow-sm border border-gray-200"
                                >
                                    <Text className="text-lg font-semibold text-gray-800">{event.name}</Text>
                                    <Text className="text-base text-gray-600 mt-1">
                                        {formatDate(event.date, event.timezone)} at {event.time} {getTimezoneAbbreviation(event.date, event.timezone)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    );
                })}
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

export default EventsScreen;