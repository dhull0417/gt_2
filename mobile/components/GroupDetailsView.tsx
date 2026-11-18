import React, { useMemo, useState } from 'react';
import { requireOnline } from '@/utils/offlineState';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { SquircleTile, type SquircleTint } from '@/components/ui/SquircleTile';
import { Feather } from '@expo/vector-icons';
import { GroupDetails, User, useApiClient } from '@/utils/api';
import { useRouter } from 'expo-router';
import { GroupAvatar } from './GroupAvatar';
import { getDMDisplayName } from '@/utils/groupDisplay';

import { useLeaveGroup } from '@/hooks/useLeaveGroup';
import { useAppearance, useThemeColors } from '@/contexts/AppearanceContext';
import { useGetMeetups } from '@/hooks/useGetMeetups';
import MeetupDetailModal from '@/components/MeetupDetailModal';
import GroupMeetupsModal from '@/components/GroupMeetupsModal';
import { ScheduleDetailsModal } from '@/components/ScheduleDetailsModal';
import { GroupMembersList } from '@/components/GroupMembersList';
import { formatMeetupDate, formatMeetupTimeRange, meetupStartInstant } from '@/utils/meetupTime';
import type { Meetup } from '@/utils/api';
import { addGroupToCalendar } from '@/utils/calendarFeed';
import { getGroupImage } from '@/utils/groupDisplay';
import { runBackInterceptor } from '@/utils/backInterceptors';
import {
    buildDetailTiles, isGroupManager, scheduleSummary, upcomingMeetupCount, type DetailTileKey,
} from '@/utils/groupDetailTiles';

interface GroupDetailsViewProps {
    groupDetails: GroupDetails;
    currentUser: User;
    onLeaveSuccess: () => void;
}

