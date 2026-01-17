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
    StyleProp,
    ViewStyle
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import { useGetGroupDetails } from "@/hooks/useGetGroupDetails";
import { useApiClient, User, userApi, Frequency } from "@/utils/api"; 
import TimePicker from "@/components/TimePicker";

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
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        if (group) {
            setFrequency(group.schedule?.frequency || null);
            setMeetTime(group.time || "05:00 PM");
            setTimezone(group.timezone || "America/Denver");
            setDefaultCapacity(group.defaultCapacity || 0);
            if (group.schedule?.frequency === 'weekly' || group.schedule?.frequency === 'biweekly') {
                setSelectedDays(group.schedule.days || []);
            } else if (group.schedule?.frequency === 'monthly') {
                setSelectedDates(group.schedule.days || []);
            }
        }
    }, [group]);

    const handleUpdateSchedule = async () => {
        if (!id) return;
        setIsUpdating(true);
        
        let finalSchedule: any = { frequency };
        if (frequency === 'weekly' || frequency === 'biweekly') finalSchedule.days = selectedDays;
        else if (frequency === 'monthly') finalSchedule.days = selectedDates;
        else if (frequency === 'daily') finalSchedule.days = [0, 1, 2, 3, 4, 5, 6];

        const targetUrl = `/api/groups/${id}/schedule`;

        try {
            await api.patch(targetUrl, {
                schedule: finalSchedule,
                time: meetTime,
                timezone: timezone,
                defaultCapacity: defaultCapacity
            });

            queryClient.invalidateQueries({ queryKey: ['groupDetails', id] });
            queryClient.invalidateQueries({ queryKey: ['events'] });
            
            Alert.alert("Success", "Schedule updated and recurring events regenerated.");
            router.back();
        } catch (error: any) {
            Alert.alert("Update Error", "Failed to update schedule.");
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
                            <FadeInView delay={100}><Text style={styles.title}>Choose time & capacity</Text></FadeInView>
                            
                            <FadeInView delay={300} style={styles.finalCardSection}>
                                <Text style={styles.pickerTitle}>Meeting Time</Text>
                                <TimePicker onTimeChange={setMeetTime} initialValue={meetTime} />
                            </FadeInView>
                            
                            <FadeInView delay={400} style={styles.finalCardSection}>
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

                            <FadeInView delay={500} style={styles.finalCardSection}>
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

                        <FadeInView delay={700}>
                            <View style={styles.footerNavSpread}>
                                <TouchableOpacity onPress={() => frequency === 'daily' ? setStep(1) : setStep(2)}>
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
    title: { fontSize: 26, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 32 },
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
});

export default EditScheduleScreen;