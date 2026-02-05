import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGetEvents } from '@/hooks/useGetEvents';
import { useRsvp } from '@/hooks/useRsvp';
import { Event, User, useApiClient, userApi } from '@/utils/api';
import { useFocusEffect, useRouter, Link } from 'expo-router';
import EventDetailModal from '@/components/EventDetailModal';
import { Feather } from '@expo/vector-icons';
import { DateTime } from 'luxon';

type GroupedEvents = {
  'Within 3 days': Event[];
  'Within 1 week': Event[];
  'Within 2 weeks': Event[];
  'Future': Event[];
};

// --- Helper Functions ---
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
    } catch (e) {
      return timezone.split('/').pop()?.replace('_', ' ') || '';
    }
};

// --- Components ---

const RsvpStatusDot = ({ event, userId }: { event: Event; userId: string }) => {
    let dotColor = 'grey'; // Grey (Undecided) default

    if (event.in.includes(userId)) {
        dotColor = '#4FD1C5'; // Green (In)
    } else if (event.out.includes(userId)) {
        dotColor = '#FF7A6E'; // Red (Out)
    }

    return (
        <View 
            style={{ 
                width: 12, 
                height: 12, 
                borderRadius: 6, 
                backgroundColor: dotColor,
                position: 'absolute',
                top: 12,
                right: 12,
                borderWidth: 1,
                borderColor: 'white'
            }} 
        />
    );
};

const RsvpCounts = ({ event }: { event: Event }) => {
    return (
        <View className="flex-row items-center mt-3 flex-wrap">
            <View className="flex-row items-center mr-4">
                <View className="w-2 h-2 rounded-full bg-green-500 mr-1.5" />
                <Text className="text-gray-600 font-medium">{event.in.length} In</Text>
            </View>

            <View className="flex-row items-center mr-4">
                <View className="w-2 h-2 rounded-full bg-red-500 mr-1.5" />
                <Text className="text-gray-600 font-medium">{event.out.length} Out</Text>
            </View>

            <View className="flex-row items-center">
                <Text 
                  className="font-bold text-[10px] uppercase" 
                  style={{ color: '#4A90E2' }}
                >
                    Max Attendees: {event.capacity === 0 ? 'Unlimited' : event.capacity}
                </Text>
            </View>
        </View>
    );
};

