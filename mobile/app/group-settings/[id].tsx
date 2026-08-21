import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  FlatList,
  Animated,
  Easing
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, Schedule, useApiClient, userApi, groupApi } from '@/utils/api';
import { useDeleteGroup } from '@/hooks/useDeleteGroup';
import { useLeaveGroup } from '@/hooks/useLeaveGroup';
import { pickImageUri, uploadImageFromUri, deleteStorageImage } from '@/utils/uploadImage';
import { GroupAvatar } from '@/components/GroupAvatar';
import { LoadingAnimation } from '@/components/LoadingAnimation';

// Mirrors the Max Attendees validation on the group-creation Schedule screen and
// the Add Meetup wizard so all three "attendee limit" entry points agree on what's valid.
const getMaxAttendeesError = (mode: "unlimited" | "limited", input: string): string | null => {
  if (mode !== "limited" || input === "") return null;
  if (!/^\d+$/.test(input)) return "Numbers only, please.";
  const n = parseInt(input, 10);
  if (n < 1 || n > 200) return "Enter a number between 1 and 200.";
  return null;
};

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
  const insets = useSafeAreaInsets();

  const { getToken } = useAuth();
  const { data: group, isLoading: isLoadingGroup } = useGetGroupDetails(id);
  const { data: currentUser, isLoading: isLoadingUser } = useQuery<User, Error>({ 
    queryKey: ['currentUser'], 
    queryFn: () => userApi.getCurrentUser(api),
  });

  // --- Termination Hooks ---
  const { mutate: deleteGroup } = useDeleteGroup();
  const { mutate: leaveGroup } = useLeaveGroup();

  // --- State for Edit Modals ---
  const [isImageModalVisible, setIsImageModalVisible] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [isConfirmingImage, setIsConfirmingImage] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [isCelebratingName, setIsCelebratingName] = useState(false);
  const [celebrationName, setCelebrationName] = useState("");
  const letterAnimsRef = useRef<Animated.Value[]>([]);
  const nameFlyAnim = useRef(new Animated.Value(0)).current;
  const heartRiseAnim = useRef(new Animated.Value(0)).current;
  const heartPopScale = useRef(new Animated.Value(1)).current;

  const [isEditingCapacity, setIsEditingCapacity] = useState(false);
  const [capacityMode, setCapacityMode] = useState<"unlimited" | "limited">("unlimited");
  const [tempCapacity, setTempCapacity] = useState("");
  const [isSavingCapacity, setIsSavingCapacity] = useState(false);

  const capacityError = getMaxAttendeesError(capacityMode, tempCapacity);
  const canSaveCapacity = capacityMode !== "limited" || (tempCapacity !== "" && !capacityError);

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

  const scheduleTypeLabel = useMemo((): string => {
    const schedule: Schedule | undefined = group?.schedule;
    if (!schedule) return 'No schedule set';
    const routines = schedule.routines ?? [];
    if (routines.length > 1) return 'Multiple Rules';
    const freq = routines.length === 1 ? routines[0].frequency : schedule.frequency;
    const labels: Record<string, string> = {
      daily: 'Daily', weekly: 'Weekly', biweekly: 'Biweekly',
      monthly: 'Monthly', ordinal: 'Ordinal', once: 'One-time', custom: 'Custom',
    };
    return labels[freq] ?? 'No schedule set';
  }, [group?.schedule]);

  const rsvpSettingsLabel = useMemo((): string => {
    const leadDays = group?.generationLeadDays;
    const deadlineDays = group?.generationDeadlineDays;
    const opensPart = leadDays != null ? `Opens ${leadDays} day${leadDays !== 1 ? 's' : ''} before at ${group?.generationLeadTime || '—'}` : null;
    const deadlinePart = deadlineDays != null ? `Deadline ${deadlineDays} day${deadlineDays !== 1 ? 's' : ''} before at ${group?.generationDeadlineTime || '—'}` : null;
    if (!opensPart && !deadlinePart) return 'RSVPs open anytime';
    return [opensPart, deadlinePart].filter(Boolean).join(' · ');
  }, [group?.generationLeadDays, group?.generationLeadTime, group?.generationDeadlineDays, group?.generationDeadlineTime]);

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
    { id: 'image', label: 'Edit Group Photo', icon: 'camera', color: '#4A90E2', bg: '#EFF6FF' },
    { id: 'name', label: 'Edit Group Name', icon: 'type', color: '#3B82F6', bg: '#EFF6FF' },
    { id: 'schedule', label: 'Edit Schedule & Times', icon: 'calendar', color: '#6366F1', bg: '#EEF2FF' },
    { id: 'jit', label: 'Edit RSVP Settings', icon: 'bell', color: '#F59E0B', bg: '#FFFBEB' },
    { id: 'capacity', label: 'Edit Attendee Limit', icon: 'users', color: '#A855F7', bg: '#F5F3FF' },
    { id: 'location', label: 'Edit Location', icon: 'map-pin', color: '#10B981', bg: '#ECFDF5' },
    { id: 'mods', label: 'Edit Moderators', icon: 'shield', color: '#06B6D4', bg: '#ECFEFF' },
    { id: 'members', label: 'Remove Members', icon: 'user-minus', color: '#F97316', bg: '#FFF7ED' },
    { id: 'terminate', label: isUserOwner ? 'Delete Group' : 'Leave Group', icon: isUserOwner ? 'trash-2' : 'log-out', color: '#EF4444', bg: '#FEF2F2', destructive: true },
  ];

  const handleOptionPress = (optionId: string) => {
    if (!id) return;

    switch (optionId) {
      case 'image':
        handleOpenImageModal();
        break;
      case 'name':
        setTempName(group?.name || "");
        setIsEditingName(true);
        break;
      case 'capacity': {
        const currentCapacity = group?.defaultCapacity || 0;
        setCapacityMode(currentCapacity > 0 ? "limited" : "unlimited");
        setTempCapacity(currentCapacity > 0 ? currentCapacity.toString() : "");
        setIsEditingCapacity(true);
        break;
      }
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

  const imageModalRotation = useRef(new Animated.Value(0)).current;

  const handleOpenImageModal = () => {
    setPreviewUri(null);
    setIsImageModalVisible(true);
    imageModalRotation.setValue(0);
    Animated.sequence([
      Animated.timing(imageModalRotation, { toValue: -6, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(imageModalRotation, { toValue: 5, duration: 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(imageModalRotation, { toValue: -3, duration: 100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(imageModalRotation, { toValue: 1.5, duration: 100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(imageModalRotation, { toValue: 0, duration: 100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  };

  const imageModalRotateStyle = {
    transform: [
      {
        rotate: imageModalRotation.interpolate({
          inputRange: [-6, 6],
          outputRange: ['-6deg', '6deg'],
        }),
      },
    ],
  };

  const avatarPopScale = useRef(new Animated.Value(1)).current;

  const handlePickNewImage = async () => {
    const uri = await pickImageUri();
    if (uri) {
      setPreviewUri(uri);
      avatarPopScale.setValue(1);
      Animated.sequence([
        Animated.delay(200),
        Animated.timing(avatarPopScale, { toValue: 1.18, duration: 2000, easing: Easing.out(Easing.exp), useNativeDriver: true }),
        Animated.timing(avatarPopScale, { toValue: 1, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(avatarPopScale, { toValue: 1.04, duration: 70, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(avatarPopScale, { toValue: 0.98, duration: 70, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(avatarPopScale, { toValue: 1.01, duration: 60, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(avatarPopScale, { toValue: 1, duration: 60, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  };

  const handleConfirmImage = async () => {
    if (!id || !previewUri) return;
    try {
      setIsConfirmingImage(true);
      const token = await getToken({ template: 'supabase' });
      if (!token) throw new Error('No auth token');

      const oldImageUrl = group?.image;
      const newFilePath = `${id}/cover.jpg`;
      const newUrl = await uploadImageFromUri(previewUri, 'group-images', newFilePath, token);

      await groupApi.updateGroup(api, { groupId: id, image: newUrl });

      // Only delete the old file if it lives at a different storage path.
      // If the paths are the same, upsert already overwrote it — deleting would remove the new file.
      if (oldImageUrl) {
        const marker = `/storage/v1/object/public/group-images/`;
        const oldPath = oldImageUrl.slice(oldImageUrl.indexOf(marker) + marker.length).split('?')[0];
        if (oldPath !== newFilePath) {
          deleteStorageImage(oldImageUrl, 'group-images', token).catch(() => {});
        }
      }

      queryClient.setQueryData(['groupDetails', id], (old: any) =>
        old ? { ...old, image: newUrl } : old
      );
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setIsImageModalVisible(false);
    } catch {
      Alert.alert('Error', 'Could not update group photo. Please try again.');
    } finally {
      setIsConfirmingImage(false);
    }
  };

  const playNameCelebration = (name: string) => {
    letterAnimsRef.current = name.split('').map(() => new Animated.Value(0));
    nameFlyAnim.setValue(0);
    heartRiseAnim.setValue(0);
    heartPopScale.setValue(1);
    setCelebrationName(name);
    setIsCelebratingName(true);

    const waveAnimations = letterAnimsRef.current.map((letterAnim, i) =>
      Animated.sequence([
        Animated.delay(i * 45),
        Animated.timing(letterAnim, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(letterAnim, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      ])
    );

    Animated.sequence([
      Animated.parallel(waveAnimations),
      Animated.parallel([
        Animated.timing(nameFlyAnim, { toValue: -260, duration: 450, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(heartRiseAnim, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(heartPopScale, { toValue: 1.18, duration: 500, easing: Easing.out(Easing.exp), useNativeDriver: true }),
          Animated.timing(heartPopScale, { toValue: 1, duration: 50, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(heartPopScale, { toValue: 1.04, duration: 18, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(heartPopScale, { toValue: 0.98, duration: 18, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(heartPopScale, { toValue: 1.01, duration: 15, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(heartPopScale, { toValue: 1, duration: 15, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ]),
    ]).start(() => {
      setIsEditingName(false);
      setIsCelebratingName(false);
      setCelebrationName("");
    });
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
            queryClient.invalidateQueries({ queryKey: ['meetups'] })
        ]);
        playNameCelebration(tempName.trim());
    } catch (error: any) {
        Alert.alert("Error", error.response?.data?.error || "Failed to update group name.");
    } finally {
        setIsSavingName(false);
    }
  };

  const handleSaveCapacity = async () => {
    if (!id || !canSaveCapacity) return;
    const capacityNum = capacityMode === "limited" ? parseInt(tempCapacity, 10) : 0;
    if (capacityNum === (group?.defaultCapacity || 0)) {
      setIsEditingCapacity(false);
      return;
    }

    setIsSavingCapacity(true);
    try {
        await groupApi.updateGroup(api, { groupId: id, defaultCapacity: capacityNum });
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['groupDetails', id] }),
            queryClient.invalidateQueries({ queryKey: ['groups'] }),
            queryClient.invalidateQueries({ queryKey: ['meetups'] })
        ]);
        setIsEditingCapacity(false);
        Alert.alert("Success", "Attendee limit and associated meetups updated.");
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
            queryClient.invalidateQueries({ queryKey: ['meetups'] })
        ]);
        setIsEditingLocation(false);
        Alert.alert("Success", "Default location and future meetups updated.");
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
            queryClient.invalidateQueries({ queryKey: ['meetups'] })
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
        <LoadingAnimation />
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
                {option.id === 'image' ? (
                  <View style={{ marginRight: 16 }}>
                    <GroupAvatar name={group?.name ?? ''} imageUrl={group?.image} size={40} borderRadius={11} />
                  </View>
                ) : (
                  <View style={[styles.iconContainer, { backgroundColor: option.bg }]}>
                    <Feather name={option.icon as any} size={20} color={option.color} />
                  </View>
                )}
                <View>
                  <Text style={[styles.optionLabel, option.destructive && styles.destructiveLabel]}>
                    {option.label}
                  </Text>
                  {option.id === 'image' && (
                    <Text style={styles.optionSubLabel}>
                      {group?.image ? 'Tap to change' : 'No photo set'}
                    </Text>
                  )}
                  {option.id === 'name' && (
                    <Text style={styles.optionSubLabel} numberOfLines={1}>
                      {group?.name || '—'}
                    </Text>
                  )}
                  {option.id === 'schedule' && (
                    <Text style={styles.optionSubLabel}>
                      {scheduleTypeLabel}
                    </Text>
                  )}
                  {option.id === 'jit' && (
                    <Text style={styles.optionSubLabel}>
                      {rsvpSettingsLabel}
                    </Text>
                  )}
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

      {/* Edit Group Photo Modal */}
      <Modal
        visible={isImageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsImageModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsImageModalVisible(false)}>
          <Animated.View style={imageModalRotateStyle}>
            <Pressable onPress={() => {}} style={[styles.modalContent, styles.imageModalContent]}>
              <Text style={styles.modalTitle}>Group Photo</Text>

              <TouchableOpacity onPress={handlePickNewImage} disabled={isConfirmingImage} style={styles.imageModalAvatarWrap}>
                <Animated.View style={{ transform: [{ scale: avatarPopScale }] }}>
                  <GroupAvatar
                    name={group?.name ?? ''}
                    imageUrl={previewUri ?? group?.image}
                    size={120}
                    borderRadius={28}
                  />
                  <View style={styles.imageModalCameraBadge}>
                    <Feather name="camera" size={16} color="#fff" />
                  </View>
                </Animated.View>
              </TouchableOpacity>

              {previewUri ? (
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={handleConfirmImage}
                  disabled={isConfirmingImage}
                >
                  {isConfirmingImage
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.confirmBtnText}>Confirm</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.confirmBtn, styles.imageModalCancelBtn]}
                  onPress={() => setIsImageModalVisible(false)}
                >
                  <Text style={styles.modalBtnTextCancel}>Cancel</Text>
                </TouchableOpacity>
              )}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Edit Name Modal */}
      <Modal visible={isEditingName} transparent animationType="fade" onRequestClose={() => setIsEditingName(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                {isCelebratingName ? (
                    <View style={styles.nameCelebrationStage}>
                        <Animated.View
                            style={[
                                styles.nameCelebrationHeart,
                                {
                                    transform: [
                                        { translateY: heartRiseAnim.interpolate({ inputRange: [0, 1], outputRange: [150, 0] }) },
                                        { scale: heartPopScale },
                                    ],
                                },
                            ]}
                        >
                            <Text style={styles.nameCelebrationHeartText}>❤️</Text>
                        </Animated.View>
                        <Animated.View style={[styles.nameCelebrationNameRow, { transform: [{ translateY: nameFlyAnim }] }]}>
                            {celebrationName.split('').map((char, i) => (
                                <Animated.Text
                                    key={`${char}-${i}`}
                                    style={[
                                        styles.nameCelebrationLetter,
                                        {
                                            transform: [{
                                                translateY: letterAnimsRef.current[i]?.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) ?? 0,
                                            }],
                                            color: letterAnimsRef.current[i]?.interpolate({ inputRange: [0, 1], outputRange: ['#111827', '#4FD1C5'] }) ?? '#111827',
                                        },
                                    ]}
                                >
                                    {char === ' ' ? ' ' : char}
                                </Animated.Text>
                            ))}
                        </Animated.View>
                    </View>
                ) : (
                    <>
                        <Text style={styles.modalTitle}>Edit Group Name</Text>
                        <TextInput style={styles.modalInput} value={tempName} onChangeText={setTempName} placeholder="Enter group name" autoFocus maxLength={50} selectTextOnFocus />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setIsEditingName(false)}><Text style={styles.modalBtnTextCancel}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={handleSaveName} disabled={isSavingName || !tempName.trim()}>
                                {isSavingName ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalBtnTextSave}>Save</Text>}
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Capacity Modal */}
      <Modal visible={isEditingCapacity} transparent animationType="fade" onRequestClose={() => setIsEditingCapacity(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Attendee Limit</Text>
                <View style={[styles.boolRow, { marginTop: 16 }]}>
                    <TouchableOpacity
                        style={[styles.boolBtn, capacityMode === "unlimited" && styles.boolBtnActive]}
                        onPress={() => { setCapacityMode("unlimited"); setTempCapacity(""); }}
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
                    <View style={{ marginTop: 14 }}>
                        <View style={[styles.inputRow, capacityError && styles.inputRowError]}>
                            <Feather name="users" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.inlineInput}
                                placeholder="How many?"
                                placeholderTextColor="#C4C9D4"
                                keyboardType="number-pad"
                                value={tempCapacity}
                                onChangeText={setTempCapacity}
                                autoFocus
                            />
                        </View>
                        {capacityError && <Text style={styles.errorText}>{capacityError}</Text>}
                    </View>
                )}
                <View style={[styles.modalButtons, { marginTop: 20 }]}>
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setIsEditingCapacity(false)}><Text style={styles.modalBtnTextCancel}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave, !canSaveCapacity && styles.modalBtnDisabled]} onPress={handleSaveCapacity} disabled={isSavingCapacity || !canSaveCapacity}>
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
                <Text style={styles.modalSubtitle}>Updates location for all associated meetups.</Text>
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
      <Modal
        visible={isEditingMods}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setIsEditingMods(false)}
      >
        <View style={[styles.fullModalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setIsEditingMods(false)} style={styles.headerIconButton}>
              <Feather name="x" size={24} color="#374151" />
            </TouchableOpacity>
            <Text style={styles.modalTitleLarge}>Manage Moderators</Text>
            <TouchableOpacity onPress={handleSaveModerators} disabled={isSavingMods} style={styles.headerIconButton}>
                {isSavingMods ? <ActivityIndicator size="small" color="#4A90E2" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={group?.members}
            keyExtractor={(item) => item._id}
            contentContainerStyle={{ padding: 20 }}
            ListHeaderComponent={() => (
              <Text style={styles.modalSubtitleLeft}>
                Only the group owner can assign moderators. Moderators can edit group settings, schedules, and manage meetups.
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
                      <Feather name="shield" size={16} color="#4A90E2" />
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
        </View>
      </Modal>

      {/* Remove Members Modal */}
      <Modal
        visible={isEditingMembers}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setIsEditingMembers(false)}
      >
        <View style={[styles.fullModalContainer, { paddingTop: insets.top }]}>
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
                  ) : isMbrOwner ? <View style={styles.ownerBadgeShield}><Feather name="shield" size={16} color="#4A90E2" /></View> : null}
                </View>
              );
            }}
          />
        </View>
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
  modalBtnSave: { backgroundColor: '#4FD1C5' },
  modalBtnDisabled: { backgroundColor: '#A7E4DE' },
  modalBtnTextCancel: { fontSize: 16, fontWeight: '700', color: '#4B5563' },
  modalBtnTextSave: { fontSize: 16, fontWeight: '700', color: 'white' },
  nameCelebrationStage: { width: '100%', height: 220, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  nameCelebrationHeart: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  nameCelebrationHeartText: { fontSize: 56 },
  nameCelebrationNameRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 16 },
  nameCelebrationLetter: { fontSize: 30, fontWeight: '800', color: '#111827' },
  boolRow: { flexDirection: 'row', gap: 10 },
  boolBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: '#fff' },
  boolBtnActive: { borderColor: '#4A90E2', backgroundColor: '#EEF6FF' },
  boolBtnText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  boolBtnTextActive: { color: '#4A90E2' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12 },
  inputRowError: { borderColor: '#EF4444' },
  inlineInput: { flex: 1, fontSize: 15, color: '#374151' },
  errorText: { fontSize: 12, fontWeight: '600', color: '#EF4444', marginTop: 6, marginLeft: 2 },
  fullModalContainer: { flex: 1, backgroundColor: 'white' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitleLarge: { fontSize: 20, fontWeight: '900', color: '#111827' },
  modalSubtitleLeft: { fontSize: 14, color: '#6B7280', marginHorizontal: 20, marginTop: 20, marginBottom: 10, fontWeight: '500', lineHeight: 20 },
  memberInfo: { flexDirection: 'row', alignItems: 'center' },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  memberName: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  memberRole: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', marginTop: 1 },
  ownerBadgeShield: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#4A90E2', fontWeight: '900', fontSize: 16 },
  headerIconButton: { padding: 4 },
  selectMemberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 18, marginHorizontal: 20, marginBottom: 10, backgroundColor: '#F9FAFB' },
  selectMemberRowActive: { backgroundColor: '#4A90E2' },
  textWhite: { color: 'white' },
  textWhite70: { color: 'rgba(255,255,255,0.7)' },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: 'white' },
  imageModalContent: { width: 300, height: 300, alignItems: 'center', justifyContent: 'center' },
  imageModalAvatarWrap: { position: 'relative', marginTop: 8 },
  imageModalCameraBadge: { position: 'absolute', bottom: 2, right: 2, backgroundColor: '#4A90E2', borderRadius: 16, padding: 6, borderWidth: 2, borderColor: '#fff' },
  confirmBtn: { marginTop: 28, alignSelf: 'stretch', backgroundColor: '#4A90E2', borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  imageModalCancelBtn: { backgroundColor: '#F3F4F6' },
});

export default GroupSettings;