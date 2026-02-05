import React, { useEffect, useState, useMemo } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  FlatList
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, useApiClient, userApi, groupApi } from '@/utils/api';
import { useDeleteGroup } from '@/hooks/useDeleteGroup';
import { useLeaveGroup } from '@/hooks/useLeaveGroup';

/**
 * Group Settings Screen
 * Access is strictly restricted to the group owner and designated moderators.
 * Features central management for group identity, schedule, JIT, and location.
 */
const GroupSettings = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApiClient();
  const queryClient = useQueryClient();

  const { data: group, isLoading: isLoadingGroup } = useGetGroupDetails(id);
  const { data: currentUser, isLoading: isLoadingUser } = useQuery<User, Error>({ 
    queryKey: ['currentUser'], 
    queryFn: () => userApi.getCurrentUser(api),
  });

  // --- Termination Hooks ---
  const { mutate: deleteGroup } = useDeleteGroup();
  const { mutate: leaveGroup } = useLeaveGroup();

  // --- State for Edit Modals ---
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const [isEditingCapacity, setIsEditingCapacity] = useState(false);
  const [tempCapacity, setTempCapacity] = useState("");
  const [isSavingCapacity, setIsSavingCapacity] = useState(false);

  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [tempLocation, setTempLocation] = useState("");
  const [isSavingLocation, setIsSavingLocation] = useState(false);

  // --- State for Moderator Management ---
  const [isEditingMods, setIsEditingMods] = useState(false);
  const [selectedModIds, setSelectedModIds] = useState<string[]>([]);
  const [isSavingMods, setIsSavingMods] = useState(false);

  // --- State for Member Management ---
  const [isEditingMembers, setIsEditingMembers] = useState(false);
  const [isRemovingMemberId, setIsRemovingMemberId] = useState<string | null>(null);

  // --- Robust Permission Logic ---
  const isUserOwner = useMemo(() => {
    if (!currentUser || !group) return false;
    const ownerId = (group.owner as any)?._id || group.owner;
    return currentUser._id.toString() === ownerId.toString();
  }, [currentUser, group]);

  const isUserMod = useMemo(() => {
    if (!currentUser || !group) return false;
    const userId = currentUser._id.toString();
    return group.moderators?.some((m: any) => (m?._id || m).toString() === userId);
  }, [currentUser, group]);

  const canAccessSettings = useMemo(() => {
    return isUserOwner || isUserMod;
  }, [isUserOwner, isUserMod]);

  // --- ACCESS CONTROL GUARD ---
  useEffect(() => {
    if (!isLoadingGroup && !isLoadingUser && group && currentUser) {
      if (!canAccessSettings) {
        Alert.alert(
          "Permission Denied", 
          "Only owners and moderators can access group settings."
        );
        router.back();
      }
    }
  }, [group, currentUser, isLoadingGroup, isLoadingUser, canAccessSettings]);

  const settingsOptions = [
    { id: 'name', label: 'Edit Name', icon: 'type', color: '#3B82F6', bg: '#EFF6FF' },
    { id: 'schedule', label: 'Edit Schedule & Times', icon: 'calendar', color: '#6366F1', bg: '#EEF2FF' },
    { id: 'jit', label: 'Edit JIT', icon: 'bell', color: '#F59E0B', bg: '#FFFBEB' },
    { id: 'capacity', label: 'Edit Attendee Limit', icon: 'users', color: '#A855F7', bg: '#F5F3FF' },
    { id: 'location', label: 'Edit Location', icon: 'map-pin', color: '#10B981', bg: '#ECFDF5' },
    { id: 'mods', label: 'Edit Moderators', icon: 'shield', color: '#06B6D4', bg: '#ECFEFF' },
    { id: 'members', label: 'Remove Members', icon: 'user-minus', color: '#F97316', bg: '#FFF7ED' },
    { id: 'terminate', label: isUserOwner ? 'Delete Group' : 'Leave Group', icon: isUserOwner ? 'trash-2' : 'log-out', color: '#EF4444', bg: '#FEF2F2', destructive: true },
  ];

  const handleOptionPress = (optionId: string) => {
    if (!id) return;

    switch (optionId) {
      case 'name':
        setTempName(group?.name || "");
        setIsEditingName(true);
        break;
      case 'capacity':
        setTempCapacity(group?.defaultCapacity?.toString() || "0");
        setIsEditingCapacity(true);
        break;
      case 'location':
        setTempLocation(group?.defaultLocation || "");
        setIsEditingLocation(true);
        break;
      case 'mods':
        const currentModIds = (group?.moderators || []).map((m: any) => 
            typeof m === 'string' ? m : m._id
        );
        setSelectedModIds(currentModIds);
        setIsEditingMods(true);
        break;
      case 'members':
        setIsEditingMembers(true);
        break;
      case 'schedule':
        router.push({ pathname: '/group-edit-schedule/[id]', params: { id: id } });
        break;
      case 'jit':
        router.push({ pathname: '/group-edit-jit/[id]', params: { id: id } });
        break;
      case 'terminate':
        if (isUserOwner) handleConfirmDelete();
        else handleConfirmLeave();
        break;
      default:
        console.log(`Option ${optionId} logic requested.`);
        break;
    }
  };

  const handleSaveName = async () => {
    if (!id || !tempName.trim()) return;
    if (tempName === group?.name) {
        setIsEditingName(false);
        return;
    }

    setIsSavingName(true);
    try {
        await groupApi.updateGroup(api, { groupId: id, name: tempName.trim() });
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['groupDetails', id] }),
            queryClient.invalidateQueries({ queryKey: ['groups'] }),
            queryClient.invalidateQueries({ queryKey: ['events'] })
        ]);
        setIsEditingName(false);
    } catch (error: any) {
        Alert.alert("Error", error.response?.data?.error || "Failed to update group name.");
    } finally {
        setIsSavingName(false);
    }
  };

  const handleSaveCapacity = async () => {
    if (!id) return;
    const capacityNum = parseInt(tempCapacity || "0", 10);
    if (capacityNum === group?.defaultCapacity) {
      setIsEditingCapacity(false);
      return;
    }

    setIsSavingCapacity(true);
    try {
        await groupApi.updateGroup(api, { groupId: id, defaultCapacity: isNaN(capacityNum) ? 0 : capacityNum });
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['groupDetails', id] }),
            queryClient.invalidateQueries({ queryKey: ['groups'] }),
            queryClient.invalidateQueries({ queryKey: ['events'] })
        ]);
        setIsEditingCapacity(false);
        Alert.alert("Success", "Attendee limit and associated events updated.");
    } catch (error: any) {
        Alert.alert("Error", error.response?.data?.error || "Failed to update attendee limit.");
    } finally {
        setIsSavingCapacity(false);
    }
  };

  const handleSaveLocation = async () => {
    if (!id) return;
    const trimmedLoc = tempLocation.trim();
    if (trimmedLoc === group?.defaultLocation) {
        setIsEditingLocation(false);
        return;
    }

    setIsSavingLocation(true);
    try {
        await groupApi.updateGroup(api, { groupId: id, defaultLocation: trimmedLoc });
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['groupDetails', id] }),
            queryClient.invalidateQueries({ queryKey: ['groups'] }),
            queryClient.invalidateQueries({ queryKey: ['events'] })
        ]);
        setIsEditingLocation(false);
        Alert.alert("Success", "Default location and future events updated.");
    } catch (error: any) {
        Alert.alert("Error", error.response?.data?.error || "Failed to update location.");
    } finally {
        setIsSavingLocation(false);
    }
  };

  // --- MODERATOR LOGIC ---
  const handleToggleModSelection = (userId: string) => {
    setSelectedModIds(prev => 
        prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSaveModerators = async () => {
    if (!id) return;
    setIsSavingMods(true);
    try {
        await groupApi.updateModerators(api, { 
            groupId: id, 
            moderatorIds: selectedModIds 
        });
        await queryClient.invalidateQueries({ queryKey: ['groupDetails', id] });
        setIsEditingMods(false);
        Alert.alert("Success", "Moderator list updated.");
    } catch (error: any) {
        Alert.alert("Error", error.response?.data?.error || "Failed to update moderators.");
    } finally {
        setIsSavingMods(false);
    }
  };

  // --- MEMBER REMOVAL LOGIC ---
  const handleRemoveMemberPress = (member: User) => {
    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${member.firstName} ${member.lastName} from the group?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive", 
          onPress: () => performMemberRemoval(member._id) 
        }
      ]
    );
  };

  const performMemberRemoval = async (memberId: string) => {
    if (!id) return;
    setIsRemovingMemberId(memberId);
    try {
        await groupApi.removeMember(api, { groupId: id, memberIdToRemove: memberId });
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['groupDetails', id] }),
            queryClient.invalidateQueries({ queryKey: ['groups'] }),
            queryClient.invalidateQueries({ queryKey: ['events'] })
        ]);
    } catch (error: any) {
        Alert.alert("Error", error.response?.data?.error || "Failed to remove member.");
    } finally {
        setIsRemovingMemberId(null);
    }
  };

  // --- TERMINATION LOGIC ---

  const handleConfirmDelete = () => {
    // Step 1: Standard Deletion Alert
    Alert.alert(
      "Delete Group", 
      `Are you sure you want to permanently delete "${group?.name}"?`, 
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: () => {
            // Step 2: Critical Recovery Warning
            Alert.alert(
              "Final Confirmation",
              "Your group cannot be recovered if deleted. Are you sure?",
              [
                { text: "Cancel", style: "cancel" },
                { 
                  text: "Yes, I am sure", 
                  style: "destructive", 
                  onPress: () => {
                    deleteGroup({ groupId: id! }, {
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: ['groups'] });
                        router.replace('/(tabs)/groups');
                      }
                    });
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const handleConfirmLeave = () => {
    Alert.alert("Leave Group", "Are you sure you want to leave this group?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Leave", 
        style: "destructive", 
        onPress: () => {
          leaveGroup({ groupId: id! }, {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: ['groups'] });
              router.replace('/(tabs)/groups');
            },
          });
        }
      },
    ]);
  };

  if (isLoadingGroup || isLoadingUser) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Feather name="x" size={28} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.optionsContainer}>
          {settingsOptions.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.optionButton}
              activeOpacity={0.7}
              onPress={() => handleOptionPress(option.id)}
            >
              <View style={styles.optionLeft}>
                <View style={[styles.iconContainer, { backgroundColor: option.bg }]}>
                  <Feather name={option.icon as any} size={20} color={option.color} />
                </View>
                <View>
                  <Text style={[styles.optionLabel, option.destructive && styles.destructiveLabel]}>
                    {option.label}
                  </Text>
                  {option.id === 'location' && (
                    <Text style={styles.optionSubLabel} numberOfLines={1}>
                       {group?.defaultLocation || 'No default location set'}
                    </Text>
                  )}
                  {option.id === 'capacity' && (
                    <Text style={styles.optionSubLabel}>
                      Current Limit: {group?.defaultCapacity === 0 ? 'Unlimited' : group?.defaultCapacity}
                    </Text>
                  )}
                  {option.id === 'mods' && (
                    <Text style={styles.optionSubLabel}>
                      {(group?.moderators?.length || 0)} moderators assigned
                    </Text>
                  )}
                  {option.id === 'members' && (
                    <Text style={styles.optionSubLabel}>
                      {(group?.members?.length || 0)} total members
                    </Text>
                  )}
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#D1D5DB" />
            </TouchableOpacity>
          ))}
        </View>
        
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Only group moderators and owners can view or modify these settings.
          </Text>
        </View>
      </ScrollView>

      {/* Edit Name Modal */}
      <Modal visible={isEditingName} transparent animationType="fade" onRequestClose={() => setIsEditingName(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Edit Group Name</Text>
                <TextInput style={styles.modalInput} value={tempName} onChangeText={setTempName} placeholder="Enter group name" autoFocus maxLength={50} selectTextOnFocus />
                <View style={styles.modalButtons}>
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setIsEditingName(false)}><Text style={styles.modalBtnTextCancel}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={handleSaveName} disabled={isSavingName || !tempName.trim()}>
                        {isSavingName ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalBtnTextSave}>Save</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Capacity Modal */}
      <Modal visible={isEditingCapacity} transparent animationType="fade" onRequestClose={() => setIsEditingCapacity(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Attendee Limit</Text>
                <Text style={styles.modalSubtitle}>Set to 0 for unlimited members.</Text>
                <TextInput style={styles.modalInput} value={tempCapacity} onChangeText={setTempCapacity} placeholder="e.g. 15" keyboardType="numeric" autoFocus maxLength={5} selectTextOnFocus />
                <View style={styles.modalButtons}>
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setIsEditingCapacity(false)}><Text style={styles.modalBtnTextCancel}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={handleSaveCapacity} disabled={isSavingCapacity}>
                        {isSavingCapacity ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalBtnTextSave}>Save</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Location Modal */}
      <Modal visible={isEditingLocation} transparent animationType="fade" onRequestClose={() => setIsEditingLocation(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Default Location</Text>
                <Text style={styles.modalSubtitle}>Updates location for all associated events.</Text>
                <TextInput style={styles.modalInput} value={tempLocation} onChangeText={setTempLocation} placeholder="e.g. Starbucks or Zoom link..." autoFocus selectTextOnFocus />
                <View style={styles.modalButtons}>
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setIsEditingLocation(false)}><Text style={styles.modalBtnTextCancel}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={handleSaveLocation} disabled={isSavingLocation}>
                        {isSavingLocation ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalBtnTextSave}>Save</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Moderators Modal */}
      <Modal visible={isEditingMods} transparent animationType="slide" onRequestClose={() => setIsEditingMods(false)}>
        <SafeAreaView style={styles.fullModalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setIsEditingMods(false)} style={styles.headerIconButton}>
              <Feather name="x" size={24} color="#374151" />
            </TouchableOpacity>
            <Text style={styles.modalTitleLarge}>Manage Moderators</Text>
            <TouchableOpacity onPress={handleSaveModerators} disabled={isSavingMods} style={styles.headerIconButton}>
                {isSavingMods ? <ActivityIndicator size="small" color="#4F46E5" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={group?.members}
            keyExtractor={(item) => item._id}
            contentContainerStyle={{ padding: 20 }}
            ListHeaderComponent={() => (
              <Text style={styles.modalSubtitleLeft}>
                Only the group owner can assign moderators. Moderators can edit group settings, schedules, and manage events.
              </Text>
            )}
            renderItem={({ item }) => {
              const mId = item._id.toString();
              const groupOwnerId = ((group?.owner as any)?._id || group?.owner || "").toString();
              const isOwner = mId === groupOwnerId;
              const isSelected = selectedModIds.includes(mId);
              
              return (
                <TouchableOpacity 
                  style={[styles.selectMemberRow, isSelected && !isOwner && styles.selectMemberRowActive]} 
                  onPress={() => !isOwner && setSelectedModIds(p => p.includes(mId) ? p.filter(id => id !== mId) : [...p, mId])}
                  disabled={isOwner || !isUserOwner}
                  activeOpacity={0.8}
                >
                  <View style={styles.memberInfo}>
                    <Image source={{ uri: item.profilePicture || 'https://placehold.co/100x100/EEE/31343C?text=?' }} style={styles.memberAvatar} />
                    <View>
                      <Text style={[styles.memberName, isSelected && !isOwner && styles.textWhite]}>{item.firstName} {item.lastName}</Text>
                      <Text style={[styles.memberRole, isSelected && !isOwner && styles.textWhite70]}>{isOwner ? 'Owner' : isSelected ? 'Moderator' : 'Member'}</Text>
                    </View>
                  </View>
                  
                  {isOwner ? (
                    <View style={styles.ownerBadgeShield}>
                      <Feather name="shield" size={16} color="#4F46E5" />
                    </View>
                  ) : (
                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                      {isSelected && <Feather name="check" size={14} color="white" />}
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* Remove Members Modal */}
      <Modal visible={isEditingMembers} transparent animationType="slide" onRequestClose={() => setIsEditingMembers(false)}>
        <SafeAreaView style={styles.fullModalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setIsEditingMembers(false)} style={styles.headerIconButton}>
              <Feather name="chevron-down" size={28} color="#374151" />
            </TouchableOpacity>
            <Text style={styles.modalTitleLarge}>Remove Members</Text>
            <View style={{ width: 44 }} />
          </View>
          <FlatList
            data={group?.members}
            keyExtractor={(item) => item._id}
            contentContainerStyle={{ padding: 20 }}
            renderItem={({ item }) => {
              const mId = item._id.toString();
              const isMbrOwner = mId === ((group?.owner as any)?._id || group?.owner || "").toString();
              const isMbrMod = group?.moderators?.some((m: any) => (m?._id || m).toString() === mId);
              const canRemove = (isUserOwner && !isMbrOwner) || (isUserMod && !isMbrOwner && !isMbrMod);

              return (
                <View style={styles.selectMemberRow}>
                  <View style={styles.memberInfo}>
                    <Image source={{ uri: item.profilePicture || 'https://placehold.co/100x100/EEE/31343C?text=?' }} style={styles.memberAvatar} />
                    <View>
                      <Text style={styles.memberName}>{item.firstName} {item.lastName}</Text>
                      <Text style={styles.memberRole}>{isMbrOwner ? 'Owner' : isMbrMod ? 'Moderator' : 'Member'}</Text>
                    </View>
                  </View>
                  
                  {canRemove ? (
                    <TouchableOpacity onPress={() => Alert.alert("Remove Member", `Remove ${item.firstName} from the group?`, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => performMemberRemoval(mId) }])} disabled={isRemovingMemberId === mId}>
                        {isRemovingMemberId === mId ? <ActivityIndicator size="small" color="#EF4444" /> : <Feather name="x-circle" size={24} color="#EF4444" />}
                    </TouchableOpacity>
                  ) : isMbrOwner ? <View style={styles.ownerBadgeShield}><Feather name="shield" size={16} color="#4F46E5" /></View> : null}
                </View>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  closeButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  scroll: { flex: 1 },
  optionsContainer: { padding: 16 },
  optionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  optionLeft: { flexDirection: 'row', alignItems: 'center' },
  iconContainer: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  optionLabel: { fontSize: 16, fontWeight: '700', color: '#374151' },
  optionSubLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '500', marginTop: 2 },
  destructiveLabel: { color: '#EF4444' },
  footer: { padding: 32, alignItems: 'center' },
  footerText: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', fontWeight: '500', lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: 'white', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 4, textAlign: 'center' },
  modalSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 16, textAlign: 'center', fontWeight: '500' },
  modalInput: { backgroundColor: '#F3F4F6', borderRadius: 12, padding: 16, fontSize: 16, color: '#111827', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: '#F3F4F6' },
  modalBtnSave: { backgroundColor: '#4F46E5' },
  modalBtnTextCancel: { fontSize: 16, fontWeight: '700', color: '#4B5563' },
  modalBtnTextSave: { fontSize: 16, fontWeight: '700', color: 'white' },
  fullModalContainer: { flex: 1, backgroundColor: 'white' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitleLarge: { fontSize: 20, fontWeight: '900', color: '#111827' },
  modalSubtitleLeft: { fontSize: 14, color: '#6B7280', marginHorizontal: 20, marginTop: 20, marginBottom: 10, fontWeight: '500', lineHeight: 20 },
  memberInfo: { flexDirection: 'row', alignItems: 'center' },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  memberName: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  memberRole: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', marginTop: 1 },
  ownerBadgeShield: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#4F46E5', fontWeight: '900', fontSize: 16 },
  headerIconButton: { padding: 4 },
  selectMemberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 18, marginHorizontal: 20, marginBottom: 10, backgroundColor: '#F9FAFB' },
  selectMemberRowActive: { backgroundColor: '#4F46E5' },
  textWhite: { color: 'white' },
  textWhite70: { color: 'rgba(255,255,255,0.7)' },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: 'white' }
});

export default GroupSettings;