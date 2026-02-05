import React, { useState } from 'react';
import { 
    View, 
    Text, 
    Image, 
    TouchableOpacity, 
    StyleSheet,
    Share,
    Alert
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GroupDetails, User } from '@/utils/api';
import AddMeetingWizard from './AddMeetingWizard';

interface GroupDetailsViewProps {
    groupDetails: GroupDetails; 
    currentUser: User;
    isRemovingMember: boolean;
    onRemoveMember: (memberIdToRemove: string) => void;
    searchQuery: string;
    onSearchChange: (text: string) => void;
    searchResults: User[] | undefined;
    onInvite: (id: string) => void;
}

const daysOfWeekFull = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
    onInvite
}: GroupDetailsViewProps) => {
    
    // --- Wizard Visibility State ---
    const [wizardVisible, setWizardVisible] = useState(false);
    

    // --- Permissions ---
    const isOwner = currentUser._id === groupDetails.owner;
    const isMod = groupDetails.moderators?.some((m: User | string) => 
        typeof m === 'string' ? m === currentUser._id : m._id === currentUser._id
    ) ?? false;
    const canManage = isOwner || isMod;

    /**
     * Share Link Logic
     * Triggers the native share sheet with the group invitation link.
     */
    const handleShareLink = async () => {
        try {
            await Share.share({
                message: `Join my group "${groupDetails.name}" on the app! Use this link to join: https://yourapp.com/groups/${groupDetails._id}`,
                url: `https://yourapp.com/groups/${groupDetails._id}`,
                title: `Invite to ${groupDetails.name}`
            });
        } catch (error: any) {
            Alert.alert("Error", "Could not share invite link.");
        }
    };

    /**
     * Helper to render meeting lines.
     */
    const renderScheduleLines = (frequency: string, dayTimes: any[]) => {
        const timeEntries = dayTimes && dayTimes.length > 0 ? dayTimes : [{ time: "Time TBD" }];

        if (frequency === 'daily') {
            return daysOfWeekFull.map((dayName, dayIdx) => {
                let matches = timeEntries.filter(dt => dt.day === dayIdx);
                if (matches.length === 0) {
                    matches = timeEntries.filter(dt => dt.day === undefined || dt.day === null);
                }

                return matches.map((mt, mtIdx) => (
                    <Text key={`daily-${dayIdx}-${mtIdx}`} style={styles.scheduleDetailText}>
                        • {dayName} @ {mt.time}
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
                dayLabel = "Meeting";
            }

            return (
                <Text key={dtIdx} style={styles.scheduleDetailText}>
                    • {dayLabel} @ {dt.time}
                </Text>
            );
        });
    };

    return (
        <View style={styles.container}>
            {/* 1. Core Details Card */}
            <View style={styles.card}>
                <View style={styles.cardHeader}><Text style={styles.cardTitle}>Details & Capacity</Text></View>
                
                {/* Detailed Schedule Section */}
                <View style={styles.infoRowTop}>
                    <Feather name="calendar" size={18} color="#4F46E5" style={{ marginTop: 2 }} />
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
                            <Text style={styles.infoText}>No schedule defined</Text>
                        )}
                    </View>
                </View>

                {/* Location Info */}
                <View style={styles.infoRow}>
                    <Feather name="map-pin" size={18} color="#4F46E5" />
                    <Text style={styles.infoText} numberOfLines={1}>
                        {groupDetails.defaultLocation || "No default location set"}
                    </Text>
                </View>

                {/* Capacity Limit */}
                <View style={styles.infoRow}>
                    <Feather name="users" size={18} color="#4F46E5" />
                    <Text style={styles.infoText}>Limit: {groupDetails.defaultCapacity === 0 ? "Unlimited" : groupDetails.defaultCapacity}</Text>
                </View>

                {/* JIT Schedule Info */}
                <View style={styles.infoRow}>
                    <Feather name="bell" size={18} color="#4F46E5" />
                    <Text style={styles.infoText}>
                        JIT: {groupDetails.generationLeadDays} day lead @ {groupDetails.generationLeadTime}
                    </Text>
                </View>

                {/* Timezone Info - Restored visibility */}
                <View style={styles.infoRow}>
                    <Feather name="globe" size={18} color="#4F46E5" />
                    <Text style={styles.infoText}>
                        Timezone: {groupDetails.timezone || "Not set"}
                    </Text>
                </View>
            </View>

            {/* 2. Quick Actions */}
            {canManage && (
                <View style={styles.managerActionsRow}>
                    <TouchableOpacity onPress={() => setWizardVisible(true)} style={styles.actionPill}>
                        <Feather name="plus" size={16} color="#4F46E5" />
                        <Text style={styles.actionPillText}>Add Meeting</Text>
                    </TouchableOpacity>

                    {/* Invite Link Action */}
                    <TouchableOpacity onPress={handleShareLink} style={styles.actionPill}>
                        <Feather name="share-2" size={16} color="#4F46E5" />
                        <Text style={styles.actionPillText}>Invite Link</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* 3. Member List */}
            <View style={{ marginBottom: 24 }}>
                <Text style={styles.sectionTitle}>Members ({groupDetails.members.length})</Text>
                {groupDetails.members.map(member => {
                    const isMemberOwner = member._id === groupDetails.owner;
                    const isMemberMod = groupDetails.moderators?.some((m: User | string) => 
                        typeof m === 'string' ? m === member._id : m._id === member._id
                    ) ?? false;

                    return (
                        <View key={member._id} style={styles.memberCard}>
                            <Image 
                                source={{ uri: member.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${member.username?.[0]}` }} 
                                style={styles.avatar} 
                            />
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={styles.memberName}>{member.firstName} {member.lastName}</Text>
                                    {isMemberOwner && <View style={styles.ownerBadge}><Text style={styles.badgeText}>Owner</Text></View>}
                                    {isMemberMod && !isMemberOwner && <View style={styles.modBadge}><Text style={styles.badgeText}>Mod</Text></View>}
                                </View>
                                <Text style={styles.memberHandle}>@{member.username}</Text>
                            </View>
                            {canManage && member._id !== groupDetails.owner && (
                                <TouchableOpacity onPress={() => onRemoveMember(member._id)} disabled={isRemovingMember}>
                                    <Feather name="x-circle" size={20} color="#EF4444" />
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                })}
            </View>

            {/* --- Add Meeting Wizard Modal --- */}
            <AddMeetingWizard 
                visible={wizardVisible} 
                onClose={() => setWizardVisible(false)} 
                groupDetails={groupDetails} 
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    card: { backgroundColor: 'white', padding: 20, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 16 },
    cardHeader: { marginBottom: 16 },
    cardTitle: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    infoRowTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
    infoText: { marginLeft: 12, fontSize: 16, fontWeight: '600', color: '#374151', flex: 1 },
    scheduleContent: { marginLeft: 12, flex: 1 },
    routineBlock: { marginBottom: 8 },
    frequencyLabel: { fontSize: 14, fontWeight: '800', color: '#4F46E5', marginBottom: 4, textTransform: 'capitalize' },
    scheduleDetailText: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 2 },
    managerActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    actionPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FF', paddingVertical: 12, borderRadius: 14, borderBottomWidth: 1, borderBottomColor: '#E0E7FF' },
    actionPillText: { marginLeft: 8, color: '#4F46E5', fontWeight: 'bold', fontSize: 13 },
    sectionTitle: { fontSize: 20, fontWeight: '900', color: '#111827', marginBottom: 16 },
    memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 16, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: '#F3F4F6' },
    memberName: { fontSize: 16, fontWeight: '800', color: '#374151' },
    memberHandle: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
    ownerBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 8, borderWidth: 1, borderColor: '#C3DAFE' },
    modBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 8, borderWidth: 1, borderColor: '#E5E7EB' },
    badgeText: { fontSize: 10, fontWeight: 'bold', color: '#4F46E5', textTransform: 'uppercase' }
});