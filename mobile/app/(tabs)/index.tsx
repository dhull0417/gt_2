import { View, Text, FlatList, RefreshControl, Modal, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Reanimated, { useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { useGetMeetups } from '@/hooks/useGetMeetups';
import { useGetGroups } from '@/hooks/useGetGroups';
import { useRsvp } from '@/hooks/useRsvp';
import { Meetup, User, useApiClient, userApi, meetupApi } from '@/utils/api';
import { broadcastMeetupUpdate } from '@/utils/groupRealtime';
import AddMeetupWizard from '@/components/AddMeetupWizard';
import { useFocusEffect, useRouter, useLocalSearchParams, Link } from 'expo-router';
import MeetupDetailModal from '@/components/MeetupDetailModal';
import MeetupConfirmSheet from '@/components/MeetupConfirmSheet';
import { shouldPromptAfterIn } from '@/utils/confirmTabs';
import RsvpResponseOverlay from '@/components/RsvpResponseOverlay';
import { Feather } from '@expo/vector-icons';
import { DateTime } from 'luxon';
import { SkeletonList } from '@/components/Skeleton';
import { FadeUp, FadeUpScreen } from '@/components/ui/FadeUp';
import { useRefreshOrToast } from '@/hooks/useRefreshOrToast';
import { OfflineEmptyState } from '@/components/OfflineEmptyState';
import { isOfflineEmpty } from '@/utils/offlineState';
import { NotificationBell } from '@/components/NotificationBell';
import { ActionSheet } from '@/components/ActionSheet';
import { haptic } from '@/utils/haptics';
import { tabScreenBottomPadding } from '@/utils/layout';
import { MeetupCard } from '@/components/MeetupCard';
import { DayHeader, splitByDay } from '@/components/MeetupDayGroups';
import { getMeetupStatus } from '@/utils/meetupStatus';
import { meetupEndInstant } from '@/utils/meetupTime';
import { useAppearance, useThemeColors } from '@/contexts/AppearanceContext';
import { toast } from '@/contexts/ToastContext';
import { muteStateFor, restoreRequest } from '@/utils/groupMute';
import { runBackInterceptor } from '@/utils/backInterceptors';
import { ScreenTour, TourTarget } from '@/components/tour/ScreenTour';
import { meetupsEmptyTourSteps, meetupsEmptyTourEnabled, meetupsWelcome } from '@/utils/emptyScreenTours';
import { TOURS } from '@/utils/screenTours';

type GroupedMeetups = {
  'Upcoming': Meetup[];
  'Past Week': Meetup[];
};

const HIDDEN_GROUPS_KEY = 'GT2_HOME_HIDDEN_GROUPS';
const HINT_DISMISSED_KEY = 'GT2_HOME_CHAT_HINT_DISMISSED';

const GROUP_BORDER_COLORS = ['#C4B5FD', '#FDE68A', '#F9A8D4', '#FDBA74', '#A5B4FC', '#86EFAC'];

const getUserId = (u: User | string): string => typeof u === 'string' ? u : u._id;

const hashGroupColor = (groupId: string): string => {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) hash = (hash + groupId.charCodeAt(i)) % GROUP_BORDER_COLORS.length;
  return GROUP_BORDER_COLORS[hash];
};

const PAST_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// How far out each recurring series shows in "Upcoming Meetups"; one-off meetups are never capped
const TAB_CAP_DAYS: Partial<Record<NonNullable<Meetup['frequency']>, number>> = {
  daily: 7, weekly: 15, biweekly: 15, monthly: 35, ordinal: 35,
  // Long enough that each series' next meetup is always on Home.
  quarterly: 100, semiannual: 200, yearly: 380,
};

// Buckets by (group, frequency) so each series gets its own cap, then merges back sorted by date
const capMeetupsByFrequency = (list: Meetup[]): Meetup[] => {
  const now = Date.now();
  const buckets = new Map<string, Meetup[]>();
  const uncapped: Meetup[] = [];

  list.forEach(m => {
    if (!m.frequency) { uncapped.push(m); return; }
    // Bucketed by (group, schedule, frequency) — including the schedule id keeps
    // two same-frequency named schedules on one group (e.g. a biweekly dinner and
    // a biweekly game night) from being merged into a single shared cap.
    const key = `${m.group._id}|${m.schedule ?? 'none'}|${m.frequency}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(m);
    buckets.set(key, bucket);
  });

  const capped: Meetup[] = [...uncapped];
  buckets.forEach((bucketMeetups, key) => {
    const frequency = key.split('|')[2] as NonNullable<Meetup['frequency']>;
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

type RsvpFilter = 'all' | 'undecided' | 'in' | 'out';

const FILTER_TABS: { key: RsvpFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'undecided', label: 'UNDECIDED' },
  { key: 'in', label: 'IN' },
  { key: 'out', label: 'OUT' },
];

// Pulses to 110% scale on tap (not just a color change) before invoking onPress.
const FilterPill = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => {
  const colors = useThemeColors();
  const scale = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(withTiming(1.1, { duration: 100 }), withTiming(1, { duration: 120 }));
    onPress();
  };

  return (
    <Reanimated.View style={pulseStyle}>
      <PressableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        style={{
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: active ? colors.brand : colors.border,
          backgroundColor: active ? colors.brand : colors.surface,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: active ? 'white' : colors.textMuted }}>
          {label}
        </Text>
      </PressableOpacity>
    </Reanimated.View>
  );
};

// --- Main Dashboard Screen ---

const DashboardScreen = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Real top inset; 0 while the offline banner (above the navigator) already covers it.
  const contentTopInset = useSafeAreaInsets().top;
  const { scheme } = useAppearance();
  const colors = useThemeColors();
  const { openMeetupId } = useLocalSearchParams<{ openMeetupId?: string }>();
  const [selectedMeetup, setSelectedMeetup] = useState<Meetup | null>(null);
  // Meetup whose Bring / Rides / Questions sheet is open (shown right after "I'm In" on a card).
  const [confirmMeetup, setConfirmMeetup] = useState<Meetup | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const meetupsQuery = useGetMeetups();
  const { data: meetups, isLoading, isError, refetch, dataUpdatedAt } = meetupsQuery;
  const { data: currentUser } = useQuery<User, Error>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
  const { mutate: rsvp, isBusyFor: isRsvpBusyFor, isQueuedFor: isRsvpQueuedFor } = useRsvp();
  const { data: groups } = useGetGroups();
  const meetupCapableGroups = useMemo(() => {
    if (!currentUser) return [];
    return (groups ?? []).filter(g => {
      if (g.isDM) return false;
      const gAny = g as any;
      const isOwner = (gAny.owner?._id || gAny.owner) === currentUser._id;
      const isMod = gAny.moderators?.some((m: any) => (m?._id || m) === currentUser._id);
      return isOwner || isMod;
    });
  }, [groups, currentUser]);
  const [addMeetupVisible, setAddMeetupVisible] = useState(false);
  const [addMeetupInitialMode, setAddMeetupInitialMode] = useState<'existing' | 'new'>('existing');
  const [showAddChoicePicker, setShowAddChoicePicker] = useState(false);
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(new Set());
  const [rsvpFilter, setRsvpFilter] = useState<RsvpFilter>('all');

  const [filterOpen, setFilterOpen] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  // The list waits for these saved settings, so the hint and hidden groups are right on the
  // first frame instead of popping out mid fade-up and jumping the cards.
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Realtime + the 5-minute stale time already keep this fresh; only refetch on focus when it's a bit old.
  useFocusEffect(useCallback(() => {
    if (Date.now() - dataUpdatedAt > 30_000) refetch();
  }, [refetch, dataUpdatedAt]));

  // Remembered between launches: which groups are hidden and whether the chat hint was dismissed.
  useEffect(() => {
    AsyncStorage.multiGet([HIDDEN_GROUPS_KEY, HINT_DISMISSED_KEY]).then(([[, hidden], [, hint]]) => {
      try { if (hidden) setHiddenGroupIds(new Set(JSON.parse(hidden))); } catch {}
      if (hint === '1') setHintDismissed(true);
    }).catch(() => {}).finally(() => setPrefsLoaded(true));
  }, []);

  // Offline, this says so and stops instead of spinning until the connection is back.
  const { refreshing: isPullRefreshing, refresh: handlePullRefresh } = useRefreshOrToast([
    () => refetch(),
    () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
    () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  ]);

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

  const saveHidden = (next: Set<string>) => {
    AsyncStorage.setItem(HIDDEN_GROUPS_KEY, JSON.stringify([...next])).catch(() => {});
  };

  const toggleGroup = useCallback((groupId: string) => {
    haptic.select();
    setHiddenGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      saveHidden(next);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    haptic.select();
    setHiddenGroupIds(prev => {
      const next = prev.size === 0 ? new Set(uniqueGroups.map(g => g._id)) : new Set<string>();
      saveHidden(next);
      return next;
    });
  }, [uniqueGroups]);

  const groupedMeetups = useMemo(() => {
    const groups: GroupedMeetups = {
      'Upcoming': [],
      'Past Week': [],
    };
    if (!meetups) return groups;

    const upcomingCandidates: Meetup[] = [];
    // The server keeps finished meetups for ~10 days before cleanup, so trim
    // "Past Week" to meetups that actually ended within the last 7 days.
    const pastCutoff = Date.now() - PAST_WEEK_MS;

    meetups.forEach(meetup => {
      if (hiddenGroupIds.has(meetup.group._id)) return;
      const { isExpired } = getMeetupStatus(meetup);
      if (isExpired) {
        if (meetupEndInstant(meetup).getTime() >= pastCutoff) groups['Past Week'].push(meetup);
      } else {
        upcomingCandidates.push(meetup);
      }
    });

    groups['Upcoming'] = capMeetupsByFrequency(upcomingCandidates);
    groups['Past Week'].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return groups;
  }, [meetups, hiddenGroupIds]);

  // Guarded on currentUser being loaded — until then, only "All" (which needs no RSVP
  // status) can be computed, so every other tab renders empty rather than crashing.
  const filteredUpcomingMeetups = useMemo(() => {
    const upcoming = groupedMeetups['Upcoming'];
    if (rsvpFilter === 'all') return upcoming;
    if (!currentUser) return [];

    return upcoming.filter(meetup => {
      switch (rsvpFilter) {
        case 'in':
          return meetup.in.some(u => getUserId(u) === currentUser._id)
            || meetup.waitlist.some(u => getUserId(u) === currentUser._id);
        case 'out':
          return meetup.out.some(u => getUserId(u) === currentUser._id);
        case 'undecided':
          return meetup.undecided.includes(currentUser._id);
        default:
          return true;
      }
    });
  }, [groupedMeetups, rsvpFilter, currentUser]);

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
    rsvp({ meetupId: meetup._id, status, skipResponsePopup: mute }, {
      onSuccess: (data: any) => {
        const updated: Meetup | undefined = data?.meetup;
        // Newly "In": one tabbed sheet for Stuff to bring / Rides / Questions, while any is unpicked.
        if (status === 'in' && updated && shouldPromptAfterIn(updated, currentUser._id)) {
          setConfirmMeetup(updated);
        }
        if (status === 'in' && guestCount > 0) {
          meetupApi.setGuestCount(api, meetup._id, guestCount)
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['meetups'] });
              broadcastMeetupUpdate(getToken, meetup.group._id);
            })
            .catch((e: any) => Alert.alert(
              'Note',
              e?.response?.status === 409 && e.response.data?.message
                ? `You're in, but your guests weren't added. ${e.response.data.message}`
                : 'RSVP saved, but guests could not be added. Try from the meetup details.'
            ));
        }
        if (mute) {
          // Undo puts back whatever mute the member had before (it may have been a partial one).
          const previousMute = muteStateFor(currentUser, meetup.group._id);
          userApi.toggleGroupMute(api, meetup.group._id, 'untilNext')
            .then(() => toast.show({
              message: `Out. ${meetup.group.name} muted until the next meetup.`,
              kind: 'success',
              actionLabel: 'Undo',
              onAction: () => {
                const { muteType, kinds } = restoreRequest(previousMute);
                userApi.toggleGroupMute(api, meetup.group._id, muteType, muteType === 'none' ? undefined : kinds)
                  .then(() => queryClient.invalidateQueries({ queryKey: ['currentUser'] })).catch(() => {});
              },
            }))
            .catch(() => {});
        }
      },
    });
  };

  // The "tap to see more" hint bubble reuses the warning token's hue but needs its own
  // (lighter-weight) fill/border, so it's kept local instead of adding a one-off theme token.
  const hintBg = scheme === 'dark' ? '#3A2E12' : '#FFFBEB';
  const hintBorder = scheme === 'dark' ? '#5B4A1E' : '#FDE68A';

  // --- List rows (virtualized) ---
  type Row =
    | { key: string; kind: 'day'; label: string }
    | { key: string; kind: 'card'; meetup: Meetup; past: boolean }
    | { key: string; kind: 'pastHeader' };

  const listRows = useMemo<Row[]>(() => {
    const rows: Row[] = [];
    splitByDay(filteredUpcomingMeetups).forEach(day => {
      rows.push({ key: `day-${day.key}`, kind: 'day', label: day.label });
      day.items.forEach((meetup: Meetup) => rows.push({ key: meetup._id, kind: 'card', meetup, past: false }));
    });
    if (groupedMeetups['Past Week'].length > 0) {
      rows.push({ key: 'past-header', kind: 'pastHeader' });
      splitByDay(groupedMeetups['Past Week']).forEach(day => {
        rows.push({ key: `past-day-${day.key}`, kind: 'day', label: day.label });
        day.items.forEach((meetup: Meetup) => rows.push({ key: `past-${meetup._id}`, kind: 'card', meetup, past: true }));
      });
    }
    return rows;
  }, [filteredUpcomingMeetups, groupedMeetups]);

  // Header sections take cascade slots 0–3, so list rows start at 4.
  const renderRow = ({ item, index }: { item: Row; index: number }) => (
    <FadeUp index={index + 4}>{renderRowContent(item)}</FadeUp>
  );

  const renderRowContent = (item: Row) => {
    if (item.kind === 'day') return <DayHeader label={item.label} />;
    if (item.kind === 'pastHeader') {
      return (
        <Text style={{ fontSize: 12, fontWeight: '900', color: colors.accentCoral, marginTop: 24, marginBottom: 8, paddingHorizontal: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Past Week
        </Text>
      );
    }
    const { meetup, past } = item;
    if (past) {
      return (
        <MeetupCard
          meetup={meetup}
          onPress={() => handleOpenModal(meetup)}
          showRsvpButtons={false}
          onRsvp={() => {}}
          isRsvping={false}
          currentUser={currentUser}
        />
      );
    }
    return (
      <MeetupCard
        meetup={meetup}
        onPress={() => handleOpenModal(meetup)}
        showRsvpButtons={true}
        onRsvp={(status, guestCount, mute) => handleDashboardRsvp(meetup, status, guestCount, mute)}
        isRsvping={isRsvpBusyFor(meetup._id)}
        rsvpQueued={isRsvpQueuedFor(meetup._id)}
        currentUser={currentUser}
      />
    );
  };

  const hasHiddenAll = uniqueGroups.length > 0 && hiddenGroupIds.size >= uniqueGroups.length;
  const noUpcomingAtAll = groupedMeetups['Upcoming'].length === 0;

  const listHeader = (
    <View>
      <FadeUp index={0}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}>
          {/* Shrinks to fit: on narrow Android phones or with a larger system font, the title pushed
              the group filter button off the edge of the screen. */}
          <Text
            style={{ fontSize: 32, fontWeight: '900', color: colors.brand, letterSpacing: -1, flexShrink: 1 }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            Upcoming Meetups
          </Text>
          {uniqueGroups.length > 1 && (
            <PressableOpacity
              onPress={() => setFilterOpen(prev => !prev)}
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, position: 'relative' }}
            >
              <Feather name="sliders" size={18} color={colors.brand} />
              {hiddenGroupIds.size > 0 && (
                <View style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentCoral }} />
              )}
            </PressableOpacity>
          )}
        </View>
      </FadeUp>

      <FadeUp index={1}>
        <TourTarget target="filters" fill>
        <View style={{ flexDirection: 'row', paddingHorizontal: 8, marginTop: 12, marginBottom: 10, gap: 8 }}>
          {FILTER_TABS.map(tab => (
            <FilterPill
              key={tab.key}
              label={tab.label}
              active={rsvpFilter === tab.key}
              onPress={() => setRsvpFilter(tab.key)}
            />
          ))}
        </View>
        </TourTarget>
      </FadeUp>

      {!hintDismissed && (
        <FadeUp index={2}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 8, gap: 6 }}>
            <Text style={{ fontSize: 13, color: colors.textFaint, fontWeight: '500' }}>
              Tap
            </Text>
            <View style={{
              width: 36, height: 36, borderRadius: 10,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, backgroundColor: hintBg, borderColor: hintBorder,
            }}>
              <Feather name="calendar" size={18} color={colors.warning} />
            </View>
            <Text style={{ flex: 1, fontSize: 13, color: colors.textFaint, fontWeight: '500' }}>
              in your Group Chat to see more meetups!
            </Text>
            <PressableOpacity
              accessibilityLabel="Dismiss hint"
              hitSlop={10}
              onPress={() => { setHintDismissed(true); AsyncStorage.setItem(HINT_DISMISSED_KEY, '1').catch(() => {}); }}
            >
              <Feather name="x" size={16} color={colors.textFaint} />
            </PressableOpacity>
          </View>
        </FadeUp>
      )}

      {filterOpen && uniqueGroups.length > 1 && (
        <FadeUp index={3}>
          <View style={{ paddingHorizontal: 8, paddingBottom: 4 }}>
            <PressableOpacity
              onPress={toggleAll}
              activeOpacity={0.7}
              haptic={false}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border, marginBottom: 2 }}
            >
              <Text style={{ flex: 1, fontSize: 15, color: colors.textPrimary, fontWeight: '700' }}>All</Text>
              <View style={{
                width: 20, height: 20, borderRadius: 5,
                borderWidth: 1.5,
                borderColor: hiddenGroupIds.size === 0 ? colors.brand : colors.borderStrong,
                backgroundColor: hiddenGroupIds.size === 0 ? colors.brand : 'transparent',
                justifyContent: 'center', alignItems: 'center',
              }}>
                {hiddenGroupIds.size === 0 && <Feather name="check" size={12} color="#fff" />}
              </View>
            </PressableOpacity>
            {uniqueGroups.map(group => {
              const isVisible = !hiddenGroupIds.has(group._id);
              const color = hashGroupColor(group._id);
              return (
                <PressableOpacity
                  key={group._id}
                  onPress={() => toggleGroup(group._id)}
                  activeOpacity={0.7}
                  haptic={false}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10 }}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
                  <Text style={{ flex: 1, fontSize: 15, color: colors.textSecondary, fontWeight: '500' }}>{group.name}</Text>
                  <View style={{
                    width: 20, height: 20, borderRadius: 5,
                    borderWidth: 1.5,
                    borderColor: isVisible ? colors.brand : colors.borderStrong,
                    backgroundColor: isVisible ? colors.brand : 'transparent',
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    {isVisible && <Feather name="check" size={12} color="#fff" />}
                  </View>
                </PressableOpacity>
              );
            })}
          </View>
        </FadeUp>
      )}

      {/* Empty states: never leave the screen blank */}
      {meetups?.length === 0 ? (
        <FadeUp index={3}><View className="bg-white dark:bg-gray-900 p-5 my-2 rounded-2xl items-center border border-gray-100 dark:border-gray-800">
          <Text style={{ fontSize: 16, color: colors.brand, marginBottom: 14, textAlign: 'center' }}>
            You have no upcoming meetups.
          </Text>
          <TourTarget target="create-group" style={{ alignSelf: 'center' }}>
          <PressableOpacity
            onPress={() => router.push('/create-group')}
            style={{ backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Create a group</Text>
          </PressableOpacity>
          </TourTarget>
        </View></FadeUp>
      ) : hasHiddenAll ? (
        <FadeUp index={3}><View className="bg-white dark:bg-gray-900 p-5 my-2 rounded-2xl items-center border border-gray-100 dark:border-gray-800">
          <Text style={{ fontSize: 14, color: colors.textFaint, fontWeight: '500', marginBottom: 12, textAlign: 'center' }}>
            All your groups are hidden by the filter.
          </Text>
          <PressableOpacity onPress={toggleAll} style={{ backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Show all groups</Text>
          </PressableOpacity>
        </View></FadeUp>
      ) : noUpcomingAtAll ? (
        <FadeUp index={3}><View className="bg-white dark:bg-gray-900 p-5 my-2 rounded-2xl items-center border border-gray-100 dark:border-gray-800">
          <Text style={{ fontSize: 14, color: colors.textFaint, fontWeight: '500', textAlign: 'center' }}>
            Nothing coming up. Open a group chat and tap the calendar to schedule the next one.
          </Text>
        </View></FadeUp>
      ) : filteredUpcomingMeetups.length === 0 ? (
        <FadeUp index={3}><View className="bg-white dark:bg-gray-900 p-5 my-2 rounded-2xl items-center border border-gray-100 dark:border-gray-800">
          <Text style={{ fontSize: 14, color: colors.textFaint, fontWeight: '500' }}>
            {rsvpFilter === 'in' ? "You're not marked In for any upcoming meetup." :
             rsvpFilter === 'out' ? "You're not marked Out for any upcoming meetup." :
             "Nothing undecided — you're all caught up."}
          </Text>
        </View></FadeUp>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView
      className="flex-1 bg-gray-50 dark:bg-black"
      edges={['left', 'right']}
      style={{ paddingTop: contentTopInset }}
    >
      {/* First-visit tour, only while there are no meetups at all (utils/emptyScreenTours.ts). */}
      <ScreenTour
        tourKey={TOURS.meetupsEmpty}
        steps={meetupsEmptyTourSteps}
        welcome={meetupsWelcome}
        enabled={meetupsEmptyTourEnabled({ loaded: !isLoading && prefsLoaded && !isOfflineEmpty(meetupsQuery) && !isError, meetups })}
        user={currentUser}
      >
      <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <TourTarget target="bell" style={{ alignSelf: 'center' }}><View><NotificationBell /></View></TourTarget>
        <Text className="text-xl font-black text-gray-900 dark:text-gray-100">Meetups</Text>
        <TourTarget target="add" style={{ alignSelf: 'center' }}>
        <PressableOpacity
          onPress={() => setShowAddChoicePicker(true)}
          style={{ alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather name="plus-circle" size={26} color={colors.brand} />
        </PressableOpacity>
        </TourTarget>
      </View>

      {isLoading || !prefsLoaded ? (
        <View style={{ flex: 1, padding: 16 }}><SkeletonList kind="meetup" count={3} /></View>
      ) : isOfflineEmpty(meetupsQuery) ? (
        <OfflineEmptyState message="Connect to the internet to load your meetups." onRetry={handlePullRefresh} />
      ) : isError && !meetups ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ textAlign: 'center', color: colors.textMuted, fontSize: 16, marginBottom: 16 }}>Couldn't load your meetups.</Text>
          <PressableOpacity onPress={() => refetch()} style={{ backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Try again</Text>
          </PressableOpacity>
        </View>
      ) : (
        // Mounted with the loaded list (not during the skeleton) so the cascade clock starts
        // when real content first appears; replays on every later focus.
        <FadeUpScreen>
          <FlatList
            data={listRows}
            keyExtractor={(row) => row.key}
            renderItem={renderRow}
            ListHeaderComponent={listHeader}
            ListFooterComponent={<View style={{ height: 40 }} />}
            contentContainerStyle={{ padding: 16, flexGrow: 1, paddingBottom: tabScreenBottomPadding(insets.bottom) }}
            refreshControl={<RefreshControl refreshing={isPullRefreshing} onRefresh={handlePullRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
            initialNumToRender={8}
            windowSize={9}
            removeClippedSubviews={false}
          />
        </FadeUpScreen>
      )}

      {/* Fully unmounted (not just visible={false}) between opens — on Android,
          leaving this Modal permanently mounted and only toggling `visible` causes
          the native Dialog to stop re-presenting after the first reopen or two. */}
      {isModalVisible && (
        <Modal
          visible={isModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => { if (!runBackInterceptor()) handleCloseModal(); }}
        >
          <MeetupDetailModal meetup={selectedMeetup} onClose={handleCloseModal} />
        </Modal>
      )}

      {/* Unmounted when closed, for the same Android reason as above. */}
      {confirmMeetup && currentUser && (
        <MeetupConfirmSheet
          visible
          // The live copy, so a refresh (e.g. an item someone just took) reaches the open sheet.
          meetup={meetups?.find(m => m._id === confirmMeetup._id) ?? confirmMeetup}
          currentUserId={currentUser._id}
          onClose={() => setConfirmMeetup(null)}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['meetups'] });
            broadcastMeetupUpdate(getToken, confirmMeetup.group._id);
          }}
          onStale={() => queryClient.invalidateQueries({ queryKey: ['meetups'] })}
        />
      )}

      {/* MeetupDetailModal renders its own instance while open (a nested RN
          Modal can fail to present on iOS), so skip this one then to avoid
          both firing off the same RSVP and showing the burst twice. */}
      {!isModalVisible && <RsvpResponseOverlay />}

      <ActionSheet
        visible={showAddChoicePicker}
        onClose={() => setShowAddChoicePicker(false)}
        items={[
          {
            key: 'new-group',
            label: 'Create New Group',
            icon: <Feather name="users" size={18} color="#7C3AED" />,
            iconBg: scheme === 'dark' ? '#2A1F45' : '#F5F3FF',
            onPress: () => router.push('/create-group'),
          },
          ...(meetupCapableGroups.length > 0 ? [{
            key: 'existing-group',
            label: 'Add Meetup to Existing Group',
            icon: <Feather name="calendar" size={18} color="#16A34A" />,
            iconBg: scheme === 'dark' ? '#132A1E' : '#F0FDF4',
            onPress: () => { setAddMeetupInitialMode('existing'); setAddMeetupVisible(true); },
          }] : []),
          {
            key: 'one-time',
            label: 'Create One-Time Meetup',
            icon: <Feather name="plus-circle" size={18} color="#0EA5E9" />,
            iconBg: scheme === 'dark' ? '#1A2A42' : '#F0F9FF',
            onPress: () => { setAddMeetupInitialMode('new'); setAddMeetupVisible(true); },
          },
        ]}
      />

      <AddMeetupWizard
        visible={addMeetupVisible}
        onClose={() => setAddMeetupVisible(false)}
        groupPickerMode={{
          groups: meetupCapableGroups,
          initialMode: addMeetupInitialMode,
          onMeetupCreated: (groupId) => {
            setAddMeetupVisible(false);
            router.push({ pathname: '/add-members/[id]', params: { id: groupId } });
          },
        }}
      />
      </ScreenTour>
    </SafeAreaView>
  );
};

export default DashboardScreen;
