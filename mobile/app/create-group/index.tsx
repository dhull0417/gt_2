import React, { useState, useRef, useEffect, useMemo } from "react";
import { 
    View, 
    Text, 
    TextInput, 
    TouchableOpacity, 
    ScrollView, 
    Image, 
    StyleSheet, 
    Alert, 
    Dimensions, 
    Modal, 
    FlatList, 
    Platform, 
    Share, 
    Keyboard, 
    ActivityIndicator,
    Animated,
    KeyboardAvoidingView,
    ViewStyle,
    StyleProp
} from "react-native";
import { useCreateGroup } from "@/hooks/useCreateGroup";
import { useSearchUsers } from "@/hooks/useSearchUsers";
import TimePicker from "@/components/TimePicker";
import { Picker } from "@react-native-picker/picker";
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { DateTime } from "luxon";
// PROJECT 7 FIX: Import Schedule interface for type safety in handleCreateRequest
import { useApiClient, Frequency, DayTime, Schedule } from "@/utils/api";

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.90; 
const SIDE_INSET = (width - CARD_WIDTH) / 2; 

const GroupImage = require('../../assets/images/group-image.jpeg');

type CreationType = 'group' | 'event' | null;

interface CustomRoutine {
    id: string;
    type: 'byDay' | 'byDate' | null; 
    data: {
        occurrence?: string; 
        dayIndex?: number;   
        dates?: number[];    
    };
}

interface UserStub {
    _id: string;
    firstName?: string;
    lastName?: string;
    username: string;
    name?: string; 
    email?: string;
    profilePicture?: string;
}

const usaTimezones = [
    { label: "Eastern (ET)", value: "America/New_York" },
    { label: "Central (CST)", value: "America/Chicago" },
    { label: "Mountain (MT)", value: "America/Denver" },
    { label: "Mountain (no DST)", value: "America/Phoenix" },
    { label: "Pacific (PST)", value: "America/Los_Angeles" },
    { label: "Alaska (AKST)", value: "America/Anchorage" },
    { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
];

const daysOfWeek = [
    { label: "Sunday", value: 0 },
    { label: "Monday", value: 1 },
    { label: "Tuesday", value: 2 },
    { label: "Wednesday", value: 3 },
    { label: "Thursday", value: 4 },
    { label: "Friday", value: 5 },
    { label: "Saturday", value: 6 },
];

const occurrences = ['1st', '2nd', '3rd', '4th', '5th', 'Last'];

interface FadeInViewProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

const FadeInView = ({ children, delay = 0, duration = 400, style }: FadeInViewProps) => {
  const fadeAnim = useMemo(() => new Animated.Value(0), []);
  const slideAnim = useMemo(() => new Animated.Value(-15), []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration, delay, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration, delay, useNativeDriver: true })
    ]).start();
  }, [delay, duration, fadeAnim, slideAnim]);

  return (
    <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], width: '100%' }, style]}>
      {children}
    </Animated.View>
  );
};

