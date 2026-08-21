import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Image,
    Alert,
    ActivityIndicator,
    TextInput,
    Modal,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    Pressable
} from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import Animated, {
    FadeIn,
    FadeOut,
    LinearTransition,
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Meetup, User, useApiClient, userApi, meetupApi, groupApi } from '@/utils/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRsvp } from '@/hooks/useRsvp';
import RsvpResponseOverlay from '@/components/RsvpResponseOverlay';
import { useGetMeetups } from '@/hooks/useGetMeetups';
import { RsvpBreather } from '@/components/RsvpBreather';
import { useRouter } from 'expo-router';
import * as Calendar from 'expo-calendar';
import NativeTimePicker from './NativeTimePicker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

// Watermark that slowly breathes between a base and darker opacity, one full cycle every 5 seconds.
const PulsingWatermark = ({ label, style, baseOpacity, peakOpacity }: {
    label: string;
    style: any;
    baseOpacity: number;
    peakOpacity: number;
}) => {
    const opacity = useSharedValue(baseOpacity);

    useEffect(() => {
        opacity.value = withRepeat(
            withTiming(peakOpacity, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

    return (
        <Animated.Text style={[style, animatedStyle]} pointerEvents="none">
            {label}
        </Animated.Text>
    );
};

interface MeetupDetailModalProps {
  meetup: Meetup | null;
  onClose: () => void;
}

// Helper to safely extract user ID whether the array contains strings or populated objects
const getUserId = (u: User | string): string => typeof u === 'string' ? u : u._id;

// Mirrors the Max Attendees validation on the group-creation Schedule screen, the
// Add Meetup wizard, and group settings so every "attendee limit" entry point agrees.
const getMaxAttendeesError = (mode: "unlimited" | "limited", input: string): string | null => {
    if (mode !== "limited" || input === "") return null;
    if (!/^\d+$/.test(input)) return "Numbers only, please.";
    const n = parseInt(input, 10);
    if (n < 1 || n > 200) return "Enter a number between 1 and 200.";
    return null;
};

const MeetupDetailModal = ({ meetup: initialMeetup, onClose }: MeetupDetailModalProps) => {
    const api = useApiClient();
    const router = useRouter();
    const queryClient = useQueryClient();
    
    const [meetup, setMeetup] = useState<Meetup | null>(initialMeetup);
    const { data: allMeetups } = useGetMeetups();

    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
    const [newDate, setNewDate] = useState(new Date());
    const [tempDate, setTempDate] = useState(new Date());
    const [newTime, setNewTime] = useState('');
    const [capacityMode, setCapacityMode] = useState<"unlimited" | "limited">("unlimited");
    const [newCapacity, setNewCapacity] = useState('');
    const [newLocation, setNewLocation] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [dmTargetUser, setDmTargetUser] = useState<User | null>(null);
    const [isCreatingDM, setIsCreatingDM] = useState(false);
    const [isSendingReminder, setIsSendingReminder] = useState(false);
    const [isUpdatingTargetRsvp, setIsUpdatingTargetRsvp] = useState(false);

    const capacityError = getMaxAttendeesError(capacityMode, newCapacity);
    const canSaveCapacity = capacityMode !== "limited" || (newCapacity !== "" && !capacityError);

    useEffect(() => {
        setMeetup(initialMeetup);
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

    const [localGuestCount, setLocalGuestCount] = useState(0);
    const [isSettingGuests, setIsSettingGuests] = useState(false);
    const [guestExpanded, setGuestExpanded] = useState(false);
    const [manualRsvpEdit, setManualRsvpEdit] = useState(false);

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

    // --- READ-ONLY & PERMISSIONS LOGIC ---
    const isOwner = typeof meetup.group === 'object' ? meetup.group.owner === currentUser._id : false; 
    const groupData = meetup.group as any;
    const isMod = typeof meetup.group === 'object' && Array.isArray(groupData.moderators)
        ? groupData.moderators.some((m: any) => typeof m === 'string' ? m === currentUser._id : m._id === currentUser._id)
        : false;

    const isCancelled = meetup.status === 'cancelled';
    const isPast = new Date(meetup.date) < new Date(); 
    const isExpired = meetup.status === 'expired' || isPast;

    const isRsvpLocked = meetup.rsvpOpenDate
    ? new Date(meetup.rsvpOpenDate) > new Date()
    : false;

    const isRsvpDeadlinePassed = meetup.rsvpCloseDate
    ? new Date(meetup.rsvpCloseDate) < new Date()
    : false;

    // RECOMMENDATION: This flag controls all "adjustment" UI
    const isReadOnly = isCancelled || isExpired;
    const canManage = (isOwner || isMod) && !isReadOnly;

    // Owner can override anyone's RSVP; a moderator can override regular members only —
    // not the owner, and not another moderator.
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
    const inUnselected = !isIn && !isWaitlisted && !(isFull && !isIn);
    const outUnselected = !isOut;
    const isUndecided = inUnselected && outUnselected;
    // While undecided, fill both buttons like they're selected so neither reads as the "default" choice.
    const inFilled = !inUnselected || isUndecided;
    const outFilled = !outUnselected || isUndecided;

    // Faint RSVP-status tint for the whole modal: amber until the user responds,
    // then green ("in"/waitlisted) or red ("out") to match the RSVP button colors.
    const modalBackgroundColor = isOut ? '#FEF2F2' : (isIn || isWaitlisted) ? '#EDF5F0' : '#FFFEFA';

    const goingUsers = (meetup.members || []).filter(m => meetup.in?.some(u => getUserId(u) === m._id));
    const outUsers = (meetup.members || []).filter(m => meetup.out?.some(u => getUserId(u) === m._id));

    // Guests stay attached to their host's clerkId even after the host RSVPs 'out'
    // (the "Keep Guests" option). Since the host no longer appears in goingUsers,
    // surface those guests as their own row instead of losing the attribution.
    const orphanGuestEntries = (meetup.guests || []).filter(g => {
        if (!g.count) return false;
        return !goingUsers.some(user => (user as any).clerkId === g.userId);
    });
    // Every user who brought guests gets its own tile (not just orphans),
    // shown alongside their own tile in the "In" grid.
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

    const performRsvp = (status: 'in' | 'out') => {
        rsvp({ meetupId: meetup._id, status }, {
            onSuccess: (data: any) => {
                queryClient.invalidateQueries({ queryKey: ['meetups'] });
                if (data.meetup) setMeetup(data.meetup);
                setManualRsvpEdit(false);
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
            if (result.meetup) setMeetup(result.meetup);
        } catch {
            const prev = meetup.guests?.find(g => g.userId === currentUser.clerkId)?.count ?? 0;
            setLocalGuestCount(prev);
            Alert.alert('Error', 'Could not update your guests. Please try again.');
        } finally {
            setIsSettingGuests(false);
        }
    };



    const handleRsvpAction = (status: 'in' | 'out') => {
        if (isReadOnly || isRsvpLocked || isRsvpDeadlinePassed) return;
        if (status === 'out' && localGuestCount > 0) {
            Alert.alert(
                'Remove Guests?',
                'Remove your guests from this Meetup too?',
                [
                    { text: 'Keep Guests', onPress: () => performRsvp('out') },
                    {
                        text: 'Remove Guests',
                        style: 'destructive',
                        onPress: async () => {
                            await performSetGuests(0);
                            performRsvp('out');
                        },
                    },
                ]
            );
            return;
        }
        performRsvp(status);
    };

    const handleRsvpOutAndMute = () => {
        setGuestExpanded(false);
        handleRsvpAction('out');
        userApi.toggleGroupMute(api, meetup.group._id, 'untilNext').catch(() => {});
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

    const handleGoToChat = () => {
        onClose();
        router.push({
            pathname: '/group-chat/[id]',
            params: { id: meetup.group._id }
        });
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
        const currentDate = selectedDate || tempDate;
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
            setNewDate(currentDate);
        } else {
            setTempDate(currentDate);
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
        setIsEditModalVisible(true);
    };

    const renderUserTile = (user: User, key: string, opts?: { waitlistPosition?: number }) => {
        const isSelf = user._id === currentUser._id;
        const Wrapper = isSelf ? View : TouchableOpacity;
        const wrapperProps = isSelf ? {} : { onPress: () => setDmTargetUser(user), activeOpacity: 0.7 };
        return (
            <Wrapper key={key} style={styles.gridItem} {...wrapperProps}>
                <View style={styles.gridAvatarWrap}>
                    {user.profilePicture
                        ? <Image source={{ uri: user.profilePicture }} style={styles.gridAvatar} />
                        : (
                            <View style={[styles.gridAvatar, styles.gridAvatarPlaceholder]}>
                                <Feather name="user" size={22} color="#9CA3AF" />
                            </View>
                        )}
                    {opts?.waitlistPosition != null && (
                        <View style={styles.waitlistBadge}>
                            <Text style={styles.waitlistBadgeText}>{opts.waitlistPosition}</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.gridName} numberOfLines={1}>{user.firstName} {user.lastName}</Text>
            </Wrapper>
        );
    };

    const renderGuestTile = (g: { userId: string; count: number }) => {
        const host = (meetup.members || []).find(m => (m as any).clerkId === g.userId);
        const hostName = host ? host.firstName : 'A member';
        return (
            <View key={`guests-${g.userId}`} style={styles.gridItem}>
                <View style={[styles.gridAvatar, styles.gridAvatarPlaceholder]}>
                    <Text style={styles.guestCountText}>+{g.count}</Text>
                </View>
                <Text style={styles.gridName} numberOfLines={1}>{hostName}&apos;s guests</Text>
            </View>
        );
    };

    const renderSectionHeader = (label: string, count: number, color: string, rightElement?: React.ReactNode) => (
        <View style={styles.sectionHeaderWrap}>
            <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionHeaderText, { color, marginBottom: 0 }]}>{label} - {count}</Text>
                {rightElement}
            </View>
            <View style={[styles.sectionHeaderLine, { backgroundColor: color }]} />
        </View>
    );

    const handleCancelMeetup = () => {
        if (isReadOnly && !isCancelled) return; // Can't cancel if already ended
        const action = isCancelled ? "Reactivate" : "Cancel";
        Alert.alert(`${action} Meetup`, `Are you sure?`, [
            { text: "No", style: "cancel" },
            { 
                text: "Yes", 
                style: isCancelled ? "default" : "destructive", 
                onPress: async () => {
                    try {
                        await meetupApi.cancelMeetup(api, meetup._id);
                        queryClient.invalidateQueries({ queryKey: ['meetups'] });
                        if (!isCancelled) onClose(); 
                    } catch (e: any) {
                        Alert.alert("Error", e.response?.data?.error || e.message);
                    }
                }
            }
        ]);
    };


    return (
        <SafeAreaView style={[styles.container, { backgroundColor: modalBackgroundColor }]} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Feather name="chevron-down" size={32} color="#9CA3AF" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>
                        {new Date(meetup.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: meetup.timezone })} • {meetup.time}
                    </Text>
                </View>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <View style={{ marginBottom: showRsvpSelector ? 32 : 14 }}>
                    {/* Updated Banner Logic */}
                    {isCancelled && (
                        <View style={styles.cancelBanner}>
                            <Feather name="alert-triangle" size={18} color="#B91C1C" />
                            <Text style={styles.cancelBannerText}>Meetup Cancelled</Text>
                        </View>
                    )}
                    {isExpired && !isCancelled && (
                        <View style={[styles.cancelBanner, { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }]}>
                            <Feather name="clock" size={18} color="#6B7280" />
                            <Text style={[styles.cancelBannerText, { color: '#6B7280' }]}>This Meetup Has Ended</Text>
                        </View>
                    )}
                    
                    <View style={{ marginTop: 8, marginBottom: 18 }}>
                        {isIn && (
                            <PulsingWatermark label="IN" style={styles.inWatermark} baseOpacity={0.32} peakOpacity={0.55} />
                        )}
                        {isOut && (
                            <PulsingWatermark label="OUT" style={styles.outWatermark} baseOpacity={0.32} peakOpacity={0.42} />
                        )}
                        <Text style={[styles.meetupTitle, isReadOnly && styles.strikeThrough]}>
                            {meetup.name}
                        </Text>
                    </View>

                    <View style={[styles.actionRow, { justifyContent: 'center' }]}>
                        {canManage && (
                            <TouchableOpacity onPress={openEditModal} style={[styles.actionBtn, styles.editActionBtn]} activeOpacity={0.7}>
                                <Feather name="edit-2" size={20} color="#F59E0B" />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={handleAddToCalendar} style={[styles.actionBtn, styles.calendarActionBtn]} activeOpacity={0.7}>
                            <Feather name="calendar" size={20} color="#16A34A" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleGoToChat} style={[styles.actionBtn, styles.chatActionBtn]} activeOpacity={0.7}>
                            <Feather name="message-circle" size={20} color="#0EA5E9" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setIsDetailsModalVisible(true)} style={[styles.actionBtn, styles.moreActionBtn]} activeOpacity={0.7}>
                            <Feather name="info" size={20} color="#7C3AED" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Hide RSVP Actions if Read Only */}
                {!isReadOnly && (
                    <Animated.View layout={LinearTransition.duration(300)} style={{ marginTop: showRsvpSelector ? 24 : 0, marginBottom: 60 }}>
                        {isRsvpLocked ? (
                            <View style={styles.rsvpLockedBanner}>
                                <Feather name="lock" size={16} color="#6B7280" />
                                <Text style={styles.rsvpLockedTitle}>RSVPs Not Open Yet</Text>
                                <Text style={styles.rsvpLockedSubtitle}>
                                    Opens {new Date(meetup.rsvpOpenDate!).toLocaleDateString(undefined, {
                                        weekday: 'short', month: 'short', day: 'numeric', timeZone: meetup.timezone
                                    })}
                                </Text>
                            </View>
                        ) : isRsvpDeadlinePassed ? (
                            <View style={styles.rsvpLockedBanner}>
                                <Feather name="lock" size={16} color="#6B7280" />
                                <Text style={styles.rsvpLockedTitle}>RSVP Deadline Passed</Text>
                                <Text style={styles.rsvpLockedSubtitle}>
                                    Closed {new Date(meetup.rsvpCloseDate!).toLocaleDateString(undefined, {
                                        weekday: 'short', month: 'short', day: 'numeric', timeZone: meetup.timezone
                                    })}
                                </Text>
                            </View>
                        ) : !showRsvpSelector ? (
                            <Animated.View
                                key="rsvp-pill"
                                entering={FadeIn.duration(220)}
                                exiting={FadeOut.duration(160)}
                                layout={LinearTransition.duration(280)}
                                style={{ alignItems: 'center' }}
                            >
                                <TouchableOpacity
                                    onPress={() => setManualRsvpEdit(true)}
                                    style={[
                                        styles.changeRsvpPill,
                                        { borderColor: isOut ? '#FF7A6E' : '#4FD1C5', backgroundColor: 'white' }
                                    ]}
                                    activeOpacity={0.7}
                                >
                                    <Feather name="repeat" size={14} color={isOut ? '#FF7A6E' : '#3FABA1'} />
                                    <Text style={[styles.changeRsvpPillText, { color: isOut ? '#C2453A' : '#3FABA1' }]}>Change In/Out</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        ) : (
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
                                                backgroundColor: isWaitlisted ? '#2563EB' : (isFull && !isIn) ? '#F97316' : inFilled ? '#4FD1C5' : 'white',
                                            }}>
                                                <Animated.View style={[{
                                                    flex: 1, flexDirection: 'row', borderRadius: 16,
                                                    borderWidth: inFilled ? 0 : 1.5,
                                                    borderColor: '#4FD1C5',
                                                }, boxStyle]}>
                                                    <TouchableOpacity
                                                        onPress={() => { setGuestExpanded(false); handleRsvpAction('in'); }}
                                                        disabled={isRsvping}
                                                        style={{ flex: 7, alignItems: 'center', justifyContent: 'center' }}
                                                    >
                                                        <Animated.Text style={[{ color: inFilled ? 'white' : '#4FD1C5', fontWeight: 'bold', fontSize: 18 }, inTextStyle]}>
                                                            {isWaitlisted ? "Waitlisted" : (isFull && !isIn) ? "Join Waitlist" : "I'm In"}
                                                        </Animated.Text>
                                                    </TouchableOpacity>
                                                    <View style={{ width: 1, backgroundColor: inFilled ? 'rgba(255,255,255,0.35)' : '#D1FAE5' }} />
                                                    <TouchableOpacity
                                                        onPress={() => setGuestExpanded(v => !v)}
                                                        disabled={isRsvping}
                                                        style={{ flex: 3, alignItems: 'center', justifyContent: 'center' }}
                                                    >
                                                        {guestExpanded
                                                            ? <Feather name="x" size={20} color={inFilled ? 'white' : '#4FD1C5'} />
                                                            : <MaterialIcons name="group-add" size={22} color={inFilled ? 'white' : '#4FD1C5'} />
                                                        }
                                                    </TouchableOpacity>
                                                </Animated.View>
                                            </View>

                                            {/* Split I'm Out button */}
                                            <View style={{
                                                flex: 1, borderRadius: 16, overflow: 'hidden', height: 72,
                                                backgroundColor: outFilled ? '#FF7A6E' : 'white',
                                            }}>
                                                <Animated.View style={[{
                                                    flex: 1, flexDirection: 'row', borderRadius: 16,
                                                    borderWidth: outFilled ? 0 : 1.5,
                                                    borderColor: '#FF7A6E',
                                                }, boxStyle]}>
                                                    <TouchableOpacity
                                                        onPress={() => { setGuestExpanded(false); handleRsvpAction('out'); }}
                                                        disabled={isRsvping}
                                                        style={{ flex: 7, alignItems: 'center', justifyContent: 'center' }}
                                                    >
                                                        <Animated.Text style={[{ color: outFilled ? 'white' : '#FF7A6E', fontWeight: 'bold', fontSize: 18 }, outTextStyle]}>I'm Out</Animated.Text>
                                                    </TouchableOpacity>
                                                    <View style={{ width: 1, backgroundColor: outFilled ? 'rgba(255,255,255,0.35)' : '#FFE4E1' }} />
                                                    <TouchableOpacity
                                                        onPress={handleRsvpOutAndMute}
                                                        disabled={isRsvping}
                                                        style={{ flex: 3, alignItems: 'center', justifyContent: 'center' }}
                                                    >
                                                        <Feather name="bell-off" size={20} color={outFilled ? 'white' : '#FF7A6E'} />
                                                    </TouchableOpacity>
                                                </Animated.View>
                                            </View>
                                        </View>
                                    )}
                                </RsvpBreather>

                                {/* Inline guest counter */}
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

                                            <TouchableOpacity
                                                onPress={async () => {
                                                    setGuestExpanded(false);
                                                    await performSetGuests(localGuestCount);
                                                    if (!isIn) performRsvp('in');
                                                }}
                                                disabled={isRsvping || isSettingGuests}
                                                style={{
                                                    width: 36, height: 36, borderRadius: 18,
                                                    backgroundColor: '#4FD1C5',
                                                    borderWidth: 1.5, borderColor: '#3FABA1',
                                                    alignItems: 'center', justifyContent: 'center',
                                                    marginLeft: 6,
                                                }}
                                            >
                                                {(isRsvping || isSettingGuests)
                                                    ? <ActivityIndicator size="small" color="white" />
                                                    : <Feather name="check" size={18} color="white" />
                                                }
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}
                            </Animated.View>
                        )}
                    </Animated.View>
                )}

                <Animated.View layout={LinearTransition.duration(300)} style={{ marginBottom: 40 }}>
                    {renderSectionHeader('In', goingUsers.length + totalGuestsForInTab, '#4FD1C5',
                        <Text style={[styles.sectionHeaderText, { color: '#4FD1C5', marginBottom: 0 }]}>
                            {meetup.capacity > 0 ? `Max: ${meetup.capacity}` : 'Unlimited'}
                        </Text>
                    )}
                    <View style={styles.grid}>
                        {goingUsers.length === 0 && totalGuestsForInTab === 0 && (
                            <Text style={styles.emptyText}>No one is in yet.</Text>
                        )}
                        {goingUsers.map(user => renderUserTile(user, user._id))}
                        {allGuestEntries.map(renderGuestTile)}
                    </View>

                    {renderSectionHeader('Out', outUsers.length, '#FF7A6E')}
                    <View style={styles.grid}>
                        {outUsers.length === 0 && <Text style={styles.emptyText}>No one is out.</Text>}
                        {outUsers.map(user => renderUserTile(user, user._id))}
                    </View>

                    {renderSectionHeader('Undecided', undecidedUsers.length, '#9CA3AF',
                        canManage && undecidedUsers.length > 0 ? (
                            <TouchableOpacity onPress={handleRemindAll} disabled={isSendingReminder} style={styles.remindAllBtn} activeOpacity={0.7}>
                                <Feather name="bell" size={12} color="#4A90E2" />
                                <Text style={styles.remindAllText}>Remind All</Text>
                            </TouchableOpacity>
                        ) : undefined
                    )}
                    <View style={styles.grid}>
                        {undecidedUsers.length === 0 && <Text style={styles.emptyText}>Everyone has responded.</Text>}
                        {undecidedUsers.map(user => renderUserTile(user, user._id))}
                    </View>

                    {waitlistUsers.length > 0 && (
                        <>
                            {renderSectionHeader('Waitlist', waitlistUsers.length, '#2563EB')}
                            <View style={styles.grid}>
                                {waitlistUsers.map((user, index) => renderUserTile(user, user._id, { waitlistPosition: index + 1 }))}
                            </View>
                        </>
                    )}
                </Animated.View>

                {/* Hide Management section if Read Only */}
                {canManage && (
                    <View style={styles.ownerSection}>
                        <TouchableOpacity onPress={handleCancelMeetup} style={[styles.cancelToggle, isCancelled && { backgroundColor: '#4A90E2', borderColor: '#4A90E2' }]}>
                            <Text style={[styles.cancelToggleText, isCancelled && { color: 'white' }]}>
                                {isCancelled ? "Reactivate Meetup" : "Cancel This Meetup"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>

            {/* More Details Modal */}
            <Modal transparent visible={isDetailsModalVisible} animationType="slide" onRequestClose={() => setIsDetailsModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeaderInner}>
                            <Text style={styles.modalTitleInner}>More Details</Text>
                            <TouchableOpacity onPress={() => setIsDetailsModalVisible(false)}>
                                <Feather name="x" size={24} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.detailsCard}>
                            <View style={styles.detailItem}>
                                <Text style={styles.detailLabel}>Location</Text>
                                <Text style={styles.detailValue}>{meetup.location || (meetup.group as any)?.defaultLocation || "No location set"}</Text>
                            </View>
                            <View style={styles.detailSeparator} />
                            <View style={styles.detailItem}>
                                <Text style={styles.detailLabel}>Capacity</Text>
                                <Text style={[styles.detailValue, isFull && !isReadOnly && { color: '#C2410C' }]}>
                                    {meetup.capacity === 0 ? "Unlimited" : `${meetup.in?.length || 0}/${meetup.capacity} spots filled`}
                                </Text>
                            </View>
                            <View style={styles.detailSeparator} />
                            <View style={styles.detailItem}>
                                <Text style={styles.detailLabel}>Group</Text>
                                <Text style={styles.detailValue}>{(meetup.group as any)?.name || '—'}</Text>
                            </View>
                            {meetup.rsvpOpenDate && (
                                <>
                                    <View style={styles.detailSeparator} />
                                    <View style={styles.detailItem}>
                                        <Text style={styles.detailLabel}>RSVPs Open</Text>
                                        <Text style={styles.detailValue}>
                                            {new Date(meetup.rsvpOpenDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: meetup.timezone })}
                                        </Text>
                                    </View>
                                </>
                            )}
                            {meetup.rsvpCloseDate && (
                                <>
                                    <View style={styles.detailSeparator} />
                                    <View style={styles.detailItem}>
                                        <Text style={styles.detailLabel}>RSVP Deadline</Text>
                                        <Text style={styles.detailValue}>
                                            {new Date(meetup.rsvpCloseDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: meetup.timezone })}
                                        </Text>
                                    </View>
                                </>
                            )}
                            <View style={styles.detailSeparator} />
                            <View style={styles.detailItem}>
                                <Text style={styles.detailLabel}>Status</Text>
                                <Text style={styles.detailValue}>{isCancelled ? "Cancelled" : isExpired ? "Ended" : "Upcoming"}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Start DM Confirmation Sheet */}
            <Modal
                visible={!!dmTargetUser}
                transparent
                animationType="slide"
                onRequestClose={() => setDmTargetUser(null)}
            >
                <Pressable style={dmStyles.backdrop} onPress={() => setDmTargetUser(null)}>
                    <Pressable style={dmStyles.sheet} onPress={() => {}}>
                        <View style={dmStyles.dragHandle} />
                        {dmTargetUser && (
                            <>
                                <Image
                                    source={{ uri: dmTargetUser.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${dmTargetUser.firstName?.[0] ?? dmTargetUser.email?.[0]}` }}
                                    style={dmStyles.avatar}
                                />
                                <Text style={dmStyles.name}>
                                    {[dmTargetUser.firstName, dmTargetUser.lastName].filter(Boolean).join(' ') || dmTargetUser.email?.split('@')[0]}
                                </Text>
                                <TouchableOpacity
                                    style={dmStyles.dmBtn}
                                    onPress={handleSendDM}
                                    disabled={isCreatingDM}
                                    activeOpacity={0.8}
                                >
                                    {isCreatingDM
                                        ? <ActivityIndicator color="#fff" size="small" />
                                        : <Text style={dmStyles.dmBtnText}>Send DM</Text>
                                    }
                                </TouchableOpacity>
                                {canManage && undecidedUsers.some(u => u._id === dmTargetUser._id) && (
                                    <TouchableOpacity
                                        style={dmStyles.remindBtn}
                                        onPress={() => handleSendReminder(dmTargetUser._id)}
                                        disabled={isSendingReminder}
                                        activeOpacity={0.8}
                                    >
                                        {isSendingReminder
                                            ? <ActivityIndicator color="#4A90E2" size="small" />
                                            : <Text style={dmStyles.remindBtnText}>Send Reminder</Text>
                                        }
                                    </TouchableOpacity>
                                )}
                                {canManageTarget(dmTargetUser) && (() => {
                                    const targetIsIn = meetup.in?.some(u => getUserId(u) === dmTargetUser._id) ?? false;
                                    const targetIsOut = meetup.out?.some(u => getUserId(u) === dmTargetUser._id) ?? false;
                                    return (
                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                                            <TouchableOpacity
                                                style={[dmStyles.rsvpActionBtn, { backgroundColor: '#4FD1C5' }, targetIsIn && dmStyles.rsvpActionBtnDisabled]}
                                                onPress={() => handleAdminRsvpChange(dmTargetUser._id, 'in')}
                                                disabled={isUpdatingTargetRsvp || targetIsIn}
                                                activeOpacity={0.8}
                                            >
                                                {isUpdatingTargetRsvp
                                                    ? <ActivityIndicator color="#fff" size="small" />
                                                    : <Text style={dmStyles.rsvpActionBtnText}>Mark as In</Text>
                                                }
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[dmStyles.rsvpActionBtn, { backgroundColor: '#FF7A6E' }, targetIsOut && dmStyles.rsvpActionBtnDisabled]}
                                                onPress={() => handleAdminRsvpChange(dmTargetUser._id, 'out')}
                                                disabled={isUpdatingTargetRsvp || targetIsOut}
                                                activeOpacity={0.8}
                                            >
                                                {isUpdatingTargetRsvp
                                                    ? <ActivityIndicator color="#fff" size="small" />
                                                    : <Text style={dmStyles.rsvpActionBtnText}>Mark as Out</Text>
                                                }
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })()}
                            </>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Combined Edit Details Modal */}
            <Modal transparent visible={isEditModalVisible} animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeaderInner}>
                                <TouchableOpacity onPress={() => setIsEditModalVisible(false)}><Feather name="x" size={24} color="#9CA3AF" /></TouchableOpacity>
                                <Text style={styles.modalTitleInner}>Edit Meetup</Text>
                                <TouchableOpacity onPress={handleUpdateMeetupDetails} disabled={isUpdating || !canSaveCapacity}>
                                    {isUpdating ? <ActivityIndicator size="small" color="#4A90E2" /> : <Text style={[styles.saveBtnText, !canSaveCapacity && styles.saveBtnTextDisabled]}>Save</Text>}
                                </TouchableOpacity>
                            </View>
                            
                            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
                                <Text style={styles.fieldLabel}>Date</Text>
                                <TouchableOpacity style={styles.dateInput} onPress={() => setShowDatePicker(true)}>
                                    <Feather name="calendar" size={18} color="#4A90E2" />
                                    <Text style={styles.dateInputText}>
                                        {newDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                    </Text>
                                </TouchableOpacity>

                                <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Time</Text>
                                <TouchableOpacity style={styles.dateInput} onPress={() => setShowTimePicker(true)}>
                                    <Feather name="clock" size={18} color="#4A90E2" />
                                    <Text style={styles.dateInputText}>{newTime}</Text>
                                </TouchableOpacity>
                                {showTimePicker && (
                                    <NativeTimePicker value={newTime} onChange={setNewTime} onClose={() => setShowTimePicker(false)} />
                                )}

                                <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Location Override</Text>
                                <View style={styles.inputContainer}>
                                    <Feather name="map-pin" size={18} color="#4A90E2" />
                                    <TextInput 
                                        style={styles.textInput}
                                        placeholder="Specific address or link..."
                                        value={newLocation}
                                        onChangeText={setNewLocation}
                                    />
                                </View>

                                <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Max Attendees</Text>
                                <View style={styles.boolRow}>
                                    <TouchableOpacity
                                        style={[styles.boolBtn, capacityMode === "unlimited" && styles.boolBtnActive]}
                                        onPress={() => { setCapacityMode("unlimited"); setNewCapacity(""); }}
                                    >
                                        <Text style={[styles.boolBtnText, capacityMode === "unlimited" && styles.boolBtnTextActive]}>Unlimited</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.boolBtn, capacityMode === "limited" && styles.boolBtnActive]}
                                        onPress={() => setCapacityMode("limited")}
                                    >
                                        <Text style={[styles.boolBtnText, capacityMode === "limited" && styles.boolBtnTextActive]}>Limited</Text>
                                    </TouchableOpacity>
                                </View>
                                {capacityMode === "limited" && (
                                    <View style={{ marginTop: 10 }}>
                                        <View style={[styles.inputContainer, capacityError && styles.inputContainerError]}>
                                            <Feather name="users" size={18} color="#4A90E2" />
                                            <TextInput
                                                style={styles.textInput}
                                                placeholder="How many?"
                                                placeholderTextColor="#C4C9D4"
                                                keyboardType="number-pad"
                                                value={newCapacity}
                                                onChangeText={setNewCapacity}
                                            />
                                        </View>
                                        {capacityError && <Text style={styles.errorText}>{capacityError}</Text>}
                                    </View>
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* --- THIS IS THE NEW MODAL FOR THE DATE PICKER --- */}
            {showDatePicker && (
                Platform.OS === 'ios' ? (
                    <Modal
                        animationType="slide"
                        transparent={true}
                        visible={showDatePicker}
                        onRequestClose={() => setShowDatePicker(false)}
                    >
                        <View style={styles.datePickerOverlay}>
                            <View style={styles.datePickerContent}>
                                <DateTimePicker
                                    value={tempDate}
                                    mode="date"
                                    display="spinner"
                                    onChange={onDateChange}
                                    textColor='black'
                                />
                                <TouchableOpacity onPress={confirmIosDate} style={styles.doneButton}>
                                    <Text style={styles.doneButtonText}>Done</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Modal>
                ) : (
                    <DateTimePicker
                        value={newDate} // Android picker can use the final state directly
                        mode="date"
                        display="default"
                        onChange={onDateChange}
                    />
                )
            )}

            <RsvpResponseOverlay />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    closeButton: { padding: 4 },
    headerTitleContainer: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 14, fontWeight: '900', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 },
    content: { flex: 1, padding: 24 },
    cancelBanner: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#FEE2E2' },
    cancelBannerText: { color: '#B91C1C', fontWeight: '800', marginLeft: 8, fontSize: 12, textTransform: 'uppercase' },
    meetupTitle: { fontSize: 26, fontWeight: '900', color: '#111827', letterSpacing: -0.5, lineHeight: 30, marginBottom: 4, textAlign: 'center' },
    inWatermark: {
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        textAlign: 'center',
        fontSize: 116,
        fontWeight: '900',
        color: '#4FD1C5',
        letterSpacing: 4,
        transform: [{ translateY: -58 }],
    },
    outWatermark: {
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        textAlign: 'center',
        fontSize: 96,
        fontWeight: '900',
        color: '#FF7A6E',
        letterSpacing: 4,
        transform: [{ translateY: -48 }],
    },
    actionRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
    actionBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    editActionBtn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
    calendarActionBtn: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
    chatActionBtn: { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' },
    moreActionBtn: { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' },
    strikeThrough: { textDecorationLine: 'line-through', color: '#D1D5DB' },
    detailsCard: { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#F3F4F6' },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
    detailItem: {},
    detailLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 0 },
    detailValue: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
    detailSeparator: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 12 },
    guestAvatarPlaceholder: { backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    rsvpLockedBanner: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: '#F9FAFB', 
    borderRadius: 16, 
    paddingVertical: 20,
    borderWidth: 1, 
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    gap: 4
},
rsvpLockedTitle: { 
    fontSize: 14, 
    fontWeight: '900', 
    color: '#6B7280', 
    textTransform: 'uppercase', 
    letterSpacing: 0.5,
    marginTop: 4
},
rsvpLockedSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF'
},
    changeRsvpPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1.5,
    },
    changeRsvpPillText: {
        fontWeight: '800',
        fontSize: 13,
        letterSpacing: 0.2,
    },
    // Roster sections
    sectionHeaderWrap: { marginTop: 8, marginBottom: 14 },
    sectionHeaderText: { fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    sectionHeaderLine: { height: 3, borderRadius: 2, opacity: 0.85 },
    remindAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EEF6FF', borderWidth: 1, borderColor: '#93C5FD', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
    remindAllText: { color: '#4A90E2', fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 8 },
    gridItem: { width: '30%', alignItems: 'center' },
    gridAvatarWrap: { width: '100%', position: 'relative' },
    gridAvatar: { width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: '#F3F4F6' },
    gridAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    gridName: { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: 6, textAlign: 'center' },
    guestCountText: { fontSize: 26, fontWeight: '900', color: '#4FD1C5' },
    waitlistBadge: { position: 'absolute', top: -6, left: -6, backgroundColor: '#2563EB', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' },
    waitlistBadgeText: { color: 'white', fontSize: 11, fontWeight: '800' },
    emptyText: { color: '#9CA3AF', fontStyle: 'italic', marginBottom: 20 },
    ownerSection: { marginTop: 40, paddingBottom: 60, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 24 },
    cancelToggle: { height: 50, borderRadius: 14, borderWidth: 2, borderColor: '#EF4444', backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
    cancelToggleText: { color: '#EF4444', fontWeight: '900', textTransform: 'uppercase', fontSize: 12 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 60 },
    modalHeaderInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalTitleInner: { fontSize: 18, fontWeight: '900', color: '#111827' },
    saveBtnText: { color: '#4A90E2', fontWeight: '900', fontSize: 16 },
    saveBtnTextDisabled: { color: '#BFDBFE' },
    modalBody: { paddingBottom: 60 },
    fieldLabel: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#E5E7EB' },
    inputContainerError: { borderColor: '#EF4444' },
    textInput: { flex: 1, marginLeft: 12, fontSize: 16, color: '#374151' },
    errorText: { fontSize: 12, fontWeight: '600', color: '#EF4444', marginTop: 6, marginLeft: 2 },
    boolRow: { flexDirection: 'row', gap: 10 },
    boolBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: '#fff' },
    boolBtnActive: { borderColor: '#4A90E2', backgroundColor: '#EEF6FF' },
    boolBtnText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
    boolBtnTextActive: { color: '#4A90E2' },
    dateInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#E5E7EB' },
    dateInputText: { marginLeft: 12, fontSize: 16, color: '#374151', fontWeight: '600' },
    datePickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    datePickerContent: { backgroundColor: 'white', borderTopRightRadius: 20, borderTopLeftRadius: 20, padding: 16 },
    doneButton: { backgroundColor: '#4A90E2', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
    doneButtonText: { color: 'white', fontSize: 18, fontWeight: '600' },
});

const dmStyles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, alignItems: 'center' },
    dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', marginBottom: 24 },
    avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 14, backgroundColor: '#F3F4F6' },
    name: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 28 },
    dmBtn: { backgroundColor: '#4A90E2', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 16, minWidth: 160, alignItems: 'center' },
    dmBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    remindBtn: { marginTop: 12, backgroundColor: '#EEF6FF', borderWidth: 1.5, borderColor: '#93C5FD', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 16, minWidth: 160, alignItems: 'center' },
    remindBtnText: { color: '#4A90E2', fontWeight: '700', fontSize: 16 },
    rsvpActionBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
    rsvpActionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    rsvpActionBtnDisabled: { opacity: 0.45 },
});

export default MeetupDetailModal;