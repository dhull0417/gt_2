import React from 'react';
import { 
    View, 
    Text, 
    TouchableOpacity, 
    ScrollView, 
    Image, 
    Alert, 
    ActivityIndicator 
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Event, User, useApiClient, userApi } from '@/utils/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRsvp } from '@/hooks/useRsvp';

interface EventDetailModalProps {
  event: Event | null;
  onClose: () => void;
}

const EventDetailModal = ({ event, onClose }: EventDetailModalProps) => {
    const api = useApiClient();
    const queryClient = useQueryClient();
    
    // Fetch current user to determine RSVP status and ownership
    const { data: currentUser } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });

    const { mutate: rsvp, isPending: isRsvping } = useRsvp();

    if (!event || !currentUser) return null;

    // --- Logic Helpers ---
    const isOwner = typeof event.group === 'object' 
        ? event.group.owner === currentUser._id 
        : false; 
    
    const isCancelled = event.status === 'cancelled';
    const isFull = event.capacity > 0 && event.in.length >= event.capacity;
    const isWaitlisted = event.waitlist.includes(currentUser._id);
    const isIn = event.in.includes(currentUser._id);

    // Map user objects for the "Going" and "Waitlist" sections
    const goingUsers = event.members.filter(m => event.in.includes(m._id));
    const waitlistedUsers = event.members.filter(m => event.waitlist.includes(m._id));

    const handleRsvpAction = (status: 'in' | 'out') => {
        rsvp({ eventId: event._id, status }, {
            onSuccess: (data: any) => {
                queryClient.invalidateQueries({ queryKey: ['events'] });
                // Check if the server response indicates a waitlist placement
                if (data.message && data.message.toLowerCase().includes('waitlist')) {
                    Alert.alert("Waitlisted", "The event is full. You've been added to the waitlist queue.");
                }
            }
        });
    };

    const handleCancelEvent = () => {
        Alert.alert("Cancel Event", "Are you sure? This event will remain visible but be marked as cancelled.", [
            { text: "No", style: "cancel" },
            { 
                text: "Yes, Cancel", 
                style: "destructive", 
                onPress: async () => {
                    try {
                        await api.patch(`/api/events/${event._id}/cancel`);
                        queryClient.invalidateQueries({ queryKey: ['events'] });
                        onClose();
                    } catch (e) {
                        Alert.alert("Error", "Could not cancel event.");
                    }
                }
            }
        ]);
    };

    return (
        <View className="flex-1 bg-white">
            {/* Header / Handle Bar */}
            <View className="flex-row items-center px-4 py-4 border-b border-gray-100">
                <TouchableOpacity onPress={onClose} className="p-1">
                    <Feather name="chevron-down" size={28} color="#4B5563" />
                </TouchableOpacity>
                <Text className="flex-1 text-center text-lg font-bold text-gray-900">Meeting Details</Text>
                <View className="w-10" />
            </View>

            <ScrollView className="p-6">
                <View className="mb-6">
                    {/* Cancellation Alert */}
                    {isCancelled && (
                        <View className="bg-red-50 border border-red-100 p-4 rounded-2xl mb-6 flex-row items-center justify-center">
                            <Feather name="alert-triangle" size={18} color="#B91C1C" />
                            <Text className="text-red-700 font-bold ml-2 uppercase tracking-wide">Meeting Cancelled</Text>
                        </View>
                    )}
                    
                    <Text className={`text-3xl font-black ${isCancelled ? 'text-gray-300 line-through' : 'text-gray-900'}`}>
                        {event.name}
                    </Text>
                    
                    <View className="mt-5 space-y-3">
                        <View className="flex-row items-center">
                            <View className="bg-indigo-50 p-2 rounded-lg">
                                <Feather name="calendar" size={16} color="#4F46E5" />
                            </View>
                            <Text className="ml-3 text-gray-600 font-semibold text-base">
                                {new Date(event.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                            </Text>
                        </View>

                        <View className="flex-row items-center">
                            <View className="bg-indigo-50 p-2 rounded-lg">
                                <Feather name="clock" size={16} color="#4F46E5" />
                            </View>
                            <Text className="ml-3 text-gray-600 font-semibold text-base">{event.time}</Text>
                        </View>
                        
                        {/* Capacity Counter */}
                        {event.capacity > 0 && (
                            <View className="flex-row items-center">
                                <View className={`p-2 rounded-lg ${isFull ? 'bg-orange-50' : 'bg-green-50'}`}>
                                    <Feather name="users" size={16} color={isFull ? "#EA580C" : "#16A34A"} />
                                </View>
                                <View className="ml-3">
                                    <Text className={`font-bold ${isFull ? 'text-orange-700' : 'text-green-700'}`}>
                                        Capacity: {event.in.length} / {event.capacity} {isFull ? '(FULL)' : ''}
                                    </Text>
                                    {isFull && !isIn && !isWaitlisted && (
                                        <Text className="text-[10px] text-orange-500 font-bold uppercase">Next spot: Waitlist</Text>
                                    )}
                                </View>
                            </View>
                        )}
                    </View>
                </View>

                {/* RSVP Actions */}
                {!isCancelled && (
                    <View className="flex-row space-x-4 mb-10">
                        <TouchableOpacity 
                            onPress={() => handleRsvpAction('in')}
                            disabled={isRsvping}
                            className={`flex-1 py-4 rounded-2xl items-center shadow-sm border-b-4 ${
                                isWaitlisted ? 'bg-blue-600 border-blue-800' : 
                                isIn ? 'bg-green-600 border-green-800' :
                                isFull ? 'bg-orange-500 border-orange-700' : 
                                'bg-white border-gray-200'
                            }`}
                        >
                            {isRsvping ? (
                                <ActivityIndicator color={isIn || isWaitlisted || isFull ? "white" : "#4F46E5"} />
                            ) : (
                                <Text className={`font-black text-lg ${isIn || isWaitlisted || isFull ? 'text-white' : 'text-gray-700'}`}>
                                    {isWaitlisted ? "Waitlisted" : isIn ? "Going" : isFull ? "Join Waitlist" : "I'm In"}
                                </Text>
                            )}
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            onPress={() => handleRsvpAction('out')}
                            disabled={isRsvping}
                            className={`flex-1 py-4 rounded-2xl items-center shadow-sm border-b-4 ${event.out.includes(currentUser._id) ? 'bg-red-600 border-red-800' : 'bg-gray-100 border-gray-300'}`}
                        >
                            <Text className={`font-black text-lg ${event.out.includes(currentUser._id) ? 'text-white' : 'text-gray-600'}`}>I'm Out</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Attendee Lists */}
                <View className="mb-8">
                    <Text className="text-xl font-black text-gray-800 mb-4 px-1 tracking-tight">Going ({event.in.length})</Text>
                    {goingUsers.length > 0 ? goingUsers.map(user => (
                        <View key={user._id} className="flex-row items-center mb-4 bg-gray-50/50 p-2 rounded-2xl">
                            <Image 
                                source={{ uri: user.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${user.username?.[0]}` }} 
                                className="w-12 h-12 rounded-2xl bg-gray-200 border-2 border-white shadow-sm"
                            />
                            <View className="ml-3">
                                <Text className="font-bold text-gray-800 text-base">{user.firstName} {user.lastName}</Text>
                                <Text className="text-xs text-gray-400 font-bold uppercase tracking-wider">@{user.username}</Text>
                            </View>
                        </View>
                    )) : (
                        <Text className="text-gray-400 italic px-2">No one confirmed yet.</Text>
                    )}

                    {/* Waitlist Section */}
                    {event.waitlist.length > 0 && (
                        <View className="mt-8">
                            <View className="flex-row items-center mb-4 px-1">
                                <Text className="text-xl font-black text-orange-600 tracking-tight">Waitlist</Text>
                                <View className="ml-2 bg-orange-100 px-2 py-0.5 rounded-full">
                                    <Text className="text-orange-700 text-xs font-bold">{event.waitlist.length}</Text>
                                </View>
                            </View>
                            {waitlistedUsers.map((user, index) => (
                                <View key={user._id} className="flex-row items-center mb-3 opacity-80 bg-orange-50/30 p-2 rounded-2xl border border-orange-100">
                                    <View className="w-6 h-6 bg-orange-100 rounded-full items-center justify-center mr-3">
                                        <Text className="text-orange-700 text-[10px] font-black">{index + 1}</Text>
                                    </View>
                                    <Image 
                                        source={{ uri: user.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${user.username?.[0]}` }} 
                                        className="w-10 h-10 rounded-xl bg-gray-200"
                                    />
                                    <View className="ml-3">
                                        <Text className="font-bold text-gray-700">{user.firstName} {user.lastName}</Text>
                                        <Text className="text-[10px] text-orange-500 font-black uppercase">In Queue</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* Owner Specific Actions */}
                {isOwner && (
                    <View className="mt-12 mb-10 pt-8 border-t border-gray-100">
                        <TouchableOpacity 
                            onPress={handleCancelEvent}
                            className={`py-4 rounded-2xl items-center border-2 ${isCancelled ? 'bg-indigo-600 border-indigo-600' : 'border-red-100 bg-red-50/20'}`}
                            activeOpacity={0.7}
                        >
                            <Text className={`font-black uppercase tracking-widest text-sm ${isCancelled ? 'text-white' : 'text-red-500'}`}>
                                {isCancelled ? "Reactivate Meeting" : "Cancel This Meeting"}
                            </Text>
                        </TouchableOpacity>
                        <Text className="text-[10px] text-gray-400 text-center mt-3 px-4 font-medium leading-relaxed">
                            {isCancelled 
                                ? "Reactivating will allow members to RSVP again." 
                                : "Cancelling keeps the event visible on the schedule but strikes it out and disables RSVPs."}
                        </Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

export default EventDetailModal;