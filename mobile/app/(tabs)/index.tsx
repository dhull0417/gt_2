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
import { Feather } from '@expo/vector-icons';
import { DateTime } from 'luxon';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { TAB_BAR_HEIGHT } from '@/utils/layout';
import { MeetupCard } from '@/components/MeetupCard';
import { DayHeader, splitByDay } from '@/components/MeetupDayGroups';

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

// How far out each recurring series shows in "Upcoming Meetups" before the
// rest fall back to the group calendar button. One-off meetups (frequency
// null) are never capped.
const TAB_CAP_DAYS: Partial<Record<NonNullable<Meetup['frequency']>, number>> = {
  daily: 7, weekly: 15, biweekly: 15, monthly: 35, ordinal: 35,
};

// Buckets by (group, frequency) series so a user in a daily group and a
// weekly group each get their own cap, then merges back into one date-sorted list.
const capMeetupsByFrequency = (list: Meetup[]): Meetup[] => {
  const now = Date.now();
  const buckets = new Map<string, Meetup[]>();
  const uncapped: Meetup[] = [];

  list.forEach(m => {
    if (!m.frequency) { uncapped.push(m); return; }
    const key = `${m.group._id}|${m.frequency}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(m);
    buckets.set(key, bucket);
  });

  const capped: Meetup[] = [...uncapped];
  buckets.forEach((bucketMeetups, key) => {
    const frequency = key.split('|')[1] as NonNullable<Meetup['frequency']>;
    const sorted = [...bucketMeetups].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const days = TAB_CAP_DAYS[frequency];

    if (days != null) {
      const cutoff = now + days * 24 * 60 * 60 * 1000;
      capped.push(...sorted.filter(m => new Date(m.date).getTime() <= cutoff));
    } else {
      capped.push(...sorted);
    }
  });

  return capped.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// --- Components ---

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

  // Meetups that would actually appear in the "Upcoming" section below, after the same
  // capMeetupsByFrequency cap (e.g. only the next 8 weekly occurrences per group are shown).
  // Used to keep "Are you in?" from prompting about a meetup the user can't see there.
  const upcomingVisibleMeetupIds = useMemo(() => {
    if (!meetups) return new Set<string>();
    const candidates = meetups.filter(meetup => {
      const isPast = new Date(meetup.date) < new Date();
      return meetup.status === 'scheduled' && !isPast;
    });
    return new Set(capMeetupsByFrequency(candidates).map(m => m._id));
  }, [meetups]);

  const allUndecidedMeetups = useMemo(() => {
    if (!meetups || !currentUser) return [];
    return meetups.filter(meetup => {
      const isPast = new Date(meetup.date) < new Date();
      const isRsvpLocked = meetup.rsvpOpenDate ? new Date(meetup.rsvpOpenDate) > new Date() : false;
      const isRsvpDeadlinePassed = meetup.rsvpCloseDate ? new Date(meetup.rsvpCloseDate) < new Date() : false;
      return meetup.status === 'scheduled' && !isPast && !isRsvpLocked && !isRsvpDeadlinePassed
        && meetup.undecided.includes(currentUser._id)
        && upcomingVisibleMeetupIds.has(meetup._id);
    });
  }, [meetups, currentUser, upcomingVisibleMeetupIds]);

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

    const upcomingCandidates: Meetup[] = [];

    meetups.forEach(meetup => {
      if (hiddenGroupIds.has(meetup.group._id)) return;
      const isPast = new Date(meetup.date) < new Date();
      if (meetup.status === 'expired' || isPast) {
        groups['Past Week'].push(meetup);
      } else {
        upcomingCandidates.push(meetup);
      }
    });

    groups['Upcoming'] = capMeetupsByFrequency(upcomingCandidates);
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
    if (!/^\d{5}$/.test(trimmed)) {
      setZipCodeError('Zip code must be 5 digits.');
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
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}>
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

              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 8, gap: 6 }}>
                <Text style={{ fontSize: 13, color: '#9CA3AF', fontWeight: '500' }}>
                  Tap
                </Text>
                <View style={{
                  width: 36, height: 36, borderRadius: 10,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, backgroundColor: '#FFFBEB', borderColor: '#FDE68A',
                }}>
                  <Feather name="calendar" size={18} color="#D97706" />
                </View>
                <Text style={{ fontSize: 13, color: '#9CA3AF', fontWeight: '500' }}>
                  in your Group Chat to see more meetups!
                </Text>
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
        visible={!!currentUser && !!currentUser.hasSeenWelcome && !currentUser.zipCode && !zipCardDismissed}
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
              onChangeText={text => { setZipCodeInput(text.replace(/\D/g, '').slice(0, 5)); setZipCodeError(''); }}
              placeholder="Zip Code"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              maxLength={5}
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