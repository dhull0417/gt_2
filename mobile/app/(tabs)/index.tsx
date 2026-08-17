import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Modal, Animated, LayoutChangeEvent, TextInput, Alert } from 'react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGetMeetups } from '@/hooks/useGetMeetups';
import { useRsvp } from '@/hooks/useRsvp';
import { Meetup, User, useApiClient, userApi, meetupApi } from '@/utils/api';
import { useFocusEffect, useRouter, useLocalSearchParams, Link } from 'expo-router';
import MeetupDetailModal from '@/components/MeetupDetailModal';
import RsvpResponseOverlay from '@/components/RsvpResponseOverlay';
import { GroupAvatar } from '@/components/GroupAvatar';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { DateTime } from 'luxon';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { RsvpBreather } from '@/components/RsvpBreather';
import { TAB_BAR_HEIGHT } from '@/utils/layout';
import ReanimatedAnimated from 'react-native-reanimated';

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

// Clusters a (date-ordered) meetup list into per-day buckets, so the date can be shown once above
// every meetup that falls on it instead of repeated on each card.
type DayGroup = { key: string; label: string; items: Meetup[] };
const splitByDay = (list: Meetup[]): DayGroup[] => {
    const groups: DayGroup[] = [];
    list.forEach(meetup => {
        const key = new Date(meetup.date).toLocaleDateString('en-CA', { timeZone: meetup.timezone });
        let group = groups.find(g => g.key === key);
        if (!group) {
            const label = new Date(meetup.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: meetup.timezone });
            group = { key, label, items: [] };
            groups.push(group);
        }
        group.items.push(meetup);
    });
    return groups;
};

// --- Components ---

const DayHeader = ({ label }: { label: string }) => (
    <Text style={{ fontSize: 16, fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 8, marginTop: 28, marginBottom: 6, textAlign: 'center' }}>
        {label}
    </Text>
);

