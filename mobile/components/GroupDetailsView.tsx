import React, { useState } from 'react';
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    StyleSheet,
    Share,
    ActivityIndicator,
    Alert,
    Platform,
    LayoutAnimation,
    UIManager,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GroupDetails, User, useApiClient, groupApi } from '@/utils/api';
import { useRouter } from 'expo-router';
import { GroupAvatar } from './GroupAvatar';
import { useQuery } from '@tanstack/react-query';
import { getDMDisplayName } from '@/utils/groupDisplay';

import { useLeaveGroup } from '@/hooks/useLeaveGroup';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

interface GroupDetailsViewProps {
    groupDetails: GroupDetails;
    currentUser: User;
    isRemovingMember: boolean;
    onRemoveMember: (memberIdToRemove: string) => void;
    searchQuery: string;
    onSearchChange: (text: string) => void;
    onLeaveSuccess: () => void;
    searchResults: User[] | undefined;
    onInvite: (id: string) => void;
    onMemberPress?: (member: User) => void;
}

const daysOfWeekFull = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Helper to get common timezone abbreviations
const getTZAbbreviation = (timezone: string) => {
    switch (timezone) {
        case "America/New_York": return "ET";
        case "America/Chicago": return "CT";
        case "America/Denver": return "MT";
        case "America/Phoenix": return "MST"; // Mountain Standard Time (no DST)
        case "America/Los_Angeles": return "PT";
        case "America/Anchorage": return "AKST";
        case "Pacific/Honolulu": return "HST";
        default: 
            return ""; // Fallback if not explicitly mapped
    }
};

/**
 * GroupDetailsView
 * Displays specific schedule routines, member lists, and invitation tools.
 * Restored: JIT Schedule info and Share Invite Link functionality.
 * Added: Role labels (Owner/Moderator) in member list.
 * Fixed: Added explicit Timezone display to the Details card.
 */
