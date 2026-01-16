import React, { useState, useRef, useEffect, useMemo } from "react";
import { 
    View, 
    Text, 
    TouchableOpacity, 
    ScrollView, 
    StyleSheet, 
    Alert, 
    Dimensions, 
    Modal, 
    FlatList, 
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
import { useApiClient, User, userApi } from "@/utils/api";
import TimePicker from "@/components/TimePicker";

const { width } = Dimensions.get('window');

// Wizard Math
const CARD_WIDTH = width * 0.90; 
const SIDE_INSET = (width - CARD_WIDTH) / 2; 

type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom' | null;

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

const FadeInView = ({ children, delay = 0, style }: { children: React.ReactNode, delay?: number, style?: StyleProp<ViewStyle> }) => {
  const fadeAnim = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay, useNativeDriver: true }).start();
  }, [delay]);
  return <Animated.View style={[{ opacity: fadeAnim, width: '100%' }, style]}>{children}</Animated.View>;
};

const EditScheduleScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const api = useApiClient();
    const queryClient = useQueryClient();

    // Data Fetching
    const { data: group, isLoading: loadingGroup } = useGetGroupDetails(id);
    const { data: currentUser } = useQuery<User, Error>({ 
        queryKey: ['currentUser'], 
        queryFn: () => userApi.getCurrentUser(api) 
    });

    // Wizard State
    const [step, setStep] = useState(1);
    const [frequency, setFrequency] = useState<Frequency>(null);
    const [selectedDays, setSelectedDays] = useState<number[]>([]); 
    const [selectedDates, setSelectedDates] = useState<number[]>([]); 
    const [meetTime, setMeetTime] = useState("05:00 PM");
    const [timezone, setTimezone] = useState("America/Denver");
    const [isUpdating, setIsUpdating] = useState(false);

    // Pre-populate state from existing group data
    useEffect(() => {
        if (group?.schedule) {
            setFrequency(group.schedule.frequency);
            setMeetTime(group.time);
            setTimezone(group.timezone);
            if (group.schedule.frequency === 'weekly' || group.schedule.frequency === 'biweekly') {
                setSelectedDays(group.schedule.days || []);
            } else if (group.schedule.frequency === 'monthly') {
                setSelectedDates(group.schedule.days || []);
            }
        }
    }, [group]);

    const handleUpdateSchedule = async () => {
        setIsUpdating(true);
        try {
            let finalSchedule: any = { frequency };
            if (frequency === 'weekly' || frequency === 'biweekly') finalSchedule.days = selectedDays;
            else if (frequency === 'monthly') finalSchedule.days = selectedDates;
            else if (frequency === 'daily') finalSchedule.days = [0, 1, 2, 3, 4, 5, 6];

            await api.patch(`/groups/${id}/schedule`, {
                schedule: finalSchedule,
                time: meetTime,
                timezone: timezone
            });

            // Invalidate queries so the details overlay and dashboard reflect changes
            queryClient.invalidateQueries({ queryKey: ['groupDetails', id] });
            queryClient.invalidateQueries({ queryKey: ['events'] });
            
            Alert.alert("Success", "Schedule updated and future events regenerated.");
            router.back();
        } catch (error: any) {
            Alert.alert("Update Error", error.response?.data?.message || "Failed to update schedule.");
        } finally {
            setIsUpdating(false);
        }
    };

    const toggleDay = (val: number) => setSelectedDays(prev => prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val]);
    const toggleDate = (val: number) => setSelectedDates(prev => prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val]);

    if (loadingGroup || !currentUser) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#4F46E5" /></SafeAreaView>;

    // Permission Check
    if (group && group.owner !== currentUser._id) {
        return (
            <SafeAreaView style={styles.center}>
                <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>Access Denied: Only owners can edit schedules.</Text>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
                    <Text style={{ color: '#4F46E5' }}>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Feather name="x" size={24} color="#374151" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Update Schedule</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.content}>
                {step === 1 && (
                    <View style={styles.stepBox}>
                        <FadeInView delay={100}><Text style={styles.title}>How often will you meet?</Text></FadeInView>
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                            {['daily', 'weekly', 'biweekly', 'monthly'].map((f) => (
                                <TouchableOpacity key={f} style={[styles.option, frequency === f && styles.optionSelected]} onPress={() => setFrequency(f as any)}>
                                    <View style={[styles.radio, frequency === f && styles.radioActive]} />
                                    <Text style={[styles.optionText, frequency === f && styles.optionTextActive]}>
                                        {f === 'biweekly' ? 'Every 2 Weeks' : f.charAt(0).toUpperCase() + f.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity style={styles.nextBtn} onPress={() => frequency === 'daily' ? setStep(3) : setStep(2)} disabled={!frequency}>
                            <Feather name="arrow-right" size={24} color="white" />
                        </TouchableOpacity>
                    </View>
                )}

                {step === 2 && (
                    <View style={styles.stepBox}>
                        <FadeInView delay={100}><Text style={styles.title}>Which days/dates?</Text></FadeInView>
                        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                            {frequency === 'monthly' ? (
                                <View style={styles.grid}>
                                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                        <TouchableOpacity key={d} style={[styles.dateBox, selectedDates.includes(d) && styles.dateBoxActive]} onPress={() => toggleDate(d)}>
                                            <Text style={[styles.dateText, selectedDates.includes(d) && styles.dateTextActive]}>{d}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            ) : (
                                daysOfWeek.map(d => (
                                    <TouchableOpacity key={d.value} style={[styles.option, selectedDays.includes(d.value) && styles.optionSelected]} onPress={() => toggleDay(d.value)}>
                                        <View style={[styles.radio, selectedDays.includes(d.value) && styles.radioActive]} />
                                        <Text style={[styles.optionText, selectedDays.includes(d.value) && styles.optionTextActive]}>{d.label}</Text>
                                    </TouchableOpacity>
                                ))
                            )}
                        </ScrollView>
                        <View style={styles.navRow}>
                            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}><Feather name="arrow-left" size={24} color="#4F46E5" /></TouchableOpacity>
                            <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(3)} disabled={(frequency === 'monthly' ? selectedDates.length : selectedDays.length) === 0}>
                                <Feather name="arrow-right" size={24} color="white" />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {step === 3 && (
                    <View style={styles.stepBox}>
                        <FadeInView delay={100}><Text style={styles.title}>Final Details</Text></FadeInView>
                        <ScrollView>
                            <Text style={styles.label}>Choose Meeting Time</Text>
                            <TimePicker onTimeChange={setMeetTime} initialValue={meetTime} />
                            
                            <Text style={[styles.label, { marginTop: 24 }]}>Select Timezone</Text>
                            <View style={styles.pickerWrap}>
                                <Picker selectedValue={timezone} onValueChange={setTimezone}>
                                    {usaTimezones.map(tz => <Picker.Item key={tz.value} label={tz.label} value={tz.value} />)}
                                </Picker>
                            </View>
                        </ScrollView>
                        <View style={styles.navRow}>
                            <TouchableOpacity style={styles.backBtn} onPress={() => frequency === 'daily' ? setStep(1) : setStep(2)}><Feather name="arrow-left" size={24} color="#4F46E5" /></TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateSchedule} disabled={isUpdating}>
                                {isUpdating ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>Save Changes</Text>}
                            </TouchableOpacity>
                        </View>
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
    content: { flex: 1 },
    stepBox: { flex: 1, padding: 24 },
    title: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', textAlign: 'center', marginBottom: 32 },
    option: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#D1D5DB' },
    optionSelected: { backgroundColor: '#EEF2FF', borderColor: '#4F46E5' },
    optionText: { fontSize: 18, color: '#374151', marginLeft: 12 },
    optionTextActive: { color: '#4F46E5', fontWeight: 'bold' },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D1D5DB' },
    radioActive: { borderColor: '#4F46E5', backgroundColor: '#4F46E5' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    dateBox: { width: width/7 - 12, height: width/7 - 12, justifyContent: 'center', alignItems: 'center', margin: 4, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB' },
    dateBoxActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
    dateText: { color: '#374151' },
    dateTextActive: { color: 'white', fontWeight: 'bold' },
    navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
    nextBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center' },
    backBtn: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: '#4F46E5', justifyContent: 'center', alignItems: 'center' },
    saveBtn: { flex: 1, height: 56, borderRadius: 28, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', marginLeft: 16 },
    saveText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    label: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 8 },
    pickerWrap: { backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#D1D5DB', overflow: 'hidden' }
});

export default EditScheduleScreen;