const RsvpCounts = ({ meetup }: { meetup: Meetup }) => {
    const totalGuests = (meetup.guests || []).reduce((sum, g) => sum + (g.count || 0), 0);
    return (
        <View className="flex-row items-center mt-3 flex-wrap">
            <View className="flex-row items-center mr-4">
                <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: '#4FD1C5' }} />
                <Text className="text-gray-600 font-medium">
                    {meetup.in.length + totalGuests}{meetup.capacity > 0 ? `/${meetup.capacity}` : ''} In
                </Text>
            </View>

            <View className="flex-row items-center mr-4">
                <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: '#FF7A6E' }} />
                <Text className="text-gray-600 font-medium">{meetup.out.length} Out</Text>
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
}: {
  meetup: Meetup;
  onPress: () => void;
  showRsvpButtons: boolean;
  onRsvp: (status: 'in' | 'out', guestCount?: number, mute?: boolean) => void;
  isRsvping: boolean;
  currentUser: User | undefined;
}) => {
  const [guestExpanded, setGuestExpanded] = useState(false);
  const [localGuestCount, setLocalGuestCount] = useState(() => {
    const entry = meetup.guests?.find(g => g.userId === currentUser?.clerkId);
    return entry?.count ?? 0;
  });

  useEffect(() => {
    if (!guestExpanded) {
      const entry = meetup.guests?.find(g => g.userId === currentUser?.clerkId);
      setLocalGuestCount(entry?.count ?? 0);
    }
  }, [meetup.guests, currentUser?.clerkId, guestExpanded]);

  const isCancelled = meetup.status === 'cancelled';
  const isPast = new Date(meetup.date) < new Date();
  const isExpired = meetup.status === 'expired' || isPast;
  const isRsvpLocked = meetup.rsvpOpenDate ? new Date(meetup.rsvpOpenDate) > new Date() : false;

  const isFull = meetup.capacity > 0 && meetup.in.length >= meetup.capacity;
  const isWaitlisted = currentUser ? meetup.waitlist.some(u => getUserId(u) === currentUser._id) : false;
  const isIn = currentUser ? meetup.in.some(u => getUserId(u) === currentUser._id) : false;
  const isOut = currentUser ? meetup.out.some(u => getUserId(u) === currentUser._id) : false;
  const inUnselected = !isIn && !isWaitlisted && !(isFull && !isIn);
  const outUnselected = !isOut;
  const isUndecided = inUnselected && outUnselected;

  const isReadOnly = isCancelled || isExpired;

  // Faint RSVP-status tint to match the detail modal: amber until the user
  // responds, then green ("in"/waitlisted) or red ("out").
  const rsvpBackgroundColor = isOut ? '#FEF2F2' : (isIn || isWaitlisted) ? '#EDF5F0' : '#FFFEFA';

  return (
    <View
      className={`p-5 my-2 rounded-2xl shadow-sm border relative ${
        isCancelled ? 'bg-red-50/30 border-red-100 opacity-80' :
        isExpired ? 'bg-gray-100 border-gray-200' : 'border-gray-200'
      }`}
      style={{
        ...(isExpired && !isCancelled ? { opacity: 0.75 } : {}),
        ...(!isReadOnly ? { backgroundColor: rsvpBackgroundColor } : {}),
      }}
    >
      <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row' }}>
        <View style={{ marginRight: 12 }}>
          <GroupAvatar name={meetup.group.name} imageUrl={meetup.group.image} size={44} />
        </View>
        <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>
          {meetup.time}
        </Text>

        <View className="flex-row justify-between items-start" style={{ marginTop: 4 }}>
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
          {!isReadOnly && (
            isIn || isOut ? (
              <Text style={{ fontSize: 13, fontWeight: '900', letterSpacing: 1, color: isIn ? '#4FD1C5' : '#FF7A6E' }}>
                {isIn ? 'IN' : 'OUT'}
              </Text>
            ) : isRsvpLocked ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name="clock" size={16} color="#9CA3AF" />
                <Feather name="lock" size={16} color="#9CA3AF" />
              </View>
            ) : (
              <Feather name="unlock" size={16} color="#F59E0B" />
            )
          )}
        </View>

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
        </View>
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
            <>
              <RsvpBreather active={isUndecided}>
                {({ boxStyle, inTextStyle, outTextStyle }) => (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {/* Split I'm In button: left 70% = RSVP in, right 30% = open guest counter */}
                    <View style={{
                      flex: 1, borderRadius: 12, overflow: 'hidden', height: 48,
                      backgroundColor: isWaitlisted ? '#2563EB' : (isFull && !isIn) ? '#F97316' : isIn ? '#4FD1C5' : 'white',
                    }}>
                      <ReanimatedAnimated.View style={[{
                        flex: 1, flexDirection: 'row', borderRadius: 12,
                        borderWidth: inUnselected ? 1.5 : 0,
                        borderColor: '#4FD1C5',
                      }, boxStyle]}>
                        <TouchableOpacity
                          onPress={() => { setGuestExpanded(false); onRsvp('in', 0); }}
                          disabled={isRsvping}
                          style={{ flex: 7, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ReanimatedAnimated.Text style={[{ color: inUnselected ? '#4FD1C5' : 'white', fontWeight: 'bold', fontSize: 16 }, inTextStyle]}>
                            {isWaitlisted ? "Waitlisted" : (isFull && !isIn) ? "Join Waitlist" : "I'm In"}
                          </ReanimatedAnimated.Text>
                        </TouchableOpacity>
                        <View style={{ width: 1, backgroundColor: inUnselected ? '#D1FAE5' : 'rgba(255,255,255,0.35)' }} />
                        <TouchableOpacity
                          onPress={() => { setLocalGuestCount(0); setGuestExpanded(v => !v); }}
                          disabled={isRsvping}
                          style={{ flex: 3, alignItems: 'center', justifyContent: 'center' }}
                        >
                          {guestExpanded
                            ? <Feather name="x" size={18} color={inUnselected ? '#4FD1C5' : 'white'} />
                            : <MaterialIcons name="group-add" size={20} color={inUnselected ? '#4FD1C5' : 'white'} />
                          }
                        </TouchableOpacity>
                      </ReanimatedAnimated.View>
                    </View>
                    {/* Split I'm Out button: left 70% = RSVP out, right 30% = RSVP out + mute group */}
                    <View style={{
                      flex: 1, borderRadius: 12, overflow: 'hidden', height: 48,
                      backgroundColor: isOut ? '#FF7A6E' : 'white',
                    }}>
                      <ReanimatedAnimated.View style={[{
                        flex: 1, flexDirection: 'row', borderRadius: 12,
                        borderWidth: outUnselected ? 1.5 : 0,
                        borderColor: '#FF7A6E',
                      }, boxStyle]}>
                        <TouchableOpacity
                          onPress={() => { setGuestExpanded(false); onRsvp('out'); }}
                          disabled={isRsvping}
                          style={{ flex: 7, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ReanimatedAnimated.Text style={[{ color: outUnselected ? '#FF7A6E' : 'white', fontWeight: 'bold', fontSize: 16 }, outTextStyle]}>I'm Out</ReanimatedAnimated.Text>
                        </TouchableOpacity>
                        <View style={{ width: 1, backgroundColor: outUnselected ? '#FFE4E1' : 'rgba(255,255,255,0.35)' }} />
                        <TouchableOpacity
                          onPress={() => { setGuestExpanded(false); onRsvp('out', 0, true); }}
                          disabled={isRsvping}
                          style={{ flex: 3, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Feather name="bell-off" size={18} color={outUnselected ? '#FF7A6E' : 'white'} />
                        </TouchableOpacity>
                      </ReanimatedAnimated.View>
                    </View>
                  </View>
                )}
              </RsvpBreather>

              {/* Inline guest counter — expands below buttons when + is tapped */}
              {guestExpanded && (
                <View style={{ alignItems: 'center', marginTop: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Add Guests?</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                  <TouchableOpacity
                    onPress={() => setLocalGuestCount(c => Math.max(0, c - 1))}
                    disabled={localGuestCount === 0}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: localGuestCount === 0 ? '#F9FAFB' : '#EEF6FF',
                      borderWidth: 1.5,
                      borderColor: localGuestCount === 0 ? '#E5E7EB' : '#93C5FD',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Feather name="minus" size={16} color={localGuestCount === 0 ? '#D1D5DB' : '#4A90E2'} />
                  </TouchableOpacity>

                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827', minWidth: 28, textAlign: 'center' }}>
                    {localGuestCount}
                  </Text>

                  <TouchableOpacity
                    onPress={() => setLocalGuestCount(c => c + 1)}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: '#EEF6FF',
                      borderWidth: 1.5, borderColor: '#93C5FD',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Feather name="plus" size={16} color="#4A90E2" />
                  </TouchableOpacity>

                  {/* Confirm */}
                  <TouchableOpacity
                    onPress={() => { setGuestExpanded(false); onRsvp('in', localGuestCount); }}
                    disabled={isRsvping}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: '#4FD1C5',
                      borderWidth: 1.5, borderColor: '#3FABA1',
                      alignItems: 'center', justifyContent: 'center',
                      marginLeft: 6,
                    }}
                  >
                    {isRsvping
                      ? <ActivityIndicator size="small" color="white" />
                      : <Feather name="check" size={18} color="white" />
                    }
                  </TouchableOpacity>
                </View>
                </View>
              )}
            </>
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
  const currentHeight = useRef<number>(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Always track the latest rendered height so the animation starts from the right value
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    currentHeight.current = e.nativeEvent.layout.height;
  }, []);

  useEffect(() => {
    if (!isRemoving) return;
    // Snapshot the current height, lock it, then animate to 0
    heightAnim.setValue(currentHeight.current);
    setIsAnimating(true);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: false }),
      Animated.timing(heightAnim, { toValue: 0, duration: 520, delay: 80, easing: t => t * t * (3 - 2 * t), useNativeDriver: false }),
    ]).start(() => onRemoved());
  }, [isRemoving]);

  return (
    <Animated.View
      onLayout={onLayout}
      style={isAnimating
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
  const insets = useSafeAreaInsets();
  const { openMeetupId } = useLocalSearchParams<{ openMeetupId?: string }>();
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = (message: string) => {
    setToastMessage(message);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastMessage(null));
  };

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

  // Deep link from a push notification tap (e.g. RSVP reminder) — open that meetup's detail modal.
  useEffect(() => {
    if (openMeetupId && meetups && meetups.length > 0) {
      const target = meetups.find(m => m._id === openMeetupId);
      if (target) {
        handleOpenModal(target);
        router.setParams({ openMeetupId: undefined });
      }
    }
  }, [openMeetupId, meetups]);

  const handleDashboardRsvp = (meetup: Meetup, status: 'in' | 'out', guestCount = 0, mute = false) => {
    if (!currentUser) return;
    rsvp({ meetupId: meetup._id, status }, {
      onSuccess: () => {
        if (status === 'in' && guestCount > 0) {
          meetupApi.setGuestCount(api, meetup._id, guestCount)
            .then(() => queryClient.invalidateQueries({ queryKey: ['meetups'] }))
            .catch(() => Alert.alert('Note', 'RSVP saved, but guests could not be added. Try from the meetup details.'));
        }
        if (mute) {
          userApi.toggleGroupMute(api, meetup.group._id, 'untilNext')
            .then(() => showToast(`${meetup.group.name} chat has been muted until the next Meetup`))
            .catch(() => {});
        }
        setRemovingId(meetup._id);
      },
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
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top', 'left', 'right']}>
      <View className="flex-row justify-center items-center px-4 py-3 border-b border-gray-200 bg-white">
        <Text className="text-xl font-black text-gray-900">Meetups</Text>
      </View>

      <ScrollView className="p-4" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + TAB_BAR_HEIGHT }}>
        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><LoadingAnimation /></View>
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
                <>
                {splitByDay(visibleUndecidedMeetups).map(day => (
                  <DayHeader key={day.key} label={day.label} />
                ))}
                {visibleUndecidedMeetups.map(meetup => (
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
                      onRsvp={(status, guestCount, mute) => handleDashboardRsvp(meetup, status, guestCount, mute)}
                      isRsvping={isRsvping}
                      currentUser={currentUser}
                    />
                  </RemovableCard>
                ))}
                </>
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
                    {splitByDay(groupMeetups).map(day => (
                      <View key={day.key}>
                        <DayHeader label={day.label} />
                        {day.items.map((meetup: Meetup) => (
                          <MeetupCard
                              key={meetup._id}
                              meetup={meetup}
                              onPress={() => handleOpenModal(meetup)}
                              showRsvpButtons={false}
                              onRsvp={() => {}}
                              isRsvping={false}
                              currentUser={currentUser}
                          />
                        ))}
                      </View>
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
        <MeetupDetailModal meetup={selectedMeetup} onClose={handleCloseModal} />
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
      {toastMessage && (
        <Animated.View style={{
          position: 'absolute',
          top: 0, bottom: 0, left: 0, right: 0,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: toastOpacity,
          pointerEvents: 'none',
        }}>
          <View style={{
            backgroundColor: '#1F2937',
            borderRadius: 14,
            paddingVertical: 16,
            paddingHorizontal: 24,
            marginHorizontal: 32,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.22,
            shadowRadius: 10,
            elevation: 8,
          }}>
            <Text style={{ color: 'white', fontWeight: '600', fontSize: 15, textAlign: 'center' }}>
              {toastMessage}
            </Text>
          </View>
        </Animated.View>
      )}

      <RsvpResponseOverlay />
    </SafeAreaView>
  );
};

export default DashboardScreen;