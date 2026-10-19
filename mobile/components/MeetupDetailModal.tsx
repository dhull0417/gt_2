import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    Image,
    Alert,
    ActivityIndicator,
    TextInput,
    Modal,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Dimensions,
    Share
} from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { getMaxAttendeesError } from '@/utils/scheduleConstants';
import { FREQUENCY_LABELS, buildFrequencyDetail } from '@/utils/meetupFrequency';
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import VideoServiceIcon from './VideoServiceIcon';
import { detectVideoService } from '../utils/videoLinks';
import { openLocation } from '../utils/openLink';
import { getUserDisplayName, getUserInitial } from '../utils/groupDisplay';
import Animated, {
    FadeIn,
    FadeOut,
    LinearTransition,
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/expo';
import { Meetup, User, useApiClient, userApi, meetupApi, groupApi } from '@/utils/api';
import { getMeetupStatus, isRsvpDeadlinePassed as isRsvpDeadlinePassedFn, isRsvpLockedFor, describeRsvpOpensFor, canPriorityBump } from '@/utils/meetupStatus';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRsvp } from '@/hooks/useRsvp';
import MeetupAssignments, { AssignmentsSheet } from '@/components/MeetupAssignments';
import { assignmentsActive, summarizeAssignments } from '@/utils/assignments';
import MeetupQuestions from '@/components/MeetupQuestions';
import MeetupTeams from '@/components/MeetupTeams';
import { questionsActive, hasAnsweredAny } from '@/utils/questions';
import { broadcastMeetupUpdate } from '@/utils/groupRealtime';
import RsvpResponseOverlay from '@/components/RsvpResponseOverlay';
import { useGetMeetups } from '@/hooks/useGetMeetups';
import { RsvpBreather } from '@/components/RsvpBreather';
import { useRouter } from 'expo-router';
import * as Calendar from 'expo-calendar';
import NativeTimePicker from './NativeTimePicker';
import LocationField from './LocationField';
import LocationSearchModal from './LocationSearchModal';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAppearance, useThemeColors } from '@/contexts/AppearanceContext';
import { PulsingWatermark } from '@/components/meetup-detail/PulsingWatermark';
import { InOutSwapIcon } from '@/components/meetup-detail/InOutSwapIcon';
import { styles, dmStyles } from '@/components/meetup-detail/styles';

interface MeetupDetailModalProps {
  meetup: Meetup | null;
  onClose: () => void;
}

// Extracts user ID whether the array holds strings or populated objects
const getUserId = (u: User | string): string => typeof u === 'string' ? u : u._id;

