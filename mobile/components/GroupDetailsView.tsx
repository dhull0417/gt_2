import React, { useState, useEffect } from 'react';
import { 
    View, 
    Text, 
    Image, 
    TouchableOpacity, 
    TextInput, 
    ActivityIndicator, 
    Modal, 
    Alert, 
    StyleSheet, 
    ScrollView,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    Switch
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GroupDetails, User, useApiClient, userApi, groupApi } from '@/utils/api';
import { formatSchedule } from '@/utils/schedule';
import { useQueryClient } from '@tanstack/react-query';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface GroupDetailsViewProps {
    groupDetails: GroupDetails; 
    currentUser: User;
    isRemovingMember: boolean;
    onRemoveMember: (memberIdToRemove: string) => void;
    searchQuery: string;
    onSearchChange: (text: string) => void;
    searchResults: User[] | undefined;
    onInvite: (id: string) => void;
    isInviting: boolean;
    onDeleteGroup: () => void;
    isDeletingGroup: boolean;
    onLeaveGroup: () => void;
    isLeavingGroup: boolean;
    onEditSchedule?: () => void;
    onAddOneOffEvent?: () => void;
}

export const GroupDetailsView = ({
    groupDetails,
    currentUser,
    isRemovingMember,
    onRemoveMember,
    searchQuery,
    onSearchChange,
    searchResults,
    onInvite,
    isInviting,
    onDeleteGroup,
    isDeletingGroup,
    onLeaveGroup,
    isLeavingGroup,
    onEditSchedule,
    onAddOneOffEvent
}: GroupDetailsViewProps) => {
    const insets = useSafeAreaInsets();
    const isOwner = currentUser._id === groupDetails.owner;
    
    // Check if current user is a moderator
    const isMod = groupDetails.moderators?.some((m: User | string) => 
        typeof m === 'string' ? m === currentUser._id : m._id === currentUser._id
    ) ?? false;

    const canManage = isOwner || isMod;

    const api = useApiClient();
    const queryClient = useQueryClient();

    // --- Mute Feature State ---
    const [isMuted, setIsMuted] = useState(currentUser.mutedGroups?.includes(groupDetails._id) || false);
    const [isTogglingMute, setIsTogglingMute] = useState(false);

    // --- Quick Settings State (Location & Capacity) ---
    const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);
    const [tempLocation, setTempLocation] = useState('');
    const [tempCapacity, setTempCapacity] = useState<number>(0);
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    // --- Moderator Management State ---
    const [isModModalVisible, setIsModModalVisible] = useState(false);
    const [selectedModIds, setSelectedModIds] = useState<string[]>([]);
    const [isSavingMods, setIsSavingMods] = useState(false);

    // Sync modal state when opening settings
    useEffect(() => {
        if (isSettingsModalVisible) {
            setTempLocation(groupDetails.defaultLocation || '');
            setTempCapacity(groupDetails.defaultCapacity || 0);
        }
    }, [isSettingsModalVisible, groupDetails]);

    // Sync internal modal state with group data when opening moderator list
    useEffect(() => {
        if (isModModalVisible) {
            const currentModIds = (groupDetails.moderators || []).map((m: User | string) => 
                typeof m === 'string' ? m : m._id
            );
            setSelectedModIds(currentModIds);
        }
    }, [isModModalVisible, groupDetails.moderators]);

    const handleToggleMute = async () => {
        setIsTogglingMute(true);
        try {
            const result = await userApi.toggleGroupMute(api, groupDetails._id);
            setIsMuted(result.muted);
            // Invalidate user query to keep the mutedGroups list globally in sync
            queryClient.invalidateQueries({ queryKey: ['currentUser'] });
        } catch (error: any) {
            Alert.alert("Error", "Failed to update notification settings.");
        } finally {
            setIsTogglingMute(false);
        }
    };

    const handleSaveSettings = async () => {
        setIsSavingSettings(true);
        try {
            // Bulk update using the group's generic update endpoint
            await api.put(`/api/groups/${groupDetails._id}`, { 
                defaultLocation: tempLocation,
                defaultCapacity: tempCapacity 
            });
            
            queryClient.invalidateQueries({ queryKey: ['groupDetails', groupDetails._id] });
            setIsSettingsModalVisible(false);
            Alert.alert("Success", "Group details updated.");
        } catch (error: any) {
            Alert.alert("Error", error.response?.data?.error || "Failed to update details.");
        } finally {
            setIsSavingSettings(false);
        }
    };

    const handleToggleModSelection = (userId: string) => {
        setSelectedModIds(prev => 
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const handleSaveModerators = async () => {
        setIsSavingMods(true);
        try {
            await groupApi.updateModerators(api, { 
                groupId: groupDetails._id, 
                moderatorIds: selectedModIds 
            });
            
            queryClient.invalidateQueries({ queryKey: ['groupDetails', groupDetails._id] });
            setIsModModalVisible(false);
            Alert.alert("Success", "Moderator list updated.");
        } catch (error: any) {
            Alert.alert("Error", error.response?.data?.error || "Failed to update moderators.");
        } finally {
            setIsSavingMods(false);
        }
    };

    return (
        <View style={{ paddingBottom: 100, paddingTop: insets.top }}>
            {/* Schedule & Capacity Card */}
            {groupDetails.schedule && (
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>Details & Capacity</Text>
                        {canManage && (
                            <View style={{ flexDirection: 'row' }}>
                                <TouchableOpacity 
                                    onPress={() => setIsSettingsModalVisible(true)} 
                                    style={styles.badgeBtnBlue}
                                >
                                    <Feather name="edit-2" size={12} color="#4F46E5" />
                                    <Text style={styles.badgeBtnTextBlue}>Edit</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                    
                    <View style={styles.infoRow}>
                        <Feather name="calendar" size={18} color="#4F46E5" />
                        <Text style={styles.infoText}>{formatSchedule(groupDetails.schedule)}</Text>
                    </View>

                    {/* Displaying Location */}
                    <View style={styles.infoRow}>
                        <Feather name="map-pin" size={18} color="#4F46E5" />
                        <Text style={styles.infoText} numberOfLines={1}>
                            {groupDetails.defaultLocation || "No default location set"}
                        </Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Feather name="users" size={18} color="#4F46E5" />
                        <Text style={styles.infoText}>Limit: {groupDetails.defaultCapacity === 0 ? "Unlimited" : groupDetails.defaultCapacity}</Text>
                    </View>

                    {/* Mute Feature Toggle UI */}
                    <View style={[styles.infoRow, styles.muteRow]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                            <Feather name={isMuted ? "bell-off" : "bell"} size={18} color={isMuted ? "#9CA3AF" : "#4F46E5"} />
                            <Text style={[styles.infoText, isMuted && { color: '#9CA3AF' }]}>Mute Chat Notifications</Text>
                        </View>
                        <Switch
                            trackColor={{ false: "#E5E7EB", true: "#C7D2FE" }}
                            thumbColor={isMuted ? "#9CA3AF" : "#4F46E5"}
                            onValueChange={handleToggleMute}
                            value={isMuted}
                            disabled={isTogglingMute}
                        />
                    </View>
                </View>
            )}

            {/* Actions for Managers */}
            {canManage && (
                <View style={styles.managerActionsRow}>
                    <TouchableOpacity onPress={onAddOneOffEvent} style={styles.actionPill}>
                        <Feather name="plus" size={16} color="#4F46E5" />
                        <Text style={styles.actionPillText}>Add Meeting</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onEditSchedule} style={styles.actionPill}>
                        <Feather name="clock" size={16} color="#4F46E5" />
                        <Text style={styles.actionPillText}>Edit Schedule</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Moderator Management Trigger (Owner Only) */}
            {isOwner && (
                <TouchableOpacity 
                    onPress={() => setIsModModalVisible(true)}
                    style={styles.manageModsBtn}
                    activeOpacity={0.7}
                >
                    <View style={styles.manageModsIcon}>
                        <Feather name="shield" size={18} color="white" />
                    </View>
                    <Text style={styles.manageModsText}>Manage Moderators</Text>
                    <Feather name="chevron-right" size={20} color="#4F46E5" />
                </TouchableOpacity>
            )}

            {/* Members Section */}
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

            {/* Invite Section */}
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

            {/* Quick Settings Modal (Location & Capacity) */}
            <Modal visible={isSettingsModalVisible} animationType="slide" transparent>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContainerCompact}>
                            <View style={styles.modalHeader}>
                                <TouchableOpacity onPress={() => setIsSettingsModalVisible(false)}>
                                    <Feather name="x" size={24} color="#9CA3AF" />
                                </TouchableOpacity>
                                <Text style={styles.modalTitle}>Edit Group Details</Text>
                                <TouchableOpacity onPress={handleSaveSettings} disabled={isSavingSettings}>
                                    {isSavingSettings ? <ActivityIndicator size="small" color="#4F46E5" /> : <Text style={styles.saveBtnText}>Save</Text>}
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={{ paddingVertical: 10 }}>
                                <Text style={styles.label}>Default Location</Text>
                                <View style={styles.inputBox}>
                                    <Feather name="map-pin" size={18} color="#4F46E5" />
                                    <TextInput 
                                        style={styles.input}
                                        value={tempLocation}
                                        onChangeText={setTempLocation}
                                        placeholder="e.g. Starbucks, Zoom Link"
                                    />
                                </View>

                                <Text style={[styles.label, {marginTop: 20}]}>Default Attendee Limit</Text>
                                <View style={styles.capacityRow}>
                                    <TouchableOpacity onPress={() => setTempCapacity(prev => Math.max(0, prev - 1))} style={styles.capBtnSmall}>
                                        <Feather name="minus" size={20} color="#4F46E5" />
                                    </TouchableOpacity>
                                    <Text style={styles.capValSmall}>{tempCapacity === 0 ? "Unlimited" : tempCapacity}</Text>
                                    <TouchableOpacity onPress={() => setTempCapacity(prev => prev + 1)} style={styles.capBtnSmall}>
                                        <Feather name="plus" size={20} color="#4F46E5" />
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.hint}>This limit is applied to all future recurring events.</Text>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Moderator Selection Modal */}
            <Modal 
                visible={isModModalVisible} 
                animationType="slide" 
                transparent={true}
                onRequestClose={() => setIsModModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={() => setIsModModalVisible(false)} style={styles.headerIconButton}>
                                <Feather name="x" size={24} color="#9CA3AF" />
                            </TouchableOpacity>
                            <Text style={styles.modalTitle}>Assign Moderators</Text>
                            <TouchableOpacity onPress={handleSaveModerators} disabled={isSavingMods} style={styles.headerIconButton}>
                                {isSavingMods ? (
                                    <ActivityIndicator size="small" color="#4F46E5" />
                                ) : (
                                    <Text style={styles.saveBtnText}>Save</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                        
                        <Text style={styles.modalSubtitle}>Selected members will be able to manage schedules, meetings, and standard members.</Text>

                        <ScrollView style={styles.memberList} showsVerticalScrollIndicator={false}>
                            {groupDetails.members.filter(m => m._id !== groupDetails.owner).map(member => {
                                const isSelected = selectedModIds.includes(member._id);
                                return (
                                    <TouchableOpacity 
                                        key={member._id} 
                                        style={[styles.selectMemberRow, isSelected && styles.selectMemberRowActive]}
                                        onPress={() => handleToggleModSelection(member._id)}
                                        activeOpacity={0.8}
                                    >
                                        <Image 
                                            source={{ uri: member.profilePicture || `https://placehold.co/100x100/EEE/31343C?text=${member.username?.[0]}` }} 
                                            style={styles.avatarSmall} 
                                        />
                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            <Text style={[styles.selectMemberName, isSelected && styles.textWhite]}>{member.firstName} {member.lastName}</Text>
                                            <Text style={[styles.selectMemberHandle, isSelected && styles.textWhite70]}>@{member.username}</Text>
                                        </View>
                                        <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                                            {isSelected && <Feather name="check" size={14} color="white" />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Admin Actions Footer */}
            <View style={{ borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 24 }}>
                {isOwner ? (
                    <TouchableOpacity onPress={onDeleteGroup} style={[styles.actionBtn, styles.deleteBtn]}>
                        <Feather name="trash-2" size={20} color="#EF4444" />
                        <Text style={styles.deleteBtnText}>Delete Group</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity onPress={onLeaveGroup} style={[styles.actionBtn, styles.deleteBtn]}>
                        <Feather name="log-out" size={20} color="#EF4444" />
                        <Text style={styles.deleteBtnText}>Leave Group</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: { backgroundColor: 'white', padding: 20, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 16 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    cardTitle: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    infoText: { marginLeft: 12, fontSize: 16, fontWeight: '600', color: '#374151', flex: 1 },
    muteRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    badgeBtnBlue: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    badgeBtnTextBlue: { color: '#4F46E5', fontSize: 10, fontWeight: 'bold', marginLeft: 4 },
    managerActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    actionPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FF', paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E0E7FF' },
    actionPillText: { marginLeft: 8, color: '#4F46E5', fontWeight: 'bold', fontSize: 13 },
    manageModsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 20, marginBottom: 32, borderWidth: 1, borderColor: '#EEF2FF', elevation: 2 },
    manageModsIcon: { backgroundColor: '#4F46E5', width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    manageModsText: { flex: 1, marginLeft: 12, fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
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
    searchResult: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FF', padding: 16, borderRadius: 16, marginBottom: 12 },
    deleteBtn: { backgroundColor: '#FEF2F2' },
    deleteBtnText: { marginLeft: 10, color: '#EF4444', fontWeight: 'bold', fontSize: 16 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContainer: { backgroundColor: 'white', borderTopLeftRadius: 32, borderTopRightRadius: 32, height: SCREEN_HEIGHT * 0.8, padding: 24, paddingBottom: 40 },
    modalContainerCompact: { backgroundColor: 'white', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 60 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    headerIconButton: { padding: 4 },
    modalTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
    modalSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 24, lineHeight: 18, textAlign: 'center' },
    label: { fontSize: 14, fontWeight: 'bold', color: '#9CA3AF', marginBottom: 8, textTransform: 'uppercase' },
    inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#E5E7EB' },
    input: { flex: 1, marginLeft: 12, fontSize: 16, color: '#374151' },
    capacityRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    capBtnSmall: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
    capValSmall: { fontSize: 20, fontWeight: '800', color: '#111827', width: 100, textAlign: 'center' },
    hint: { fontSize: 12, color: '#9CA3AF', marginTop: 8, fontStyle: 'italic' },
    saveBtnText: { color: '#4F46E5', fontWeight: '900', fontSize: 16 },
    memberList: { flex: 1 },
    selectMemberRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 18, marginBottom: 10, backgroundColor: '#F9FAFB' },
    selectMemberRowActive: { backgroundColor: '#4F46E5' },
    avatarSmall: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E5E7EB' },
    selectMemberName: { fontSize: 16, fontWeight: 'bold', color: '#374151' },
    selectMemberHandle: { fontSize: 12, color: '#9CA3AF' },
    textWhite: { color: 'white' },
    textWhite70: { color: 'rgba(255,255,255,0.7)' },
    checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
    checkboxActive: { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: 'white' },
});