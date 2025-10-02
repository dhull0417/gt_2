import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useRsvp } from '@/hooks/useRsvp';
import { useDeleteEvent } from '@/hooks/useDeleteEvent';
import { useRemoveScheduledDay } from '@/hooks/useRemoveScheduledDay';
import { Event, User, useApiClient, userApi, GroupDetails, groupApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';
import { DateTime } from 'luxon';

interface EventDetailModalProps {
    event: Event | null;
    onClose: () => void;
}

const EventDetailModal: React.FC<EventDetailModalProps> = ({ event, onClose }) => {
    const insets = useSafeAreaInsets();
    const api = useApiClient();
    const queryClient = useQueryClient();
    const { mutate: rsvp, isPending: isRsvping } = useRsvp();
    const { mutate: deleteEvent, isPending: isDeletingEvent } = useDeleteEvent();
    const { mutate: removeScheduledDay, isPending: isRemovingDay } = useRemoveScheduledDay();
    const { data: currentUser } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });

    if (!event) return null;

    const formatDate = (dateString: string, timezone: string) => {
        const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone };
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

    const handleRsvp = (status: 'in' | 'out') => {
        if (!currentUser) return;
        rsvp({ eventId: event._id, status }, {
            onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: ['events'] });
            }
        });
    };

    const getRsvpStatus = (userId: string) => {
        if (event.in.includes(userId)) return 'in';
        if (event.out.includes(userId)) return 'out';
        return 'undecided';
    };
    
    const handleDeleteThisEvent = () => {
        const confirmationMessage = event.isOverride 
            ? "Are you sure you want to delete this one-off event?"
            : "Are you sure you want to delete this single event? A new one will be generated for the next occurrence.";
        
        Alert.alert("Delete This Event?", confirmationMessage, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => {
                deleteEvent({ eventId: event._id }, {
                    onSuccess: () => {
                        if (!event.isOverride) {
                            Alert.alert("Success", "The next occurrence for this event has been created.");
                        }
                        onClose();
                    }
                });
            }},
        ]);
    };

    const handleRemoveThisDay = async () => {
        try {
            const group: GroupDetails = await queryClient.fetchQuery({
                queryKey: ['groupDetails', event.group._id],
                queryFn: () => groupApi.getGroupDetails(api, event.group._id),
            });

            if (!group.schedule) return;

            const eventDate = DateTime.fromISO(event.date, { zone: event.timezone });
            const dayToRemove = group.schedule.frequency === 'weekly' 
                ? eventDate.weekday === 7 ? 0 : eventDate.weekday
                : eventDate.day;

            const dayDescription = group.schedule.frequency === 'weekly' 
                ? eventDate.toFormat('EEEE') 
                : `the ${eventDate.toFormat('do')}`;
            
            Alert.alert(`Delete all future ${dayDescription}s?`, `This will permanently remove this day from the group's recurring schedule.`, [
                { text: "Cancel", style: "cancel" },
                { text: "Confirm", style: "destructive", onPress: () => {
                    removeScheduledDay({ groupId: event.group._id, day: dayToRemove, frequency: group.schedule.frequency }, {
                        onSuccess: () => onClose()
                    });
                }},
            ]);
        } catch (error) {
            Alert.alert("Error", "Could not fetch group details to update schedule.");
        }
    };

    return (
        <View className="flex-1 bg-white">
            <View className="flex-row items-center justify-between px-4" style={{ paddingTop: insets.top + 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                <View className="flex-row items-center">
                    <TouchableOpacity onPress={onClose} className="mr-4">
                        <Feather name="arrow-left" size={24} color="#4f46e5" />
                    </TouchableOpacity>
                    <Text className="text-xl font-bold text-gray-900">{event.name}</Text>
                </View>
                {currentUser && event.group.owner === currentUser._id && (
                    <Link href={{ pathname: `/event-edit/${event._id}` as any }} asChild>
                        <TouchableOpacity>
                            <Feather name="edit-2" size={22} color="#4f46e5" />
                        </TouchableOpacity>
                    </Link>
                )}
            </View>
            <View className="p-6">
                <Text className="text-base text-gray-600">{formatDate(event.date, event.timezone)}</Text>
                <Text className="text-base text-gray-600 mb-6">at {event.time} {getTimezoneAbbreviation(event.date, event.timezone)}</Text>
                <Text className="text-lg text-gray-800 font-semibold mb-2">Are you going?</Text>
                <View className="flex-row space-x-4 mb-8">
                    <TouchableOpacity onPress={() => handleRsvp('in')} disabled={isRsvping || getRsvpStatus(currentUser?._id || '') === 'in'} className="flex-1 py-4 bg-green-500 rounded-lg items-center justify-center shadow">
                        <Text className="text-white font-bold text-lg">I'm In</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleRsvp('out')} disabled={isRsvping || getRsvpStatus(currentUser?._id || '') === 'out'} className="flex-1 py-4 bg-red-500 rounded-lg items-center justify-center shadow">
                        <Text className="text-white font-bold text-lg">I'm Out</Text>
                    </TouchableOpacity>
                </View>
            </View>
            <ScrollView className="flex-1 px-6 bg-gray-50" contentContainerStyle={{ paddingBottom: 40 }}>
                <Text className="text-lg text-gray-800 font-semibold mb-2 pt-6">Guest List</Text>
                {event.members.map(member => {
                    const status = getRsvpStatus(member._id);
                    return (
                        <View key={member._id} className="flex-row items-center justify-between bg-white p-3 rounded-lg mb-2 shadow-sm">
                            <View className="flex-row items-center">
                                <Image source={{ uri: member.profilePicture || 'https://placehold.co/100x100/EEE/31343C?text=?' }} className="w-10 h-10 rounded-full mr-4"/>
                                <Text className="text-base text-gray-700">{member.firstName} {member.lastName}</Text>
                            </View>
                            {status === 'in' && <Feather name="check-circle" size={24} color="green" />}
                            {status === 'out' && <Feather name="x-circle" size={24} color="red" />}
                        </View>
                    )
                })}
                {currentUser && event.group.owner === currentUser._id && (
                    <View className="mt-8 pt-4 border-t border-gray-200 space-y-4">
                        <Text className="text-base font-semibold text-gray-600 text-center">Owner Actions</Text>
                        {event.isOverride ? (
                            <TouchableOpacity onPress={handleDeleteThisEvent} disabled={isDeletingEvent} className={`py-4 rounded-lg items-center shadow ${isDeletingEvent ? 'bg-red-300' : 'bg-red-600'}`}>
                                {isDeletingEvent ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">Delete One-Off Event</Text>}
                            </TouchableOpacity>
                        ) : (
                            <>
                                <TouchableOpacity onPress={handleDeleteThisEvent} disabled={isDeletingEvent} className={`py-4 rounded-lg items-center shadow ${isDeletingEvent ? 'bg-yellow-600' : 'bg-yellow-500'}`}>
                                    {isDeletingEvent ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">Delete This Event Only</Text>}
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleRemoveThisDay} disabled={isRemovingDay} className={`py-4 rounded-lg items-center shadow ${isRemovingDay ? 'bg-red-300' : 'bg-red-600'}`}>
                                    {isRemovingDay ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">Delete All Occurrences on this Day</Text>}
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

export default EventDetailModal;