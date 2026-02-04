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
 * Features administrative controls for owners/moderators.
 * Includes explicit name synchronization logic for associated events.
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

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  // --- ACCESS CONTROL GUARD ---
  useEffect(() => {
    if (!isLoadingGroup && !isLoadingUser && group && currentUser) {
      const userId = currentUser._id;
      // Using 'any' to bypass strict inference issues during troubleshooting
      const g = group as any;
      const isOwner = g.owner === userId || g.owner?._id === userId;
      const isMod = g.moderators?.some((m: any) => (m?._id || m) === userId);

      if (!isOwner && !isMod) {
        Alert.alert("Permission Denied", "Only owners and moderators can access settings.");
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
    if (optionId === 'name') {
      setTempName(group?.name || "");
      setIsEditingName(true);
    } else if (optionId === 'schedule') {
      router.push({ pathname: '/group-edit-schedule/[id]', params: { id: id! } });
    }
  };

  /**
   * handleSaveName
   * Performs the update and ensures associated event names are refreshed.
   * This handles the requirement to gather associated event updates 
   * by forcing the client to refetch all relevant caches (groups, details, events).
   */
  const handleSaveName = async () => {
    if (!id || !tempName.trim()) return;
    
    if (tempName === group?.name) {
        setIsEditingName(false);
        return;
    }

    setIsSavingName(true);
    try {
        console.log(`[SYNC] Starting name update for Group: ${id} to "${tempName}"`);
        
        // 1. Execute group update command via API
        // This triggers the backend to update both the Group and its related Events
        const response = await groupApi.updateGroup(api, { groupId: id, name: tempName.trim() });
        
        console.log("[SYNC] Server acknowledged update:", JSON.stringify(response, null, 2));

        // 2. Global UI synchronization
        // Invalidate 'events' specifically to ensure all event cards update their titles immediately
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['groupDetails', id] }),
            queryClient.invalidateQueries({ queryKey: ['groups'] }),
            queryClient.invalidateQueries({ queryKey: ['events'] })
        ]);
        
        console.log("[SYNC] Global refresh triggered.");
        
        setIsEditingName(false);
        Alert.alert("Success", "Name updated for the group and all associated events.");
    } catch (error: any) {
        console.error("[SYNC] Propagation Error:", error);
        Alert.alert("Error", error.response?.data?.error || "Failed to update group name.");
    } finally {
        setIsSavingName(false);
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
      {/* Native header style */}
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
                <Text style={[styles.optionLabel, option.destructive && styles.destructiveLabel]}>
                  {option.label}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#D1D5DB" />
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Updating the group name will automatically update all associated meeting titles.
          </Text>
        </View>
      </ScrollView>

      {/* Name Input Modal */}
      <Modal visible={isEditingName} transparent animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Update Group Name</Text>
            <TextInput
              style={styles.modalInput}
              value={tempName}
              onChangeText={setTempName}
              autoFocus
              placeholderTextColor="#9CA3AF"
              selectTextOnFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnCancel]} 
                onPress={() => setIsEditingName(false)}
              >
                <Text style={styles.modalBtnTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnSave]} 
                onPress={handleSaveName} 
                disabled={isSavingName}
              >
                {isSavingName ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.modalBtnTextSave}>Save</Text>
                )}
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
  destructiveLabel: { color: '#EF4444' },
  footer: { padding: 32, alignItems: 'center' },
  footerText: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', fontWeight: '500', lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: 'white', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 16, textAlign: 'center' },
  modalInput: { backgroundColor: '#F3F4F6', borderRadius: 12, padding: 16, fontSize: 16, color: '#111827', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: '#F3F4F6' },
  modalBtnSave: { backgroundColor: '#4F46E5' },
  modalBtnTextCancel: { fontSize: 16, fontWeight: '700', color: '#4B5563' },
  modalBtnTextSave: { fontSize: 16, fontWeight: '700', color: 'white' }
});

export default GroupSettings;