import React, { useEffect, useState } from 'react';
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
  Platform
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, useApiClient, userApi, groupApi } from '@/utils/api';

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

  // --- ACCESS CONTROL GUARD ---
  useEffect(() => {
    if (!isLoadingGroup && !isLoadingUser && group && currentUser) {
      const userId = currentUser._id;
      const g = group as any;
      const isOwner = g.owner === userId || g.owner?._id === userId;
      const isMod = g.moderators?.some((m: any) => (m?._id || m) === userId);

      if (!isOwner && !isMod) {
        Alert.alert(
          "Permission Denied", 
          "Only owners and moderators can access group settings."
        );
        router.back();
      }
    }
  }, [group, currentUser, isLoadingGroup, isLoadingUser]);

  const settingsOptions = [
    { id: 'name', label: 'Edit Name', icon: 'type', color: '#3B82F6', bg: '#EFF6FF' },
    { id: 'schedule', label: 'Edit Schedule & Times', icon: 'calendar', color: '#6366F1', bg: '#EEF2FF' },
    { id: 'jit', label: 'Edit JIT', icon: 'bell', color: '#F59E0B', bg: '#FFFBEB' },
    { id: 'capacity', label: 'Edit Attendee Limit', icon: 'users', color: '#A855F7', bg: '#F5F3FF' },
    { id: 'location', label: 'Edit Location', icon: 'map-pin', color: '#10B981', bg: '#ECFDF5' },
    { id: 'mods', label: 'Edit Moderators', icon: 'shield', color: '#06B6D4', bg: '#ECFEFF' },
    { id: 'members', label: 'Remove Members', icon: 'user-minus', color: '#F97316', bg: '#FFF7ED' },
    { id: 'delete', label: 'Delete Group', icon: 'trash-2', color: '#EF4444', bg: '#FEF2F2', destructive: true },
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
      case 'schedule':
        router.push({ pathname: '/group-edit-schedule/[id]', params: { id: id } });
        break;
      case 'jit':
        router.push({ pathname: '/group-edit-jit/[id]', params: { id: id } });
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
    
    // Safety check: don't call if no change
    if (trimmedLoc === group?.defaultLocation) {
        setIsEditingLocation(false);
        return;
    }

    setIsSavingLocation(true);
    try {
        // This triggers the backend updateGroup which now handles event syncing
        await groupApi.updateGroup(api, { groupId: id, defaultLocation: trimmedLoc });
        
        // Invalidate all relevant data to refresh UI everywhere
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

  if (isLoadingGroup || isLoadingUser) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
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
                <TextInput 
                    style={styles.modalInput} 
                    value={tempLocation} 
                    onChangeText={setTempLocation} 
                    placeholder="e.g. Starbucks or Zoom link..." 
                    autoFocus 
                    selectTextOnFocus 
                />
                <View style={styles.modalButtons}>
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setIsEditingLocation(false)}>
                        <Text style={styles.modalBtnTextCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={handleSaveLocation} disabled={isSavingLocation}>
                        {isSavingLocation ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalBtnTextSave}>Save</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
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
  modalBtnTextSave: { fontSize: 16, fontWeight: '700', color: 'white' }
});

export default GroupSettings;