const CreateGroupScreen = () => {
  const router = useRouter();
  const api = useApiClient();
  const { existingGroupId, initialType } = useLocalSearchParams<{ existingGroupId?: string, initialType?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  
  // --- Basic State ---
  const [step, setStep] = useState(0); 
  const [creationType, setCreationType] = useState<CreationType>(null);
  const [groupName, setGroupName] = useState("");
  const [location, setLocation] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<UserStub[]>([]);
  const { data: searchResults, isLoading: isSearchingUsers } = useSearchUsers(searchQuery);

  // --- Schedule State ---
  const [frequency, setFrequency] = useState<Frequency | null>(null);
  const [dayTimes, setDayTimes] = useState<DayTime[]>([]);
  const [selectedDates, setSelectedDates] = useState<number[]>([]); 
  const [kickoffDate, setKickoffDate] = useState<string>(DateTime.now().toISODate()!);
  const [meetTime, setMeetTime] = useState("05:00 PM");
  const [timezone, setTimezone] = useState("America/Denver");

  // --- Custom Routines State ---
  const [customRoutines, setCustomRoutines] = useState<CustomRoutine[]>([
      { id: Date.now().toString(), type: null, data: { occurrence: '1st', dayIndex: 0, dates: [] } }
  ]);
  const [currentPage, setCurrentPage] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState<{ type: 'occurrence' | 'dayIndex', routineIndex: number } | null>(null);

  // --- JIT Settings ---
  const [leadDays, setLeadDays] = useState(2);
  const [notificationTime, setNotificationTime] = useState("09:00 AM");

  // --- One-off logic ---
  const [oneOffDate, setOneOffDate] = useState<string>(DateTime.now().toISODate()!);
  const [calendarViewMonth, setCalendarViewMonth] = useState<DateTime>(DateTime.now().startOf('month'));
  
  const { mutate, isPending: isMutationPending } = useCreateGroup();
  const [isCustomPending, setIsCustomPending] = useState(false);
  const isPending = isMutationPending || isCustomPending;

  useEffect(() => {
    if (existingGroupId) { setCreationType('event'); setStep(3); }
    else if (initialType === 'event') { setCreationType('event'); setStep(1); }
  }, [initialType, existingGroupId]);

  const calendarGrid = useMemo(() => {
    const startOfMonth = calendarViewMonth.startOf('month');
    const endOfMonth = calendarViewMonth.endOf('month');
    const firstDayIdx = startOfMonth.weekday === 7 ? 0 : startOfMonth.weekday;
    const days = [];
    for (let i = 0; i < firstDayIdx; i++) days.push(null);
    for (let i = 1; i <= endOfMonth.day; i++) days.push(calendarViewMonth.set({ day: i }));
    return days;
  }, [calendarViewMonth]);

  const changeMonth = (offset: number) => setCalendarViewMonth(prev => prev.plus({ months: offset }));

  const getDisplayName = (user: UserStub) => {
      if (user.firstName) return `${user.firstName} ${user.lastName || ''}`.trim();
      return user.username;
  };

  const getDisplayInitials = (user: UserStub) => {
      const name = getDisplayName(user);
      return name.charAt(0).toUpperCase();
  };

  const handleCreateRequest = async () => {
    if (existingGroupId) {
        setIsCustomPending(true);
        try {
            await api.post(`/api/groups/${existingGroupId}/events`, { date: oneOffDate, time: meetTime, timezone: timezone, name: groupName, location: location });
            Alert.alert("Success", "Meeting added to group!");
            router.back();
        } catch (error: any) { Alert.alert("Error", error.response?.data?.error || "Failed to add meeting."); }
        finally { setIsCustomPending(false); }
        return;
    }

    if (creationType === 'event') {
        const payload: any = { name: groupName, time: meetTime, schedule: { frequency: 'once', date: oneOffDate }, timezone, location, eventsToDisplay: 1, members: selectedMembers.map(m => m._id) };
        mutate(payload, { onSuccess: () => router.back() });
        return;
    }

    // PROJECT 7 FIX: Use proper interface typing for schedule construction
    let finalSchedule: Partial<Schedule> = { frequency: frequency as Frequency, startDate: kickoffDate };
    
    if (frequency === 'weekly' || frequency === 'biweekly') {
        finalSchedule.days = dayTimes.map(dt => dt.day);
        finalSchedule.dayTimes = dayTimes;
    } else if (frequency === 'monthly') {
        finalSchedule.days = selectedDates;
    } else if (frequency === 'daily') {
        finalSchedule.days = [0, 1, 2, 3, 4, 5, 6]; 
    } else if (frequency === 'custom') {
        finalSchedule.days = [0]; 
        finalSchedule.rules = customRoutines.map(r => ({
            type: r.type as 'byDay' | 'byDate',
            occurrence: r.type === 'byDay' ? r.data.occurrence as any : undefined,
            day: r.type === 'byDay' ? r.data.dayIndex : undefined,
            dates: r.type === 'byDate' ? r.data.dates : undefined,
        }));
    }

    const payload: any = { 
        name: groupName, 
        time: meetTime, 
        schedule: finalSchedule as Schedule, 
        timezone,
        defaultLocation: location,
        eventsToDisplay: 1,
        members: selectedMembers.map(m => m._id),
        generationLeadDays: leadDays,
        generationLeadTime: notificationTime
    };

    mutate(payload, { onSuccess: () => router.back() });
  };

  const handleNext = () => {
    if (creationType === 'group' && step === 3 && frequency === 'daily') {
        setStep(5); // Skip day/time selection
    } else {
        setStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    const isAtStart = step === 0 || (existingGroupId && step === 3) || (initialType === 'event' && !existingGroupId && step === 1);
    if (isAtStart) {
      Alert.alert("Discard Changes?", "Are you sure you want to exit?", [
        { text: "Stay", style: "cancel" }, { text: "Exit", style: "destructive", onPress: () => router.back() }
      ]);
    } else if (step === 5 && frequency === 'daily' && creationType === 'group') {
        setStep(3);
    } else {
        setStep(prev => prev - 1);
    }
  };

  const toggleDayAndTime = (dayIndex: number) => {
    setDayTimes(prev => {
        const exists = prev.find(dt => dt.day === dayIndex);
        if (exists) return prev.filter(dt => dt.day !== dayIndex);
        return [...prev, { day: dayIndex, time: meetTime }];
    });
  };

  const updateTimeForDay = (dayIndex: number, newTime: string) => {
    setDayTimes(prev => prev.map(dt => dt.day === dayIndex ? { ...dt, time: newTime } : dt));
  };

  const toggleDateSelection = (date: number) => {
    setSelectedDates(prev => {
        if (prev.includes(date)) return prev.filter(d => d !== date);
        if (prev.length >= 10) { Alert.alert("Limit Reached", "Max 10 dates."); return prev; }
        return [...prev, date];
    });
  };

  const toggleMember = (user: UserStub) => {
    if (selectedMembers.some(m => m._id === user._id)) {
        setSelectedMembers(prev => prev.filter(m => m._id !== user._id));
    } else {
        setSelectedMembers(prev => [...prev, user]);
        setSearchQuery(""); 
        Keyboard.dismiss();
    }
  };

  const handleModalSelect = (value: any) => {
      if (modalConfig) {
          const newRoutines = [...customRoutines];
          newRoutines[modalConfig.routineIndex].data = { ...newRoutines[modalConfig.routineIndex].data, [modalConfig.type]: value };
          setCustomRoutines(newRoutines);
      }
      setModalVisible(false);
      setModalConfig(null);
  };

  const addRoutine = () => {
      if (customRoutines.length >= 5) return;
      const newRoutine: CustomRoutine = { id: Date.now().toString(), type: null, data: { occurrence: '1st', dayIndex: 0, dates: [] } };
      const newRoutines = [...customRoutines, newRoutine];
      setCustomRoutines(newRoutines);
      setTimeout(() => {
          scrollRef.current?.scrollTo({ x: newRoutines.length * CARD_WIDTH, animated: true });
          setCurrentPage(newRoutines.length - 1);
      }, 100);
  };

  const removeRoutine = (index: number) => {
      if (customRoutines.length === 1) {
          const newRoutines = [...customRoutines];
          newRoutines[index] = { ...newRoutines[index], type: null, data: { occurrence: '1st', dayIndex: 0, dates: [] } };
          setCustomRoutines(newRoutines);
          return;
      }
      const newRoutines = customRoutines.filter((_, i) => i !== index);
      setCustomRoutines(newRoutines);
      if (currentPage >= newRoutines.length) setCurrentPage(newRoutines.length - 1);
  };

  const updateRoutine = (index: number, updates: Partial<CustomRoutine>) => {
      const newRoutines = [...customRoutines];
      newRoutines[index] = { ...newRoutines[index], ...updates };
      setCustomRoutines(newRoutines);
  };

  const updateRoutineData = (index: number, field: string, value: any) => {
      const newRoutines = [...customRoutines];
      newRoutines[index].data = { ...newRoutines[index].data, [field]: value };
      setCustomRoutines(newRoutines);
  };

  const openDropdown = (type: 'occurrence' | 'dayIndex', routineIndex: number) => {
      setModalConfig({ type, routineIndex });
      setModalVisible(true);
  };

  const handleScroll = (event: any) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const pageIndex = Math.round(offsetX / CARD_WIDTH);
      setCurrentPage(pageIndex);
  };

  const renderDropdownModal = () => {
      if (!modalVisible || !modalConfig) return null;
      const options = modalConfig.type === 'occurrence' ? occurrences.map(o => ({ label: o, value: o })) : daysOfWeek; 
      return (
          <Modal transparent visible={modalVisible} animationType="fade">
              <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
                  <View style={styles.modalContent}>
                      <Text style={styles.modalTitle}>Select {modalConfig.type === 'occurrence' ? 'Occurrence' : 'Day'}</Text>
                      <FlatList 
                        data={options as any}
                        keyExtractor={(item) => item.label}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.modalItem} onPress={() => handleModalSelect(item.value)}>
                                <Text style={styles.modalItemText}>{item.label}</Text>
                            </TouchableOpacity>
                        )}
                      />
                  </View>
              </TouchableOpacity>
          </Modal>
      );
  };

  const renderRoutineCard = (routine: CustomRoutine, index: number) => {
      return (
          <View key={routine.id} style={styles.cardContainer}>
              <View style={styles.card}>
                  {routine.type === null && (
                      <View style={styles.cardContentCentered}>
                          <TouchableOpacity style={styles.selectionButton} onPress={() => updateRoutine(index, { type: 'byDay' })}>
                              <Text style={styles.selectionButtonText}>Schedule By Day</Text>
                              <Text style={styles.selectionButtonSubtext}>Example: Every 2nd Thursday</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.selectionButton} onPress={() => updateRoutine(index, { type: 'byDate' })}>
                              <Text style={styles.selectionButtonText}>Schedule By Date</Text>
                              <Text style={styles.selectionButtonSubtext}>Example: Every 15th of the month</Text>
                          </TouchableOpacity>
                      </View>
                  )}
                  {routine.type === 'byDay' && (
                      <View style={styles.cardContent}>
                          <Text style={styles.cardLabel}>Every</Text>
                          <TouchableOpacity style={styles.dropdownButton} onPress={() => openDropdown('occurrence', index)}>
                                <Text style={styles.dropdownButtonText}>{routine.data.occurrence || 'Select'}</Text>
                                <Feather name="chevron-down" size={20} color="#4F46E5" />
                          </TouchableOpacity>
                          <View style={{ height: 10 }} />
                          <TouchableOpacity style={styles.dropdownButton} onPress={() => openDropdown('dayIndex', index)}>
                                <Text style={styles.dropdownButtonText}>
                                    {daysOfWeek.find(d => d.value === routine.data.dayIndex)?.label || 'Select Day'}
                                </Text>
                                <Feather name="chevron-down" size={20} color="#4F46E5" />
                          </TouchableOpacity>
                          <Text style={styles.cardLabel}>of the month</Text>
                          <TouchableOpacity onPress={() => updateRoutine(index, { type: null })} style={{marginTop: 20}}>
                              <Text style={{color: '#6B7280', textDecorationLine: 'underline'}}>Change Type</Text>
                          </TouchableOpacity>
                      </View>
                  )}
                  {routine.type === 'byDate' && (
                       <View style={styles.cardContent}>
                           <Text style={[styles.cardLabel, { marginBottom: 10 }]}>Select Date(s)</Text>
                           <View style={styles.calendarGrid}>
                               {Array.from({ length: 31 }, (_, i) => i + 1).map((date) => {
                                   const isSelected = routine.data.dates?.includes(date);
                                   return (
                                       <TouchableOpacity 
                                           key={date}
                                           style={[styles.miniDateBox, isSelected && styles.dateBoxSelected]}
                                           onPress={() => {
                                               const currentDates = routine.data.dates || [];
                                               const newDates = currentDates.includes(date) ? currentDates.filter(d => d !== date) : [...currentDates, date];
                                               updateRoutineData(index, 'dates', newDates);
                                           }}
                                       >
                                           <Text style={[styles.miniDateText, isSelected && styles.dateTextSelected]}>{date}</Text>
                                       </TouchableOpacity>
                                   );
                               })}
                           </View>
                           <TouchableOpacity onPress={() => updateRoutine(index, { type: null })} style={{marginTop: 20}}>
                              <Text style={{color: '#6B7280', textDecorationLine: 'underline'}}>Change Type</Text>
                          </TouchableOpacity>
                       </View>
                  )}
              </View>
              <TouchableOpacity style={styles.deleteButton} onPress={() => removeRoutine(index)}>
                  <Text style={styles.deleteButtonText}>Delete this routine</Text>
              </TouchableOpacity>
          </View>
      );
  };

  const renderStep0_Choice = () => (
    <View style={styles.stepContainerPadded}>
        <FadeInView delay={100}><Text style={styles.headerTitle}>New:</Text></FadeInView>
        <View style={{ flex: 1, justifyContent: 'center' }}>
            <FadeInView delay={300}>
                <TouchableOpacity style={[styles.selectionButton, { height: 110, justifyContent: 'center' }]} onPress={() => { setCreationType('group'); setStep(1); }}>
                    <Text style={styles.selectionButtonText}>Group</Text>
                    <Text style={styles.selectionButtonSubtext}>Create a recurring schedule with others</Text>
                </TouchableOpacity>
            </FadeInView>
            <FadeInView delay={450}>
                <TouchableOpacity style={[styles.selectionButton, { height: 110, justifyContent: 'center' }]} onPress={() => { setCreationType('event'); setStep(1); }}>
                    <Text style={styles.selectionButtonText}>One-Off Event</Text>
                    <Text style={styles.selectionButtonSubtext}>A single, non-recurring event</Text>
                </TouchableOpacity>
            </FadeInView>
        </View>
    </View>
  );

  const renderStep1_Name = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.stepContainerPadded} keyboardShouldPersistTaps="handled"> 
        <FadeInView delay={100}><Text style={styles.headerTitle}>{creationType === 'event' ? "Meeting Name?" : "What's your Group name?"}</Text></FadeInView>
        <FadeInView delay={300}><View style={styles.imagePlaceholder}><Image source={GroupImage} style={styles.image} resizeMode="cover" /></View></FadeInView>
        <FadeInView delay={500}><TextInput style={styles.textInput} placeholder={creationType === 'event' ? "Meeting title..." : "Group name here"} placeholderTextColor="#999" value={groupName} onChangeText={setGroupName} maxLength={30} /></FadeInView>
        <FadeInView delay={650}>
          <View style={styles.footerNavSpread}>
              <TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity>
              <TouchableOpacity onPress={handleNext} disabled={groupName.trim().length === 0}><Feather name="arrow-right-circle" size={48} color={groupName.trim().length === 0 ? "#D1D5DB" : "#4F46E5"} /></TouchableOpacity>
          </View>
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderStep2_AddMembers = () => {
    const isSearching = searchQuery.length > 0;
    const filteredUsers = (searchResults as UserStub[]) || [];
    return (
      <View style={styles.stepContainerPadded}>
        <View style={{ flex: 1 }}>
          <FadeInView delay={100}><Text style={styles.headerTitle}>{creationType === 'event' ? "Who is invited?" : "Who should be in this group?"}</Text></FadeInView>
          <FadeInView delay={250}>
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.pickerTitle}>Search for members</Text>
              <View style={styles.searchBox}>
                <Feather name="search" size={20} color="#9CA3AF" />
                <TextInput style={styles.searchInput} placeholder="Search users by name..." placeholderTextColor="#9CA3AF" value={searchQuery} onChangeText={setSearchQuery} />
                {isSearchingUsers && <ActivityIndicator size="small" color="#4F46E5" style={{marginRight: 8}} />}
              </View>
            </View>
          </FadeInView>
          <FadeInView delay={400} style={{ flex: 1 }}>
            <View style={{ flex: 1 }}> 
              {isSearching ? (
                <FlatList data={filteredUsers} keyExtractor={(item) => item._id} keyboardShouldPersistTaps="handled" renderItem={({ item }) => (
                    <TouchableOpacity style={styles.resultItem} onPress={() => toggleMember(item)}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Image source={{ uri: item.profilePicture || 'https://placehold.co/100x100/EEE/31343C?text=' + (item.firstName?.[0] || 'U') }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#E0E7FF' }} />
                        <View style={{ marginLeft: 12 }}>
                          <Text style={styles.resultText}>{getDisplayName(item)}</Text>
                          <Text style={styles.resultSubtext}>@{item.username}</Text>
                        </View>
                      </View>
                      {selectedMembers.some(m => m._id === item._id) ? <Feather name="check" size={20} color="#4F46E5" /> : null}
                    </TouchableOpacity>
                  )} />
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View>
                    <Text style={styles.pickerTitle}>Or invite via link</Text>
                    <TouchableOpacity style={styles.shareLinkButton} onPress={() => Share.share({ message: `Join my new ${creationType === 'event' ? 'event' : 'group'} "${groupName}"!` })}>
                      <Feather name="share" size={20} color="#4F46E5" />
                      <Text style={styles.shareLinkText}>Share Invite Link</Text>
                    </TouchableOpacity>
                  </View>
                  {!!selectedMembers.length && (
                    <View style={{ marginTop: 24 }}>
                      <Text style={[styles.pickerTitle, { marginBottom: 8 }]}>Selected ({selectedMembers.length})</Text>
                      <View style={styles.selectedListContainer}>
                        {selectedMembers.map(member => (
                          <View key={member._id} style={styles.selectedRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={styles.avatarPlaceholder}><Text style={styles.avatarText}>{getDisplayInitials(member)}</Text></View>
                                <View style={{ marginLeft: 12 }}>
                                    <Text style={styles.selectedName}>{getDisplayName(member)}</Text>
                                    <Text style={styles.selectedUsername}>@{member.username}</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => toggleMember(member)}><Feather name="trash-2" size={20} color="#EF4444" /></TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </FadeInView>
        </View>
        <FadeInView delay={550}>
          <View style={styles.footerNavSpread}>
            <TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity>
            <TouchableOpacity onPress={handleNext}><Feather name="arrow-right-circle" size={48} color="#4F46E5" /></TouchableOpacity>
          </View>
        </FadeInView>
      </View>
    );
  };

  const renderStep3_Frequency = () => (
    <View style={styles.stepContainerPadded}>
        <FadeInView delay={100}><Text style={styles.headerTitle}>How often will you meet?</Text></FadeInView>
        <View style={{ flex: 1, justifyContent: 'center' }}>
            {['daily', 'weekly', 'biweekly', 'monthly', 'custom'].map((f, idx) => (
                <FadeInView key={f} delay={200 + (idx * 50)}>
                    <TouchableOpacity style={[styles.frequencyButton, frequency === f && styles.frequencyButtonSelected]} onPress={() => setFrequency(f as any)}>
                        <View style={[styles.radioCircle, frequency === f && styles.radioCircleSelected]} />
                        <Text style={[styles.frequencyText, frequency === f && styles.frequencyTextSelected]}>
                            {f === 'biweekly' ? 'Every 2 Weeks' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                    </TouchableOpacity>
                </FadeInView>
            ))}
        </View>
        <FadeInView delay={600}>
            <View style={styles.footerNavSpread}>
                <TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity>
                <TouchableOpacity onPress={handleNext} disabled={!frequency}><Feather name="arrow-right-circle" size={48} color={!frequency ? "#D1D5DB" : "#4F46E5"} /></TouchableOpacity>
            </View>
        </FadeInView>
    </View>
  );

  const renderStep4_Details = () => { 
    if (frequency === 'custom') {
        const canAdd = customRoutines.length < 5;
        return (
            <View style={styles.stepContainer}> 
                <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
                    <FadeInView delay={100}><Text style={styles.headerTitle}>Add up to 5 routines</Text></FadeInView>
                    <FadeInView delay={200}>
                        <View style={styles.paginationRow}>
                            <View style={styles.paginationDotsContainer}>
                                {customRoutines.map((_, i) => (
                                    <View key={i} style={[styles.dot, currentPage === i && styles.activeDot]} />
                                ))}</View>
                            {canAdd && (<TouchableOpacity style={styles.headerAddButton} onPress={addRoutine}><Feather name="plus" size={18} color="#FFF" /></TouchableOpacity>)}
                        </View>
                    </FadeInView>
                </View>
                <FadeInView delay={350} style={{ flex: 1 }}>
                    <View style={{flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} snapToInterval={CARD_WIDTH} snapToAlignment="start" decelerationRate="fast" contentContainerStyle={{ paddingHorizontal: SIDE_INSET }} onMomentumScrollEnd={handleScroll} style={{ flex: 1 }}>
                            {customRoutines.map((routine, index) => renderRoutineCard(routine, index))}
                        </ScrollView>
                    </View>
                </FadeInView>
                <FadeInView delay={500}>
                    <View style={[styles.footerNavSpread, { paddingHorizontal: 24, marginBottom: 24 }]}>
                        <TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity>
                        <TouchableOpacity style={styles.doneButton} onPress={handleNext} disabled={customRoutines.some(r => r.type === null)}><Text style={styles.doneButtonText}>Done</Text></TouchableOpacity>
                    </View>
                </FadeInView>
            </View>
        );
    }

    const isMonthly = frequency === 'monthly';
    const isValid = isMonthly ? selectedDates.length > 0 : dayTimes.length > 0;

    return (
        <View style={styles.stepContainerPadded}>
            <FadeInView delay={100}><Text style={styles.headerTitle}>{isMonthly ? "Which date(s)?" : "Days & Times"}</Text></FadeInView>
            <View style={{ flex: 1 }}>
                <ScrollView showsVerticalScrollIndicator={false}>
                    {isMonthly ? (
                        <View style={styles.calendarGrid}>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map((date) => (
                                <TouchableOpacity key={date} style={[styles.dateBox, selectedDates.includes(date) && styles.dateBoxSelected]} onPress={() => toggleDateSelection(date)}>
                                    <Text style={[styles.dateText, selectedDates.includes(date) && styles.dateTextSelected]}>{date}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : (
                        daysOfWeek.map((day) => {
                            const activeDT = dayTimes.find(dt => dt.day === day.value);
                            const isSelected = !!activeDT;
                            return (
                                <View key={day.value} style={[styles.dayTimeRow, isSelected && styles.dayTimeRowSelected]}>
                                    <TouchableOpacity style={styles.dayToggleBtn} onPress={() => toggleDayAndTime(day.value)}>
                                        <View style={[styles.checkboxCircle, isSelected && styles.checkboxCircleSelected]} />
                                        <Text style={[styles.dayLabelText, isSelected && styles.dayLabelTextSelected]}>{day.label}</Text>
                                    </TouchableOpacity>
                                    {isSelected && (
                                        <View style={styles.dayTimePickerContainer}>
                                            <TimePicker onTimeChange={(t) => updateTimeForDay(day.value, t)} initialValue={activeDT.time} />
                                        </View>
                                    )}
                                </View>
                            );
                        })
                    )}
                </ScrollView>
            </View>
            <FadeInView delay={400}>
                <View style={styles.footerNavSpread}>
                    <TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity>
                    <TouchableOpacity onPress={handleNext} disabled={!isValid}><Feather name="arrow-right-circle" size={48} color={!isValid ? "#D1D5DB" : "#4F46E5"} /></TouchableOpacity>
                </View>
            </FadeInView>
        </View>
    );
  };

  const renderStep5_StartDate = () => (
    <View style={styles.stepContainerPadded}>
        <FadeInView delay={100}><Text style={styles.headerTitle}>When should the schedule begin?</Text></FadeInView>
        <View style={{ flex: 1 }}>
            <View style={styles.calendarContainer}>
                <View style={styles.calendarNav}>
                    <TouchableOpacity onPress={() => changeMonth(-1)}><Feather name="chevron-left" size={24} color="#4F46E5" /></TouchableOpacity>
                    <Text style={styles.calendarMonthText}>{calendarViewMonth.toFormat('LLLL yyyy')}</Text>
                    <TouchableOpacity onPress={() => changeMonth(1)}><Feather name="chevron-right" size={24} color="#4F46E5" /></TouchableOpacity>
                </View>
                <View style={styles.calendarHeaderRow}>{['S','M','T','W','T','F','S'].map(d => <Text key={d} style={styles.calendarHeaderDay}>{d}</Text>)}</View>
                <View style={styles.calendarGridContainer}>{calendarGrid.map((day, idx) => {
                    if (!day) return <View key={`pad-${idx}`} style={styles.calendarDayBox} />;
                    const isSelected = day.toISODate() === kickoffDate;
                    const isToday = day.hasSame(DateTime.now(), 'day');
                    return (
                        <TouchableOpacity key={day.toISODate()} onPress={() => setKickoffDate(day.toISODate()!)} style={[styles.calendarDayBox, isSelected && styles.calendarDayBoxSelected, isToday && !isSelected && styles.calendarDayBoxToday]}>
                            <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, isToday && !isSelected && styles.calendarDayTextToday]}>{day.day}</Text>
                        </TouchableOpacity>
                    );
                })}</View>
            </View>
            <Text style={styles.kickoffHint}>Recurring meetings will start spawning on or after this date.</Text>
        </View>
        <FadeInView delay={500}>
            <View style={styles.footerNavSpread}>
                <TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity>
                <TouchableOpacity onPress={handleNext}><Feather name="arrow-right-circle" size={48} color="#4F46E5" /></TouchableOpacity>
            </View>
        </FadeInView>
    </View>
  );

  const renderStep6_FinalTime = () => (
    <View style={styles.stepContainerPadded}>
        <FadeInView delay={100}><Text style={styles.headerTitle}>Defaults & Timezone</Text></FadeInView>
        <View style={{ flex: 1 }}>
            <Text style={styles.pickerTitle}>Default Meeting Time</Text>
            <TimePicker onTimeChange={setMeetTime} initialValue={meetTime} />
            <Text style={styles.hintCenter}>Used if a day-specific time is not set.</Text>
            <View style={{ height: 32 }} />
            <Text style={styles.pickerTitle}>Select Timezone</Text>
            <View style={styles.pickerWrapper}><Picker selectedValue={timezone} onValueChange={setTimezone} itemStyle={styles.pickerItem}>{usaTimezones.map(tz => <Picker.Item key={tz.value} label={tz.label} value={tz.value} />)}</Picker></View>
        </View>
        <FadeInView delay={600}><View style={styles.footerNavSpread}><TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity><TouchableOpacity onPress={handleNext}><Feather name="arrow-right-circle" size={48} color="#4F46E5" /></TouchableOpacity></View>
        </FadeInView>
    </View>
  );

  const renderStep7_Notifications = () => (
    <View style={styles.stepContainerPadded}>
        <FadeInView delay={100}><Text style={styles.headerTitle}>Notifications</Text></FadeInView>
        <View style={{ flex: 1 }}>
            <Text style={styles.description}>How many days before the meeting should we notify everyone to RSVP?</Text>
            <View style={styles.jitCard}>
                <View style={styles.leadDaysRow}>
                    <TouchableOpacity onPress={() => setLeadDays(Math.max(0, leadDays - 1))} style={styles.stepperBtn}><Feather name="minus" size={24} color="#4F46E5" /></TouchableOpacity>
                    <View style={{ alignItems: 'center', width: 100 }}><Text style={styles.leadVal}>{leadDays}</Text><Text style={styles.leadLabel}>Days</Text></View>
                    <TouchableOpacity onPress={() => setLeadDays(leadDays + 1)} style={styles.stepperBtn}><Feather name="plus" size={24} color="#4F46E5" /></TouchableOpacity>
                </View>
                <View style={styles.divider} />
                <Text style={styles.sectionLabelCenter}>Trigger Time</Text>
                <TimePicker onTimeChange={setNotificationTime} initialValue={notificationTime} />
            </View>
        </View>
        <FadeInView delay={600}><View style={styles.footerNavSpread}><TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity><TouchableOpacity onPress={handleNext}><Feather name="arrow-right-circle" size={48} color="#4F46E5" /></TouchableOpacity></View></FadeInView>
    </View>
  );

  const renderStep8_Location = () => (
    <View style={styles.stepContainerPadded}>
        <FadeInView delay={100}><Text style={styles.headerTitle}>Where are you meeting?</Text></FadeInView>
        <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={styles.searchBox}>
                <Feather name="map-pin" size={20} color="#4F46E5" />
                <TextInput style={styles.searchInput} placeholder="e.g. Starbucks, Zoom Link" placeholderTextColor="#9CA3AF" value={location} onChangeText={setLocation} />
            </View>
        </View>
        <FadeInView delay={600}>
            <View style={styles.footerNavSpread}>
                <TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity>
                <TouchableOpacity style={[styles.createButton, isPending && { opacity: 0.7 }]} onPress={handleCreateRequest} disabled={isPending}>
                    {isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.createButtonText}>Finish</Text>}
                </TouchableOpacity>
            </View>
        </FadeInView>
    </View>
  );

  const renderStep_OneOffDate = () => (
    <View style={styles.stepContainerPadded}>
        <FadeInView delay={100}><Text style={styles.headerTitle}>When is the event?</Text></FadeInView>
        <View style={{ flex: 1 }}>
            <View style={styles.calendarContainer}>
                <View style={styles.calendarNav}>
                    <TouchableOpacity onPress={() => changeMonth(-1)}><Feather name="chevron-left" size={24} color="#4F46E5" /></TouchableOpacity>
                    <Text style={styles.calendarMonthText}>{calendarViewMonth.toFormat('LLLL yyyy')}</Text>
                    <TouchableOpacity onPress={() => changeMonth(1)}><Feather name="chevron-right" size={24} color="#4F46E5" /></TouchableOpacity>
                </View>
                <View style={styles.calendarHeaderRow}>{['S','M','T','W','T','F','S'].map(d => <Text key={d} style={styles.calendarHeaderDay}>{d}</Text>)}</View>
                <View style={styles.calendarGridContainer}>{calendarGrid.map((day, idx) => {
                    if (!day) return <View key={`pad-${idx}`} style={styles.calendarDayBox} />;
                    const isSelected = day.toISODate() === oneOffDate;
                    return (
                        <TouchableOpacity key={day.toISODate()} onPress={() => setOneOffDate(day.toISODate()!)} style={[styles.calendarDayBox, isSelected && styles.calendarDayBoxSelected]}>
                            <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected]}>{day.day}</Text>
                        </TouchableOpacity>
                    );
                })}</View>
            </View>
        </View>
        <FadeInView delay={500}><View style={styles.footerNavSpread}><TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity><TouchableOpacity onPress={handleNext}><Feather name="arrow-right-circle" size={48} color="#4F46E5" /></TouchableOpacity></View></FadeInView>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        {step === 0 && renderStep0_Choice()}
        {step === 1 && renderStep1_Name()}
        {step === 2 && renderStep2_AddMembers()}
        {step === 3 && creationType === 'group' && renderStep3_Frequency()}
        {step === 4 && creationType === 'group' && renderStep4_Details()}
        {step === 5 && creationType === 'group' && renderStep5_StartDate()}
        {step === 6 && creationType === 'group' && renderStep6_FinalTime()}
        {step === 7 && creationType === 'group' && renderStep7_Notifications()}
        {step === 8 && creationType === 'group' && renderStep8_Location()}

        {step === 3 && creationType === 'event' && renderStep_OneOffDate()}
        {step === 4 && creationType === 'event' && renderStep6_FinalTime()}
        {step === 5 && creationType === 'event' && renderStep8_Location()}
        {renderDropdownModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    stepContainer: { flex: 1, justifyContent: 'space-between' },
    stepContainerPadded: { flex: 1, padding: 24 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', textAlign: 'center', marginBottom: 24 },
    imagePlaceholder: { width: '80%', aspectRatio: 16/9, marginVertical: 24, alignSelf: 'center', backgroundColor: '#E5E7EB', borderRadius: 12, overflow: 'hidden' },
    image: { width: '100%', height: '100%' },
    textInput: { width: '100%', padding: 16, borderBottomWidth: 2, borderColor: '#4F46E5', backgroundColor: '#FFFFFF', fontSize: 18, fontWeight: '500' },
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, paddingHorizontal: 16, height: 56 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 16, color: '#374151' },
    resultItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    resultText: { fontSize: 16, fontWeight: '500' },
    resultSubtext: { fontSize: 14, color: '#9CA3AF' },
    shareLinkButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#EEF2FF', borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE' },
    shareLinkText: { color: '#4F46E5', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
    selectedListContainer: { backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
    selectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    selectedName: { fontSize: 16, fontWeight: '500', color: '#1F2937' },
    selectedUsername: { fontSize: 14, color: '#6B7280' },
    avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E0E7FF', alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#4F46E5', fontWeight: 'bold', fontSize: 16 },
    frequencyButton: { flexDirection: 'row', alignItems: 'center', padding: 20, marginBottom: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12 },
    frequencyButtonSelected: { backgroundColor: '#F5F7FF', borderColor: '#4F46E5' },
    frequencyText: { fontSize: 18, color: '#374151', marginLeft: 12 },
    frequencyTextSelected: { color: '#4F46E5', fontWeight: '700' },
    radioCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: '#FFF' },
    radioCircleSelected: { borderColor: '#4F46E5', backgroundColor: '#4F46E5' },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    dateBox: { width: width / 7 - 12, height: width / 7 - 12, justifyContent: 'center', alignItems: 'center', margin: 4, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFF' },
    dateBoxSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
    dateText: { fontSize: 16 },
    dateTextSelected: { color: '#FFF', fontWeight: 'bold' },
    paginationRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    paginationDotsContainer: { flexDirection: 'row', alignItems: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB', marginHorizontal: 4 },
    activeDot: { backgroundColor: '#4F46E5', width: 20 },
    headerAddButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
    cardContainer: { width: CARD_WIDTH, alignItems: 'center', paddingHorizontal: 5 }, 
    card: { width: '100%', height: 400, backgroundColor: 'white', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4, justifyContent: 'center' },
    cardContentCentered: { alignItems: 'center', justifyContent: 'center', width: '100%' },
    cardContent: { alignItems: 'center', width: '100%' },
    cardLabel: { fontSize: 18, fontWeight: '600', color: '#374151', marginVertical: 10 },
    selectionButton: { width: '100%', padding: 16, backgroundColor: '#FFF', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB', elevation: 2 },
    selectionButtonText: { fontSize: 20, fontWeight: 'bold', color: '#1F2937' },
    selectionButtonSubtext: { fontSize: 14, color: '#6B7280', marginTop: 4 },
    dropdownButton: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#F9FAFB', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB' },
    dropdownButtonText: { fontSize: 16, color: '#374151' },
    miniDateBox: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', margin: 3, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFF' },
    miniDateText: { fontSize: 12, color: '#374151' },
    deleteButton: { marginTop: 12, padding: 8 },
    deleteButtonText: { color: '#EF4444', fontSize: 14, fontWeight: '500' },
    doneButton: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#4F46E5', borderRadius: 8 },
    doneButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '80%', maxHeight: '50%', backgroundColor: 'white', borderRadius: 16, padding: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
    modalItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    modalItemText: { fontSize: 18, color: '#374151', textAlign: 'center' },
    footerNavSpread: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
    pickerTitle: { fontSize: 16, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 8, marginTop: 16, textAlign: 'center' },
    finalCardSection: { width: '100%', marginBottom: 24 },
    pickerWrapper: { backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
    pickerItem: { height: 120 },
    createButton: { backgroundColor: '#4F46E5', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, elevation: 3 },
    createButtonText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
    calendarContainer: { backgroundColor: 'white', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB' },
    calendarNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    calendarMonthText: { fontSize: 18, fontWeight: 'bold' },
    calendarHeaderRow: { flexDirection: 'row', marginBottom: 8 },
    calendarHeaderDay: { flex: 1, textAlign: 'center', fontSize: 12, color: '#9CA3AF', fontWeight: 'bold' },
    calendarGridContainer: { flexDirection: 'row', flexWrap: 'wrap' },
    calendarDayBox: { width: (width - 80) / 7, height: 40, alignItems: 'center', justifyContent: 'center' },
    calendarDayBoxSelected: { backgroundColor: '#4F46E5', borderRadius: 20 },
    calendarDayBoxToday: { borderBottomWidth: 2, borderBottomColor: '#4F46E5' },
    calendarDayText: { fontSize: 16 },
    calendarDayTextSelected: { color: 'white', fontWeight: 'bold' },
    calendarDayTextToday: { color: '#4F46E5', fontWeight: 'bold' },
    description: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
    jitCard: { backgroundColor: 'white', borderRadius: 24, padding: 24, borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 12 },
    leadDaysRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    stepperBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F5F7FF', alignItems: 'center', justifyContent: 'center' },
    leadVal: { fontSize: 32, fontWeight: '900', color: '#111827' },
    leadLabel: { fontSize: 10, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase' },
    divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 20 },
    hint: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center', marginTop: 12 },
    hintCenter: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 4 },
    sectionLabelCenter: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 16, textAlign: 'center' },
    dayTimeRow: { backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    dayTimeRowSelected: { borderColor: '#4F46E5', backgroundColor: '#F5F7FF' },
    dayToggleBtn: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    checkboxCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB' },
    checkboxCircleSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
    dayLabelText: { fontSize: 18, marginLeft: 12, fontWeight: '500' },
    dayLabelTextSelected: { color: '#4F46E5', fontWeight: '700' },
    dayTimePickerContainer: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 12 },
    kickoffHint: { fontSize: 13, color: '#6B7280', fontStyle: 'italic', textAlign: 'center', marginTop: 16 },
});

export default CreateGroupScreen;