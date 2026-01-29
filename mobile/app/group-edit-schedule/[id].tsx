import React, { useState, useEffect, useMemo } from "react";
import { 
    View, 
    Text, 
    TouchableOpacity, 
    ScrollView, 
    StyleSheet, 
    Alert, 
    Dimensions, 
    Animated,
    ActivityIndicator,
    TextInput,
    StyleProp,
    ViewStyle
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import { useGetGroupDetails } from "../../hooks/useGetGroupDetails";
import { useApiClient, User, userApi, Frequency, Routine } from "../../utils/api"; 
import TimePicker from "../../components/TimePicker";
import { DateTime } from "luxon";

const { width } = Dimensions.get('window');

type LocalFrequency = Frequency | null;

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
    { label: "Sunday", value: 0 }, { label: "Monday", value: 1 }, { label: "Tuesday", value: 2 },
    { label: "Wednesday", value: 3 }, { label: "Thursday", value: 4 }, { label: "Friday", value: 5 }, { label: "Saturday", value: 6 },
];

const FadeInView = ({ children, delay = 0, duration = 400, style }: { children: React.ReactNode, delay?: number, duration?: number, style?: StyleProp<ViewStyle> }) => {
  const fadeAnim = useMemo(() => new Animated.Value(0), []);
  const slideAnim = useMemo(() => new Animated.Value(-15), []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration, delay, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration, delay, useNativeDriver: true })
    ]).start();
  }, [delay, fadeAnim, slideAnim, duration]);

  return (
    <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], width: '100%' }, style]}>
      {children}
    </Animated.View>
  );
};

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

    const [step, setStep] = useState(1);
    const [frequency, setFrequency] = useState<LocalFrequency>(null);
    const [selectedDays, setSelectedDays] = useState<number[]>([]); 
    const [selectedDates, setSelectedDates] = useState<number[]>([]); 
    const [meetTime, setMeetTime] = useState("05:00 PM");
    const [timezone, setTimezone] = useState("America/Denver");
    const [defaultCapacity, setDefaultCapacity] = useState<number>(0);
    const [location, setLocation] = useState("");
    const [startDate, setStartDate] = useState<string>(DateTime.now().toISODate()!);

    // --- JIT State ---
    const [leadDays, setLeadDays] = useState(2);
    const [notificationTime, setNotificationTime] = useState("09:00 AM");
    const [eventsToDisplay, setEventsToDisplay] = useState(1);
    
    const [isUpdating, setIsUpdating] = useState(false);

    // Calendar logic for Kickoff Date picker
    const [calendarMonth, setCalendarMonth] = useState<DateTime>(DateTime.now().startOf('month'));
    const calendarGrid = useMemo(() => {
        const start = calendarMonth.startOf('month');
        const firstDayIdx = start.weekday === 7 ? 0 : start.weekday;
        const days = [];
        for (let i = 0; i < firstDayIdx; i++) days.push(null);
        for (let i = 1; i <= calendarMonth.endOf('month').day; i++) days.push(calendarMonth.set({ day: i }));
        return days;
    }, [calendarMonth]);

    useEffect(() => {
        if (group) {
            const sched = group.schedule;
            setFrequency(sched?.frequency || null);
            
            // Get time from routine or fallback to legacy group.time
            const firstRoutineTime = sched?.routines?.[0]?.dayTimes?.[0]?.time;
            setMeetTime(firstRoutineTime || (group as any).time || "05:00 PM");
            
            setTimezone(group.timezone || "America/Denver");
            setDefaultCapacity(group.defaultCapacity || 0);
            setLocation(group.defaultLocation || "");
            
            // Project 6 JIT Init
            setLeadDays(group.generationLeadDays ?? 2);
            setNotificationTime(group.generationLeadTime || "09:00 AM");
            setEventsToDisplay((group as any).eventsToDisplay || 1);
            setStartDate(sched?.startDate || DateTime.now().toISODate()!);
            
            if (sched?.frequency === 'weekly' || sched?.frequency === 'biweekly') {
                const days = sched.routines?.[0]?.dayTimes?.map(dt => dt.day).filter(d => d !== undefined) as number[];
                setSelectedDays(days?.length ? days : (sched as any).days || []);
            } else if (sched?.frequency === 'monthly') {
                const dates = sched.routines?.[0]?.dayTimes?.map(dt => dt.date).filter(d => d !== undefined) as number[];
                setSelectedDates(dates?.length ? dates : (sched as any).days || []);
            }
        }
    }, [group]);

    const handleUpdateSchedule = async () => {
        if (!id || !frequency) return;
        setIsUpdating(true);
        
        const targets = frequency === 'monthly' ? selectedDates : (frequency === 'daily' ? [0,1,2,3,4,5,6] : selectedDays);
        const dayTimes = targets.map(val => (
            frequency === 'monthly' ? { date: val, time: meetTime } : { day: val, time: meetTime }
        ));

        const routine: Routine = {
            frequency: frequency,
            dayTimes: dayTimes
        };

        const targetUrl = `/api/groups/${id}/schedule`;

        try {
            // The JIT Worker relies on metadata at the root AND the routines within the schedule
            await api.patch(targetUrl, {
                name: group?.name,
                schedule: {
                    frequency: frequency,
                    routines: [routine],
                    startDate: startDate // Anchors the cycle to ensure the JIT window calculates correctly
                },
                time: meetTime, // Root-level required for some notification worker versions
                timezone: timezone,
                defaultCapacity: defaultCapacity,
                defaultLocation: location,
                generationLeadDays: leadDays,
                generationLeadTime: notificationTime,
                eventsToDisplay: eventsToDisplay // Set to 1 for JIT (create only on notification trigger)
            });

            queryClient.invalidateQueries({ queryKey: ['groupDetails', id] });
            queryClient.invalidateQueries({ queryKey: ['events'] });
            
            Alert.alert("Success", "Schedule and notification settings updated.");
            router.back();
        } catch (error: any) {
            Alert.alert("Update Error", "Failed to update group settings.");
        } finally {
            setIsUpdating(false);
        }
    };

    const toggleDay = (val: number) => setSelectedDays(prev => prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val]);
    const toggleDate = (val: number) => setSelectedDates(prev => prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val]);

    if (loadingGroup || !currentUser) {
        return (
            <SafeAreaView style={styles.center}>
                <ActivityIndicator size="large" color="#4F46E5" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Feather name="x" size={24} color="#374151" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Update Schedule</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={{ flex: 1 }}>
                {step === 1 && (
                    <View style={styles.stepContainerPadded}>
                        <FadeInView delay={100}><Text style={styles.title}>How often will you meet?</Text></FadeInView>
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                            {['daily', 'weekly', 'biweekly', 'monthly'].map((f, idx) => (
                                <FadeInView key={f} delay={200 + (idx * 50)}>
                                    <TouchableOpacity 
                                        style={[styles.frequencyButton, frequency === f && styles.frequencyButtonSelected]} 
                                        onPress={() => setFrequency(f as any)}
                                    >
                                        <View style={[styles.radioCircle, frequency === f && styles.radioCircleSelected]} />
                                        <Text style={[styles.frequencyText, frequency === f && styles.frequencyTextSelected]}>
                                            {f === 'biweekly' ? 'Every 2 Weeks' : f.charAt(0).toUpperCase() + f.slice(1)}
                                        </Text>
                                    </TouchableOpacity>
                                </FadeInView>
                            ))}
                        </View>
                        <FadeInView delay={600}>
                            <View style={styles.footerNavRight}>
                                <TouchableOpacity onPress={() => frequency === 'daily' ? setStep(3) : setStep(2)} disabled={!frequency}>
                                    <Feather name="arrow-right-circle" size={54} color={!frequency ? "#D1D5DB" : "#4F46E5"} />
                                </TouchableOpacity>
                            </View>
                        </FadeInView>
                    </View>
                )}

                {step === 2 && (
                    <View style={styles.stepContainerPadded}>
                        <FadeInView delay={100}><Text style={styles.title}>Which day(s) will you meet?</Text></FadeInView>
                        <View style={{ flex: 1 }}>
                            <FadeInView delay={250}>
                                <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                                    {frequency === 'monthly' ? (
                                        <View style={styles.calendarGrid}>
                                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                                <TouchableOpacity key={d} style={[styles.dateBox, selectedDates.includes(d) && styles.dateBoxSelected]} onPress={() => toggleDate(d)}>
                                                    <Text style={[styles.dateText, selectedDates.includes(d) && styles.dateTextSelected]}>{d}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    ) : (
                                        daysOfWeek.map(d => (
                                            <TouchableOpacity 
                                                key={d.value} 
                                                style={[styles.frequencyButton, selectedDays.includes(d.value) && styles.frequencyButtonSelected]} 
                                                onPress={() => toggleDay(d.value)}
                                            >
                                                <View style={[styles.radioCircle, selectedDays.includes(d.value) && styles.radioCircleSelected]} />
                                                <Text style={[styles.frequencyText, selectedDays.includes(d.value) && styles.frequencyTextSelected]}>{d.label}</Text>
                                            </TouchableOpacity>
                                        ))
                                    )}
                                </ScrollView>
                            </FadeInView>
                        </View>
                        <FadeInView delay={400}>
                            <View style={styles.footerNavSpread}>
                                <TouchableOpacity onPress={() => setStep(1)}><Feather name="arrow-left-circle" size={54} color="#4F46E5" /></TouchableOpacity>
                                <TouchableOpacity onPress={() => setStep(3)} disabled={(frequency === 'monthly' ? selectedDates.length : selectedDays.length) === 0}>
                                    <Feather name="arrow-right-circle" size={54} color={(frequency === 'monthly' ? selectedDates.length : selectedDays.length) === 0 ? "#D1D5DB" : "#4F46E5"} />
                                </TouchableOpacity>
                            </View>
                        </FadeInView>
                    </View>
                )}

                {step === 3 && (
                    <View style={styles.stepContainerPadded}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <FadeInView delay={100}><Text style={styles.title}>Meeting Details</Text></FadeInView>
                            
                            <FadeInView delay={300} style={styles.finalCardSection}>
                                <Text style={styles.pickerTitle}>Meeting Time</Text>
                                <TimePicker onTimeChange={setMeetTime} initialValue={meetTime} />
                            </FadeInView>

                            <FadeInView delay={400} style={styles.finalCardSection}>
                                <Text style={styles.pickerTitle}>Kickoff Date (Effective From)</Text>
                                <View style={styles.calendarContainer}>
                                    <View style={styles.calendarNav}>
                                        <TouchableOpacity onPress={() => setCalendarMonth(prev => prev.minus({ months: 1 }))}>
                                            <Feather name="chevron-left" size={24} color="#4F46E5" />
                                        </TouchableOpacity>
                                        <Text style={styles.calendarMonthText}>{calendarMonth.toFormat('MMMM yyyy')}</Text>
                                        <TouchableOpacity onPress={() => setCalendarMonth(prev => prev.plus({ months: 1 }))}>
                                            <Feather name="chevron-right" size={24} color="#4F46E5" />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.calendarGridContainer}>
                                        {calendarGrid.map((day, idx) => {
                                            if (!day) return <View key={`p-${idx}`} style={styles.calendarDayBox} />;
                                            const isSel = day.toISODate() === startDate;
                                            return (
                                                <TouchableOpacity 
                                                    key={day.toISODate()} 
                                                    onPress={() => setStartDate(day.toISODate()!)} 
                                                    style={[styles.calendarDayBox, isSel && styles.calendarDayBoxSelected]}
                                                >
                                                    <Text style={[styles.calendarDayText, isSel && styles.calendarDayTextSelected]}>{day.day}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>
                            </FadeInView>

                            <FadeInView delay={500} style={styles.finalCardSection}>
                                <Text style={styles.pickerTitle}>Default Location</Text>
                                <TextInput 
                                    style={styles.textInput} 
                                    placeholder="Location name or link..." 
                                    value={location} 
                                    onChangeText={setLocation} 
                                />
                            </FadeInView>
                            
                            <FadeInView delay={600} style={styles.finalCardSection}>
                                <Text style={styles.pickerTitle}>Select Timezone</Text>
                                <View style={styles.pickerWrapper}>
                                    <Picker 
                                        selectedValue={timezone} 
                                        onValueChange={setTimezone} 
                                        itemStyle={styles.pickerItem}
                                    >
                                        {usaTimezones.map(tz => <Picker.Item key={tz.value} label={tz.label} value={tz.value} />)}
                                    </Picker>
                                </View>
                            </FadeInView>

                            <FadeInView delay={700} style={styles.finalCardSection}>
                                <Text style={styles.pickerTitle}>Attendee Limit (0 = Unlimited)</Text>
                                <View style={styles.capacityRow}>
                                    <TouchableOpacity 
                                        onPress={() => setDefaultCapacity(prev => Math.max(0, prev - 1))}
                                        style={styles.capBtn}
                                    >
                                        <Feather name="minus" size={24} color="#4F46E5" />
                                    </TouchableOpacity>
                                    <Text style={styles.capVal}>{defaultCapacity === 0 ? "Unlimited" : defaultCapacity}</Text>
                                    <TouchableOpacity 
                                        onPress={() => setDefaultCapacity(prev => prev + 1)}
                                        style={styles.capBtn}
                                    >
                                        <Feather name="plus" size={24} color="#4F46E5" />
                                    </TouchableOpacity>
                                </View>
                            </FadeInView>
                        </ScrollView>

                        <FadeInView delay={800}>
                            <View style={styles.footerNavSpread}>
                                <TouchableOpacity onPress={() => frequency === 'daily' ? setStep(1) : setStep(2)}>
                                    <Feather name="arrow-left-circle" size={54} color="#4F46E5" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setStep(4)}>
                                    <Feather name="arrow-right-circle" size={54} color="#4F46E5" />
                                </TouchableOpacity>
                            </View>
                        </FadeInView>
                    </View>
                )}

                {step === 4 && (
                    <View style={styles.stepContainerPadded}>
                        <FadeInView delay={100}><Text style={styles.title}>Notification Settings</Text></FadeInView>
                        
                        <FadeInView delay={250}>
                            <Text style={styles.description}>
                                How many days before the meeting should we create the event and notify everyone?
                            </Text>
                        </FadeInView>

                        <FadeInView delay={400} style={styles.jitCard}>
                            <View style={styles.leadDaysRow}>
                                <TouchableOpacity onPress={() => setLeadDays(Math.max(0, leadDays - 1))} style={styles.stepperBtn}>
                                    <Feather name="minus" size={24} color="#4F46E5" />
                                </TouchableOpacity>
                                <View style={{ alignItems: 'center', width: 120 }}>
                                    <Text style={styles.leadVal}>{leadDays}</Text>
                                    <Text style={styles.leadLabel}>Days Before</Text>
                                </View>
                                <TouchableOpacity onPress={() => setLeadDays(leadDays + 1)} style={styles.stepperBtn}>
                                    <Feather name="plus" size={24} color="#4F46E5" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.divider} />

                            <Text style={styles.sectionLabelCenter}>Events to show at once</Text>
                            <View style={styles.leadDaysRow}>
                                <TouchableOpacity onPress={() => setEventsToDisplay(Math.max(1, eventsToDisplay - 1))} style={styles.stepperBtn}>
                                    <Feather name="minus" size={24} color="#4F46E5" />
                                </TouchableOpacity>
                                <View style={{ alignItems: 'center', width: 120 }}>
                                    <Text style={styles.leadVal}>{eventsToDisplay}</Text>
                                    <Text style={styles.leadLabel}>{eventsToDisplay === 1 ? 'Just-In-Time' : 'Future Events'}</Text>
                                </View>
                                <TouchableOpacity onPress={() => setEventsToDisplay(eventsToDisplay + 1)} style={styles.stepperBtn}>
                                    <Feather name="plus" size={24} color="#4F46E5" />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.hint}>Set to 1 to ensure events are created exactly when the notification fires.</Text>

                            <View style={styles.divider} />

                            <Text style={styles.sectionLabelCenter}>Trigger Time</Text>
                            <TimePicker onTimeChange={setNotificationTime} initialValue={notificationTime} />
                        </FadeInView>

                        <FadeInView delay={600}>
                            <View style={styles.footerNavSpread}>
                                <TouchableOpacity onPress={() => setStep(3)}>
                                    <Feather name="arrow-left-circle" size={54} color="#4F46E5" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.createButton, isUpdating && { opacity: 0.7 }]}
                                    onPress={handleUpdateSchedule}
                                    disabled={isUpdating}
                                >
                                    {isUpdating ? (
                                        <ActivityIndicator color="#FFF" />
                                    ) : (
                                        <Text style={styles.createButtonText}>Save Changes</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </FadeInView>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
    stepContainerPadded: { flex: 1, padding: 24 },
    title: { fontSize: 26, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 24 },
    description: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
    frequencyButton: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        padding: 20, 
        marginBottom: 16, 
        backgroundColor: '#FFFFFF', 
        borderWidth: 1.5, 
        borderColor: '#E5E7EB', 
        borderRadius: 16, 
        elevation: 2 
    },
    frequencyButtonSelected: { backgroundColor: '#F5F7FF', borderColor: '#4F46E5' },
    frequencyText: { fontSize: 18, color: '#374151', marginLeft: 16, fontWeight: '500' },
    frequencyTextSelected: { color: '#4F46E5', fontWeight: '700' },
    radioCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: '#FFF' },
    radioCircleSelected: { borderColor: '#4F46E5', backgroundColor: '#4F46E5' },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    dateBox: { width: width / 7 - 12, height: width / 7 - 12, justifyContent: 'center', alignItems: 'center', margin: 4, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFF' },
    dateBoxSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
    dateText: { fontSize: 16, color: '#374151', fontWeight: '600' },
    dateTextSelected: { color: '#FFF', fontWeight: 'bold' },
    footerNavRight: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', marginTop: 24 },
    footerNavSpread: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
    finalCardSection: { width: '100%', marginBottom: 24 },
    pickerTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 12, textAlign: 'center' },
    pickerWrapper: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB', overflow: 'hidden', elevation: 2 },
    pickerItem: { color: '#111827', fontSize: 18, height: 120 },
    capacityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
    capBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20 },
    capVal: { fontSize: 24, fontWeight: '800', color: '#111827' },
    createButton: { paddingVertical: 18, paddingHorizontal: 36, borderRadius: 16, alignItems: 'center', backgroundColor: '#4F46E5', elevation: 5 },
    createButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
    textInput: { backgroundColor: 'white', padding: 16, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', fontSize: 16, color: '#374151' },
    jitCard: { backgroundColor: 'white', borderRadius: 24, padding: 24, borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 12 },
    leadDaysRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    stepperBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F5F7FF', alignItems: 'center', justifyContent: 'center' },
    leadVal: { fontSize: 32, fontWeight: '900', color: '#111827' },
    leadLabel: { fontSize: 10, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase' },
    divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 20 },
    sectionLabelCenter: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 16, textAlign: 'center' },
    hint: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center', marginTop: -8, marginBottom: 12 },
    calendarContainer: { backgroundColor: 'white', padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB' },
    calendarNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    calendarMonthText: { fontSize: 18, fontWeight: 'bold' },
    calendarGridContainer: { flexDirection: 'row', flexWrap: 'wrap' },
    calendarDayBox: { width: (width - 100) / 7, height: 40, alignItems: 'center', justifyContent: 'center' },
    calendarDayBoxSelected: { backgroundColor: '#4F46E5', borderRadius: 20 },
    calendarDayText: { fontSize: 16 },
    calendarDayTextSelected: { color: 'white', fontWeight: 'bold' },
});

export default EditScheduleScreen;