const MeetupDetailModal = ({ meetup: initialMeetup, onClose }: MeetupDetailModalProps) => {
    const api = useApiClient();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { getToken } = useAuth();
    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const isDark = scheme === 'dark';

    const [meetup, setMeetup] = useState<Meetup | null>(initialMeetup);
    const { data: allMeetups } = useGetMeetups();
    const [swapIconNonce, setSwapIconNonce] = useState(0);

    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [newDate, setNewDate] = useState(new Date());
    const [tempDate, setTempDate] = useState(new Date());
    const [newTime, setNewTime] = useState('');
    const [capacityMode, setCapacityMode] = useState<"unlimited" | "limited">("unlimited");
    const [newCapacity, setNewCapacity] = useState('');
    const [newLocation, setNewLocation] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [isLocationSearchActive, setIsLocationSearchActive] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [dmTargetUser, setDmTargetUser] = useState<User | null>(null);
    // Member an owner/moderator is editing assignments for.
    const [assignTarget, setAssignTarget] = useState<User | null>(null);
    const [isCreatingDM, setIsCreatingDM] = useState(false);
    const [isSendingReminder, setIsSendingReminder] = useState(false);
    const [isUpdatingTargetRsvp, setIsUpdatingTargetRsvp] = useState(false);

    const capacityError = getMaxAttendeesError(capacityMode, newCapacity);
    const canSaveCapacity = capacityMode !== "limited" || (newCapacity !== "" && !capacityError);

    useEffect(() => {
        setMeetup(initialMeetup);
        setDescriptionExpanded(false);
        descriptionChevronRotation.value = 0;
        setLocationExpanded(false);
        locationChevronRotation.value = 0;
    }, [initialMeetup]);

    useEffect(() => {
        if (allMeetups && meetup) {
            const updated = allMeetups.find(e => e._id === meetup._id);
            if (updated) setMeetup(updated);
        }
    }, [allMeetups]);

    const { data: currentUser } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });

    const { mutate: rsvp, isPending: isRsvping } = useRsvp();

    const [assignmentsSignal, setAssignmentsSignal] = useState(0);
    const [questionsSignal, setQuestionsSignal] = useState(0);
    // Set when the questions sheet should follow the assignments sheet.
    const questionsAfterAssignments = useRef(false);
    const [localGuestCount, setLocalGuestCount] = useState(0);
    const [isSettingGuests, setIsSettingGuests] = useState(false);
    const [guestExpanded, setGuestExpanded] = useState(false);
    const [descriptionExpanded, setDescriptionExpanded] = useState(false);
    const descriptionChevronRotation = useSharedValue(0);
    const descriptionChevronStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${descriptionChevronRotation.value}deg` }],
    }));
    const descriptionPressScale = useSharedValue(1);
    const descriptionPressStyle = useAnimatedStyle(() => ({
        transform: [{ scale: descriptionPressScale.value }],
    }));
    const [locationExpanded, setLocationExpanded] = useState(false);
    const [locationTruncated, setLocationTruncated] = useState(false);
    const locationChevronRotation = useSharedValue(0);
    const locationChevronStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${locationChevronRotation.value}deg` }],
    }));
    const [manualRsvpEdit, setManualRsvpEdit] = useState(false);
    const [isActionsMenuVisible, setIsActionsMenuVisible] = useState(false);
    const [actionsMenuAnchor, setActionsMenuAnchor] = useState<{ top: number; left: number; pointerLeft: number } | null>(null);
    const moreBtnRef = useRef<View>(null);

    const openActionsMenu = () => {
        moreBtnRef.current?.measureInWindow((x, y, width, height) => {
            const screenWidth = Dimensions.get('window').width;
            const cardWidth = 200;
            const pointerSize = 14;
            const margin = 12;
            const buttonCenterX = x + width / 2;
            const left = Math.min(
                Math.max(buttonCenterX - cardWidth / 2, margin),
                screenWidth - cardWidth - margin
            );
            const pointerLeft = Math.min(
                Math.max(buttonCenterX - left - pointerSize / 2, 12),
                cardWidth - 12 - pointerSize
            );
            setActionsMenuAnchor({ top: y + height + 36, left, pointerLeft });
            setIsActionsMenuVisible(true);
        });
    };

    useEffect(() => {
        if (!isSettingGuests && meetup && currentUser) {
            const entry = meetup.guests?.find(g => g.userId === currentUser.clerkId);
            setLocalGuestCount(entry?.count ?? 0);
        }
    }, [meetup, currentUser, isSettingGuests]);

    const waitlistUsers = (meetup?.waitlist || [])
        .map(u => (meetup?.members || []).find(m => m._id === getUserId(u)))
        .filter((u): u is User => !!u);

    if (!meetup || !currentUser) return null;

    const meetupGroupId = typeof meetup.group === 'string' ? meetup.group : meetup.group._id;

    // --- READ-ONLY & PERMISSIONS LOGIC ---
    const isOwner = typeof meetup.group === 'object' ? meetup.group.owner === currentUser._id : false;
    const groupData = meetup.group as any;
    const isMod = typeof meetup.group === 'object' && Array.isArray(groupData.moderators)
        ? groupData.moderators.some((m: any) => typeof m === 'string' ? m === currentUser._id : m._id === currentUser._id)
        : false;

    const { isCancelled, isExpired, isHappeningNow } = getMeetupStatus(meetup);

    const isRsvpLocked = isRsvpLockedFor(meetup, currentUser?._id);

    const isRsvpDeadlinePassed = isRsvpDeadlinePassedFn(meetup);

    // Controls all "adjustment" UI
    const isReadOnly = isCancelled || isExpired;
    const canManage = (isOwner || isMod) && !isReadOnly;

    // Whoever created this one-off meetup can also edit/cancel it, even without owner/mod
    // status — but NOT override other members' RSVPs or send reminders (canManage handles those).
    const createdBy = (meetup as any).createdBy;
    const isCreator = !!createdBy && (typeof createdBy === 'string' ? createdBy === currentUser._id : createdBy._id === currentUser._id);
    const canEditOrCancel = (isOwner || isMod || isCreator) && !isReadOnly;
    // A cancelled (but not yet expired) meetup can still be restored by the same
    // set of people who could cancel it — unlike canEditOrCancel, this stays true
    // while isCancelled so the "Reactivate" action remains reachable.
    const canCancelOrRestore = (isOwner || isMod || isCreator) && !isExpired;

    // Owner can override any RSVP; a moderator can override only regular members.
    const canManageTarget = (target: User): boolean =>
        canManage && target._id !== currentUser._id && (
            isOwner || (
                groupData.owner !== target._id &&
                !(Array.isArray(groupData.moderators) && groupData.moderators.some((m: any) => (typeof m === 'string' ? m : m._id) === target._id))
            )
        );

    const isFull = meetup.capacity > 0 && (meetup.in?.length || 0) >= meetup.capacity;
    const isWaitlisted = meetup.waitlist?.some(u => getUserId(u) === currentUser._id) || false;
    const isIn = meetup.in?.some(u => getUserId(u) === currentUser._id) || false;
    const isOut = meetup.out?.some(u => getUserId(u) === currentUser._id) || false;
    const hasRsvpResponse = isIn || isOut || isWaitlisted;
    const showRsvpSelector = !hasRsvpResponse || manualRsvpEdit;
    // Waitlists are a Premium feature of the group owner: on a full meetup in a
    // non-Premium group there is nothing to join, so the button reads "Full".
    // (Only `=== false` counts, so a missing flag never blocks; the server enforces.)
    const waitlistLocked = isFull && !isIn && !isWaitlisted && meetup.group?.isPremium === false;
    const canBump = canPriorityBump(meetup, currentUser?._id);
    const inUnselected = !isIn && !isWaitlisted && !(isFull && !isIn);
    const outUnselected = !isOut;
    const isUndecided = inUnselected && outUnselected;
    // While undecided, fill both buttons like they're selected so neither reads as the "default" choice.
    const inFilled = !inUnselected || isUndecided;
    const outFilled = !outUnselected || isUndecided;

    // Tint matches RSVP button colors: amber until responded, green (in/waitlisted), red (out).
    // Dark mode swaps in muted, low-saturation versions of the same hues (mirrors MeetupCard).
    const modalBackgroundColor = isDark
        ? (isOut ? '#3A1F1F' : (isIn || isWaitlisted) ? '#16261D' : colors.surfaceAlt)
        : (isOut ? '#FEF2F2' : (isIn || isWaitlisted) ? '#EDF5F0' : '#FFFEFA');

    const goingUsers = (meetup.members || []).filter(m => meetup.in?.some(u => getUserId(u) === m._id));
    const outUsers = (meetup.members || []).filter(m => meetup.out?.some(u => getUserId(u) === m._id));

    // Guests stay tied to host's clerkId even after the host RSVPs 'out' (Keep Guests).
    // Host then drops from goingUsers, so surface guests as their own row.
    const orphanGuestEntries = (meetup.guests || []).filter(g => {
        if (!g.count) return false;
        return !goingUsers.some(user => (user as any).clerkId === g.userId);
    });
    // Every user with guests gets its own tile (not just orphans), in the In grid.
    const allGuestEntries = (meetup.guests || []).filter(g => !!g.count);
    const totalGuestsForInTab = goingUsers.reduce((sum, user) => {
        const entry = (meetup.guests || []).find(g => g.userId === (user as any).clerkId);
        return sum + (entry?.count ?? 0);
    }, 0) + orphanGuestEntries.reduce((sum, g) => sum + g.count, 0);

    const respondedIds = new Set([
        ...(meetup.in || []).map(getUserId),
        ...(meetup.out || []).map(getUserId),
        ...(meetup.waitlist || []).map(getUserId),
    ]);
    const undecidedUsers = (meetup.members || []).filter(m => !respondedIds.has(m._id));

    const performRsvp = (status: 'in' | 'out', opts?: { skipResponsePopup?: boolean }) => {
        rsvp({ meetupId: meetup._id, status, skipResponsePopup: opts?.skipResponsePopup }, {
            onSuccess: (data: any) => {
                queryClient.invalidateQueries({ queryKey: ['meetups'] });
                if (data.meetup) setMeetup(data.meetup);
                setManualRsvpEdit(false);
                // Newly "In" on a meetup with things to bring / rides: ask right away.
                if (status === 'in' && data.meetup && assignmentsActive(data.meetup)
                    && !data.meetup.bringClaims?.some((c: any) => c.user === currentUser._id)
                    && !data.meetup.rides?.some((r: any) => r.user === currentUser._id)
                    && !data.meetup.waitlist?.some((u: any) => (typeof u === 'string' ? u : u._id) === currentUser._id)) {
                    setAssignmentsSignal((n) => n + 1);
                    questionsAfterAssignments.current = questionsActive(data.meetup) && !hasAnsweredAny(data.meetup, currentUser._id);
                } else if (status === 'in' && data.meetup && questionsActive(data.meetup)
                    && !hasAnsweredAny(data.meetup, currentUser._id)
                    && !data.meetup.waitlist?.some((u: any) => (typeof u === 'string' ? u : u._id) === currentUser._id)) {
                    setQuestionsSignal((n) => n + 1);
                }
            },
            onError: (error: any) => {
                Alert.alert("RSVP Failed", error.response?.data?.error || "An error occurred while updating your RSVP.");
            }
        });
    };

    const performSetGuests = async (count: number) => {
        setLocalGuestCount(count);
        setIsSettingGuests(true);
        try {
            const result = await meetupApi.setGuestCount(api, meetup._id, count);
            queryClient.invalidateQueries({ queryKey: ['meetups'] });
            broadcastMeetupUpdate(getToken, meetupGroupId);
            if (result.meetup) setMeetup(result.meetup);
        } catch {
            const prev = meetup.guests?.find(g => g.userId === currentUser.clerkId)?.count ?? 0;
            setLocalGuestCount(prev);
            Alert.alert('Error', 'Could not update your guests. Please try again.');
        } finally {
            setIsSettingGuests(false);
        }
    };



    const handleRsvpAction = (status: 'in' | 'out', opts?: { skipResponsePopup?: boolean }) => {
        if (isReadOnly || isRsvpLocked || isRsvpDeadlinePassed) return;
        if (status === 'out' && localGuestCount > 0) {
            Alert.alert(
                'Remove Guests?',
                'Remove your guests from this Meetup too?',
                [
                    { text: 'Keep Guests', onPress: () => performRsvp('out', opts) },
                    {
                        text: 'Remove Guests',
                        style: 'destructive',
                        onPress: async () => {
                            await performSetGuests(0);
                            performRsvp('out', opts);
                        },
                    },
                ]
            );
            return;
        }
        performRsvp(status, opts);
    };

    const handleRsvpOutAndMute = () => {
        setGuestExpanded(false);
        handleRsvpAction('out', { skipResponsePopup: true });
        userApi.toggleGroupMute(api, meetup.group._id, 'untilNext')
            .then(() => {
                Alert.alert('RSVP recorded: Out', `The ${meetup.group.name} chat has been muted until the next meetup.`);
            })
            .catch(() => {});
    };

    const handleAddToCalendar = async () => {
        const { status } = await Calendar.requestCalendarPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'Please allow calendar access in your device settings to add meetup events.');
            return;
        }

        const [time, modifier] = meetup.time.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;

        const startDate = new Date(meetup.date);
        startDate.setHours(hours, minutes, 0, 0);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
        const groupName = (meetup.group as any)?.name || '';

        try {
            // Search all calendars (including subscribed feed) for a duplicate
            const allCalendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
            const searchStart = new Date(startDate.getTime() - 60 * 1000);
            const searchEnd = new Date(startDate.getTime() + 60 * 1000);
            const existing = await Calendar.getEventsAsync(
                allCalendars.map(c => c.id),
                searchStart,
                searchEnd
            );

            const alreadyExists = existing.some(e =>
                e.title === meetup.name ||                          // added via this button
                e.title === `${groupName}: ${meetup.name}` ||      // added via calendar feed sync
                (e.notes?.includes(`groupthat-id:${meetup._id}`))  // tagged from a previous add
            );

            if (alreadyExists) {
                Alert.alert('Already on Your Calendar', 'This meetup is already saved to your calendar.');
                return;
            }

            let calendarId: string;
            if (Platform.OS === 'ios') {
                const defaultCal = await Calendar.getDefaultCalendarAsync();
                calendarId = defaultCal.id;
            } else {
                const writable = allCalendars.find(c => c.isPrimary && c.allowsModifications)
                    || allCalendars.find(c => c.allowsModifications);
                if (!writable) {
                    Alert.alert('Error', 'No writable calendar found on your device.');
                    return;
                }
                calendarId = writable.id;
            }

            await Calendar.createEventAsync(calendarId, {
                title: meetup.name,
                startDate,
                endDate,
                location: meetup.location || (meetup.group as any)?.defaultLocation || '',
                notes: `GroupThat meetup with ${groupName}\ngroupthat-id:${meetup._id}`,
                timeZone: meetup.timezone,
            });
            Alert.alert('Added!', `"${meetup.name}" has been added to your calendar.`);
        } catch {
            Alert.alert('Error', 'Could not add this event to your calendar. Please try again.');
        }
    };

    const handleOpenLocation = (address: string) => openLocation(address);

    const handleGoToChat = () => {
        onClose();
        router.push({
            pathname: '/group-chat/[id]',
            params: { id: meetup.group._id }
        });
    };

    const handleInviteToMeetup = async () => {
        try {
            const { link } = await groupApi.generateInviteLink(api, meetup.group._id);
            await Share.share({
                message: `Join me for "${meetup.name}" on GroupThat!\n\nSTEP 1 — Download the app:\n→ https://invite.groupthatapp.com/download\n\nSTEP 2 — Join the group:\n→ ${link}`,
            });
        } catch {
            Alert.alert('Error', 'Could not create invite link. Please try again.');
        }
    };

    const handleSendDM = async () => {
        if (!dmTargetUser) return;
        setIsCreatingDM(true);
        try {
            const { group } = await groupApi.createOrGetDM(api, dmTargetUser._id);
            queryClient.invalidateQueries({ queryKey: ['groups'] });
            setDmTargetUser(null);
            onClose();
            router.push({
                pathname: '/group-chat/[id]',
                params: { id: group._id }
            });
        } catch {
            Alert.alert('Error', 'Could not open DM. Please try again.');
        } finally {
            setIsCreatingDM(false);
        }
    };

    const handleSendReminder = async (userId?: string) => {
        setIsSendingReminder(true);
        try {
            await meetupApi.sendReminder(api, meetup._id, userId);
            setDmTargetUser(null);
            Alert.alert(
                'Reminder Sent',
                userId ? "They'll get a push notification to RSVP." : "All undecided members will get a push notification to RSVP."
            );
        } catch (e: any) {
            Alert.alert('Error', e.response?.data?.error || 'Could not send the reminder. Please try again.');
        } finally {
            setIsSendingReminder(false);
        }
    };

    const handleAdminRsvpChange = async (targetUserId: string, status: 'in' | 'out') => {
        setIsUpdatingTargetRsvp(true);
        try {
            const result = await meetupApi.handleRsvp(api, { meetupId: meetup._id, status, targetUserId });
            if (result.meetup) setMeetup(result.meetup);
            queryClient.invalidateQueries({ queryKey: ['meetups'] });
            broadcastMeetupUpdate(getToken, meetupGroupId);
            setDmTargetUser(null);
        } catch (e: any) {
            Alert.alert('Error', e.response?.data?.error || "Could not update their RSVP. Please try again.");
        } finally {
            setIsUpdatingTargetRsvp(false);
        }
    };

    const handleRemindAll = () => {
        Alert.alert(
            'Remind All Undecided?',
            `Send an RSVP reminder to all ${undecidedUsers.length} undecided member${undecidedUsers.length === 1 ? '' : 's'}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Send', onPress: () => handleSendReminder() },
            ]
        );
    };

    const handleUpdateMeetupDetails = async () => {
        if (isReadOnly || !canSaveCapacity) return;
        const payload: any = { meetupId: meetup._id };
        const capInt = capacityMode === "limited" ? parseInt(newCapacity, 10) : 0;

        if (newDate.toISOString().split('T')[0] !== new Date(meetup.date).toISOString().split('T')[0]) payload.date = newDate;
        if (newTime !== meetup.time) payload.time = newTime;
        if (newLocation !== (meetup.location || '')) payload.location = newLocation;
        if (newDescription !== (meetup.description || '')) payload.description = newDescription;
        if (capInt !== meetup.capacity) payload.capacity = capInt;

        if (Object.keys(payload).length <= 1) {
            setIsEditModalVisible(false);
            return;
        }
        
        setIsUpdating(true);
        try {
            const response = await meetupApi.updateMeetup(api, payload);
            await queryClient.invalidateQueries({ queryKey: ['meetups'] });
            if (response?.meetup) setMeetup(response.meetup);
            setIsEditModalVisible(false);
            Alert.alert("Success", "Meetup details updated.");
        } catch (error: any) {
            Alert.alert("Update Failed", error.response?.data?.error || error.message);
        } finally {
            setIsUpdating(false);
        }
    };

    const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            // Android's dialog has no Done button; closing on a pick (event.type 'set') IS
            // the confirm. A dismiss fires 'dismissed' with no selectedDate — don't fall back
            // to tempDate here, it only tracks the original date on this branch.
            setShowDatePicker(false);
            if (event.type === 'set' && selectedDate) {
                setNewDate(selectedDate);
            }
            return;
        }
        if (selectedDate) {
            setTempDate(selectedDate);
        }
    };

    const confirmIosDate = () => {
        setNewDate(tempDate);
        setShowDatePicker(false);
    };

    const openEditModal = () => {
        setNewDate(new Date(meetup.date));
        setTempDate(new Date(meetup.date));
        setNewTime(meetup.time);
        setCapacityMode(meetup.capacity > 0 ? "limited" : "unlimited");
        setNewCapacity(meetup.capacity > 0 ? meetup.capacity.toString() : "");
        setNewLocation(meetup.location || '');
        setNewDescription(meetup.description || '');
        setIsEditModalVisible(true);
    };

    // Items someone is bringing and their ride role, shown as pills under their name.
    const assignmentSummary = assignmentsActive(meetup) ? summarizeAssignments(meetup) : null;
    const renderAssignmentPills = (userId: string) => {
        if (!assignmentSummary) return null;
        const pills: { key: string; label: string; icon: keyof typeof Feather.glyphMap; bg: string; fg: string }[] = [];
        for (const item of assignmentSummary.items) {
            if (item.claimedBy.includes(userId)) {
                pills.push({ key: `i-${item._id}`, label: item.name, icon: 'shopping-bag', bg: '#F0FDFA', fg: '#0F766E' });
            }
        }
        const driver = assignmentSummary.drivers.find(d => d.userId === userId);
        if (driver) {
            pills.push({ key: 'driver', label: `Driver · ${driver.seats}`, icon: 'truck', bg: '#EEF6FF', fg: '#2563EB' });
        } else if (assignmentSummary.passengers.includes(userId)) {
            pills.push({ key: 'passenger', label: 'Needs ride', icon: 'user', bg: '#FFF7ED', fg: '#C2410C' });
        }
        if (pills.length === 0) return null;
        return (
            <View style={styles.pillStack}>
                {pills.map(p => (
                    <View key={p.key} style={[styles.assignPill, { backgroundColor: p.bg }]}>
                        <Feather name={p.icon} size={9} color={p.fg} />
                        <Text style={[styles.assignPillText, { color: p.fg }]} numberOfLines={1}>{p.label}</Text>
                    </View>
                ))}
            </View>
        );
    };

    const renderUserTile = (user: User, key: string, opts?: { waitlistPosition?: number }) => {
        const isSelf = user._id === currentUser._id;
        const Wrapper = isSelf ? View : PressableOpacity;
        const wrapperProps = isSelf ? {} : { onPress: () => setDmTargetUser(user), activeOpacity: 0.7 };
        return (
            <Wrapper key={key} style={styles.gridItem} {...wrapperProps}>
                <View style={styles.gridAvatarWrap}>
                    {user.profilePicture
                        ? <Image source={{ uri: user.profilePicture }} style={[styles.gridAvatar, { backgroundColor: colors.backgroundAlt }]} />
                        : (
                            <View style={[styles.gridAvatar, styles.gridAvatarPlaceholder, { backgroundColor: colors.backgroundAlt }]}>
                                <Feather name="user" size={22} color={colors.textFaint} />
                            </View>
                        )}
                    {opts?.waitlistPosition != null && (
                        <View style={[styles.waitlistBadge, { borderColor: colors.surface }]}>
                            <Text style={styles.waitlistBadgeText}>{opts.waitlistPosition}</Text>
                        </View>
                    )}
                </View>
                <Text style={[styles.gridName, { color: colors.textSecondary }]} numberOfLines={1}>{getUserDisplayName(user)}</Text>
                {renderAssignmentPills(user._id)}
            </Wrapper>
        );
    };

    const renderGuestTiles = (g: { userId: string; count: number }) => {
        const host = (meetup.members || []).find(m => (m as any).clerkId === g.userId);
        const hostName = host ? getUserDisplayName(host) : 'A member';
        return Array.from({ length: g.count }, (_, i) => (
            <View key={`guest-${g.userId}-${i}`} style={styles.gridItem}>
                <View style={[styles.gridAvatar, styles.gridAvatarPlaceholder, styles.guestAvatarPlaceholder]}>
                    <Feather name="user" size={22} color="#FFFFFF" />
                </View>
                <Text style={[styles.gridName, { color: colors.textSecondary }]} numberOfLines={1}>{hostName}&apos;s Guest</Text>
            </View>
        ));
    };

    const renderSectionHeader = (label: string, count: number, color: string, rightElement?: React.ReactNode) => (
        <View style={styles.sectionHeaderWrap}>
            <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionHeaderText, { color, marginBottom: 0 }]}>{label} - {count}</Text>
                {rightElement}
            </View>
            <View style={[styles.sectionHeaderLine, { backgroundColor: color, opacity: isDark ? 0.7 : 0.85 }]} />
        </View>
    );

    const handleCancelMeetup = () => {
        if (isExpired) return; // Can't cancel or restore an ended meetup
        const action = isCancelled ? "Reactivate" : "Cancel";
        Alert.alert(`${action} Meetup`, `Are you sure?`, [
            { text: "No", style: "cancel" },
            {
                text: "Yes",
                style: isCancelled ? "default" : "destructive",
                onPress: async () => {
                    try {
                        const newStatus = isCancelled ? 'scheduled' : 'cancelled';
                        if (isCancelled) {
                            await meetupApi.restoreMeetup(api, meetup._id);
                        } else {
                            await meetupApi.cancelMeetup(api, meetup._id);
                        }

                        // Apply the new status immediately — invalidateQueries alone leaves
                        // the card/modal showing the old status until the background
                        // refetch lands, which can take a beat (or longer offline).
                        setMeetup(prev => prev ? { ...prev, status: newStatus } : prev);
                        queryClient.setQueryData<Meetup[]>(['meetups'], (old) =>
                            old?.map(m => m._id === meetup._id ? { ...m, status: newStatus } : m)
                        );
                        queryClient.invalidateQueries({ queryKey: ['meetups'] });
                        broadcastMeetupUpdate(getToken, meetupGroupId);
                        if (!isCancelled) onClose();
                    } catch (e: any) {
                        Alert.alert("Error", e.response?.data?.error || e.message);
                    }
                }
            }
        ]);
    };


    const resolvedLocation = meetup.location || (meetup.group as any)?.defaultLocation || '';
    const headerVideoService = detectVideoService(resolvedLocation);
    const frequencyDetail = buildFrequencyDetail(meetup);
    const frequencyLabel = meetup.frequency
        ? `${FREQUENCY_LABELS[meetup.frequency]}${frequencyDetail ? ` (${frequencyDetail})` : ''}`
        : null;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: modalBackgroundColor }]} edges={['top', 'bottom']}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <PressableOpacity onPress={onClose} style={styles.closeButton}>
                    <Feather name="x" size={28} color={colors.textFaint} />
                </PressableOpacity>
                <Animated.View layout={LinearTransition.duration(300).easing(Easing.out(Easing.cubic))} style={styles.headerTitleContainer}>
                    <Text style={[styles.headerTitle, { color: colors.textFaint }]}>
                        {new Date(meetup.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: meetup.timezone })} • {meetup.time}
                    </Text>
                    {!!resolvedLocation && (
                        <View style={styles.headerLocationWrap}>
                            {/* Off-screen measuring clone — its full, unlimited-line layout tells us
                                whether the real (1-line) text below is actually being truncated. */}
                            <Text
                                style={[styles.headerLocation, styles.headerLocationMeasure]}
                                onTextLayout={(e) => setLocationTruncated(e.nativeEvent.lines.length > 1)}
                            >
                                {resolvedLocation}
                            </Text>
                            <Animated.View layout={LinearTransition.duration(300).easing(Easing.out(Easing.cubic))} style={styles.headerLocationRow}>
                                <Pressable
                                    onPress={() => handleOpenLocation(resolvedLocation)}
                                    style={styles.headerLocationTextWrap}
                                >
                                    <View style={styles.headerLocationInnerRow}>
                                        {!!headerVideoService && (
                                            <View style={styles.headerLocationIcon}>
                                                <VideoServiceIcon service={headerVideoService} size={14} />
                                            </View>
                                        )}
                                        <Animated.Text
                                            key={locationExpanded ? 'expanded' : 'collapsed'}
                                            entering={FadeIn.duration(200).delay(80)}
                                            exiting={FadeOut.duration(120)}
                                            style={[styles.headerLocation, { color: colors.textFaint }]}
                                            numberOfLines={locationExpanded ? undefined : 1}
                                        >
                                            {resolvedLocation}
                                        </Animated.Text>
                                    </View>
                                </Pressable>
                                {locationTruncated && (
                                    <Pressable
                                        onPress={() => {
                                            const next = !locationExpanded;
                                            setLocationExpanded(next);
                                            locationChevronRotation.value = withSpring(next ? 180 : 0, { damping: 12, stiffness: 160 });
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        }}
                                        hitSlop={8}
                                    >
                                        <Animated.View style={[styles.headerLocationChevron, locationChevronStyle]}>
                                            <Feather name="chevron-down" size={14} color={colors.textFaint} />
                                        </Animated.View>
                                    </Pressable>
                                )}
                            </Animated.View>
                        </View>
                    )}
                </Animated.View>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <View style={{ marginBottom: showRsvpSelector ? 32 : 14 }}>
                    {isCancelled && (
                        <View style={[
                            styles.cancelBanner,
                            { justifyContent: 'space-between', backgroundColor: isDark ? '#3B1E1E' : '#FEF2F2', borderColor: isDark ? '#5C2E2E' : '#FEE2E2' },
                        ]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                <Feather name="alert-triangle" size={18} color={colors.danger} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.cancelBannerText, { color: colors.danger }]}>
                                        {meetup.cancelReason === 'minimum-headcount' ? 'Cancelled: minimum not met' : 'Meetup Cancelled'}
                                    </Text>
                                    {meetup.cancelReason === 'minimum-headcount' && (
                                        <Text style={[styles.cancelBannerSubtext, { color: colors.danger }]}>
                                            {meetup.minAttendees
                                                ? `The RSVP deadline has passed and fewer than ${meetup.minAttendees} people were in.`
                                                : 'The RSVP deadline has passed and the minimum headcount wasn\'t met.'}
                                        </Text>
                                    )}
                                </View>
                            </View>
                            {canCancelOrRestore && (
                                <PressableOpacity onPress={handleCancelMeetup} style={[styles.reactivateBannerBtn, { backgroundColor: colors.brand }]}>
                                    <Text style={styles.reactivateBannerBtnText}>Reactivate</Text>
                                </PressableOpacity>
                            )}
                        </View>
                    )}
                    {isExpired && !isCancelled && (
                        <View style={[styles.cancelBanner, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
                            <Feather name="clock" size={18} color={colors.textMuted} />
                            <Text style={[styles.cancelBannerText, { color: colors.textMuted }]}>This Meetup Has Ended</Text>
                        </View>
                    )}
                    {isHappeningNow && (
                        <View style={[styles.cancelBanner, { backgroundColor: isDark ? '#123330' : '#F0FDFB', borderColor: isDark ? '#1F5B54' : '#99F6E4' }]}>
                            <Feather name="radio" size={18} color={isDark ? colors.accentTeal : '#0F766E'} />
                            <Text style={[styles.cancelBannerText, { color: isDark ? colors.accentTeal : '#0F766E' }]}>Meetup Happening Right Now</Text>
                        </View>
                    )}

                    <Animated.View layout={LinearTransition.duration(350).easing(Easing.out(Easing.cubic))} style={{ marginTop: 8, marginBottom: 18 }}>
                        {isIn && (
                            <PulsingWatermark label="IN" style={styles.inWatermark} baseOpacity={0.32} peakOpacity={0.55} />
                        )}
                        {isOut && (
                            <PulsingWatermark label="OUT" style={styles.outWatermark} baseOpacity={0.32} peakOpacity={0.42} />
                        )}
                        <Animated.View layout={LinearTransition.duration(350).easing(Easing.out(Easing.cubic))} style={styles.nameCard}>
                            {!!frequencyLabel && (
                                <Text style={[styles.meetupFrequencyLabel, { color: colors.textFaint }]}>{frequencyLabel}</Text>
                            )}
                            <Text style={[
                                styles.meetupTitle,
                                { color: colors.textPrimary },
                                isReadOnly && [styles.strikeThrough, { color: colors.borderStrong }],
                            ]}>
                                {meetup.name}
                            </Text>
                            {!!meetup.description?.trim() && (
                                <Pressable
                                    onPress={() => {
                                        const next = !descriptionExpanded;
                                        setDescriptionExpanded(next);
                                        descriptionChevronRotation.value = withSpring(next ? 180 : 0, { damping: 12, stiffness: 160 });
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    }}
                                    onPressIn={() => { descriptionPressScale.value = withTiming(0.96, { duration: 100 }); }}
                                    onPressOut={() => { descriptionPressScale.value = withTiming(1, { duration: 150 }); }}
                                >
                                    <Animated.View
                                        layout={LinearTransition.duration(350).easing(Easing.out(Easing.cubic))}
                                        style={[
                                            styles.meetupDescriptionChip,
                                            { backgroundColor: colors.surfaceAlt },
                                            descriptionExpanded && styles.meetupDescriptionChipExpanded,
                                            descriptionPressStyle,
                                        ]}
                                    >
                                        <View style={styles.meetupDescriptionRow}>
                                            <Feather name="align-left" size={12} color={colors.textFaint} style={styles.meetupDescriptionIcon} />
                                            <Animated.Text
                                                key={descriptionExpanded ? 'expanded' : 'collapsed'}
                                                entering={FadeIn.duration(200).delay(80)}
                                                exiting={FadeOut.duration(120)}
                                                style={[styles.meetupDescriptionText, { color: colors.textMuted }]}
                                                numberOfLines={descriptionExpanded ? undefined : 1}
                                            >
                                                {meetup.description.trim()}
                                            </Animated.Text>
                                            <Animated.View style={[styles.meetupDescriptionChevron, descriptionChevronStyle]}>
                                                <Feather name="chevron-down" size={14} color={colors.textFaint} />
                                            </Animated.View>
                                        </View>
                                    </Animated.View>
                                </Pressable>
                            )}
                        </Animated.View>
                    </Animated.View>

                    <Animated.View layout={LinearTransition.duration(350).easing(Easing.out(Easing.cubic))} style={[styles.actionRow, { justifyContent: 'center' }]}>
                        <PressableOpacity
                            ref={moreBtnRef}
                            onPress={openActionsMenu}
                            style={[styles.actionBtn, styles.moreActionBtn, { backgroundColor: colors.brandSoft, borderColor: colors.brand }]}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="ellipsis-horizontal-circle-outline" size={22} color={colors.brand} />
                        </PressableOpacity>
                        {!isReadOnly && !isRsvpLocked && !isRsvpDeadlinePassed && hasRsvpResponse && (
                            <PressableOpacity
                                onPress={() => {
                                    setManualRsvpEdit(v => !v);
                                    setSwapIconNonce(n => n + 1);
                                }}
                                style={[styles.actionBtn, styles.inOutActionBtn]}
                                activeOpacity={0.7}
                            >
                                <View style={[StyleSheet.absoluteFill, { top: 0, height: '50%', backgroundColor: isDark ? '#123330' : '#F0FDFB', borderTopLeftRadius: 9, borderTopRightRadius: 9 }]} />
                                <View style={[StyleSheet.absoluteFill, { top: '50%', height: '50%', backgroundColor: isDark ? '#3B1E1E' : '#FFE4E1', borderBottomLeftRadius: 9, borderBottomRightRadius: 9 }]} />
                                <InOutSwapIcon burstNonce={swapIconNonce} />
                            </PressableOpacity>
                        )}
                    </Animated.View>
                </View>

                {!isReadOnly && (
                    <Animated.View layout={LinearTransition.duration(300)} style={{ marginTop: showRsvpSelector ? 24 : 0, marginBottom: (isRsvpLocked || isRsvpDeadlinePassed || showRsvpSelector) ? 60 : 0 }}>
                        {isRsvpLocked ? (
                            <View style={[styles.rsvpLockedBanner, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                                <Feather name="lock" size={22} color={colors.textMuted} />
                                <Text style={[styles.rsvpLockedTitle, { color: colors.textMuted }]}>RSVPs Not Open Yet</Text>
                                <Text style={[styles.rsvpLockedSubtitle, { color: colors.textFaint }]}>
                                    Opens {describeRsvpOpensFor(meetup, currentUser?._id)}
                                </Text>
                            </View>
                        ) : isRsvpDeadlinePassed ? (
                            <View style={[styles.rsvpLockedBanner, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                                <Feather name="lock" size={22} color={colors.textMuted} />
                                <Text style={[styles.rsvpLockedTitle, { color: colors.textMuted }]}>RSVP Deadline Passed</Text>
                                <Text style={[styles.rsvpLockedSubtitle, { color: colors.textFaint }]}>
                                    Closed {new Date(meetup.rsvpCloseDate!).toLocaleDateString(undefined, {
                                        weekday: 'short', month: 'short', day: 'numeric', timeZone: meetup.timezone
                                    })}
                                </Text>
                            </View>
                        ) : !showRsvpSelector ? null : (
                            <Animated.View
                                key="rsvp-buttons"
                                entering={FadeIn.duration(220)}
                                exiting={FadeOut.duration(160)}
                                layout={LinearTransition.duration(280)}
                            >
                                <RsvpBreather active={isUndecided}>
                                    {({ boxStyle, inTextStyle, outTextStyle }) => (
                                        <View style={{ flexDirection: 'row', gap: 12 }}>
                                            {/* Split I'm In button */}
                                            <View style={{
                                                flex: 1, borderRadius: 16, overflow: 'hidden', height: 72,
                                                backgroundColor: isWaitlisted ? '#2563EB' : waitlistLocked ? '#9CA3AF' : (isFull && !isIn) ? (canBump ? colors.accentTeal : '#F97316') : inFilled ? colors.accentTeal : colors.surface,
                                            }}>
                                                <Animated.View style={[{
                                                    flex: 1, flexDirection: 'row', borderRadius: 16,
                                                    borderWidth: inFilled ? 0 : 1.5,
                                                    borderColor: colors.accentTeal,
                                                }, boxStyle]}>
                                                    <PressableOpacity
                                                        onPress={() => { setGuestExpanded(false); handleRsvpAction('in'); }}
                                                        disabled={isRsvping || waitlistLocked}
                                                        style={{ flex: 7, alignItems: 'center', justifyContent: 'center' }}
                                                    >
                                                        <Animated.Text style={[{ color: inFilled ? 'white' : colors.accentTeal, fontWeight: 'bold', fontSize: 18 }, inTextStyle]}>
                                                            {isWaitlisted ? "Waitlisted" : waitlistLocked ? "Full" : (isFull && !isIn) ? (canBump ? "Priority In" : "Join Waitlist") : "I'm In"}
                                                        </Animated.Text>
                                                    </PressableOpacity>
                                                    <View style={{ width: 1, backgroundColor: inFilled ? 'rgba(255,255,255,0.35)' : colors.border }} />
                                                    <PressableOpacity
                                                        onPress={() => setGuestExpanded(v => !v)}
                                                        disabled={isRsvping || waitlistLocked}
                                                        style={{ flex: 3, alignItems: 'center', justifyContent: 'center' }}
                                                    >
                                                        {guestExpanded
                                                            ? <Feather name="x" size={20} color={inFilled ? 'white' : colors.accentTeal} />
                                                            : <MaterialIcons name="group-add" size={22} color={inFilled ? 'white' : colors.accentTeal} />
                                                        }
                                                    </PressableOpacity>
                                                </Animated.View>
                                            </View>

                                            {/* Split I'm Out button */}
                                            <View style={{
                                                flex: 1, borderRadius: 16, overflow: 'hidden', height: 72,
                                                backgroundColor: outFilled ? colors.accentCoral : colors.surface,
                                            }}>
                                                <Animated.View style={[{
                                                    flex: 1, flexDirection: 'row', borderRadius: 16,
                                                    borderWidth: outFilled ? 0 : 1.5,
                                                    borderColor: colors.accentCoral,
                                                }, boxStyle]}>
                                                    <PressableOpacity
                                                        onPress={() => { setGuestExpanded(false); handleRsvpAction('out'); }}
                                                        disabled={isRsvping}
                                                        style={{ flex: 7, alignItems: 'center', justifyContent: 'center' }}
                                                    >
                                                        <Animated.Text style={[{ color: outFilled ? 'white' : colors.accentCoral, fontWeight: 'bold', fontSize: 18 }, outTextStyle]}>I'm Out</Animated.Text>
                                                    </PressableOpacity>
                                                    <View style={{ width: 1, backgroundColor: outFilled ? 'rgba(255,255,255,0.35)' : colors.border }} />
                                                    <PressableOpacity
                                                        onPress={handleRsvpOutAndMute}
                                                        disabled={isRsvping}
                                                        style={{ flex: 3, alignItems: 'center', justifyContent: 'center' }}
                                                    >
                                                        <Feather name="bell-off" size={20} color={outFilled ? 'white' : colors.accentCoral} />
                                                    </PressableOpacity>
                                                </Animated.View>
                                            </View>
                                        </View>
                                    )}
                                </RsvpBreather>

                                {/* Inline guest counter */}
                                {guestExpanded && (
                                    <View style={{ alignItems: 'center', marginTop: 10 }}>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Add Guests?</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                                            <PressableOpacity
                                                onPress={() => setLocalGuestCount(c => Math.max(0, c - 1))}
                                                disabled={localGuestCount === 0}
                                                style={{
                                                    width: 36, height: 36, borderRadius: 18,
                                                    backgroundColor: localGuestCount === 0 ? colors.surfaceAlt : colors.brandSoft,
                                                    borderWidth: 1.5,
                                                    borderColor: localGuestCount === 0 ? colors.border : colors.brand,
                                                    alignItems: 'center', justifyContent: 'center',
                                                }}
                                            >
                                                <Feather name="minus" size={16} color={localGuestCount === 0 ? colors.borderStrong : colors.brand} />
                                            </PressableOpacity>

                                            <Text style={{ fontSize: 24, fontWeight: '900', color: colors.textPrimary, minWidth: 28, textAlign: 'center' }}>
                                                {localGuestCount}
                                            </Text>

                                            <PressableOpacity
                                                onPress={() => setLocalGuestCount(c => c + 1)}
                                                style={{
                                                    width: 36, height: 36, borderRadius: 18,
                                                    backgroundColor: colors.brandSoft,
                                                    borderWidth: 1.5, borderColor: colors.brand,
                                                    alignItems: 'center', justifyContent: 'center',
                                                }}
                                            >
                                                <Feather name="plus" size={16} color={colors.brand} />
                                            </PressableOpacity>

                                            <PressableOpacity
                                                onPress={async () => {
                                                    setGuestExpanded(false);
                                                    await performSetGuests(localGuestCount);
                                                    if (!isIn) performRsvp('in');
                                                }}
                                                disabled={isRsvping || isSettingGuests}
                                                style={{
                                                    width: 36, height: 36, borderRadius: 18,
                                                    backgroundColor: colors.accentTeal,
                                                    borderWidth: 1.5, borderColor: '#3FABA1',
                                                    alignItems: 'center', justifyContent: 'center',
                                                    marginLeft: 6,
                                                }}
                                            >
                                                {(isRsvping || isSettingGuests)
                                                    ? <ActivityIndicator size="small" color="white" />
                                                    : <Feather name="check" size={18} color="white" />
                                                }
                                            </PressableOpacity>
                                        </View>
                                    </View>
                                )}
                            </Animated.View>
                        )}
                    </Animated.View>
                )}

                <MeetupAssignments
                    meetup={meetup}
                    currentUserId={currentUser._id}
                    isIn={isIn && !isReadOnly}
                    openSignal={assignmentsSignal}
                    onUpdated={(m) => {
                        setMeetup(m);
                        queryClient.invalidateQueries({ queryKey: ['meetups'] });
                        broadcastMeetupUpdate(getToken, meetupGroupId);
                    }}
                    onStale={() => queryClient.invalidateQueries({ queryKey: ['meetups'] })}
                    onSheetClosed={() => {
                        if (questionsAfterAssignments.current) {
                            questionsAfterAssignments.current = false;
                            setQuestionsSignal((n) => n + 1);
                        }
                    }}
                />

                <MeetupTeams
                    meetup={meetup}
                    currentUserId={currentUser._id}
                    canManage={canManage}
                    onUpdated={(m) => {
                        setMeetup(m);
                        queryClient.invalidateQueries({ queryKey: ['meetups'] });
                        broadcastMeetupUpdate(getToken, meetupGroupId);
                    }}
                />

                <MeetupQuestions
                    meetup={meetup}
                    currentUserId={currentUser._id}
                    canAnswer={(isIn || isWaitlisted) && !isReadOnly}
                    openSignal={questionsSignal}
                    onUpdated={(m) => {
                        setMeetup(m);
                        queryClient.invalidateQueries({ queryKey: ['meetups'] });
                        broadcastMeetupUpdate(getToken, meetupGroupId);
                    }}
                />

                <Animated.View layout={LinearTransition.duration(300)} style={{ marginBottom: 40, marginTop: 8 }}>
                    {renderSectionHeader('In', goingUsers.length + totalGuestsForInTab, colors.accentTeal,
                        <Text style={[styles.sectionHeaderText, { color: colors.accentTeal, marginBottom: 0 }]}>
                            {meetup.capacity > 0 ? `Max: ${meetup.capacity}` : 'Unlimited'}
                        </Text>
                    )}
                    <View style={styles.grid}>
                        {goingUsers.length === 0 && totalGuestsForInTab === 0 && (
                            <Text style={[styles.emptyText, { color: colors.textFaint }]}>No one is in yet.</Text>
                        )}
                        {goingUsers.map(user => renderUserTile(user, user._id))}
                        {allGuestEntries.flatMap(renderGuestTiles)}
                    </View>

                    {renderSectionHeader('Out', outUsers.length, colors.accentCoral)}
                    <View style={styles.grid}>
                        {outUsers.length === 0 && <Text style={[styles.emptyText, { color: colors.textFaint }]}>No one is out.</Text>}
                        {outUsers.map(user => renderUserTile(user, user._id))}
                    </View>

                    {renderSectionHeader('Undecided', undecidedUsers.length, colors.textFaint,
                        canManage && undecidedUsers.length > 0 ? (
                            <PressableOpacity onPress={handleRemindAll} disabled={isSendingReminder} style={[styles.remindAllBtn, { backgroundColor: colors.brandSoft, borderColor: colors.brand }]} activeOpacity={0.7}>
                                <Feather name="bell" size={12} color={colors.brand} />
                                <Text style={[styles.remindAllText, { color: colors.brand }]}>Remind All</Text>
                            </PressableOpacity>
                        ) : undefined
                    )}
                    <View style={styles.grid}>
                        {undecidedUsers.length === 0 && <Text style={[styles.emptyText, { color: colors.textFaint }]}>Everyone has responded.</Text>}
                        {undecidedUsers.map(user => renderUserTile(user, user._id))}
                    </View>

                    {waitlistUsers.length > 0 && (
                        <>
                            {renderSectionHeader('Waitlist', waitlistUsers.length, isDark ? '#5B9EE8' : '#2563EB')}
                            <View style={styles.grid}>
                                {waitlistUsers.map((user, index) => renderUserTile(user, user._id, { waitlistPosition: index + 1 }))}
                            </View>
                        </>
                    )}
                </Animated.View>

                {canCancelOrRestore && !isCancelled && (
                    <View style={[styles.ownerSection, { borderTopColor: colors.border }]}>
                        <PressableOpacity onPress={handleCancelMeetup} style={[styles.cancelToggle, { borderColor: colors.danger, backgroundColor: isDark ? '#3B1E1E' : '#FEF2F2' }]}>
                            <Text style={[styles.cancelToggleText, { color: colors.danger }]}>Cancel This Meetup</Text>
                        </PressableOpacity>
                    </View>
                )}
            </ScrollView>

            {/* Actions Menu */}
            <Modal transparent visible={isActionsMenuVisible} animationType="fade" onRequestClose={() => setIsActionsMenuVisible(false)}>
                <Pressable style={styles.actionsMenuOverlay} onPress={() => setIsActionsMenuVisible(false)}>
                    <View style={[styles.actionsMenuCard, actionsMenuAnchor && { top: actionsMenuAnchor.top, left: actionsMenuAnchor.left }]}>
                        {actionsMenuAnchor && (
                            <View style={[styles.actionsMenuPointer, { left: actionsMenuAnchor.pointerLeft }]} />
                        )}
                        {canEditOrCancel && (
                            <>
                                <PressableOpacity
                                    style={styles.actionsMenuItem}
                                    onPress={() => { setIsActionsMenuVisible(false); openEditModal(); }}
                                >
                                    <View style={[styles.actionsMenuIconWrap, { backgroundColor: isDark ? '#3A2E12' : '#FFFBEB' }]}>
                                        <Feather name="edit-2" size={18} color="#F59E0B" />
                                    </View>
                                    <Text style={styles.actionsMenuLabel}>Edit Meetup</Text>
                                </PressableOpacity>
                                <View style={styles.actionsMenuDivider} />
                            </>
                        )}
                        <PressableOpacity
                            style={styles.actionsMenuItem}
                            onPress={() => { setIsActionsMenuVisible(false); handleAddToCalendar(); }}
                        >
                            <View style={[styles.actionsMenuIconWrap, { backgroundColor: isDark ? '#132A1E' : '#F0FDF4' }]}>
                                <Feather name="calendar" size={18} color="#16A34A" />
                            </View>
                            <Text style={styles.actionsMenuLabel}>Add to Calendar</Text>
                        </PressableOpacity>
                        <View style={styles.actionsMenuDivider} />
                        <PressableOpacity
                            style={styles.actionsMenuItem}
                            onPress={() => { setIsActionsMenuVisible(false); handleGoToChat(); }}
                        >
                            <View style={[styles.actionsMenuIconWrap, { backgroundColor: isDark ? '#1A2A42' : '#F0F9FF' }]}>
                                <Feather name="message-circle" size={18} color="#0EA5E9" />
                            </View>
                            <Text style={styles.actionsMenuLabel}>Go to Chat</Text>
                        </PressableOpacity>
                        <View style={styles.actionsMenuDivider} />
                        <PressableOpacity
                            style={styles.actionsMenuItem}
                            onPress={() => { setIsActionsMenuVisible(false); handleInviteToMeetup(); }}
                        >
                            <View style={[styles.actionsMenuIconWrap, { backgroundColor: isDark ? '#123330' : '#ECFDF5' }]}>
                                <Feather name="user-plus" size={18} color="#0D9488" />
                            </View>
                            <Text style={styles.actionsMenuLabel}>Invite to Meetup</Text>
                        </PressableOpacity>
                    </View>
                </Pressable>
            </Modal>

            {/* Start DM Confirmation Sheet */}
            <Modal
                visible={!!dmTargetUser}
                transparent
                animationType="slide"
                onRequestClose={() => setDmTargetUser(null)}
            >
                <Pressable style={[dmStyles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setDmTargetUser(null)}>
                    <Pressable style={[dmStyles.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
                        <View style={[dmStyles.dragHandle, { backgroundColor: colors.borderStrong }]} />
                        {dmTargetUser && (
                            <>
                                <Image
                                    source={{ uri: dmTargetUser.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${getUserInitial(dmTargetUser)}` }}
                                    style={[dmStyles.avatar, { backgroundColor: colors.backgroundAlt }]}
                                />
                                <Text style={[dmStyles.name, { color: colors.textPrimary }]}>
                                    {getUserDisplayName(dmTargetUser)}
                                </Text>
                                <PressableOpacity
                                    style={[dmStyles.dmBtn, { backgroundColor: colors.brand }]}
                                    onPress={handleSendDM}
                                    disabled={isCreatingDM}
                                    activeOpacity={0.8}
                                >
                                    {isCreatingDM
                                        ? <ActivityIndicator color="#fff" size="small" />
                                        : <Text style={dmStyles.dmBtnText}>Send DM</Text>
                                    }
                                </PressableOpacity>
                                {canManage && undecidedUsers.some(u => u._id === dmTargetUser._id) && (
                                    <PressableOpacity
                                        style={[dmStyles.remindBtn, { backgroundColor: colors.brandSoft, borderColor: colors.brand }]}
                                        onPress={() => handleSendReminder(dmTargetUser._id)}
                                        disabled={isSendingReminder}
                                        activeOpacity={0.8}
                                    >
                                        {isSendingReminder
                                            ? <ActivityIndicator color={colors.brand} size="small" />
                                            : <Text style={[dmStyles.remindBtnText, { color: colors.brand }]}>Send Reminder</Text>
                                        }
                                    </PressableOpacity>
                                )}
                                {canManageTarget(dmTargetUser) && (() => {
                                    const targetIsIn = meetup.in?.some(u => getUserId(u) === dmTargetUser._id) ?? false;
                                    const targetIsOut = meetup.out?.some(u => getUserId(u) === dmTargetUser._id) ?? false;
                                    return (
                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                                            <PressableOpacity
                                                style={[dmStyles.rsvpActionBtn, { backgroundColor: colors.accentTeal }, targetIsIn && dmStyles.rsvpActionBtnDisabled]}
                                                onPress={() => handleAdminRsvpChange(dmTargetUser._id, 'in')}
                                                disabled={isUpdatingTargetRsvp || targetIsIn}
                                                activeOpacity={0.8}
                                            >
                                                {isUpdatingTargetRsvp
                                                    ? <ActivityIndicator color="#fff" size="small" />
                                                    : <Text style={dmStyles.rsvpActionBtnText}>Mark as In</Text>
                                                }
                                            </PressableOpacity>
                                            <PressableOpacity
                                                style={[dmStyles.rsvpActionBtn, { backgroundColor: colors.accentCoral }, targetIsOut && dmStyles.rsvpActionBtnDisabled]}
                                                onPress={() => handleAdminRsvpChange(dmTargetUser._id, 'out')}
                                                disabled={isUpdatingTargetRsvp || targetIsOut}
                                                activeOpacity={0.8}
                                            >
                                                {isUpdatingTargetRsvp
                                                    ? <ActivityIndicator color="#fff" size="small" />
                                                    : <Text style={dmStyles.rsvpActionBtnText}>Mark as Out</Text>
                                                }
                                            </PressableOpacity>
                                        </View>
                                    );
                                })()}
                                {canManageTarget(dmTargetUser) && assignmentsActive(meetup)
                                    && (meetup.in?.some(u => getUserId(u) === dmTargetUser._id) ?? false) && (
                                    <PressableOpacity
                                        style={dmStyles.remindBtn}
                                        onPress={() => {
                                            const target = dmTargetUser;
                                            setDmTargetUser(null);
                                            // Let this sheet finish dismissing before presenting the next (iOS).
                                            setTimeout(() => setAssignTarget(target), 350);
                                        }}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={dmStyles.remindBtnText}>Edit Assignments</Text>
                                    </PressableOpacity>
                                )}
                            </>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>

            {assignTarget && (
                <AssignmentsSheet
                    visible
                    meetup={meetup}
                    currentUserId={currentUser._id}
                    forUser={{ id: assignTarget._id, name: getUserDisplayName(assignTarget) }}
                    onClose={() => setAssignTarget(null)}
                    onUpdated={(m) => {
                        setMeetup(m);
                        queryClient.invalidateQueries({ queryKey: ['meetups'] });
                        broadcastMeetupUpdate(getToken, meetupGroupId);
                    }}
                    onStale={() => queryClient.invalidateQueries({ queryKey: ['meetups'] })}
                />
            )}

            {/* Combined Edit Details Modal */}
            <Modal transparent visible={isEditModalVisible} animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                            <View style={styles.modalHeaderInner}>
                                <PressableOpacity onPress={() => setIsEditModalVisible(false)}><Feather name="x" size={24} color={colors.textFaint} /></PressableOpacity>
                                <Text style={[styles.modalTitleInner, { color: colors.textPrimary }]}>Edit Meetup</Text>
                                <PressableOpacity onPress={handleUpdateMeetupDetails} disabled={isUpdating || !canSaveCapacity}>
                                    {isUpdating ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={[styles.saveBtnText, { color: colors.brand }, !canSaveCapacity && styles.saveBtnTextDisabled]}>Save</Text>}
                                </PressableOpacity>
                            </View>

                            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
                                <Text style={[styles.fieldLabel, { color: colors.textFaint }]}>Date</Text>
                                <PressableOpacity style={[styles.dateInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} onPress={() => setShowDatePicker(true)}>
                                    <Feather name="calendar" size={18} color={colors.brand} />
                                    <Text style={[styles.dateInputText, { color: colors.textSecondary }]}>
                                        {newDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                    </Text>
                                </PressableOpacity>

                                <Text style={[styles.fieldLabel, { color: colors.textFaint, marginTop: 20 }]}>Time</Text>
                                <PressableOpacity style={[styles.dateInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} onPress={() => setShowTimePicker(true)}>
                                    <Feather name="clock" size={18} color={colors.brand} />
                                    <Text style={[styles.dateInputText, { color: colors.textSecondary }]}>{newTime}</Text>
                                </PressableOpacity>

                                <Text style={[styles.fieldLabel, { color: colors.textFaint, marginTop: 20 }]}>Location Override</Text>
                                <LocationField
                                    variant="card"
                                    placeholder="Specific address or link..."
                                    value={newLocation}
                                    onPress={() => setIsLocationSearchActive(true)}
                                />

                                <Text style={[styles.fieldLabel, { color: colors.textFaint, marginTop: 20 }]}>Max Attendees</Text>
                                <View style={styles.boolRow}>
                                    <PressableOpacity
                                        style={[styles.boolBtn, { borderColor: colors.border, backgroundColor: colors.surface }, capacityMode === "unlimited" && [styles.boolBtnActive, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]]}
                                        onPress={() => { setCapacityMode("unlimited"); setNewCapacity(""); }}
                                    >
                                        <Text style={[styles.boolBtnText, { color: colors.textMuted }, capacityMode === "unlimited" && { color: colors.brand }]}>Unlimited</Text>
                                    </PressableOpacity>
                                    <PressableOpacity
                                        style={[styles.boolBtn, { borderColor: colors.border, backgroundColor: colors.surface }, capacityMode === "limited" && [styles.boolBtnActive, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]]}
                                        onPress={() => setCapacityMode("limited")}
                                    >
                                        <Text style={[styles.boolBtnText, { color: colors.textMuted }, capacityMode === "limited" && { color: colors.brand }]}>Limited</Text>
                                    </PressableOpacity>
                                </View>
                                {capacityMode === "limited" && (
                                    <View style={{ marginTop: 10 }}>
                                        <View style={[styles.inputContainer, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }, capacityError && styles.inputContainerError]}>
                                            <Feather name="users" size={18} color={colors.brand} />
                                            <TextInput
                                                style={[styles.textInput, { color: colors.textSecondary }]}
                                                placeholder="How many?"
                                                placeholderTextColor={colors.placeholder}
                                                keyboardType="number-pad"
                                                value={newCapacity}
                                                onChangeText={setNewCapacity}
                                            />
                                        </View>
                                        {capacityError && <Text style={styles.errorText}>{capacityError}</Text>}
                                    </View>
                                )}

                                <Text style={[styles.fieldLabel, { color: colors.textFaint, marginTop: 20 }]}>Description (optional)</Text>
                                <View style={[styles.inputContainer, styles.descriptionInputContainer, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                                    <TextInput
                                        style={[styles.textInput, styles.descriptionInput, { color: colors.textSecondary }]}
                                        placeholder="Add any extra details for this meetup..."
                                        placeholderTextColor={colors.placeholder}
                                        value={newDescription}
                                        onChangeText={setNewDescription}
                                        multiline
                                        textAlignVertical="top"
                                    />
                                </View>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>

                <LocationSearchModal
                    visible={isLocationSearchActive}
                    initialValue={newLocation}
                    placeholder="Specific address or link..."
                    onDone={(text) => { setNewLocation(text); setIsLocationSearchActive(false); }}
                    onCancel={() => setIsLocationSearchActive(false)}
                    asOverlay
                />

                {/* Rendered inside this Modal's tree, not a sibling — RN can't stack a second native Modal */}
                {showDatePicker && (
                    Platform.OS === 'ios' ? (
                        <View style={StyleSheet.absoluteFillObject}>
                            <View style={styles.datePickerOverlay}>
                                <View style={[styles.datePickerContent, { backgroundColor: colors.surface }]}>
                                    <DateTimePicker
                                        value={tempDate}
                                        mode="date"
                                        display="spinner"
                                        onChange={onDateChange}
                                        textColor={isDark ? colors.textPrimary : 'black'}
                                    />
                                    <PressableOpacity onPress={confirmIosDate} style={[styles.doneButton, { backgroundColor: colors.brand }]}>
                                        <Text style={styles.doneButtonText}>Done</Text>
                                    </PressableOpacity>
                                </View>
                            </View>
                        </View>
                    ) : (
                        <DateTimePicker
                            value={newDate} // Android picker can use the final state directly
                            mode="date"
                            display="default"
                            onChange={onDateChange}
                        />
                    )
                )}

                {showTimePicker && (
                    <NativeTimePicker value={newTime} onChange={setNewTime} onClose={() => setShowTimePicker(false)} asOverlay />
                )}
            </Modal>

            <RsvpResponseOverlay />
        </SafeAreaView>
    );
};

export default MeetupDetailModal;