// Group photo + name, the next meetup, then a 2-wide grid of squircle tiles that each open
// their own place (invite screen, members page, schedule modal, ...). DMs show their members instead.
export const GroupDetailsView = ({
    groupDetails,
    currentUser,
    onLeaveSuccess,
}: GroupDetailsViewProps) => {

    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const isDark = scheme === 'dark';
    const router = useRouter();
    const api = useApiClient();
    const { mutate: leaveGroup, isPending: isLeaving } = useLeaveGroup();

    const isDM = !!groupDetails.isDM;
    const canManage = isGroupManager(groupDetails as any, currentUser._id);

    // The group's meetups, from the same cached list the Home tab uses.
    const { data: allMeetups } = useGetMeetups();
    const [openMeetup, setOpenMeetup] = useState<Meetup | null>(null);
    const [meetupsOpen, setMeetupsOpen] = useState(false);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const nextMeetup = useMemo(() => {
        if (isDM) return null;
        const now = Date.now();
        return (allMeetups ?? [])
            .filter(m => m.group._id === groupDetails._id && m.status === 'scheduled' && meetupStartInstant(m).getTime() >= now)
            .sort((a, b) => meetupStartInstant(a).getTime() - meetupStartInstant(b).getTime())[0] ?? null;
    }, [allMeetups, groupDetails._id, isDM]);
    const upcomingCount = useMemo(
        () => upcomingMeetupCount(allMeetups, groupDetails._id, Date.now()),
        [allMeetups, groupDetails._id],
    );

    // Pastel icon-chip colours adapt by scheme while keeping the same hue family
    const tint = (light: string, lightBorder: string, dark: string, darkBorder: string, fg: string): SquircleTint =>
        ({ bg: isDark ? dark : light, border: isDark ? darkBorder : lightBorder, fg });
    const chipBlue = { backgroundColor: isDark ? '#1A2A42' : '#EEF6FF', borderColor: isDark ? '#2C4870' : '#BFDBFE' };
    const tints = {
        teal: tint('#F0FDFA', '#99F6E4', '#123330', '#1F5B54', colors.accentTeal),
        blue: tint('#EEF6FF', '#BFDBFE', '#1A2A42', '#2C4870', colors.brand),
        amber: tint('#FFFBEB', '#FDE68A', '#3A2E12', '#5C4A1E', '#D97706'),
        purple: tint('#F5F3FF', '#DDD6FE', '#241B3D', '#3B2E63', '#7C3AED'),
        gray: tint('#F3F4F6', '#E5E7EB', '#262A33', '#3A3F4B', colors.textSecondary),
        slate: tint('#EEF2F7', '#CBD5E1', '#1E2633', '#334155', isDark ? '#94A3B8' : '#475569'),
    };

    const memberCount = groupDetails.members?.length ?? 0;
    const tileProps: Record<DetailTileKey, React.ComponentProps<typeof SquircleTile>> = {
        invite: {
            icon: 'user-plus', label: 'Invite Friends', subtitle: 'QR & link', tint: tints.teal,
            onPress: () => router.push({ pathname: '/group-invite/[id]', params: { id: groupDetails._id } }),
        },
        calendar: {
            icon: 'calendar', label: 'Add to My Calendar', tint: tints.blue,
            onPress: () => addGroupToCalendar(api, groupDetails._id, groupDetails.name),
        },
        meetups: {
            icon: 'list', label: 'Upcoming Meetups', tint: tints.amber,
            subtitle: upcomingCount === 0 ? 'None scheduled' : `${upcomingCount} upcoming`,
            onPress: () => setMeetupsOpen(true),
        },
        past: {
            icon: 'rotate-ccw', label: 'Past Meetups', tint: tints.slate,
            onPress: () => router.push({ pathname: '/group-past-meetups/[id]', params: { id: groupDetails._id } }),
        },
        members: {
            icon: 'users', label: 'Group Members', tint: tints.purple,
            subtitle: `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`,
            onPress: () => router.push({ pathname: '/group-members/[id]', params: { id: groupDetails._id } }),
        },
        schedule: {
            icon: 'clock', label: 'Schedule Details', tint: tints.blue,
            subtitle: scheduleSummary(groupDetails.schedules),
            onPress: () => setScheduleOpen(true),
        },
        settings: {
            icon: 'settings', label: 'Group Settings', tint: tints.gray,
            onPress: () => router.push({ pathname: '/group-settings/[id]', params: { id: groupDetails._id } }),
        },
    };
    const tiles = buildDetailTiles({ isDM, canManage });

    const handleLeaveGroup = () => {
        if (!requireOnline('leave this group')) return;
        Alert.alert(
            "Leave Group",
            `Are you sure you want to leave "${groupDetails.name}"?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Leave",
                    style: "destructive",
                    onPress: () => {
                        leaveGroup({ groupId: groupDetails._id }, {
                            onSuccess: onLeaveSuccess
                        });
                    }
                }
            ]
        );
    };

    const headerName = isDM ? getDMDisplayName(groupDetails as any, currentUser.clerkId) : groupDetails.name;

    return (
        <View style={styles.container}>
            {/* Group photo + name */}
            <View style={styles.groupHeader}>
                <GroupAvatar name={headerName} imageUrl={getGroupImage(groupDetails as any, currentUser.clerkId)} size={140} borderRadius={32} />
                <Text style={[styles.groupHeaderName, { color: colors.textPrimary }]}>{headerName}</Text>
            </View>

            {/* Next meetup — tap to open it */}
            {nextMeetup && (
                <PressableOpacity onPress={() => setOpenMeetup(nextMeetup)} style={[styles.card, { backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center' }]} activeOpacity={0.8}>
                    <View style={[styles.iconWrap, chipBlue]}>
                        <Feather name="calendar" size={16} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: colors.textFaint, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>Next meetup</Text>
                        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 2 }} numberOfLines={1}>{nextMeetup.name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 1 }} numberOfLines={1}>
                            {formatMeetupDate(nextMeetup, { weekday: 'short', month: 'short', day: 'numeric' })} at {formatMeetupTimeRange(nextMeetup)}
                        </Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.textFaint} />
                </PressableOpacity>
            )}
            {openMeetup && (
                <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!runBackInterceptor()) setOpenMeetup(null); }}>
                    <MeetupDetailModal meetup={openMeetup} onClose={() => setOpenMeetup(null)} />
                </Modal>
            )}

            {/* Squircle grid, 2 wide */}
            {tiles.length > 0 && (
                <View style={styles.tileGrid}>
                    {tiles.map((key) => (
                        <SquircleTile key={key} testID={`tile-${key}`} style={styles.tile} {...tileProps[key]} />
                    ))}
                </View>
            )}

            {/* DMs have no tiles; show who's in the conversation */}
            {isDM && (
                <GroupMembersList
                    groupDetails={groupDetails}
                    currentUser={currentUser}
                    isRemovingMember={false}
                    onRemoveMember={() => {}}
                />
            )}

            {!isDM && (
                <>
                    <GroupMeetupsModal visible={meetupsOpen} onClose={() => setMeetupsOpen(false)} groupId={groupDetails._id} />
                    <ScheduleDetailsModal visible={scheduleOpen} onClose={() => setScheduleOpen(false)} groupDetails={groupDetails} />
                </>
            )}

            {/* --- LEAVE GROUP BUTTON (for non-managers) --- */}
            {!canManage && (
                <View style={[styles.footerActionContainer, { borderTopColor: colors.border }]}>
                    <PressableOpacity onPress={handleLeaveGroup} style={[styles.leaveButton, { backgroundColor: colors.danger }]} disabled={isLeaving}>
                        {isLeaving
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={styles.leaveButtonText}>Leave Group</Text>
                        }
                    </PressableOpacity>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    groupHeader: { alignItems: 'center', paddingVertical: 20, marginBottom: 8 },
    groupHeaderName: { fontSize: 20, fontWeight: '900', marginTop: 12, textAlign: 'center' },
    card: { padding: 12, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 12 },
    iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    // Two per row; an odd last tile sits alone on the left.
    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginTop: 4, marginBottom: 12 },
    tile: { width: '48%' },
    footerActionContainer: { paddingHorizontal: 20, paddingVertical: 24, borderTopWidth: 1, marginTop: 16 },
    leaveButton: { paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    leaveButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});
