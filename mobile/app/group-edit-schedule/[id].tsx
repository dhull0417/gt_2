import React, { useState, useEffect, useMemo } from "react";
import { 
    View, 
    Text, 
    TextInput, 
    TouchableOpacity, 
    ScrollView, 
    StyleSheet, 
    Alert, 
    Dimensions, 
    Platform, 
    Keyboard, 
    ActivityIndicator,
    Animated,
    KeyboardAvoidingView,
    ViewStyle,
    StyleProp,
    LayoutChangeEvent
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import { useGetGroupDetails } from "../../hooks/useGetGroupDetails";
import { useApiClient, User, userApi, Frequency, Routine, DayTime } from "../../utils/api"; 
import TimePicker from "../../components/TimePicker";
import { DateTime } from "luxon";

const { width } = Dimensions.get('window');

const usaTimezones = [
    { label: "Eastern (ET)", value: "America/New_York" },
    { label: "Central (CST)", value: "America/Chicago" },
    { label: "Mountain (MT)", value: "America/Denver" },
    { label: "Mountain (no DST)", value: "America/Phoenix" },
    { label: "Pacific (PST)", value: "America/Los_Angeles" },
    { label: "Alaska (AKST)", value: "America/Anchorage" },
    { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
];

// UPDATED: Labels are now fully spelled out
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

/**
 * Edit Schedule Screen
 * Mirroring the Create Group flow Scheduling steps exactly.
 * Focused ONLY on Frequency, Days/Dates, and Meeting Times.
 */
const EditScheduleScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const api = useApiClient();
    const queryClient = useQueryClient();

    const { data: group, isLoading: loadingGroup } = useGetGroupDetails(id);
    const { data: currentUser } = useQuery<User, Error>({ 
        queryKey: ['currentUser'], 
        queryFn: () => userApi.getCurrentUser(api) 
    });

    // --- Wizard Flow State ---
    const [step, setStep] = useState(4); // Starts at the frequency step from creation flow
    
    // Schedule Builder Logic
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

    // Persistent settings from group (hidden from editing as requested)
    const [kickoffDate, setKickoffDate] = useState<string>(DateTime.now().toISODate()!);
    const [location, setLocation] = useState("");
    const [leadDays, setLeadDays] = useState(2);
    const [notificationTime, setNotificationTime] = useState("09:00 AM");
    const [isUpdating, setIsUpdating] = useState(false);

    // --- Populate existing data for preservation ---
    useEffect(() => {
        if (group) {
            const sched = group.schedule;
            if (sched?.routines) {
                setRoutines(sched.routines);
                setIsMultipleMode(sched.routines.length > 1 || sched.frequency === 'custom');
            }
            setCurrentTZ(group.timezone || "America/Denver");
            setLocation(group.defaultLocation || "");
            setLeadDays(group.generationLeadDays ?? 2);
            setNotificationTime(group.generationLeadTime || "09:00 AM");
            
            if (sched?.startDate) {
                const dt = DateTime.fromISO(sched.startDate);
                if (dt.isValid) setKickoffDate(dt.toISODate()!);
            }
        }
    }, [group]);

    const getTargets = () => {
        if (currentFreq === 'daily') return [0,1,2,3,4,5,6];
        if (currentFreq === 'weekly' || currentFreq === 'biweekly') return [...selectedDays].sort((a,b) => a-b);
        if (currentFreq === 'monthly') return [...selectedDates].sort((a,b) => a-b);
        if (currentFreq === 'ordinal') return [ordinalDay];
        return [];
    };

    const handleUpdateSchedule = async () => {
        if (!id) return;
        setIsUpdating(true);
        
        const payload = {
            schedule: {
                frequency: isMultipleMode ? 'custom' : (routines[0]?.frequency || 'once'),
                startDate: kickoffDate,
                routines: routines
            },
            timezone: currentTZ,
            defaultLocation: location,
            generationLeadDays: leadDays,
            generationLeadTime: notificationTime
        };

        try {
            await api.patch(`/api/groups/${id}/schedule`, payload);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['groupDetails', id] }),
                queryClient.invalidateQueries({ queryKey: ['events'] }),
                queryClient.invalidateQueries({ queryKey: ['groups'] })
            ]);
            Alert.alert("Success", "Group schedule updated.");
            router.back();
        } catch (error: any) {
            Alert.alert("Error", error.response?.data?.error || "Failed to update.");
        } finally {
            setIsUpdating(false);
        }
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
            setStep(15); 
        }
    };

    const handleNext = () => {
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
        if (step === 11) setStep(15);
        else setStep(prev => prev + 1);
    };

    const handleBack = () => {
        if (step === 4) return router.back();
        if (step === 6 && !isSameTime && loopIndex > 0) {
            setLoopIndex(loopIndex - 1);
            setTempDayTimes(prev => prev.slice(0, -1));
            return;
        }
        if (step === 11) {
            setRoutines(prev => prev.slice(0, -1));
            return setStep(6);
        }
        if (step === 15) {
            if (isMultipleMode) return setStep(11);
            return setStep(6);
        }
        setStep(prev => prev - 1);
    };

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
                // Simplified: Uses the full label directly
                heading = `Time for ${dayData?.label || ""}`;
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
                            onValueChange={(v: string) => setCurrentTZ(v)} 
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
            <FadeInView delay={100}><Text style={styles.headerTitle}>Review Schedule</Text></FadeInView>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Schedules</Text>
                    {routines.map((r, i) => (
                        <View key={i} style={styles.routineSummaryBox}>
                            <Text style={styles.routineSummaryType}>{r.frequency.toUpperCase()}</Text>
                            {r.dayTimes.map((dt, dti) => {
                                let label = "";
                                if (r.frequency === 'ordinal' && r.rules?.[0]) {
                                    const dayData = daysOfWeek.find(d => d.value === r.rules![0].day);
                                    label = `${r.rules[0].occurrence} ${dayData?.label || ""}`;
                                } else {
                                    const dayData = daysOfWeek.find(d => d.value === dt.day);
                                    label = dt.date ? `The ${dt.date}${dt.date === 1 ? 'st' : dt.date === 2 ? 'nd' : dt.date === 3 ? 'rd' : 'th'}` : dayData?.label || "";
                                }
                                return <Text key={dti} style={styles.summaryValSmall}>• {label} @ {dt.time}</Text>
                            })}
                        </View>
                    ))}
                    <Text style={styles.summaryLabel}>Preserved Settings</Text>
                    <Text style={styles.summaryValSmall}>• Start Date: {DateTime.fromISO(kickoffDate).toLocaleString(DateTime.DATE_MED)}</Text>
                    <Text style={styles.summaryValSmall}>• JIT: {leadDays} days @ {notificationTime}</Text>
                    <Text style={styles.summaryValSmall}>• Location: {location || "Default"}</Text>
                </View>
            </ScrollView>
            <View style={styles.footerNavSpread}>
                <TouchableOpacity onPress={handleBack}><Feather name="arrow-left" size={32} color="#6B7280" /></TouchableOpacity>
                <TouchableOpacity style={styles.finishBtn} onPress={handleUpdateSchedule} disabled={isUpdating}>
                    {isUpdating ? <ActivityIndicator color="white" /> : <Text style={styles.finishBtnText}>Save Changes</Text>}
                </TouchableOpacity>
            </View>
        </View>
    );

    if (loadingGroup || !currentUser) return <View style={styles.center}><ActivityIndicator size="large" color="#4F46E5" /></View>;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
                            <TouchableOpacity 
                                key={d.value} 
                                style={[styles.frequencyButton, selectedDays.includes(d.value)&&styles.frequencyButtonSelected]} 
                                onPress={()=>setSelectedDays((prev)=>prev.includes(d.value)?prev.filter(x=>x!==d.value):[...prev,d.value])}
                            >
                                <View style={[styles.checkboxCircle, selectedDays.includes(d.value)&&styles.checkboxCircleSelected]}>
                                    {selectedDays.includes(d.value)&&<Feather name="check" size={14} color="white"/>}
                                </View>
                                {/* Simplified: Renders the full label directly */}
                                <Text style={styles.frequencyText}>{d.label}</Text>
                            </TouchableOpacity>
                        ))}</View>
                        <View style={styles.footerNavSpread}>
                            <TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity>
                            <TouchableOpacity onPress={handleNext} disabled={!selectedDays.length}>
                                <Feather name="arrow-right-circle" size={48} color={!selectedDays.length?'#CCC':'#4F46E5'} />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
                {step === 8 && (
                    <View style={styles.stepContainerPadded}>
                        <Text style={styles.headerTitle}>Choose dates</Text>
                        <View style={styles.dateGrid}>{Array.from({length:31}, (_,i)=>i+1).map(d=>(
                            <TouchableOpacity key={d} style={[styles.dateBox, selectedDates.includes(d)&&styles.dateBoxSelected]} onPress={()=>setSelectedDates((prev)=>prev.includes(d)?prev.filter(x=>x!==d):[...prev,d])}><Text style={[styles.dateText, selectedDates.includes(d)&&styles.dateTextSelected]}>{d}</Text></TouchableOpacity>
                        ))}</View>
                        <View style={styles.footerNavSpread}><TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity><TouchableOpacity onPress={handleNext} disabled={!selectedDates.length}><Feather name="arrow-right-circle" size={48} color={!selectedDates.length?'#CCC':'#4F46E5'} /></TouchableOpacity></View>
                    </View>
                )}
                {step === 10 && (
                    <View style={styles.stepContainerPadded}>
                        <Text style={styles.headerTitle}>Select pattern</Text>
                        <View style={{flex: 1, justifyContent: 'center'}}>
                            <View style={styles.pickerWrapper}><Picker selectedValue={ordinalOccurrence} onValueChange={(v: string)=>setOrdinalOccurrence(v)} itemStyle={styles.pickerItem}>{occurrences.map(o=><Picker.Item key={o} label={o} value={o} color="#111827"/>)}</Picker></View>
                            <View style={{height: 20}}/>
                            <View style={styles.pickerWrapper}><Picker selectedValue={ordinalDay} onValueChange={(v: number)=>setOrdinalDay(v)} itemStyle={styles.pickerItem}>{daysOfWeek.map(d=><Picker.Item key={d.value} label={d.label} value={d.value} color="#111827"/>)}</Picker></View>
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
                            <TouchableOpacity style={styles.choiceBtnOutline} onPress={()=>setStep(15)}><Text style={styles.choiceBtnTextOutline}>Continue</Text></TouchableOpacity>
                        </View>
                        <View style={styles.footerNavSpread}><TouchableOpacity onPress={handleBack}><Feather name="arrow-left-circle" size={48} color="#4F46E5" /></TouchableOpacity></View>
                    </View>
                )}
                {step === 15 && renderStep15_Summary()}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    stepContainerPadded: { flex: 1, padding: 24, paddingTop: 12 },
    centeredContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 26, fontWeight: '900', color: '#111827', textAlign: 'center', marginBottom: 8 },
    headerSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 20 },
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
    loopProgress: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', fontWeight: 'bold', textTransform: 'uppercase' },
    summaryCard: { backgroundColor: 'white', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB' },
    summaryLabel: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginTop: 16 },
    summaryVal: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginTop: 4 },
    summaryValSmall: { fontSize: 15, color: '#374151', marginTop: 2 },
    routineSummaryBox: { marginTop: 10, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 12 },
    routineSummaryType: { fontSize: 10, fontWeight: '900', color: '#4F46E5', marginBottom: 4 },
    finishBtn: { backgroundColor: '#4F46E5', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
    finishBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});

export default EditScheduleScreen;