export const GroupDetailsView = ({
    groupDetails,
    currentUser,
    isRemovingMember,
    onRemoveMember,
    searchQuery,
    onSearchChange,
    searchResults,
    onInvite,
    onLeaveSuccess,
    onMemberPress,
}: GroupDetailsViewProps) => {
    
    const [detailsExpanded, setDetailsExpanded] = useState(false);
    const router = useRouter();
    const api = useApiClient();
    const { mutate: leaveGroup, isPending: isLeaving } = useLeaveGroup();

    const { data: inviteLinkData } = useQuery({
        queryKey: ['inviteLink', groupDetails._id],
        queryFn: () => groupApi.generateInviteLink(api, groupDetails._id),
        enabled: !groupDetails.isDM,
        staleTime: 1000 * 60 * 5,
    });
    

    // --- Permissions ---
    const isOwner = currentUser._id === groupDetails.owner;
    const isMod = groupDetails.moderators?.some((m: User | string) => 
        typeof m === 'string' ? m === currentUser._id : m._id === currentUser._id
    ) ?? false;
    const canManage = isOwner || isMod;

    const handleInvitePress = async () => {
        const inviteLink = inviteLinkData?.link;
        if (!inviteLink) {
            Alert.alert('Not Ready', 'The invite link is still loading. Please try again in a moment.');
            return;
        }
        try {
            await Share.share({
                message: `Join my group "${groupDetails.name}" on GroupThat!\n\nSTEP 1 — Download the app:\n→ https://invite.groupthatapp.com/download\n\nSTEP 2 — Join the group:\n→ ${inviteLink}`,
            });
        } catch (error: any) {
            Alert.alert('Error', 'Could not share invite link.');
        }
    };

    const handleLeaveGroup = () => {
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

    /**
     * Helper to render meetup lines.
     */
    const renderScheduleLines = (frequency: string, dayTimes: any[]) => {
        const groupTimezoneAbbr = getTZAbbreviation(groupDetails.timezone);
        const timeEntries = dayTimes && dayTimes.length > 0 ? dayTimes : [{ time: "Time TBD" }];

        if (frequency === 'daily') {
            return daysOfWeekFull.map((dayName, dayIdx) => {
                let matches = timeEntries.filter(dt => dt.day === dayIdx);
                if (matches.length === 0) {
                    matches = timeEntries.filter(dt => dt.day === undefined || dt.day === null);
                }

                return matches.map((mt, mtIdx) => (
                    <Text key={`daily-${dayIdx}-${mtIdx}`} style={styles.scheduleDetailText}>
                        • {dayName} @ {mt.time} {groupTimezoneAbbr}
                    </Text>
                ));
            });
        }

        return timeEntries.map((dt, dtIdx) => {
            let dayLabel = "";
            if (frequency === 'ordinal' && groupDetails.schedule?.routines?.[0]?.rules?.[0]) {
                const rules = groupDetails.schedule.routines[0].rules;
                const ruleDay = rules![0].day;
                const dayName = typeof ruleDay === 'number' ? daysOfWeekFull[ruleDay] : "";
                dayLabel = `${rules![0].occurrence} ${dayName}`;
            } else if (typeof dt.date === 'number') {
                const d = dt.date;
                const sfx = d === 1 || d === 21 || d === 31 ? 'st' : 
                            d === 2 || d === 22 ? 'nd' : 
                            d === 3 || d === 23 ? 'rd' : 'th';
                dayLabel = `The ${d}${sfx}`;
            } else if (typeof dt.day === 'number') {
                dayLabel = daysOfWeekFull[dt.day];
            } else {
                dayLabel = "Meetup";
            }

            return (
                <Text key={dtIdx} style={styles.scheduleDetailText}>
                    • {dayLabel} @ {dt.time} {groupTimezoneAbbr}
                </Text>
            );
        });
    };

    const isDM = !!groupDetails.isDM;
    const headerName = isDM ? getDMDisplayName(groupDetails as any, currentUser.clerkId) : groupDetails.name;

    const toggleDetails = () => {
        animate();
        setDetailsExpanded(v => !v);
    };

    return (
        <View style={styles.container}>
            {/* 0. Group Photo Header */}
            <View style={styles.groupHeader}>
                <GroupAvatar name={headerName} imageUrl={groupDetails.image} size={140} borderRadius={32} />
                <Text style={styles.groupHeaderName}>{headerName}</Text>
            </View>

            {/* Invite Friends — hidden for DMs */}
            {!isDM && (
                <TouchableOpacity onPress={handleInvitePress} style={styles.inviteButton} activeOpacity={0.7}>
                    <Feather name="user-plus" size={16} color="#0D9488" />
                    <Text style={styles.inviteButtonText}>Invite Friends</Text>
                </TouchableOpacity>
            )}

            {/* 1. Details — collapsible, hidden for DMs */}
            {!isDM && <View style={styles.card}>
                <TouchableOpacity style={styles.collapsibleHeader} onPress={toggleDetails} activeOpacity={0.7}>
                    <View style={styles.collapsibleHeaderLeft}>
                        <View style={[styles.iconWrap, styles.iconWrapSmall, styles.iconWrapBlue]}>
                            <Feather name="info" size={14} color="#4A90E2" />
                        </View>
                        <Text style={styles.cardTitle}>Details</Text>
                    </View>
                    <Feather name={detailsExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#9CA3AF" />
                </TouchableOpacity>

                {detailsExpanded && (
                    <View style={styles.collapsibleBody}>
                        {/* Detailed Schedule Section */}
                        <View style={groupDetails.schedule?.routines && groupDetails.schedule.routines.length > 0 ? styles.infoRowTop : styles.infoRow}>
                            <View style={[styles.iconWrap, styles.iconWrapBlue]}>
                                <Feather name="calendar" size={16} color="#4A90E2" />
                            </View>
                            <View style={styles.scheduleContent}>
                                {groupDetails.schedule?.routines && groupDetails.schedule.routines.length > 0 ? (
                                    groupDetails.schedule.routines.map((routine, rIdx) => (
                                        <View key={rIdx} style={styles.routineBlock}>
                                            <Text style={styles.frequencyLabel}>
                                                {routine.frequency === 'biweekly' ? 'Every 2 Weeks' : routine.frequency.charAt(0).toUpperCase() + routine.frequency.slice(1)}
                                            </Text>
                                            {renderScheduleLines(routine.frequency, routine.dayTimes)}
                                        </View>
                                    ))
                                ) : (
                                    <Text style={[styles.scheduleDetailText, { fontSize: 16, marginBottom: 0 }]}>No schedule defined</Text>
                                )}
                            </View>
                        </View>

                        {/* Location Info */}
                        <View style={styles.infoRow}>
                            <View style={[styles.iconWrap, styles.iconWrapGreen]}>
                                <Feather name="map-pin" size={16} color="#16A34A" />
                            </View>
                            <Text style={styles.infoText}>
                                {groupDetails.defaultLocation || "No default location set"}
                            </Text>
                        </View>

                        {/* Capacity Limit */}
                        <View style={styles.infoRow}>
                            <View style={[styles.iconWrap, styles.iconWrapPurple]}>
                                <Feather name="users" size={16} color="#7C3AED" />
                            </View>
                            <Text style={styles.infoText}>{groupDetails.defaultCapacity === 0 ? "Unlimited Attendees" : groupDetails.defaultCapacity}</Text>
                        </View>

                        {/* JIT Schedule Info */}
                        <View style={[styles.infoRow, { marginBottom: 0 }]}>
                            <View style={[styles.iconWrap, styles.iconWrapAmber]}>
                                <Feather name="bell" size={16} color="#D97706" />
                            </View>
                            <Text style={styles.infoText}>
                                {groupDetails.generationLeadDays == null && groupDetails.generationDeadlineDays == null
                                    ? "RSVPs open anytime"
                                    : [
                                        groupDetails.generationLeadDays != null
                                            ? `Opens ${groupDetails.generationLeadDays} day${groupDetails.generationLeadDays !== 1 ? 's' : ''} before @ ${groupDetails.generationLeadTime}`
                                            : null,
                                        groupDetails.generationDeadlineDays != null
                                            ? `Deadline ${groupDetails.generationDeadlineDays} day${groupDetails.generationDeadlineDays !== 1 ? 's' : ''} before @ ${groupDetails.generationDeadlineTime}`
                                            : null,
                                    ].filter(Boolean).join(' · ')}
                            </Text>
                        </View>
                    </View>
                )}
            </View>}

            {/* 2. Member List — split into Owner/Moderators and Members, always expanded */}
            {(() => {
                const isStaff = (member: User) => {
                    const isMemberOwner = member._id === groupDetails.owner;
                    const isMemberMod = groupDetails.moderators?.some((m: User | string) =>
                        typeof m === 'string' ? m === member._id : m._id === member._id
                    ) ?? false;
                    return isMemberOwner || isMemberMod;
                };
                const staffMembers = groupDetails.members.filter(isStaff);
                const regularMembers = groupDetails.members.filter(m => !isStaff(m));

                const renderMemberTile = (member: User) => {
                    const isMemberOwner = member._id === groupDetails.owner;
                    const isMemberMod = groupDetails.moderators?.some((m: User | string) =>
                        typeof m === 'string' ? m === member._id : m._id === member._id
                    ) ?? false;
                    const isSelf = member._id === currentUser._id;
                    const canTap = !isDM && !isSelf && !!onMemberPress;
                    const canRemove = !isDM && !isMemberOwner && (isOwner || (canManage && !isMemberMod));

                    const Wrapper = canTap ? TouchableOpacity : View;
                    const wrapperProps = canTap ? { onPress: () => onMemberPress!(member), activeOpacity: 0.7 } : {};

                    return (
                        <Wrapper key={member._id} style={styles.gridItem} {...wrapperProps}>
                            <View style={styles.gridAvatarWrap}>
                                {member.profilePicture
                                    ? <Image source={{ uri: member.profilePicture }} style={styles.gridAvatar} />
                                    : (
                                        <View style={[styles.gridAvatar, styles.gridAvatarPlaceholder]}>
                                            <Feather name="user" size={22} color="#9CA3AF" />
                                        </View>
                                    )}
                                {isMemberOwner && (
                                    <View style={[styles.roleBadge, styles.ownerRoleBadge]}>
                                        <Feather name="star" size={11} color="white" />
                                    </View>
                                )}
                                {isMemberMod && !isMemberOwner && (
                                    <View style={[styles.roleBadge, styles.modRoleBadge]}>
                                        <Feather name="shield" size={11} color="white" />
                                    </View>
                                )}
                                {canRemove && (
                                    <TouchableOpacity
                                        style={styles.removeBadge}
                                        onPress={() => onRemoveMember(member._id)}
                                        disabled={isRemovingMember}
                                    >
                                        <Feather name="x" size={12} color="white" />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <Text style={styles.gridName} numberOfLines={1}>{member.firstName} {member.lastName}</Text>
                        </Wrapper>
                    );
                };

                return (
                    <>
                        {staffMembers.length > 0 && (
                            <View style={{ marginTop: 8, marginBottom: 24 }}>
                                <View style={styles.sectionHeaderWrap}>
                                    <Text style={[styles.sectionTitle, { color: '#7C3AED' }]}>Owner & Moderators — {staffMembers.length}</Text>
                                    <View style={[styles.sectionHeaderLine, { backgroundColor: '#7C3AED' }]} />
                                </View>
                                <View style={styles.grid}>
                                    {staffMembers.map(renderMemberTile)}
                                </View>
                            </View>
                        )}

                        {regularMembers.length > 0 && (
                            <View style={{ marginTop: 8, marginBottom: 24 }}>
                                <View style={styles.sectionHeaderWrap}>
                                    <Text style={styles.sectionTitle}>Members — {regularMembers.length}</Text>
                                    <View style={styles.sectionHeaderLine} />
                                </View>
                                <View style={styles.grid}>
                                    {regularMembers.map(renderMemberTile)}
                                </View>
                            </View>
                        )}
                    </>
                );
            })()}

            {/* --- LEAVE GROUP BUTTON (for non-managers) --- */}
            {!canManage && (
                <View style={styles.footerActionContainer}>
                    <TouchableOpacity onPress={handleLeaveGroup} style={styles.leaveButton} disabled={isLeaving}>
                        {isLeaving 
                            ? <ActivityIndicator color="#fff" /> 
                            : <Text style={styles.leaveButtonText}>Leave Group</Text>
                        }
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    groupHeader: { alignItems: 'center', paddingVertical: 20, marginBottom: 8 },
    groupHeaderName: { fontSize: 20, fontWeight: '900', color: '#111827', marginTop: 12, textAlign: 'center' },
    card: { backgroundColor: 'white', padding: 12, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 12 },
    collapsibleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    collapsibleHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    collapsibleBody: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    cardTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    infoRowTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
    infoText: { marginLeft: 12, fontSize: 16, fontWeight: '600', color: '#374151', flex: 1 },
    scheduleContent: { marginLeft: 12, flex: 1 },
    routineBlock: { marginBottom: 8 },
    frequencyLabel: { fontSize: 14, fontWeight: '800', color: '#4A90E2', marginBottom: 4, textTransform: 'capitalize' },
    scheduleDetailText: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 2 },
    iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    iconWrapSmall: { width: 26, height: 26, borderRadius: 9 },
    iconWrapBlue: { backgroundColor: '#EEF6FF', borderColor: '#BFDBFE' },
    iconWrapGreen: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
    iconWrapPurple: { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' },
    iconWrapAmber: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
    inviteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1, backgroundColor: '#F0FDFA', borderColor: '#99F6E4', marginBottom: 12 },
    inviteButtonText: { marginLeft: 8, fontWeight: 'bold', fontSize: 14, color: '#0D9488' },
    sectionHeaderWrap: { marginBottom: 16 },
    sectionTitle: { fontSize: 15, fontWeight: '900', color: '#4A90E2', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    sectionHeaderLine: { height: 3, borderRadius: 2, backgroundColor: '#4A90E2', opacity: 0.85 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    gridItem: { width: '30%', alignItems: 'center' },
    gridAvatarWrap: { width: '100%', position: 'relative' },
    gridAvatar: { width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: '#F3F4F6' },
    gridAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    gridName: { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: 6, textAlign: 'center' },
    roleBadge: { position: 'absolute', top: -6, left: -6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' },
    ownerRoleBadge: { backgroundColor: '#4F46E5' },
    modRoleBadge: { backgroundColor: '#6B7280' },
    removeBadge: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' },
    footerActionContainer: { paddingHorizontal: 20, paddingVertical: 24, borderTopWidth: 1, borderTopColor: '#F3F4F6', marginTop: 16 },
    leaveButton: { backgroundColor: '#EF4444', paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    leaveButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});