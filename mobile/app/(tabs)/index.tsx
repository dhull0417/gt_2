import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGetEvents } from '@/hooks/useGetEvents';
import { useRsvp } from '@/hooks/useRsvp';
import { Event, User, useApiClient, userApi } from '@/utils/api';
import { useFocusEffect, useRouter } from 'expo-router';
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

// 1. Status Dot Component
const RsvpStatusDot = ({ event, userId }: { event: Event; userId: string }) => {
    let dotColor = '#FBBF24'; // Yellow (Undecided) default

    if (event.in.includes(userId)) {
        dotColor = '#10B981'; // Green (In)
    } else if (event.out.includes(userId)) {
        dotColor = '#EF4444'; // Red (Out)
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
                borderColor: 'white' // Optional: adds a crisp edge
            }} 
        />
    );
};

// 2. Counts Component
const RsvpCounts = ({ event }: { event: Event }) => {
    return (
        <View className="flex-row items-center mt-3">
            {/* Green Count (In) */}
            <View className="flex-row items-center mr-4">
                <View className="w-2 h-2 rounded-full bg-green-500 mr-1.5" />
                <Text className="text-gray-600 font-medium">{event.in.length}</Text>
            </View>

            {/* Red Count (Out) */}
            <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full bg-red-500 mr-1.5" />
                <Text className="text-gray-600 font-medium">{event.out.length}</Text>
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
  return (
    <View className="bg-white p-5 my-2 rounded-lg shadow-sm border border-gray-200 relative">
      <TouchableOpacity onPress={onPress}>
        {/* Status Dot */}
        {currentUser && <RsvpStatusDot event={event} userId={currentUser._id} />}

        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1F2937', paddingRight: 20 }}>
          {event.name}
        </Text>
        <Text style={{ fontSize: 16, color: '#4B5563', marginTop: 4 }}>
          {formatDate(event.date, event.timezone)} at {event.time} {getTimezoneAbbreviation(event.date, event.timezone)}
        </Text>

        {/* Counts Display */}
        <RsvpCounts event={event} />
      </TouchableOpacity>

      {showRsvpButtons && (
        <View className="flex-row space-x-4 mt-4 pt-4 border-t border-gray-100">
          <TouchableOpacity
            onPress={() => onRsvp('in')}
            disabled={isRsvping}
            className="flex-1 py-3 bg-green-500 rounded-lg items-center justify-center shadow"
          >
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>I'm In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onRsvp('out')}
            disabled={isRsvping}
            className="flex-1 py-3 bg-red-500 rounded-lg items-center justify-center shadow"
          >
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>I'm Out</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const DashboardScreen = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: events, isLoading, isError, refetch } = useGetEvents();
  const { data: currentUser } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
  });
  const { mutate: rsvp, isPending: isRsvping } = useRsvp();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const { nextUndecidedEvent } = useMemo(() => {
    if (!events || !currentUser) {
      return { nextUndecidedEvent: null };
    }
    const nextUndecided = events.find(event => event.undecided.includes(currentUser._id));
    return { nextUndecidedEvent: nextUndecided };
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
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200 bg-white">
        <View style={{ width: 24 }} />
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>
          Home
        </Text>
        <View style={{ width: 24 }} />
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
            {/* You coming? Section */}
            <View className="mb-8">
              <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#1F2937', paddingHorizontal: 8, marginBottom: 8 }}>
                You coming?
              </Text>
              {nextUndecidedEvent ? (
                <EventCard
                  event={nextUndecidedEvent}
                  onPress={() => handleOpenModal(nextUndecidedEvent)}
                  showRsvpButtons={true}
                  onRsvp={(status) => handleDashboardRsvp(nextUndecidedEvent._id, status)}
                  isRsvping={isRsvping}
                  currentUser={currentUser} // Pass currentUser
                />
              ) : (
                <View className="bg-white p-5 my-2 rounded-lg items-center">
                  <Text style={{ fontSize: 16, color: '#6B7280' }}>
                    You're all caught up! No pending RSVPs.
                  </Text>
                </View>
              )}
            </View>

            {/* Upcoming Events Section */}
            <View>
              <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#1F2937', paddingHorizontal: 8, marginBottom: 8 }}>
                Upcoming Events
              </Text>

              {events?.length === 0 && (
                <View className="bg-white p-5 my-2 rounded-lg items-center">
                  <Text style={{ fontSize: 16, color: '#6B7280' }}>
                    You have no upcoming events.
                  </Text>
                </View>
              )}

              {Object.entries(groupedEvents).map(([groupTitle, groupEvents]) => {
                if (groupEvents.length === 0) return null;
                return (
                  <View key={groupTitle}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16, marginBottom: 8, paddingHorizontal: 8 }}>
                      {groupTitle}
                    </Text>
                    {groupEvents.map((event: Event) => (
                      <TouchableOpacity
                        key={event._id}
                        onPress={() => handleOpenModal(event)}
                        className="bg-white p-5 my-2 rounded-lg shadow-sm border border-gray-200 relative"
                      >
                         {/* 👇 1. Status Dot */}
                        {currentUser && <RsvpStatusDot event={event} userId={currentUser._id} />}

                        <Text style={{ fontSize: 18, fontWeight: '600', color: '#1F2937', paddingRight: 20 }}>
                          {event.name}
                        </Text>
                        <Text style={{ fontSize: 16, color: '#4B5563', marginTop: 4 }}>
                          {formatDate(event.date, event.timezone)} at {event.time} {getTimezoneAbbreviation(event.date, event.timezone)}
                        </Text>
                        
                        {/* 👇 2. Counts Display */}
                        <RsvpCounts event={event} />

                      </TouchableOpacity>
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
        onRequestClose={handleCloseModal}
      >
        <EventDetailModal event={selectedEvent} onClose={handleCloseModal} />
      </Modal>
    </SafeAreaView>
  );
};

export default DashboardScreen;