const EventCard = ({
  event,
  onPress,
  showRsvpButtons,
  onRsvp,
  isRsvping,
  currentUser
}: {
  event: Event;
  onPress: () => void;
  showRsvpButtons: boolean;
  onRsvp: (status: 'in' | 'out') => void;
  isRsvping: boolean;
  currentUser: User | undefined;
}) => {
  const isCancelled = event.status === 'cancelled';
  const isFull = event.capacity > 0 && event.in.length >= event.capacity;
  const isWaitlisted = currentUser ? event.waitlist.includes(currentUser._id) : false;
  const isIn = currentUser ? event.in.includes(currentUser._id) : false;

  return (
    <View 
      className={`p-5 my-2 rounded-2xl shadow-sm border relative ${
        isCancelled ? 'bg-red-50/30 border-red-100 opacity-80' : 'bg-white border-gray-200'
      }`}
    >
      <TouchableOpacity onPress={onPress} disabled={isCancelled}>
        {!isCancelled && currentUser && <RsvpStatusDot event={event} userId={currentUser._id} />}

        <View className="flex-row justify-between items-start">
          <View className="flex-1 pr-6">
            <Text 
              style={{ 
                fontSize: 20, 
                fontWeight: 'bold', 
                color: isCancelled ? '#9CA3AF' : '#4FD1C5',
                textDecorationLine: isCancelled ? 'line-through' : 'none' 
              }}
            >
              {event.name}
            </Text>
            {isCancelled && (
              <View className="bg-red-100 self-start px-2 py-0.5 rounded-md mt-1">
                <Text className="text-red-600 text-[10px] font-black uppercase">Cancelled</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={{ fontSize: 16, color: isCancelled ? '#9CA3AF' : '#4B5563', marginTop: 4 }}>
          {formatDate(event.date, event.timezone)} at {event.time} {getTimezoneAbbreviation(event.date, event.timezone)}
        </Text>

        {!isCancelled && <RsvpCounts event={event} />}

        <View className="flex-row mt-2">
            {isFull && !isCancelled && !isIn && (
                <View className="bg-orange-100 px-2 py-1 rounded-lg mr-2 border border-orange-200">
                    <Text className="text-orange-600 text-[10px] font-black">FULL</Text>
                </View>
            )}
            {isWaitlisted && (
                <View className="bg-blue-100 px-2 py-1 rounded-lg border border-blue-200">
                    <Text className="text-blue-600 text-[10px] font-black uppercase">Waitlisted</Text>
                </View>
            )}
        </View>
      </TouchableOpacity>

      {showRsvpButtons && !isCancelled && (
        <View className="flex-row space-x-4 mt-4 pt-4 border-t border-gray-100">
          <TouchableOpacity
            onPress={() => onRsvp('in')}
            disabled={isRsvping}
            className={`flex-1 py-3 rounded-xl items-center justify-center shadow-sm ${
                isWaitlisted ? 'bg-blue-600' :
                (isFull && !isIn) ? 'bg-orange-500' : 
                '' 
            }`}
            style={{ backgroundColor: isWaitlisted ? '#2563EB' : (isFull && !isIn) ? '#F97316' : '#4FD1C5' }}
          >
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
                {isWaitlisted ? "Waitlisted" : (isFull && !isIn) ? "Join Waitlist" : "I'm In"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onRsvp('out')}
            disabled={isRsvping}
            className="flex-1 py-3 rounded-xl items-center justify-center shadow-sm"
            style={{ backgroundColor: '#FF7A6E' }}
          >
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>I'm Out</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// --- Main Dashboard Screen ---

const DashboardScreen = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const { data: events, isLoading, isError, refetch } = useGetEvents();
  const { data: currentUser } = useQuery<User, Error>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
  const { mutate: rsvp, isPending: isRsvping } = useRsvp();

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const nextUndecidedEvent = useMemo(() => {
    if (!events || !currentUser) return null;
    return events.find(event => event.status !== 'cancelled' && event.undecided.includes(currentUser._id));
  }, [events, currentUser]);

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
      if (diffInDays <= 3) groups['Within 3 days'].push(event);
      else if (diffInDays <= 7) groups['Within 1 week'].push(event);
      else if (diffInDays <= 14) groups['Within 2 weeks'].push(event);
      else groups['Future'].push(event);
    });
    return groups;
  }, [events]);

  const handleOpenModal = (event: Event) => {
    setSelectedEvent(event);
    setIsModalVisible(true);
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
    setSelectedEvent(null);
  };

  const handleDashboardRsvp = (eventId: string, status: 'in' | 'out') => {
    if (!currentUser) return;
    rsvp({ eventId, status }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['events'] });
      }
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="items-center px-6 py-4 border-b border-gray-200 bg-white">
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>
          Home
        </Text>
      </View>

      <ScrollView className="p-4">
        {isLoading ? (
          <ActivityIndicator size="large" color="#4f46e5" className="mt-16" />
        ) : isError ? (
          <Text style={{ textAlign: 'center', color: '#ef4444', marginTop: 32 }}>
            Failed to load events.
          </Text>
        ) : (
          <>
            <View className="mb-10 mt-2">
              <Text style={{ fontSize: 32, fontWeight: '900', color: '#4A90E2', paddingHorizontal: 8, marginBottom: 8, letterSpacing: -1 }}>
                You coming?
              </Text>
              {nextUndecidedEvent ? (
                <EventCard
                  event={nextUndecidedEvent}
                  onPress={() => handleOpenModal(nextUndecidedEvent)}
                  showRsvpButtons={true}
                  onRsvp={(status) => handleDashboardRsvp(nextUndecidedEvent._id, status)}
                  isRsvping={isRsvping}
                  currentUser={currentUser}
                />
              ) : (
                <View className="bg-white p-8 my-2 rounded-[2rem] items-center border border-dashed border-gray-300">
                  <Text className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                    No pending RSVPs
                  </Text>
                </View>
              )}
            </View>

            <View className="pb-10">
              <Text style={{ fontSize: 32, fontWeight: '900', color: '#4A90E2', paddingHorizontal: 8, marginBottom: 8, letterSpacing: -1 }}>
                Upcoming
              </Text>

              {events?.length === 0 && (
                <View className="bg-white p-5 my-2 rounded-2xl items-center border border-gray-100">
                  <Text style={{ fontSize: 16, color: '#4A90E2' }}>
                    You have no upcoming events.
                  </Text>
                </View>
              )}

              {Object.entries(groupedEvents).map(([groupTitle, groupEvents]) => {
                if (groupEvents.length === 0) return null;
                return (
                  <View key={groupTitle}>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: '#FF7A6E', marginTop: 24, marginBottom: 8, paddingHorizontal: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                      {groupTitle}
                    </Text>
                    {groupEvents.map((event: Event) => (
                        <EventCard
                            key={event._id}
                            event={event}
                            onPress={() => handleOpenModal(event)}
                            showRsvpButtons={false}
                            onRsvp={() => {}}
                            isRsvping={false}
                            currentUser={currentUser}
                        />
                    ))}
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        {/* Use SafeAreaView with edges explicitly defined to protect the top of the details screen */}
        <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }} edges={['top', 'bottom']}>
            <EventDetailModal event={selectedEvent} onClose={handleCloseModal} />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

export default DashboardScreen;