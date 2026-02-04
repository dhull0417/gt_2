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
    StyleProp,
    LayoutChangeEvent
} from "react-native";
import { useCreateGroup } from "../../hooks/useCreateGroup";
import { useSearchUsers } from "../../hooks/useSearchUsers";
import TimePicker from "../../components/TimePicker";
import { Picker } from "@react-native-picker/picker";
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { DateTime } from "luxon";
import { useApiClient, Frequency, DayTime, Routine, User } from "../../utils/api";

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.90; 

// Fallback high-quality image for the creation flow
const GroupImage = { uri: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1000' };

type CreationType = 'group' | 'event' | null;

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
    { label: "S", value: 0 }, { label: "M", value: 1 }, { label: "T", value: 2 },
    { label: "W", value: 3 }, { label: "T", value: 4 }, { label: "F", value: 5 }, { label: "S", value: 6 },
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
  const { initialType } = useLocalSearchParams<{ initialType?: string }>();
  
  // --- Flow State ---
  const [step, setStep] = useState(0); 
  const [creationType, setCreationType] = useState<CreationType>(null);
  
  // --- Group Identity ---
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<UserStub[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { data: searchResults, isLoading: isSearchingUsers } = useSearchUsers(searchQuery);

  // --- Multi-Routine Logic ---
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isMultipleMode, setIsMultipleMode] = useState(false);

  // Active builder states
  const [currentFreq, setCurrentFreq] = useState<Frequency | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedDates, setSelectedDates] = useState<number[]>([]);
  const [isSameTime, setIsSameTime] = useState<boolean | null>(null);
  const [ordinalOccurrence, setOrdinalOccurrence] = useState('1st');
  const [ordinalDay, setOrdinalDay] = useState(1);
  
  const [loopIndex, setLoopIndex] = useState(0); 
  const [tempTime, setTempTime] = useState("05:00 PM");
  const [tempDayTimes, setTempDayTimes] = useState<DayTime[]>([]);
  const [currentTZ, setCurrentTZ] = useState("America/Denver");

  // Global Schedule Settings
  const [kickoffDate, setKickoffDate] = useState<string>(DateTime.now().toISODate()!);
  const [location, setLocation] = useState("");
  const [leadDays, setLeadDays] = useState(2);
  const [notificationTime, setNotificationTime] = useState("09:00 AM");

  const { mutate, isPending } = useCreateGroup();

  // FIXED CALENDAR LAYOUT LOGIC
  const [calculatedDayWidth, setCalculatedDayWidth] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState<DateTime>(DateTime.now().startOf('month'));
  
  const calendarGrid = useMemo(() => {
    const start = calendarMonth.startOf('month');
    const firstDayIdx = start.weekday === 7 ? 0 : start.weekday;
    const days: (DateTime | null)[] = [];
    for (let i = 0; i < firstDayIdx; i++) days.push(null);
    for (let i = 1; i <= calendarMonth.endOf('month').day; i++) {
        days.push(calendarMonth.set({ day: i }));
    }
    return days;
  }, [calendarMonth]);

  const onCalendarContainerLayout = (event: LayoutChangeEvent) => {
      const { width: measuredWidth } = event.nativeEvent.layout;
      // Safety margin -0.5 prevents Saturday wrap due to rounding
      setCalculatedDayWidth((measuredWidth / 7) - 0.5);
  };

  const getTargets = () => {
    if (currentFreq === 'daily') return [0,1,2,3,4,5,6];
    if (currentFreq === 'weekly' || currentFreq === 'biweekly') return [...selectedDays].sort((a,b) => a-b);
    if (currentFreq === 'monthly') return [...selectedDates].sort((a,b) => a-b);
    if (currentFreq === 'ordinal') return [ordinalDay];
    return [];
  };

  const handleCreateRequest = () => {
    const payload: any = {
        name: groupName,
        timezone: currentTZ,
        members: selectedMembers.map(m => m._id),
        generationLeadDays: leadDays,
        generationLeadTime: notificationTime,
        eventsToDisplay: 1,
        defaultLocation: location
    };

    if (routines.length > 0) {
        payload.schedule = {
            frequency: isMultipleMode ? 'custom' : routines[0].frequency,
            startDate: kickoffDate,
            routines: routines
        };
    }

    mutate(payload, { 
        onSuccess: () => {
            Alert.alert("Success", "Group created!");
            router.replace('/(tabs)/groups'); 
        }
    });
  };

  const handleFinishRoutine = (finalDayTimes: DayTime[]) => {
      const routine: Routine = {
          frequency: currentFreq!,
          dayTimes: finalDayTimes,
          rules: currentFreq === 'ordinal' ? [{ 
              type: 'byDay', 
              occurrence: ordinalOccurrence as any, 
              day: ordinalDay 
          }] : undefined
      };
      
      const newRoutines = isMultipleMode ? [...routines, routine] : [routine];
      setRoutines(newRoutines);
      
      setTempDayTimes([]);
      setLoopIndex(0);
      setSelectedDays([]);
      setSelectedDates([]);
      setCurrentFreq(null);
      setIsSameTime(null);
      setTempTime("05:00 PM");

      if (isMultipleMode && newRoutines.length < 5) {
          setStep(11); 
      } else {
          setStep(9); 
      }
  };

  const handleNext = () => {
    if (step === 1 && groupName.trim() === "") return;
    
    if (step === 4) {
        if (currentFreq === 'custom') { 
            setIsMultipleMode(true); 
            setCurrentFreq(null); 
            return; 
        } 
        if (currentFreq === 'daily') return setStep(5);
        if (currentFreq === 'weekly' || currentFreq === 'biweekly') return setStep(7);
        if (currentFreq === 'monthly') return setStep(8);
        if (currentFreq === 'ordinal') return setStep(10);
    }

    if (step === 7) {
        if (selectedDays.length === 1) { setIsSameTime(true); return setStep(6); }
        return setStep(5);
    }

    if (step === 8) {
        if (selectedDates.length === 0) return Alert.alert("Required", "Select at least one date.");
        if (selectedDates.length === 1) { setIsSameTime(true); return setStep(6); }
        return setStep(5);
    }

    if (step === 10) {
        setIsSameTime(true); 
        setStep(6);
        return;
    }

    if (step === 6) {
        const targets = getTargets();

        if (isSameTime) {
            const entries: DayTime[] = targets.map(val => (
                currentFreq === 'monthly' ? { date: val, time: tempTime } : { day: val, time: tempTime }
            ));
            return handleFinishRoutine(entries);
        } else {
            const val = targets[loopIndex];
            const currentEntry = currentFreq === 'monthly' ? { date: val, time: tempTime } : { day: val, time: tempTime };
            const updatedTempList = [...tempDayTimes, currentEntry as DayTime];

            if (loopIndex < targets.length - 1) {
                setTempDayTimes(updatedTempList);
                setLoopIndex(loopIndex + 1);
            } else {
                handleFinishRoutine(updatedTempList);
            }
            return;
        }
    }

    setStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (step === 0) return router.back();
    if (step === 6 && !isSameTime && loopIndex > 0) {
        setLoopIndex(loopIndex - 1);
        setTempDayTimes(prev => prev.slice(0, -1));
        return;
    }
    if (step === 11) {
        setRoutines(prev => prev.slice(0, -1));
        return setStep(6);
    }
    if (step === 9) {
        if (isMultipleMode) return setStep(11);
        return setStep(6);
    }
    if (step === 15 || step === 14) return setStep(13);
    setStep(prev => prev - 1);
  };

  const handleClose = () => {
    router.replace('/(tabs)/groups');
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

  const handleShareInvite = async () => {
      try {
          await Share.share({
              message: `Join my group "${groupName}" on the app! Sign up here: https://yourapplink.com`,
          });
      } catch (error) {
          console.error("Share error:", error);
      }
  };

  // --- Step Renders ---

  const renderStep2_Invite = () => (
      <View style={styles.stepContainerPadded}>
          <FadeInView delay={100}><Text style={styles.headerTitle}>Invite members</Text></FadeInView>
          
          <FadeInView delay={200}>
              <View style={styles.searchBox}>
                  <Feather name="search" size={20} color="#9CA3AF" />
                  <TextInput 
                    style={styles.searchInput} 
                    placeholder="Search by username..." 
                    value={searchQuery} 
                    onChangeText={setSearchQuery} 
                    autoCapitalize="none"
                  />
              </View>
          </FadeInView>

          {selectedMembers.length > 0 && (
              <View style={styles.selectedMembersContainer}>
                  <Text style={styles.sectionLabel}>Currently Invited ({selectedMembers.length})</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedScroll}>
                      {selectedMembers.map((member) => (
                          <TouchableOpacity 
                            key={member._id} 
                            style={styles.selectedMemberChip}
                            onPress={() => toggleMember(member)}
                          >
                              <Text style={styles.selectedMemberText}>@{member.username}</Text>
                              <Feather name="x-circle" size={14} color="#6B7280" style={{ marginLeft: 6 }} />
                          </TouchableOpacity>
                      ))}
                  </ScrollView>
              </View>
          )}

          <View style={{ flex: 1 }}>
              {isSearchingUsers ? (
                  <ActivityIndicator size="small" color="#4F46E5" style={{ marginTop: 20 }} />
              ) : (
                  <FlatList 
                    data={searchResults || []} 
                    keyExtractor={item=>item._id} 
                    renderItem={({item})=>(
                        <TouchableOpacity style={styles.resultRow} onPress={()=>toggleMember(item)}>
                            <Text style={styles.resultText}>@{item.username}</Text>
                            {selectedMembers.some(m=>m._id===item._id) && <Feather name="check-circle" size={24} color="#4F46E5" />}
                        </TouchableOpacity>
                    )}
                  />
              )}
          </View>

          <TouchableOpacity style={styles.shareLinkBtn} onPress={handleShareInvite}>
              <Feather name="share-2" size={20} color="#4F46E5" />
              <Text style={styles.shareLinkText}>Share Invite Link</Text>
          </TouchableOpacity>

          <View style={styles.footerNavSpread}>
              <TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity>
              <TouchableOpacity onPress={handleNext}><Feather name="arrow-right-circle" size={48} color="#4F46E5" /></TouchableOpacity>
          </View>
      </View>
  );

  const renderStep4_Frequency = () => {
      const isLoop = isMultipleMode && routines.length > 0;
      const heading = isLoop ? `Routine ${routines.length + 1}` : (isMultipleMode ? "First Routine" : "How often will you meet?");
      return (
          <View style={styles.stepContainerPadded}>
              <FadeInView delay={100}><Text style={styles.headerTitle}>{heading}</Text></FadeInView>
              <View style={{ flex: 1, justifyContent: 'center' }}>
                  {['daily', 'weekly', 'biweekly', 'monthly', 'ordinal', 'custom'].map((f) => {
                      if (isMultipleMode && f === 'custom') return null;
                      return (
                          <TouchableOpacity key={f} style={[styles.frequencyButton, currentFreq === f && styles.frequencyButtonSelected]} onPress={() => setCurrentFreq(f as any)}>
                              <View style={[styles.radioCircle, currentFreq === f && styles.radioCircleSelected]} />
                              <View style={{ marginLeft: 12 }}>
                                  <Text style={styles.frequencyText}>{f === 'custom' ? 'Multiple Rules' : f.charAt(0).toUpperCase() + f.slice(1)}</Text>
                                  {f === 'ordinal' && <Text style={styles.frequencySub}>Ex: 2nd Wednesday, Last Saturday</Text>}
                              </View>
                          </TouchableOpacity>
                      );
                  })}
              </View>
              <View style={styles.footerNavSpread}>
                  <TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity>
                  <TouchableOpacity onPress={handleNext} disabled={!currentFreq}><Feather name="arrow-right-circle" size={48} color={!currentFreq ? "#D1D5DB" : "#4F46E5"} /></TouchableOpacity>
              </View>
          </View>
      );
  };

  const renderStep6_TimeSelection = () => {
      const targets = getTargets();
      const val = targets[loopIndex];
      let heading = "Meeting time";
      if (!isSameTime) {
          if (currentFreq === 'monthly') {
              const sfx = val === 1 ? 'st' : val === 2 ? 'nd' : val === 3 ? 'rd' : 'th';
              heading = `Time for the ${val}${sfx}`;
          } else {
              const dayData = daysOfWeek.find(d => d.value === val);
              heading = `Time for ${dayData?.label === "S" ? (val === 0 ? "Sunday" : "Saturday") : dayData?.label}`;
          }
      }

      return (
          <View style={styles.stepContainerPadded}>
              <FadeInView delay={100}><Text style={styles.headerTitle}>{heading}</Text></FadeInView>
              {!isSameTime && targets.length > 1 && (
                  <Text style={styles.loopProgress}>Entry {loopIndex + 1} of {targets.length}</Text>
              )}
              <View style={{ flex: 1, paddingTop: 20 }}>
                  <Text style={styles.pickerTitle}>Select Time</Text>
                  <TimePicker onTimeChange={setTempTime} initialValue={tempTime} />
                  <View style={{ height: 40 }} />
                  <Text style={styles.pickerTitle}>Timezone</Text>
                  <View style={styles.pickerWrapper}>
                      <Picker 
                        selectedValue={currentTZ} 
                        onValueChange={(itemValue: string) => setCurrentTZ(itemValue)} 
                        itemStyle={styles.pickerItem}
                      >
                          {usaTimezones.map(tz=><Picker.Item key={tz.value} label={tz.label} value={tz.value} color="#111827"/>)}
                      </Picker>
                  </View>
              </View>
              <View style={styles.footerNavSpread}>
                  <TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity>
                  <TouchableOpacity onPress={handleNext}><Feather name="arrow-right-circle" size={48} color="#4F46E5" /></TouchableOpacity>
              </View>
          </View>
      );
  };

  const renderStep15_Summary = () => (
      <View style={styles.stepContainerPadded}>
          <FadeInView delay={100}><Text style={styles.headerTitle}>Review</Text></FadeInView>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Group Name</Text>
                  <Text style={styles.summaryVal}>{groupName}</Text>

                  <Text style={styles.summaryLabel}>Effective Date</Text>
                  <Text style={styles.summaryVal}>{DateTime.fromISO(kickoffDate).toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)}</Text>

                  <Text style={styles.summaryLabel}>Schedules</Text>
                  {routines.map((r, i) => (
                      <View key={i} style={styles.routineSummaryBox}>
                          <Text style={styles.routineSummaryType}>{r.frequency.toUpperCase()}</Text>
                          {r.dayTimes.map((dt, dti) => {
                              let label = "";
                              if (r.frequency === 'ordinal' && r.rules?.[0]) {
                                  const dayData = daysOfWeek.find(d => d.value === r.rules![0].day);
                                  const dayName = dayData?.label === "S" ? (dayData.value === 0 ? "Sunday" : "Saturday") : dayData?.label;
                                  label = `${r.rules[0].occurrence} ${dayName}`;
                              } else {
                                  const dayData = daysOfWeek.find(d => d.value === dt.day);
                                  const dayName = dayData?.label === "S" ? (dayData.value === 0 ? "Sunday" : "Saturday") : dayData?.label;
                                  label = dt.date ? `The ${dt.date}${dt.date === 1 ? 'st' : dt.date === 2 ? 'nd' : dt.date === 3 ? 'rd' : 'th'}` : dayName || "";
                              }
                              return <Text key={dti} style={styles.summaryValSmall}>• {label} @ {dt.time}</Text>
                          })}
                      </View>
                  ))}

                  <Text style={styles.summaryLabel}>JIT Notifications</Text>
                  <Text style={styles.summaryValSmall}>{leadDays} days lead @ {notificationTime}</Text>

                  <Text style={styles.summaryLabel}>Location</Text>
                  <Text style={styles.summaryVal}>{location || "Not specified"}</Text>
              </View>
          </ScrollView>
          <View style={styles.footerNavSpread}>
              <TouchableOpacity onPress={handleBack}><Feather name="arrow-left" size={32} color="#6B7280" /></TouchableOpacity>
              <TouchableOpacity style={styles.finishBtn} onPress={handleCreateRequest} disabled={isPending}>
                  {isPending ? <ActivityIndicator color="white" /> : <Text style={styles.finishBtnText}>Confirm</Text>}
              </TouchableOpacity>
          </View>
      </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            {/* Header: Fixed X button for all creation steps */}
            <View style={styles.screenHeader}>
                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                    <Feather name="x" size={28} color="#374151" />
                </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
                {step === 0 && (
                    <View style={styles.stepContainerPadded}>
                        <Text style={styles.headerTitle}>New:</Text>
                        <View style={styles.centeredContent}>
                            <TouchableOpacity style={styles.selectionButton} onPress={() => { setCreationType('group'); handleNext(); }}>
                                <Text style={styles.selectionButtonText}>Group</Text>
                                <Text style={styles.selectionButtonSubtext}>Recurring schedule with members</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.selectionButton} onPress={() => { setCreationType('event'); handleNext(); }}>
                                <Text style={styles.selectionButtonText}>Event</Text>
                                <Text style={styles.selectionButtonSubtext}>Single instance override</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
                {step === 1 && (
                    <View style={styles.stepContainerPadded}>
                        <Text style={styles.headerTitle}>Name your group</Text>
                        <View style={styles.imagePlaceholder}><Image source={GroupImage} style={styles.image} resizeMode="cover" /></View>
                        <TextInput style={styles.textInput} placeholder="The coolest group..." value={groupName} onChangeText={setGroupName} />
                        <View style={styles.footerNavSpread}>
                            <TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity>
                            <TouchableOpacity onPress={handleNext} disabled={!groupName}><Feather name="arrow-right-circle" size={48} color={!groupName ? '#CCC' : '#4F46E5'} /></TouchableOpacity>
                        </View>
                    </View>
                )}
                
                {step === 2 && renderStep2_Invite()}

                {step === 3 && (
                    <View style={styles.stepContainerPadded}>
                        <Text style={styles.headerTitle}>Define schedule now?</Text>
                        <View style={styles.centeredContent}>
                            <TouchableOpacity style={styles.choiceBtn} onPress={()=>setStep(4)}><Text style={styles.choiceBtnText}>Yes</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.choiceBtnOutline} onPress={handleCreateRequest}><Text style={styles.choiceBtnTextOutline}>No</Text></TouchableOpacity>
                        </View>
                        <View style={styles.footerNavSpread}><TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity></View>
                    </View>
                )}

                {step === 4 && renderStep4_Frequency()}
                
                {step === 5 && (
                    <View style={styles.stepContainerPadded}>
                        <Text style={styles.headerTitle}>Same time for all days?</Text>
                        <View style={styles.centeredContent}>
                            <TouchableOpacity style={styles.choiceBtn} onPress={()=>{setIsSameTime(true); setStep(6);}}><Text style={styles.choiceBtnText}>Yes</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.choiceBtnOutline} onPress={()=>{setIsSameTime(false); setStep(6);}}><Text style={styles.choiceBtnTextOutline}>No</Text></TouchableOpacity>
                        </View>
                        <View style={styles.footerNavSpread}><TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity></View>
                    </View>
                )}

                {step === 6 && renderStep6_TimeSelection()}

                {step === 7 && (
                    <View style={styles.stepContainerPadded}>
                        <Text style={styles.headerTitle}>Select weekdays</Text>
                        <View style={{flex: 1, justifyContent: 'center'}}>{daysOfWeek.map(d=>(
                            <TouchableOpacity key={d.value} style={[styles.frequencyButton, selectedDays.includes(d.value)&&styles.frequencyButtonSelected]} onPress={()=>setSelectedDays((prev: number[])=>prev.includes(d.value)?prev.filter(x=>x!==d.value):[...prev,d.value])}><View style={[styles.checkboxCircle, selectedDays.includes(d.value)&&styles.checkboxCircleSelected]}>{selectedDays.includes(d.value)&&<Feather name="check" size={14} color="white"/>}</View><Text style={styles.frequencyText}>{d.label === "S" ? (d.value === 0 ? "Sunday" : "Saturday") : d.label}</Text></TouchableOpacity>
                        ))}</View>
                        <View style={styles.footerNavSpread}><TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity><TouchableOpacity onPress={handleNext} disabled={!selectedDays.length}><Feather name="arrow-right-circle" size={48} color={!selectedDays.length?'#CCC':'#4F46E5'} /></TouchableOpacity></View>
                    </View>
                )}

                {step === 8 && (
                    <View style={styles.stepContainerPadded}>
                        <Text style={styles.headerTitle}>Choose dates</Text>
                        <View style={styles.dateGrid}>{Array.from({length:31}, (_,i)=>i+1).map(d=>(
                            <TouchableOpacity key={d} style={[styles.dateBox, selectedDates.includes(d)&&styles.dateBoxSelected]} onPress={()=>setSelectedDates((prev: number[])=>prev.includes(d)?prev.filter(x=>x!==d):[...prev,d])}><Text style={[styles.dateText, selectedDates.includes(d)&&styles.dateTextSelected]}>{d}</Text></TouchableOpacity>
                        ))}</View>
                        <View style={styles.footerNavSpread}><TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity><TouchableOpacity onPress={handleNext} disabled={!selectedDates.length}><Feather name="arrow-right-circle" size={48} color={!selectedDates.length?'#CCC':'#4F46E5'} /></TouchableOpacity></View>
                    </View>
                )}

                {step === 9 && (
                    <View style={styles.stepContainerPadded}>
                        <Text style={styles.headerTitle}>When to start?</Text>
                        {/* FIXED CALENDAR: Measurement fixed Saturday layout drift */}
                        <View style={styles.calendarContainer} onLayout={onCalendarContainerLayout}>
                            <View style={styles.calendarNav}>
                                <TouchableOpacity onPress={()=>setCalendarMonth((prev: DateTime)=>prev.minus({months:1}))}><Feather name="chevron-left" size={24} color="#4F46E5"/></TouchableOpacity>
                                <Text style={styles.calendarMonthText}>{calendarMonth.toFormat('MMMM yyyy')}</Text>
                                <TouchableOpacity onPress={()=>setCalendarMonth((prev: DateTime)=>prev.plus({months:1}))}><Feather name="chevron-right" size={24} color="#4F46E5"/></TouchableOpacity>
                            </View>
                            
                            {calculatedDayWidth > 0 ? (
                                <>
                                    <View style={styles.calendarGridContainer}>
                                        {daysOfWeek.map((day, i) => (
                                            <View key={`lbl-${i}`} style={[styles.calendarDayBox, { width: calculatedDayWidth }]}>
                                                <Text style={styles.dayLabelText}>{day.label}</Text>
                                            </View>
                                        ))}
                                    </View>
                                    <View style={styles.calendarGridContainer}>
                                        {calendarGrid.map((day: DateTime | null, idx: number)=>{
                                            if(!day) return <View key={`p-${idx}`} style={[styles.calendarDayBox, { width: calculatedDayWidth }]}/>;
                                            const isSel = day.toISODate() === kickoffDate;
                                            return (
                                                <TouchableOpacity 
                                                    key={day.toISODate()} 
                                                    onPress={()=>setKickoffDate(day.toISODate()!)} 
                                                    style={[
                                                        styles.calendarDayBox, 
                                                        { width: calculatedDayWidth },
                                                        isSel && styles.calendarDayBoxSelected
                                                    ]}
                                                >
                                                    <Text style={[styles.calendarDayText, isSel && styles.calendarDayTextSelected]}>
                                                        {day.day}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </>
                            ) : <ActivityIndicator style={{ margin: 20 }} />}
                        </View>
                        <View style={styles.footerNavSpread}><TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity><TouchableOpacity onPress={()=>setStep(12)}><Feather name="arrow-right-circle" size={48} color="#4F46E5" /></TouchableOpacity></View>
                    </View>
                )}

                {step === 10 && (
                    <View style={styles.stepContainerPadded}>
                        <Text style={styles.headerTitle}>Select pattern</Text>
                        <View style={{flex: 1, justifyContent: 'center'}}>
                            <View style={styles.pickerWrapper}><Picker selectedValue={ordinalOccurrence} onValueChange={(itemValue: string)=>setOrdinalOccurrence(itemValue)} itemStyle={styles.pickerItem}>{occurrences.map(o=><Picker.Item key={o} label={o} value={o} color="#111827"/>)}</Picker></View>
                            <View style={{height: 20}}/>
                            <View style={styles.pickerWrapper}><Picker selectedValue={ordinalDay} onValueChange={(itemValue: number)=>setOrdinalDay(itemValue)} itemStyle={styles.pickerItem}>{daysOfWeek.map(d=><Picker.Item key={d.value} label={d.label} value={d.value} color="#111827"/>)}</Picker></View>
                        </View>
                        <View style={styles.footerNavSpread}><TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity><TouchableOpacity onPress={handleNext}><Feather name="arrow-right-circle" size={48} color="#4F46E5" /></TouchableOpacity></View>
                    </View>
                )}

                {step === 11 && (
                    <View style={styles.stepContainerPadded}>
                        <Text style={styles.headerTitle}>Add another rule?</Text>
                        <Text style={styles.headerSub}>max 5 allowed</Text>
                        <View style={styles.centeredContent}>
                            <TouchableOpacity style={styles.choiceBtn} onPress={()=>setStep(4)}><Text style={styles.choiceBtnText}>Add More</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.choiceBtnOutline} onPress={()=>setStep(9)}><Text style={styles.choiceBtnTextOutline}>Continue</Text></TouchableOpacity>
                        </View>
                        <View style={styles.footerNavSpread}>
                            <TouchableOpacity onPress={handleBack}>
                                <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {step === 12 && (
                    <View style={styles.stepContainerPadded}>
                        <FadeInView delay={100}><Text style={styles.headerTitle}>JIT Setup</Text></FadeInView>
                        <View style={{ flex: 1 }}>
                            <FadeInView delay={250}>
                                <Text style={styles.description}>
                                    Lead time for event creation and member notification:
                                </Text>
                            </FadeInView>

                            <FadeInView delay={400} style={styles.jitCard}>
                                <View style={styles.leadDaysRow}>
                                    <TouchableOpacity onPress={() => setLeadDays(Math.max(0, leadDays - 1))} style={styles.stepperBtn}>
                                        <Feather name="minus" size={24} color="#4F46E5" />
                                    </TouchableOpacity>
                                    <View style={{ alignItems: 'center', width: 120 }}>
                                        <Text style={styles.leadVal}>{leadDays}</Text>
                                        <Text style={styles.leadLabel}>Days Lead</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => setLeadDays(leadDays + 1)} style={styles.stepperBtn}>
                                        <Feather name="plus" size={24} color="#4F46E5" />
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.divider} />

                                <Text style={styles.sectionLabelCenter}>Trigger Time</Text>
                                <TimePicker onTimeChange={setNotificationTime} initialValue={notificationTime} />
                            </FadeInView>
                        </View>
                        <View style={styles.footerNavSpread}><TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity><TouchableOpacity onPress={()=>setStep(13)}><Feather name="arrow-right-circle" size={48} color="#4F46E5" /></TouchableOpacity></View>
                    </View>
                )}

                {step === 13 && (
                    <View style={styles.stepContainerPadded}>
                        <Text style={styles.headerTitle}>Default location?</Text>
                        <View style={styles.centeredContent}>
                            <TouchableOpacity style={styles.choiceBtn} onPress={()=>setStep(14)}><Text style={styles.choiceBtnText}>Set Location</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.choiceBtnOutline} onPress={()=>setStep(15)}><Text style={styles.choiceBtnTextOutline}>Skip</Text></TouchableOpacity>
                        </View>
                        <View style={styles.footerNavSpread}>
                            <TouchableOpacity onPress={handleBack}>
                                <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {step === 14 && (
                    <View style={styles.stepContainerPadded}>
                        <Text style={styles.headerTitle}>Location Info</Text>
                        <TextInput style={styles.textInput} placeholder="e.g. Starbucks or Zoom link..." value={location} onChangeText={setLocation} />
                        <View style={styles.footerNavSpread}><TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity><TouchableOpacity onPress={()=>setStep(15)}><Feather name="arrow-right-circle" size={48} color="#4F46E5" /></TouchableOpacity></View>
                    </View>
                )}

                {step === 15 && renderStep15_Summary()}
            </View>
        </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    screenHeader: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    closeButton: {
        padding: 8,
    },
    stepContainerPadded: { flex: 1, padding: 24, paddingTop: 12 },
    centeredContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 26, fontWeight: '900', color: '#111827', textAlign: 'center', marginBottom: 8 },
    headerSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 20 },
    imagePlaceholder: { width: '100%', aspectRatio: 16/9, marginVertical: 24, borderRadius: 16, overflow: 'hidden', backgroundColor: '#E5E7EB' },
    image: { width: '100%', height: 200 },
    textInput: { width: '100%', padding: 16, borderBottomWidth: 2, borderColor: '#4F46E5', fontSize: 18, fontWeight: '600', backgroundColor: 'white', borderRadius: 12 },
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 16 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 16 },
    sectionLabel: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 },
    selectedMembersContainer: { marginBottom: 20 },
    selectedScroll: { paddingLeft: 4, paddingBottom: 4 },
    selectedMemberChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#E5E7EB' },
    selectedMemberText: { fontSize: 14, fontWeight: '600', color: '#374151' },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    resultText: { fontSize: 16, fontWeight: '500', color: '#374151' },
    selectionButton: { width: '100%', padding: 20, backgroundColor: 'white', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB', elevation: 2 },
    selectionButtonText: { fontSize: 20, fontWeight: 'bold', color: '#1F2937' },
    selectionButtonSubtext: { fontSize: 14, color: '#6B7280', marginTop: 4 },
    choiceBtn: { width: '100%', backgroundColor: '#4F46E5', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 16 },
    choiceBtnText: { color: 'white', fontSize: 18, fontWeight: '800' },
    choiceBtnOutline: { width: '100%', borderWidth: 2, borderColor: '#E5E7EB', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
    choiceBtnTextOutline: { color: '#6B7280', fontSize: 18, fontWeight: '800' },
    frequencyButton: { flexDirection: 'row', alignItems: 'center', padding: 18, marginBottom: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 16 },
    frequencyButtonSelected: { backgroundColor: '#F5F7FF', borderColor: '#4F46E5' },
    frequencyText: { fontSize: 17, color: '#374151', fontWeight: '700', marginLeft: 12 },
    frequencySub: { fontSize: 12, color: '#9CA3AF', marginTop: 2, marginLeft: 12 },
    radioCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB' },
    radioCircleSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
    checkboxCircle: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
    checkboxCircleSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
    footerNavSpread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingBottom: 20 },
    pickerWrapper: { backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
    pickerItem: { height: 120, color: '#111827', fontSize: 18 },
    pickerTitle: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 8, marginTop: 16 },
    dateGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    dateBox: { width: '12%', height: 45, justifyContent: 'center', alignItems: 'center', margin: '1%', borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFF' },
    dateBoxSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
    dateText: { fontSize: 14, fontWeight: '600' },
    dateTextSelected: { color: '#FFF' },
    calendarContainer: { backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
    calendarNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15 },
    calendarMonthText: { fontSize: 18, fontWeight: 'bold' },
    calendarGridContainer: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
    calendarDayBox: { height: 45, alignItems: 'center', justifyContent: 'center' },
    calendarDayBoxSelected: { backgroundColor: '#4F46E5', borderRadius: 25 },
    calendarDayText: { fontSize: 16 },
    calendarDayTextSelected: { color: 'white', fontWeight: 'bold' },
    description: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
    jitCard: { backgroundColor: 'white', borderRadius: 24, padding: 24, borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 12 },
    leadDaysRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    stepperBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F5F7FF', alignItems: 'center', justifyContent: 'center' },
    leadVal: { fontSize: 32, fontWeight: '900', color: '#111827' },
    leadLabel: { fontSize: 10, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase' },
    divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 20 },
    hint: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center', marginTop: 12 },
    loopProgress: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', fontWeight: 'bold', textTransform: 'uppercase' },
    summaryCard: { backgroundColor: 'white', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB' },
    summaryLabel: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginTop: 16 },
    summaryVal: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginTop: 4 },
    summaryValSmall: { fontSize: 15, color: '#374151', marginTop: 2 },
    routineSummaryBox: { marginTop: 10, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 12 },
    routineSummaryType: { fontSize: 10, fontWeight: '900', color: '#4F46E5', marginBottom: 4 },
    sectionLabelCenter: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 16, textAlign: 'center' },
    finishBtn: { backgroundColor: '#4F46E5', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
    finishBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    shareLinkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#F5F7FF', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#4F46E5', marginVertical: 16 },
    shareLinkText: { color: '#4F46E5', fontWeight: '700', fontSize: 16, marginLeft: 10 },
    dayLabelText: { fontSize: 10, fontWeight: '900', color: '#9CA3AF' }
});

export default CreateGroupScreen;