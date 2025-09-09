import { View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGetEvents } from '@/hooks/useGetEvents';
import { Event } from '@/utils/api';

const EventsScreen = () => {
    const { data: events, isLoading, isError } = useGetEvents();

    const formatDate = (dateString: string) => {
        // --- THIS IS THE FIX ---
        // We add timeZone: 'UTC' to the options. This tells the formatter
        // to ignore the user's local timezone and format the date as UTC.
        const options: Intl.DateTimeFormatOptions = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC', 
        };
        return new Date(dateString).toLocaleDateString(undefined, options);
    };

    const renderEventList = () => {
        if (isLoading) {
            return <ActivityIndicator size="large" color="#4f46e5" className="mt-8"/>;
        }

        if (isError) {
            return <Text className="text-center text-red-500 mt-4">Failed to load events.</Text>;
        }
        
        if (!events || events.length === 0) {
            return <Text className="text-center text-gray-500 mt-4">You have no upcoming events.</Text>
        }

        return events.map((event: Event) => (
            <TouchableOpacity
                key={event._id}
                className="bg-white p-5 my-2 rounded-lg shadow-sm border border-gray-200"
            >
                <Text className="text-lg font-semibold text-gray-800">{event.name}</Text>
                <Text className="text-base text-gray-600 mt-1">{formatDate(event.date)} at {event.time}</Text>
            </TouchableOpacity>
        ));
    };

    return (
        <SafeAreaView className='flex-1 bg-gray-50'>
            <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200 bg-white">
                <Text className="text-xl font-bold text-gray-900">Upcoming Events</Text>
            </View>

            <ScrollView className="px-4 mt-4">
                {renderEventList()}
            </ScrollView>
        </SafeAreaView>
    );
};

export default EventsScreen;