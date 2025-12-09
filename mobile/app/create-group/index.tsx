import React, { useState, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, Alert, Dimensions, Modal, FlatList, Platform, Share, Keyboard, ActivityIndicator } from "react-native";
import { useCreateGroup } from "@/hooks/useCreateGroup";
import { useSearchUsers } from "@/hooks/useSearchUsers";
import TimePicker from "@/components/TimePicker";
import { Picker } from "@react-native-picker/picker";
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

const GroupImage = require('../../assets/images/group-image.png');
const { width } = Dimensions.get('window');

// Card Math
const CARD_WIDTH = width * 0.90; 
const SIDE_INSET = (width - CARD_WIDTH) / 2; 

// --- Types ---
type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom' | null;

interface CustomRoutine {
    id: string;
    type: 'byDay' | 'byDate' | null; 
    data: {
        occurrence?: string; 
        dayIndex?: number;   
        dates?: number[];    
    };
}

// 👇 UPDATED INTERFACE: Added 'name' as optional to fix TS error
interface UserStub {
    _id: string;
    firstName?: string;
    lastName?: string;
    username: string;
    name?: string; // Added this to prevent the "Property does not exist" error
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

const CreateGroupScreen = () => {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  
  // --- State ---
  const [step, setStep] = useState(1);
  const [groupName, setGroupName] = useState("");
  const [eventsToDisplay, setEventsToDisplay] = useState("1");
  
  // Member Selection State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<UserStub[]>([]);
  
  // Search Hook
  const { data: searchResults, isLoading: isSearchingUsers } = useSearchUsers(searchQuery);

  // Scheduling State
  const [frequency, setFrequency] = useState<Frequency>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]); 
  const [selectedDates, setSelectedDates] = useState<number[]>([]); 
  
  const [customRoutines, setCustomRoutines] = useState<CustomRoutine[]>([
      { id: Date.now().toString(), type: null, data: { occurrence: '1st', dayIndex: 0, dates: [] } }
  ]);
  const [currentPage, setCurrentPage] = useState(0);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState<{ 
      type: 'occurrence' | 'dayIndex', 
      routineIndex: number 
  } | null>(null);

  // Time State
  const [meetTime, setMeetTime] = useState("05:00 PM");
  const [timezone, setTimezone] = useState("America/Denver");
  
  const { mutate, isPending } = useCreateGroup();

  // --- Helpers ---
  const getDisplayName = (user: UserStub) => {
      if (user.firstName) return `${user.firstName} ${user.lastName || ''}`.trim();
      if (user.name) return user.name;
      return user.username;
  };

  const getDisplayInitials = (user: UserStub) => {
      const name = getDisplayName(user);
      return name.charAt(0).toUpperCase();
  };

  // --- Logic ---

  const handleCreateGroup = () => {
    const limit = parseInt(eventsToDisplay);
    if (isNaN(limit) || limit < 1 || limit > 14) {
        Alert.alert("Invalid Input", "Please enter a number between 1 and 14 for displayed events.");
        return;
    }

    let finalSchedule: any = { frequency };

    if (frequency === 'weekly' || frequency === 'biweekly') {
        finalSchedule.days = selectedDays;
    } else if (frequency === 'monthly') {
        finalSchedule.days = selectedDates;
    } else if (frequency === 'daily') {
        finalSchedule.days = [0, 1, 2, 3, 4, 5, 6]; 
    } else if (frequency === 'custom') {
        finalSchedule.days = [0]; 
        finalSchedule.rules = customRoutines.map(r => ({
            type: r.type,
            occurrence: r.type === 'byDay' ? r.data.occurrence : undefined,
            day: r.type === 'byDay' ? r.data.dayIndex : undefined,
            dates: r.type === 'byDate' ? r.data.dates : undefined,
        }));
    }

const memberIds = selectedMembers.map(m => m._id);

    const variables = { 
        name: groupName, 
        time: meetTime, 
        schedule: finalSchedule, 
        timezone,
        eventsToDisplay: limit,
        members: memberIds // 👈 Send to backend
    };

    mutate(variables, {
        onSuccess: () => {
            router.back();
        }
    });
  };

  const handleNext = () => {
    if (step === 3) { 
        if (frequency === 'daily') {
            setStep(5); 
        } else {
            setStep(4); 
        }
    } else {
        setStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (step === 5 && frequency === 'daily') {
        setStep(3); 
    } else {
        setStep(prev => prev - 1);
    }
  };

  const toggleDaySelection = (dayIndex: number) => {
    setSelectedDays(prev => 
        prev.includes(dayIndex) ? prev.filter(d => d !== dayIndex) : [...prev, dayIndex]
    );
  };

  const toggleDateSelection = (date: number) => {
    setSelectedDates(prev => {
        if (prev.includes(date)) return prev.filter(d => d !== date);
        if (prev.length >= 10) {
            Alert.alert("Limit Reached", "You can only select up to 10 dates.");
            return prev;
        }
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

  const handleShareLink = async () => {
      try {
          await Share.share({
              message: `Join my new group "${groupName}" on the app!`,
          });
      } catch (error: any) {
          Alert.alert(error.message);
      }
  };

  const addRoutine = () => {
      if (customRoutines.length >= 5) return;
      const newRoutine: CustomRoutine = { 
          id: Date.now().toString(), type: null, data: { occurrence: '1st', dayIndex: 0, dates: [] } 
      };
      const newRoutines = [...customRoutines, newRoutine];
      setCustomRoutines(newRoutines);
      setTimeout(() => {
          scrollRef.current?.scrollTo({ x: newRoutines.length * CARD_WIDTH, animated: true });
          setCurrentPage(newRoutines.length - 1);
      }, 100);
  };

  const removeRoutine = (index: number) => {
      if (customRoutines.length === 1) {
          updateRoutine(index, { type: null, data: { occurrence: '1st', dayIndex: 0, dates: [] } });
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

  const handleModalSelect = (value: any) => {
      if (modalConfig) {
          updateRoutineData(modalConfig.routineIndex, modalConfig.type, value);
      }
      setModalVisible(false);
      setModalConfig(null);
  };

  const handleScroll = (event: any) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const pageIndex = Math.round(offsetX / CARD_WIDTH);
      setCurrentPage(pageIndex);
  };

  // --- RENDERERS ---

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

  const renderStep1_Name = () => (
    <View style={styles.stepContainerPadded}> 
      <Text style={styles.headerTitle}>What's your Group name?</Text>
      <View style={styles.imagePlaceholder}>
          <Image source={GroupImage} style={styles.image} resizeMode="cover" />
      </View>
      <TextInput
        style={styles.textInput}
        placeholder="Your group name here"
        placeholderTextColor="#999"
        value={groupName}
        onChangeText={setGroupName}
        maxLength={30}
      />
      <View style={styles.footerNavRight}>
          <TouchableOpacity onPress={handleNext} disabled={groupName.trim().length === 0}>
              <Feather name="arrow-right-circle" size={48} color={groupName.trim().length === 0 ? "#D1D5DB" : "#4F46E5"} />
          </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep2_AddMembers = () => {
    const isSearching = searchQuery.length > 0;
    
    // Use real API data
    const filteredUsers = (searchResults as UserStub[]) || [];

    return (
        <View style={styles.stepContainerPadded}>
            <View>
                <Text style={styles.headerTitle}>Who should be in this group?</Text>
                
                {/* SEARCH BOX */}
                <View style={{ marginBottom: 16 }}>
                    <Text style={styles.pickerTitle}>Search for members</Text>
                    <View style={styles.searchBox}>
                        <Feather name="search" size={20} color="#9CA3AF" />
                        <TextInput 
                            style={styles.searchInput}
                            placeholder="Search users by name..."
                            placeholderTextColor="#9CA3AF"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {/* Loading Indicator */}
                        {isSearchingUsers && <ActivityIndicator size="small" color="#4F46E5" style={{marginRight: 8}} />}
                        
                        {/* Clear Button */}
                        {isSearching && (
                            <TouchableOpacity onPress={() => setSearchQuery("")}>
                                <Feather name="x-circle" size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>

            {isSearching ? (
                // SEARCH RESULTS LIST
                <FlatList 
                    data={filteredUsers}
                    keyExtractor={(item) => item._id}
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                    style={{ flex: 1, marginHorizontal: -24 }} 
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 20 }}
                    renderItem={({ item }) => (
                        <TouchableOpacity 
                            style={styles.resultItem} 
                            onPress={() => toggleMember(item)}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Image 
                                    source={{ uri: item.profilePicture || 'https://placehold.co/100x100/EEE/31343C?text=' + (item.firstName?.[0] || 'U') }} 
                                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#E0E7FF' }} 
                                />
                                <View style={{ marginLeft: 12 }}>
                                    {/* 👇 UPDATED: Safe display name logic */}
                                    <Text style={styles.resultText}>{getDisplayName(item)}</Text>
                                    <Text style={styles.resultSubtext}>@{item.username}</Text>
                                </View>
                            </View>
                            {selectedMembers.some(m => m._id === item._id) && (
                                <Feather name="check" size={20} color="#4F46E5" />
                            )}
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        !isSearchingUsers ? (
                            <View style={{ padding: 20, alignItems: 'center' }}>
                                <Text style={{ color: '#9CA3AF' }}>No users found matching "{searchQuery}"</Text>
                            </View>
                        ) : null
                    }
                />
            ) : (
                // NORMAL CONTENT (Share Link + Selected List)
                <View style={{ flex: 1 }}>
                    <View>
                        <Text style={styles.pickerTitle}>Or invite via link</Text>
                        <TouchableOpacity style={styles.shareLinkButton} onPress={handleShareLink}>
                            <Feather name="share" size={20} color="#4F46E5" />
                            <Text style={styles.shareLinkText}>Share Invite Link</Text>
                        </TouchableOpacity>
                    </View>

                    {/* SELECTED MEMBERS LIST */}
                    <View style={{ flex: 1, marginTop: 24 }}>
                        {selectedMembers.length > 0 && (
                            <>
                                <Text style={[styles.pickerTitle, { marginBottom: 8 }]}>Selected Members ({selectedMembers.length})</Text>
                                <ScrollView style={styles.selectedListContainer}>
                                    {selectedMembers.map(member => (
                                        <View key={member._id} style={styles.selectedRow}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <Image 
                                                    source={{ uri: member.profilePicture || 'https://placehold.co/100x100/EEE/31343C?text=' + (member.firstName?.[0] || 'U') }} 
                                                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#E0E7FF' }}
                                                />
                                                <View style={{ marginLeft: 12 }}>
                                                    {/* 👇 UPDATED: Safe display name logic */}
                                                    <Text style={styles.selectedName}>{getDisplayName(member)}</Text>
                                                    <Text style={styles.selectedUsername}>@{member.username}</Text>
                                                </View>
                                            </View>
                                            <TouchableOpacity onPress={() => toggleMember(member)}>
                                                <Feather name="trash-2" size={20} color="#EF4444" />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </ScrollView>
                            </>
                        )}
                    </View>
                </View>
            )}

            {/* Footer Navigation */}
            <View style={styles.footerNavSpread}>
                <TouchableOpacity onPress={handleBack}>
                    <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleNext}>
                    <Feather name="arrow-right-circle" size={48} color="#4F46E5" />
                </TouchableOpacity>
            </View>
        </View>
    );
  };

  const renderStep3_Frequency = () => { 
    const options: { label: string, value: Frequency }[] = [
        { label: "Daily", value: 'daily' },
        { label: "Weekly", value: 'weekly' },
        { label: "Every 2 Weeks", value: 'biweekly' },
        { label: "Monthly", value: 'monthly' },
        { label: "Custom", value: 'custom' },
    ];

    return (
        <View style={styles.stepContainerPadded}>
            <Text style={styles.headerTitle}>How often will you meet?</Text>
            <View style={{ flex: 1, justifyContent: 'center' }}>
                {options.map((option) => {
                    const isSelected = frequency === option.value;
                    return (
                        <TouchableOpacity 
                            key={option.value}
                            style={[styles.frequencyButton, isSelected && styles.frequencyButtonSelected]}
                            onPress={() => setFrequency(option.value)}
                        >
                            <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]} />
                            <Text style={[styles.frequencyText, isSelected && styles.frequencyTextSelected]}>
                                {option.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            <View style={styles.footerNavSpread}>
                <TouchableOpacity onPress={handleBack}>
                    <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleNext} disabled={!frequency}>
                    <Feather name="arrow-right-circle" size={48} color={!frequency ? "#D1D5DB" : "#4F46E5"} />
                </TouchableOpacity>
            </View>
        </View>
    );
  };

  const renderStep4_Details = () => { 
    if (frequency === 'custom') {
        const canAdd = customRoutines.length < 5;
        return (
            <View style={styles.stepContainer}> 
                <View style={{ paddingHorizontal: 24 }}>
                    <Text style={styles.headerTitle}>Add up to 5 routines</Text>
                    <View style={styles.paginationRow}>
                        <View style={styles.paginationDotsContainer}>
                            {customRoutines.map((_, i) => (
                                <View key={i} style={[styles.dot, currentPage === i && styles.activeDot]} />
                            ))}
                        </View>
                        {canAdd && (
                            <TouchableOpacity style={styles.headerAddButton} onPress={addRoutine}>
                                <Feather name="plus" size={18} color="#FFF" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <View style={{flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <ScrollView 
                        ref={scrollRef}
                        horizontal 
                        showsHorizontalScrollIndicator={false}
                        snapToInterval={CARD_WIDTH} 
                        snapToAlignment="start"
                        decelerationRate="fast" 
                        contentContainerStyle={{ paddingHorizontal: SIDE_INSET }}
                        onMomentumScrollEnd={handleScroll}
                        style={{ flex: 1 }}
                    >
                        {customRoutines.map((routine, index) => renderRoutineCard(routine, index))}
                    </ScrollView>
                </View>

                <View style={[styles.footerNavSpread, { paddingHorizontal: 24 }]}>
                    <TouchableOpacity onPress={handleBack}>
                        <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={styles.doneButton}
                        onPress={handleNext}
                        disabled={customRoutines.some(r => r.type === null)}
                    >
                        <Text style={styles.doneButtonText}>Done</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const isMonthly = frequency === 'monthly';
    const isValid = isMonthly ? selectedDates.length > 0 : selectedDays.length > 0;

    return (
        <View style={styles.stepContainerPadded}>
            <Text style={styles.headerTitle}>
                {isMonthly ? "Which day(s) will you meet?" : "Which day(s) will you meet?"}
            </Text>
            
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
                {isMonthly ? (
                    <View style={styles.calendarGrid}>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((date) => {
                            const isSelected = selectedDates.includes(date);
                            return (
                                <TouchableOpacity 
                                    key={date}
                                    style={[styles.dateBox, isSelected && styles.dateBoxSelected]}
                                    onPress={() => toggleDateSelection(date)}
                                >
                                    <Text style={[styles.dateText, isSelected && styles.dateTextSelected]}>{date}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ) : (
                    <View>
                        {daysOfWeek.map((day) => {
                            const isSelected = selectedDays.includes(day.value);
                            return (
                                <TouchableOpacity 
                                    key={day.value}
                                    style={[styles.frequencyButton, isSelected && styles.frequencyButtonSelected]}
                                    onPress={() => toggleDaySelection(day.value)}
                                >
                                    <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]} />
                                    <Text style={[styles.frequencyText, isSelected && styles.frequencyTextSelected]}>
                                        {day.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </ScrollView>

            <View style={styles.footerNavSpread}>
                <TouchableOpacity onPress={handleBack}>
                    <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleNext} disabled={!isValid}>
                    <Feather name="arrow-right-circle" size={48} color={!isValid ? "#D1D5DB" : "#4F46E5"} />
                </TouchableOpacity>
            </View>
        </View>
    );
  };

  const renderStep5_Time = () => (
    <View style={styles.stepContainerPadded}>
        <Text style={styles.headerTitle}>Choose a time & details</Text>
        <TimePicker onTimeChange={setMeetTime} initialValue={meetTime} />
        <View style={styles.timezoneContainer}>
            <Text style={styles.pickerTitle}>Select Timezone</Text>
            <View style={styles.pickerWrapper}>
                <Picker selectedValue={timezone} onValueChange={setTimezone} itemStyle={styles.pickerItem}>
                    {usaTimezones.map(tz => <Picker.Item key={tz.value} label={tz.label} value={tz.value} />)}
                </Picker>
            </View>
        </View>

        <View style={{ marginBottom: 20 }}>
            <Text style={styles.pickerTitle}>How many upcoming events to display?</Text>
            <Text style={{ textAlign: 'center', color: '#6B7280', marginBottom: 8 }}>(Enter 1 - 14)</Text>
            <TextInput
                style={{ 
                    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, 
                    backgroundColor: 'white', fontSize: 18, textAlign: 'center' 
                }}
                keyboardType="number-pad"
                value={eventsToDisplay}
                onChangeText={setEventsToDisplay}
                maxLength={2}
            />
        </View>

        <View style={styles.footerNavSpread}>
            <TouchableOpacity onPress={handleBack}>
                <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.createButton, isPending && { backgroundColor: '#A5B4FC' }]}
                onPress={handleCreateGroup}
                disabled={isPending}
            >
                <Text style={styles.createButtonText}>{isPending ? "Creating..." : "Create Group"}</Text>
            </TouchableOpacity>
        </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <View style={{ flex: 1 }}>
            {step === 1 && renderStep1_Name()}
            {step === 2 && renderStep2_AddMembers()}
            {step === 3 && renderStep3_Frequency()}
            {step === 4 && renderStep4_Details()}
            {step === 5 && renderStep5_Time()}
        </View>
        {renderDropdownModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    stepContainer: { flex: 1, justifyContent: 'space-between' },
    stepContainerPadded: { flex: 1, justifyContent: 'space-between', padding: 24 },
    
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', textAlign: 'center', marginBottom: 24 },
    imagePlaceholder: { width: '80%', aspectRatio: 16/9, marginVertical: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
    image: { width: '100%', height: '100%', borderRadius: 8 },
    textInput: { width: '100%', padding: 16, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, backgroundColor: '#FFFFFF', fontSize: 16 },
    
    // Member Selection Styles
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 16, height: 50 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 16, color: '#374151' },
    
    resultItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    resultText: { fontSize: 16, color: '#374151', fontWeight: '500' },
    resultSubtext: { fontSize: 14, color: '#9CA3AF' },

    shareLinkButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#EEF2FF', borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE' },
    shareLinkText: { color: '#4F46E5', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },

    // Selected List Styles
    selectedListContainer: { flex: 1, backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
    selectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    selectedName: { fontSize: 16, fontWeight: '500', color: '#1F2937' },
    selectedUsername: { fontSize: 14, color: '#6B7280' },
    avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E0E7FF', alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#4F46E5', fontWeight: 'bold', fontSize: 16 },

    // Frequency Button Styles
    frequencyButton: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8 },
    frequencyButtonSelected: { backgroundColor: '#E0E7FF', borderColor: '#4F46E5' },
    frequencyText: { fontSize: 18, color: '#374151', marginLeft: 12 },
    frequencyTextSelected: { color: '#4F46E5', fontWeight: '600' },
    radioCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: '#FFF' },
    radioCircleSelected: { borderColor: '#4F46E5', backgroundColor: '#4F46E5' },

    // Calendar Styles
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    dateBox: { width: width / 7 - 12, height: width / 7 - 12, justifyContent: 'center', alignItems: 'center', margin: 4, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFF' },
    dateBoxSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
    dateText: { fontSize: 16, color: '#374151' },
    dateTextSelected: { color: '#FFF', fontWeight: 'bold' },

    // Custom Routine Styles
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
    
    selectionButton: { width: '100%', padding: 16, backgroundColor: '#F3F4F6', borderRadius: 12, marginBottom: 16, alignItems: 'center', borderBottomWidth: 1, borderColor: '#E5E7EB' },
    selectionButtonText: { fontSize: 18, fontWeight: 'bold', color: '#4F46E5', marginBottom: 4 },
    selectionButtonSubtext: { fontSize: 14, color: '#6B7280' },

    dropdownButton: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#F9FAFB', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB' },
    dropdownButtonText: { fontSize: 16, color: '#374151' },
    
    miniDateBox: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', margin: 3, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFF' },
    miniDateText: { fontSize: 12, color: '#374151' },

    deleteButton: { marginTop: 12, padding: 8 },
    deleteButtonText: { color: '#EF4444', fontSize: 14, fontWeight: '500' },
    
    doneButton: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#4F46E5', borderRadius: 8 },
    doneButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '80%', maxHeight: '50%', backgroundColor: 'white', borderRadius: 16, padding: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
    modalItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    modalItemText: { fontSize: 18, color: '#374151', textAlign: 'center' },

    footerNavRight: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', marginTop: 24 },
    footerNavSpread: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
    
    pickerTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 8, textAlign: 'center' },
    timezoneContainer: { width: '100%', marginVertical: 16 },
    pickerWrapper: { backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', overflow: 'hidden' },
    pickerItem: { color: 'black', fontSize: 18, height: 120 },
    createButton: { paddingVertical: 16, paddingHorizontal: 32, borderRadius: 8, alignItems: 'center', backgroundColor: '#4F46E5', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1.41, elevation: 2 },
    createButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
});

export default CreateGroupScreen;