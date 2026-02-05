import React from 'react';
import { 
    View, 
    Text, 
    Image, 
    TouchableOpacity, 
    TextInput, 
    StyleSheet, 
    ScrollView,
    Dimensions
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GroupDetails, User } from '@/utils/api';

interface GroupDetailsViewProps {
    groupDetails: GroupDetails; 
    currentUser: User;
    isRemovingMember: boolean;
    onRemoveMember: (memberIdToRemove: string) => void;
    searchQuery: string;
    onSearchChange: (text: string) => void;
    searchResults: User[] | undefined;
    onInvite: (id: string) => void;
    onAddOneOffEvent?: () => void;
}

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * GroupDetailsView
 * Displays specific schedule routines, member lists, and invitation tools.
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
    onAddOneOffEvent
}: GroupDetailsViewProps) => {
    const isOwner = currentUser._id === groupDetails.owner;
    
    const isMod = groupDetails.moderators?.some((m: User | string) => 
        typeof m === 'string' ? m === currentUser._id : m._id === currentUser._id
    ) ?? false;

    const canManage = isOwner || isMod;

    /**
     * Helper to render meeting lines.
     * Expands 'daily' to show every day of the week vertically.
     */
    const renderScheduleLines = (frequency: string, dayTimes: any[], rules?: any[]) => {
        const timeEntries = dayTimes && dayTimes.length > 0 ? dayTimes : [{ time: "Time TBD" }];

        if (frequency === 'daily') {
            return timeEntries.map((dt, dtIdx) => (
                <View key={`daily-group-${dtIdx}`}>
                    {daysOfWeek.map((day, dayIdx) => (
                        <Text key={`daily-${dtIdx}-${dayIdx}`} style={styles.scheduleDetailText}>
                            • {day} @ {dt.time}
                        </Text>
                    ))}
                </View>
            ));
        }

        return timeEntries.map((dt, dtIdx) => {
            let dayLabel = "";
            if (frequency === 'ordinal' && rules?.[0]) {
                const ruleDay = rules[0].day;
                const dayName = typeof ruleDay === 'number' ? daysOfWeek[ruleDay] : "";
                dayLabel = `${rules[0].occurrence} ${dayName}`;
            } else if (typeof dt.date === 'number') {
                const d = dt.date;
                const sfx = d === 1 || d === 21 || d === 31 ? 'st' : 
                            d === 2 || d === 22 ? 'nd' : 
                            d === 3 || d === 23 ? 'rd' : 'th';
                dayLabel = `The ${d}${sfx}`;
            } else if (typeof dt.day === 'number') {
                dayLabel = daysOfWeek[dt.day];
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
                <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>Details & Capacity</Text>
                </View>
                
                {/* Detailed Schedule Section */}
                <View style={styles.infoRowTop}>
                    <Feather name="calendar" size={18} color="#4F46E5" style={{ marginTop: 2 }} />
                    <View style={styles.scheduleContent}>
                        {groupDetails.schedule?.routines && groupDetails.schedule.routines.length > 0 ? (
                            // 1. Logic for "Multiple Rules" or standard creation routines
                            groupDetails.schedule.routines.map((routine, rIdx) => (
                                <View key={rIdx} style={styles.routineBlock}>
                                    <Text style={styles.frequencyLabel}>
                                        {routine.frequency === 'biweekly' ? 'Every 2 Weeks' : routine.frequency.charAt(0).toUpperCase() + routine.frequency.slice(1)}
                                    </Text>
                                    {renderScheduleLines(routine.frequency, routine.dayTimes, routine.rules)}
                                </View>
                            ))
                        ) : groupDetails.schedule?.frequency ? (
                            // 2. Fallback for simple/legacy schedules (frequency set but routines missing)
                            <View style={styles.routineBlock}>
                                <Text style={styles.frequencyLabel}>
                                    {groupDetails.schedule.frequency === 'biweekly' ? 'Every 2 Weeks' : groupDetails.schedule.frequency.charAt(0).toUpperCase() + groupDetails.schedule.frequency.slice(1)}
                                </Text>
                                {renderScheduleLines(
                                    groupDetails.schedule.frequency, 
                                    (groupDetails.schedule as any).dayTimes || [], 
                                    (groupDetails.schedule as any).rules
                                )}
                            </View>
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

                {/* JIT Notification Settings */}
                <View style={styles.infoRow}>
                    <Feather name="bell" size={18} color="#4F46E5" />
                    <Text style={styles.infoText}>
                        Notifies {groupDetails.generationLeadDays} day{groupDetails.generationLeadDays !== 1 ? 's' : ''} before at {groupDetails.generationLeadTime}
                    </Text>
                </View>
            </View>

            {/* 2. Management Quick Actions */}
            {canManage && (
                <View style={styles.managerActionsRow}>
                    <TouchableOpacity onPress={onAddOneOffEvent} style={styles.actionPill}>
                        <Feather name="plus" size={16} color="#4F46E5" />
                        <Text style={styles.actionPillText}>Add Meeting</Text>
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
                    );
                    return (
                        <View key={member._id} style={styles.memberCard}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                <Image 
                                    source={{ uri: member.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${member.username?.[0]}` }} 
                                    style={styles.avatar} 
                                />
                                <View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Text style={styles.memberName}>{member.firstName} {member.lastName}</Text>
                                        {isMemberOwner && <View style={styles.ownerBadge}><Text style={styles.badgeText}>Owner</Text></View>}
                                        {isMemberMod && !isMemberOwner && <View style={styles.modBadge}><Text style={styles.modBadgeText}>Mod</Text></View>}
                                    </View>
                                    <Text style={styles.memberHandle}>@{member.username}</Text>
                                </View>
                            </View>
                            {(isOwner && !isMemberOwner) || (isMod && !isMemberOwner && !isMemberMod) ? (
                                <TouchableOpacity onPress={() => onRemoveMember(member._id)} disabled={isRemovingMember}>
                                    <Feather name="x-circle" size={20} color="#EF4444" />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    );
                })}
            </View>

            {/* 4. Invite Section */}
            {canManage && (
                <View style={{ marginBottom: 32 }}>
                    <Text style={styles.sectionTitle}>Invite Members</Text>
                    <View style={styles.searchBox}>
                        <Feather name="search" size={18} color="#9CA3AF" />
                        <TextInput 
                            style={styles.searchInput} 
                            placeholder="Search by username..." 
                            value={searchQuery} 
                            onChangeText={onSearchChange} 
                            autoCapitalize="none" 
                        />
                    </View>
                    {searchQuery.length > 0 && searchResults?.map(user => (
                         <TouchableOpacity key={user._id} style={styles.searchResult} onPress={() => onInvite(user._id)}>
                             <Text style={{ fontWeight: '600' }}>@{user.username}</Text>
                             <Text style={{ color: '#4F46E5', fontWeight: 'bold' }}>Invite</Text>
                         </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    card: { backgroundColor: 'white', padding: 20, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 16 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
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
    avatar: { width: 44, height: 44, borderRadius: 14, marginRight: 12, backgroundColor: '#F3F4F6' },
    memberName: { fontSize: 16, fontWeight: '800', color: '#374151' },
    memberHandle: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
    ownerBadge: { backgroundColor: '#F5F3FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 6 },
    badgeText: { fontSize: 8, fontWeight: 'bold', color: '#7C3AED', textTransform: 'uppercase' },
    modBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 6 },
    modBadgeText: { fontSize: 8, fontWeight: 'bold', color: '#2563EB', textTransform: 'uppercase' },
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 12, height: 50 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 15 },
    searchResult: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }
});