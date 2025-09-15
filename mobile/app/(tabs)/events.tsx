import { View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Image } from 'react-native';
import React, { useState } from 'react';
// 1. Import useSafeAreaInsets
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGetEvents } from '@/hooks/useGetEvents';
import { useRsvp } from '@/hooks/useRsvp';
import { Event, User, useApiClient, userApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';

const EventsScreen = () => {
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [isModalVisible, setIsModalVisible] = useState(false);

    // 2. Get the inset values
    const insets = useSafeAreaInsets();

    const api = useApiClient();
    const queryClient = useQueryClient();
    const { data: events, isLoading, isError } = useGetEvents();
    const { mutate: rsvp, isPending: isRsvping } = useRsvp();
    
    const { data: currentUser } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });

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

    const handleOpenModal = (event: Event) => {
        setSelectedEvent(event);
        setIsModalVisible(true);
    };
    
    const handleCloseModal = () => setIsModalVisible(false);

    const handleRsvp = (status: 'in' | 'out') => {
        if (!selectedEvent || !currentUser) return;
        
        rsvp({ eventId: selectedEvent._id, status }, {
            onSuccess: () => {
                queryClient.setQueryData(['events'], (oldData: Event[] | undefined) => {
                    if (!oldData) return [];
                    return oldData.map(event => {
                        if (event._id === selectedEvent._id) {
                            const newEvent = { ...event };
                            const userId = currentUser._id;
                            newEvent.in = newEvent.in.filter(id => id !== userId);
                            newEvent.out = newEvent.out.filter(id => id !== userId);
                            newEvent.undecided = newEvent.undecided.filter(id => id !== userId);
                            if (status === 'in') newEvent.in.push(userId);
                            if (status === 'out') newEvent.out.push(userId);
                            setSelectedEvent(newEvent);
                            return newEvent;
                        }
                        return event;
                    });
                });
            }
        });
    };

    const getRsvpStatus = (userId: string) => {
        if (selectedEvent?.in.includes(userId)) return 'in';
        if (selectedEvent?.out.includes(userId)) return 'out';
        return 'undecided';
    };

    return (
        <SafeAreaView className='flex-1 bg-gray-50'>
            <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200 bg-white">
                <Text className="text-xl font-bold text-gray-900">Upcoming Events</Text>
            </View>

            <ScrollView className="px-4 mt-4">
                {isLoading && <ActivityIndicator size="large" color="#4f46e5" className="mt-8"/>}
                {isError && <Text className="text-center text-red-500 mt-4">Failed to load events.</Text>}
                {!isLoading && events?.length === 0 && <Text className="text-center text-gray-500 mt-4">You have no upcoming events.</Text>}

                {events?.map((event) => (
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
            </ScrollView>

            <Modal visible={isModalVisible} animationType="slide" onRequestClose={handleCloseModal}>
                {selectedEvent && (
                    // 3. Use a regular View as the main container
                    <View className="flex-1 bg-white">
                        {/* 4. Manually apply the top padding to the header View */}
                        <View 
                            className="flex-row items-center px-4 py-3 border-b border-gray-200"
                            style={{ paddingTop: insets.top + 12, paddingBottom: 12 }}
                        >
                            <TouchableOpacity onPress={handleCloseModal} className="mr-4">
                                <Feather name="arrow-left" size={24} color="#4f46e5" />
                            </TouchableOpacity>
                            <Text className="text-xl font-bold text-gray-900">{selectedEvent.name}</Text>
                        </View>
                        
                        <View className="p-6">
                            <Text className="text-base text-gray-600">{formatDate(selectedEvent.date, selectedEvent.timezone)}</Text>
                            <Text className="text-base text-gray-600 mb-6">
                                at {selectedEvent.time} {getTimezoneAbbreviation(selectedEvent.date, selectedEvent.timezone)}
                            </Text>

                            <Text className="text-lg text-gray-800 font-semibold mb-2">Are you going?</Text>
                            <View className="flex-row space-x-4 mb-8">
                                <TouchableOpacity 
                                    onPress={() => handleRsvp('in')}
                                    disabled={isRsvping || getRsvpStatus(currentUser?._id || '') === 'in'}
                                    className="flex-1 py-4 bg-green-500 rounded-lg items-center justify-center shadow"
                                >
                                    <Text className="text-white font-bold text-lg">I'm In</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    onPress={() => handleRsvp('out')}
                                    disabled={isRsvping || getRsvpStatus(currentUser?._id || '') === 'out'}
                                    className="flex-1 py-4 bg-red-500 rounded-lg items-center justify-center shadow"
                                >
                                    <Text className="text-white font-bold text-lg">I'm Out</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        
                        <ScrollView className="flex-1 px-6 bg-gray-50">
                             <Text className="text-lg text-gray-800 font-semibold mb-2 pt-6">Guest List</Text>
                            {selectedEvent.members.map(member => {
                                const status = getRsvpStatus(member._id);
                                return (
                                    <View key={member._id} className="flex-row items-center justify-between bg-white p-3 rounded-lg mb-2 shadow-sm">
                                        <View className="flex-row items-center">
                                            <Image 
                                                source={{ uri: member.profilePicture || 'https://placehold.co/100x100/EEE/31343C?text=?' }} 
                                                className="w-10 h-10 rounded-full mr-4"
                                            />
                                            <Text className="text-base text-gray-700">{member.firstName} {member.lastName}</Text>
                                        </View>
                                        {status === 'in' && <Feather name="check-circle" size={24} color="green" />}
                                        {status === 'out' && <Feather name="x-circle" size={24} color="red" />}
                                    </View>
                                )
                            })}
                        </ScrollView>
                    </View>
                )}
            </Modal>
        </SafeAreaView>
    );
};

export default EventsScreen;