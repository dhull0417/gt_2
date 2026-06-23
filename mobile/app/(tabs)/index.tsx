import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Modal, Animated, LayoutChangeEvent, TextInput } from 'react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGetMeetups } from '@/hooks/useGetMeetups';
import { useRsvp } from '@/hooks/useRsvp';
import { Meetup, User, useApiClient, userApi } from '@/utils/api';
import { useFocusEffect, useRouter, Link } from 'expo-router';
import MeetupDetailModal from '@/components/MeetupDetailModal';
import { Feather } from '@expo/vector-icons';
import { DateTime } from 'luxon';

type GroupedMeetups = {
  'Upcoming': Meetup[];
  'Past Week': Meetup[];
};

const GROUP_BORDER_COLORS = ['#C4B5FD', '#FDE68A', '#F9A8D4', '#FDBA74', '#A5B4FC', '#86EFAC'];

const hashGroupColor = (groupId: string): string => {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) hash = (hash + groupId.charCodeAt(i)) % GROUP_BORDER_COLORS.length;
  return GROUP_BORDER_COLORS[hash];
};

// --- Helper Functions ---
const getUserId = (u: User | string): string => typeof u === 'string' ? u : u._id;

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

const RsvpStatusDot = ({ meetup, userId }: { meetup: Meetup; userId: string }) => {
    let dotColor = 'grey'; // Grey (Undecided) default

    if (meetup.in.some(u => getUserId(u) === userId)) {
        dotColor = '#4FD1C5'; // Green (In)
    } else if (meetup.out.some(u => getUserId(u) === userId)) {
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

const RsvpCounts = ({ meetup }: { meetup: Meetup }) => {
    return (
        <View className="flex-row items-center mt-3 flex-wrap">
            <View className="flex-row items-center mr-4">
                <View className="w-2 h-2 rounded-full bg-green-500 mr-1.5" />
                <Text className="text-gray-600 font-medium">{meetup.in.length} In</Text>
            </View>

            <View className="flex-row items-center mr-4">
                <View className="w-2 h-2 rounded-full bg-red-500 mr-1.5" />
                <Text className="text-gray-600 font-medium">{meetup.out.length} Out</Text>
            </View>

            <View className="flex-row items-center">
                <Text 
                  className="font-bold text-[10px] uppercase" 
                  style={{ color: '#4A90E2' }}
                >
                    Max Attendees: {meetup.capacity === 0 ? 'Unlimited' : meetup.capacity}
                </Text>
            </View>
        </View>
    );
};

const MeetupCard = ({
  meetup,
  onPress,
  showRsvpButtons,
  onRsvp,
  isRsvping,
  currentUser,
  groupBorderColor,
}: {
  meetup: Meetup;
  onPress: () => void;
  showRsvpButtons: boolean;
  onRsvp: (status: 'in' | 'out') => void;
  isRsvping: boolean;
  currentUser: User | undefined;
  groupBorderColor?: string;
}) => {
  const isCancelled = meetup.status === 'cancelled';
  const isPast = new Date(meetup.date) < new Date();
  const isExpired = meetup.status === 'expired' || isPast;
  const isRsvpLocked = meetup.rsvpOpenDate ? new Date(meetup.rsvpOpenDate) > new Date() : false;

  const isFull = meetup.capacity > 0 && meetup.in.length >= meetup.capacity;
  const isWaitlisted = currentUser ? meetup.waitlist.some(u => getUserId(u) === currentUser._id) : false;
  const isIn = currentUser ? meetup.in.some(u => getUserId(u) === currentUser._id) : false;

  const isReadOnly = isCancelled || isExpired;

  return (
    <View 
      className={`p-5 my-2 rounded-2xl shadow-sm border relative ${
        isCancelled ? 'bg-red-50/30 border-red-100 opacity-80' : 
        isExpired ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-200'
      }`}
      style={{
        ...(isExpired && !isCancelled ? { opacity: 0.75 } : {}),
        ...(!isReadOnly && groupBorderColor ? {
          borderLeftWidth: 6,
          borderLeftColor: groupBorderColor,
          borderTopColor: groupBorderColor,
          borderRightColor: groupBorderColor,
          borderBottomColor: groupBorderColor,
          shadowColor: groupBorderColor,
          shadowOffset: { width: -5, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 3,
        } : {}),
      }}
    >
      <TouchableOpacity onPress={onPress}>
        {!isReadOnly && currentUser && <RsvpStatusDot meetup={meetup} userId={currentUser._id} />}

        <View className="flex-row justify-between items-start">
          <View className="flex-1 pr-6">
            <Text 
              style={{ 
                fontSize: 20, 
                fontWeight: 'bold', 
                color: isReadOnly ? '#9CA3AF' : '#4FD1C5',
                textDecorationLine: isCancelled ? 'line-through' : 'none' 
              }}
            >
              {meetup.name}
            </Text>
            {isCancelled && (
              <View className="bg-red-100 self-start px-2 py-0.5 rounded-md mt-1">
                <Text className="text-red-600 text-[10px] font-black uppercase">Cancelled</Text>
              </View>
            )}
            {isExpired && !isCancelled && (
              <View className="bg-gray-300 self-start px-2 py-0.5 rounded-md mt-1">
                <Text className="text-gray-700 text-[10px] font-black uppercase">Past Event</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={{ fontSize: 16, color: isReadOnly ? '#9CA3AF' : '#4B5563', marginTop: 4 }}>
          {formatDate(meetup.date, meetup.timezone)} at {meetup.time} {getTimezoneAbbreviation(meetup.date, meetup.timezone)}
        </Text>

        {!isReadOnly && <RsvpCounts meetup={meetup} />}

        <View className="flex-row mt-2">
            {isFull && !isReadOnly && !isIn && (
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

        {isExpired && !isCancelled && (
          <View className="mt-3 pt-3 border-t border-gray-200 flex-row items-center">
            <Feather name="info" size={12} color="#9CA3AF" />
            <Text className="text-[#9CA3AF] text-[11px] font-bold uppercase ml-1.5 tracking-tight">
              View History & Details
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {showRsvpButtons && !isReadOnly && (
        <View className="mt-4 pt-4 border-t border-gray-100">
          {isRsvpLocked ? (
            <View className="bg-gray-100 py-3 rounded-xl items-center border border-gray-200">
              <View className="flex-row items-center">
                <Feather name="lock" size={14} color="#6B7280" className="mr-2" />
                <Text className="text-gray-600 font-bold text-sm ml-1.5">
                  RSVPs open on {formatDate(meetup.rsvpOpenDate!, meetup.timezone)}
                </Text>
              </View>
            </View>
          ) : (
            <View className="flex-row gap-4">
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
      )}
    </View>
  );
};

const RemovableCard = ({
  isRemoving,
  onRemoved,
  children,
}: {
  isRemoving: boolean;
  onRemoved: () => void;
  children: React.ReactNode;
}) => {
  const opacity = useRef(new Animated.Value(1)).current;
  const heightAnim = useRef(new Animated.Value(0)).current;
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    if (measuredHeight === null) {
      const h = e.nativeEvent.layout.height;
      setMeasuredHeight(h);
      heightAnim.setValue(h);
    }
  }, [measuredHeight]);

  useEffect(() => {
    if (!isRemoving || measuredHeight === null) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: false }),
      Animated.timing(heightAnim, { toValue: 0, duration: 520, delay: 80, easing: t => t * t * (3 - 2 * t), useNativeDriver: false }),
    ]).start(() => onRemoved());
  }, [isRemoving, measuredHeight]);

  return (
    <Animated.View
      onLayout={onLayout}
      style={measuredHeight !== null
        ? { height: heightAnim, overflow: 'hidden', opacity }
        : { opacity }
      }
    >
      {children}
    </Animated.View>
  );
};

// --- Main Dashboard Screen ---

const DashboardScreen = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selectedMeetup, setSelectedMeetup] = useState<Meetup | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const { data: meetups, isLoading, isError, refetch } = useGetMeetups();
  const { data: currentUser } = useQuery<User, Error>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
  const { mutate: rsvp, isPending: isRsvping } = useRsvp();
  const [hiddenMeetupIds, setHiddenMeetupIds] = useState<Set<string>>(new Set());
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(new Set());
  const [zipCodeInput, setZipCodeInput] = useState('');
  const [zipCardDismissed, setZipCardDismissed] = useState(false);
  const [isSavingZip, setIsSavingZip] = useState(false);
  const [zipCodeError, setZipCodeError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const allUndecidedMeetups = useMemo(() => {
    if (!meetups || !currentUser) return [];
    return meetups.filter(meetup => {
      const isPast = new Date(meetup.date) < new Date();
      const isRsvpLocked = meetup.rsvpOpenDate ? new Date(meetup.rsvpOpenDate) > new Date() : false;
      return meetup.status === 'scheduled' && !isPast && !isRsvpLocked && meetup.undecided.includes(currentUser._id);
    });
  }, [meetups, currentUser]);

  const visibleUndecidedMeetups = useMemo(() => {
    return allUndecidedMeetups
      .filter(m => !hiddenMeetupIds.has(m._id))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 1);
  }, [allUndecidedMeetups, hiddenMeetupIds]);

  const uniqueGroups = useMemo(() => {
    if (!meetups) return [];
    const seen = new Set<string>();
    const groups: { _id: string; name: string }[] = [];
    meetups.forEach(m => {
      if (!seen.has(m.group._id)) {
        seen.add(m.group._id);
        groups.push({ _id: m.group._id, name: m.group.name });
      }
    });
    return groups;
  }, [meetups]);

  const toggleGroup = useCallback((groupId: string) => {
    setHiddenGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setHiddenGroupIds(prev =>
      prev.size === 0
        ? new Set(uniqueGroups.map(g => g._id))
        : new Set()
    );
  }, [uniqueGroups]);

  const groupedMeetups = useMemo(() => {
    const groups: GroupedMeetups = {
      'Upcoming': [],
      'Past Week': [],
    };
    if (!meetups) return groups;

    meetups.forEach(meetup => {
      if (hiddenGroupIds.has(meetup.group._id)) return;
      const isPast = new Date(meetup.date) < new Date();
      if (meetup.status === 'expired' || isPast) {
        groups['Past Week'].push(meetup);
      } else {
        groups['Upcoming'].push(meetup);
      }
    });

    groups['Past Week'].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return groups;
  }, [meetups, hiddenGroupIds]);

  const handleOpenModal = (meetup: Meetup) => {
    setSelectedMeetup(meetup);
    setIsModalVisible(true);
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
    setSelectedMeetup(null);
  };

  const handleDashboardRsvp = (meetupId: string, status: 'in' | 'out') => {
    if (!currentUser) return;
    rsvp({ meetupId, status }, {
      onSuccess: () => setRemovingId(meetupId),
    });
  };

  const handleSaveZipCode = async () => {
    const trimmed = zipCodeInput.trim();
    if (!trimmed) {
      setZipCodeError('Please enter a zip code.');
      return;
    }
    setZipCodeError('');
    setIsSavingZip(true);
    try {
      const { data } = await userApi.updateProfile(api, { zipCode: trimmed });
      if (data?.user) {
        queryClient.setQueryData(['currentUser'], data.user);
      } else {
        queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      }
      setZipCardDismissed(true);
    } catch {
      setZipCodeError('Failed to save. Please try again.');
    } finally {
      setIsSavingZip(false);
    }
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
          <ActivityIndicator size="large" color="#4A90E2" className="mt-16" />
        ) : isError ? (
          <Text style={{ textAlign: 'center', color: '#ef4444', marginTop: 32 }}>
            Failed to load meetups.
          </Text>
        ) : (
          <>
            <View className="mb-10 mt-2">
              <Text style={{ fontSize: 32, fontWeight: '900', color: '#4A90E2', paddingHorizontal: 8, marginBottom: 8, letterSpacing: -1 }}>
                {currentUser?.firstName ? `${currentUser.firstName}, are you in?` : 'Are you in?'}
              </Text>


              {visibleUndecidedMeetups.length > 0 ? (
                visibleUndecidedMeetups.map(meetup => (
                  <RemovableCard
                    key={meetup._id}
                    isRemoving={removingId === meetup._id}
                    onRemoved={() => {
                      setHiddenMeetupIds(prev => new Set([...prev, meetup._id]));
                      setRemovingId(null);
                      queryClient.invalidateQueries({ queryKey: ['meetups'] });
                    }}
                  >
                    <MeetupCard
                      meetup={meetup}
                      onPress={() => handleOpenModal(meetup)}
                      showRsvpButtons={true}
                      onRsvp={(status) => handleDashboardRsvp(meetup._id, status)}
                      isRsvping={isRsvping}
                      currentUser={currentUser}
                      groupBorderColor={hashGroupColor(meetup.group._id)}
                    />
                  </RemovableCard>
                ))
              ) : (
                <View className="bg-white p-8 my-2 rounded-[2rem] items-center border border-dashed border-gray-300">
                  <Text className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                    No pending RSVPs
                  </Text>
                </View>
              )}
            </View>

            <View className="pb-10">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 8 }}>
                <Text style={{ fontSize: 32, fontWeight: '900', color: '#4A90E2', letterSpacing: -1 }}>
                  Upcoming Meetups
                </Text>
                {uniqueGroups.length > 1 && (
                  <TouchableOpacity
                    onPress={() => setFilterOpen(prev => !prev)}
                    style={{ backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, position: 'relative' }}
                  >
                    <Feather name="sliders" size={18} color="#1D4ED8" />
                    {hiddenGroupIds.size > 0 && (
                      <View style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF7A6E' }} />
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {filterOpen && uniqueGroups.length > 1 && (
                <View style={{ paddingHorizontal: 8, paddingBottom: 4 }}>
                  <TouchableOpacity
                    onPress={toggleAll}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB', marginBottom: 2 }}
                  >
                    <Text style={{ flex: 1, fontSize: 15, color: '#111827', fontWeight: '700' }}>All</Text>
                    <View style={{
                      width: 20, height: 20, borderRadius: 5,
                      borderWidth: 1.5,
                      borderColor: hiddenGroupIds.size === 0 ? '#4A90E2' : '#D1D5DB',
                      backgroundColor: hiddenGroupIds.size === 0 ? '#4A90E2' : 'transparent',
                      justifyContent: 'center', alignItems: 'center',
                    }}>
                      {hiddenGroupIds.size === 0 && <Feather name="check" size={12} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                  {uniqueGroups.map(group => {
                    const isVisible = !hiddenGroupIds.has(group._id);
                    const color = hashGroupColor(group._id);
                    return (
                      <TouchableOpacity
                        key={group._id}
                        onPress={() => toggleGroup(group._id)}
                        activeOpacity={0.7}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10 }}
                      >
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
                        <Text style={{ flex: 1, fontSize: 15, color: '#374151', fontWeight: '500' }}>{group.name}</Text>
                        <View style={{
                          width: 20, height: 20, borderRadius: 5,
                          borderWidth: 1.5,
                          borderColor: isVisible ? '#4A90E2' : '#D1D5DB',
                          backgroundColor: isVisible ? '#4A90E2' : 'transparent',
                          justifyContent: 'center', alignItems: 'center',
                        }}>
                          {isVisible && <Feather name="check" size={12} color="#fff" />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {meetups?.length === 0 && (
                <View className="bg-white p-5 my-2 rounded-2xl items-center border border-gray-100">
                  <Text style={{ fontSize: 16, color: '#4A90E2' }}>
                    You have no upcoming meetups.
                  </Text>
                </View>
              )}

              {Object.entries(groupedMeetups).map(([groupTitle, groupMeetups]) => {
                if (groupMeetups.length === 0) return null;
                return (
                  <View key={groupTitle}>
                    {groupTitle !== 'Upcoming' && (
                      <Text style={{ fontSize: 12, fontWeight: '900', color: '#FF7A6E', marginTop: 24, marginBottom: 8, paddingHorizontal: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {groupTitle}
                      </Text>
                    )}
                    {groupMeetups.map((meetup: Meetup) => (
                        <MeetupCard
                            key={meetup._id}
                            meetup={meetup}
                            onPress={() => handleOpenModal(meetup)}
                            showRsvpButtons={false}
                            onRsvp={() => {}}
                            isRsvping={false}
                            currentUser={currentUser}
                            groupBorderColor={hashGroupColor(meetup.group._id)}
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
        <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }} edges={['top', 'bottom']}>
            <MeetupDetailModal meetup={selectedMeetup} onClose={handleCloseModal} />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={!!currentUser && !currentUser.zipCode && !zipCardDismissed}
        animationType="fade"
        transparent
        onRequestClose={() => setZipCardDismissed(true)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 28 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 28 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 6 }}>
              One quick thing
            </Text>
            <Text style={{ fontSize: 15, color: '#6B7280', marginBottom: 20, lineHeight: 22 }}>
              Add your zip code so we can improve your experience.
            </Text>
            <TextInput
              value={zipCodeInput}
              onChangeText={text => { setZipCodeInput(text); setZipCodeError(''); }}
              placeholder="Zip Code"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              maxLength={10}
              style={{
                backgroundColor: '#F9FAFB', borderWidth: 1,
                borderColor: zipCodeError ? '#EF4444' : '#E5E7EB',
                borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
                fontSize: 16, color: '#111827', marginBottom: zipCodeError ? 6 : 16,
              }}
            />
            {!!zipCodeError && (
              <Text style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{zipCodeError}</Text>
            )}
            <TouchableOpacity
              onPress={handleSaveZipCode}
              disabled={isSavingZip}
              style={{ backgroundColor: '#4A90E2', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 10 }}
            >
              {isSavingZip
                ? <ActivityIndicator color="white" />
                : <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Save</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setZipCardDismissed(true)}
              style={{ alignItems: 'center', paddingVertical: 8 }}
            >
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default DashboardScreen;