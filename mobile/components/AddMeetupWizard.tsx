import React, { useState, useMemo } from 'react';
import { 
    View, 
    Text, 
    TouchableOpacity, 
    TextInput, 
    StyleSheet, 
    Modal, 
    ActivityIndicator, 
    LayoutChangeEvent, 
    Alert,
    Platform
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GroupDetails, groupApi, useApiClient } from '@/utils/api';
import { DateTime } from 'luxon';
import TimePicker from './TimePicker';
import { Picker } from '@react-native-picker/picker';
import { useQueryClient } from '@tanstack/react-query';

interface AddMeetupWizardProps {
    visible: boolean;
    onClose: () => void;
    groupDetails: GroupDetails;
}

const daysOfWeekFull = [
    { label: "Sunday", value: 0 }, 
    { label: "Monday", value: 1 }, 
    { label: "Tuesday", value: 2 },
    { label: "Wednesday", value: 3 }, 
    { label: "Thursday", value: 4 }, 
    { label: "Friday", value: 5 }, 
    { label: "Saturday", value: 6 },
];

const usaTimezones = [
    { label: "Eastern (ET)", value: "America/New_York" },
    { label: "Central (CST)", value: "America/Chicago" },
    { label: "Mountain (MT)", value: "America/Denver" },
    { label: "Mountain (no DST)", value: "America/Phoenix" },
    { label: "Pacific (PST)", value: "America/Los_Angeles" },
    { label: "Alaska (AKST)", value: "America/Anchorage" },
    { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
];

/**
 * AddMeetupWizard
 * A streamlined 4-step wizard for creating one-off meetups.
 */
const AddMeetupWizard = ({ visible, onClose, groupDetails }: AddMeetupWizardProps) => {
    const api = useApiClient();
    const queryClient = useQueryClient();

    // --- Wizard State ---
    const [step, setStep] = useState(1);
    const [isSaving, setIsSaving] = useState(false);

    // --- Data States ---
    const [meetupDate, setMeetupDate] = useState<string>(DateTime.now().toISODate()!);
    const [meetupTime, setMeetupTime] = useState("05:00 PM");
    const [meetupTZ, setMeetupTZ] = useState(groupDetails.timezone || "America/Denver");
    const [meetupCapacity, setMeetupCapacity] = useState(groupDetails.defaultCapacity || 0);
    const [meetupLocation, setMeetupLocation] = useState(groupDetails.defaultLocation || "");

    // --- Calendar Logic ---
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

    const onCalendarContainerLayout = (meetup: LayoutChangeEvent) => {
        const { width: measuredWidth } = meetup.nativeEvent.layout;
        /**
         * FIX: Divider logic to ensure 7 items fit perfectly.
         * The safety margin -0.5 prmeetups floating point rounding from forcing a wrap.
         */
        setCalculatedDayWidth((measuredWidth / 7) - 0.5);
    };

    const handleCreateMeetup = async () => {
        setIsSaving(true);
        try {
            /**
             * FIX: Passing meetupDate as the raw string (YYYY-MM-DD) instead of new Date().
             * This prmeetups local environment timezone shifting that causes the "one day early" bug.
             */
            await groupApi.createOneOffMeetup(api, {
                groupId: groupDetails._id,
                date: meetupDate as any, 
                time: meetupTime,
                timezone: meetupTZ,
                capacity: meetupCapacity,
                location: meetupLocation,
                name: groupDetails.name 
            });
            Alert.alert("Success", "Meetup added!");
            resetAndClose();
            queryClient.invalidateQueries({ queryKey: ['meetups'] });
        } catch (error: any) {
            Alert.alert("Error", error.response?.data?.error || "Failed to add meetup.");
        } finally {
            setIsSaving(false);
        }
    };

    const resetAndClose = () => {
        setStep(1);
        setMeetupDate(DateTime.now().toISODate()!);
        setMeetupTime("05:00 PM");
        onClose();
    };

    return (
        <Modal 
            visible={visible} 
            animationType="slide" 
            presentationStyle="pageSheet" 
            onRequestClose={resetAndClose}
        >
            <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                    <TouchableOpacity onPress={resetAndClose}><Feather name="x" size={24} color="#374151" /></TouchableOpacity>
                    <Text style={styles.modalHeaderTitle}>Add Meetup</Text>
                    <View style={{ width: 24 }} />
                </View>

                {step === 1 && (
                    <View style={styles.wizardStep}>
                        <Text style={styles.wizardTitle}>Select Meetup Date</Text>
                        <View style={styles.calendarContainer} onLayout={onCalendarContainerLayout}>
                            <View style={styles.calendarNav}>
                                <TouchableOpacity onPress={()=>setCalendarMonth(prev=>prev.minus({months:1}))}><Feather name="chevron-left" size={24} color="#4A90E2"/></TouchableOpacity>
                                <Text style={styles.calendarMonthText}>{calendarMonth.toFormat('MMMM yyyy')}</Text>
                                <TouchableOpacity onPress={()=>setCalendarMonth(prev=>prev.plus({months:1}))}><Feather name="chevron-right" size={24} color="#4A90E2"/></TouchableOpacity>
                            </View>
                            <View style={styles.calendarGridContainer}>
                                {daysOfWeekFull.map((day, i) => (
                                    <View key={i} style={[styles.calendarDayBox, { width: calculatedDayWidth }]}>
                                        <Text style={styles.dayLabelText}>{day.label.charAt(0)}</Text>
                                    </View>
                                ))}
                            </View>
                            <View style={styles.calendarGridContainer}>
                                {calendarGrid.map((day, idx)=>{
                                    if(!day) return <View key={idx} style={[styles.calendarDayBox, { width: calculatedDayWidth }]}/>;
                                    const isSel = day.toISODate() === meetupDate;
                                    return (
                                        <TouchableOpacity 
                                            key={day.toISODate()} 
                                            onPress={()=>setMeetupDate(day.toISODate()!)} 
                                            style={[styles.calendarDayBox, { width: calculatedDayWidth }, isSel && styles.calendarDayBoxSelected]}
                                        >
                                            <Text style={[styles.calendarDayText, isSel && styles.calendarDayTextSelected]}>{day.day}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                        <TouchableOpacity onPress={() => setStep(2)} style={styles.nextBtn}><Text style={styles.nextBtnText}>Next</Text></TouchableOpacity>
                    </View>
                )}

                {step === 2 && (
                    <View style={styles.wizardStep}>
                        <Text style={styles.wizardTitle}>Select Time</Text>
                        <TimePicker onTimeChange={setMeetupTime} initialValue={meetupTime} />
                        <Text style={styles.pickerLabel}>Timezone</Text>
                        <View style={styles.pickerWrapper}>
                            <Picker 
                                selectedValue={meetupTZ} 
                                onValueChange={setMeetupTZ} 
                                itemStyle={{ height: 120, color: '#111827' }}
                                dropdownIconColor="#111827"
                            >
                                {usaTimezones.map(tz => (
                                    <Picker.Item 
                                        key={tz.value} 
                                        label={tz.label} 
                                        value={tz.value} 
                                        color="#111827" 
                                    />
                                ))}
                            </Picker>
                        </View>
                        <View style={styles.rowBtn}>
                            <TouchableOpacity onPress={() => setStep(1)} style={styles.backBtn}><Text style={styles.backBtnText}>Back</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => setStep(3)} style={styles.nextBtn}><Text style={styles.nextBtnText}>Next</Text></TouchableOpacity>
                        </View>
                    </View>
                )}

                {step === 3 && (
                    <View style={styles.wizardStep}>
                        <Text style={styles.wizardTitle}>Max Attendees?</Text>
                        <View style={styles.stepperContainer}>
                            <TouchableOpacity onPress={() => setMeetupCapacity(Math.max(0, meetupCapacity - 1))} style={styles.stepperBtn}><Feather name="minus" size={24} color="#FF7A6E" /></TouchableOpacity>
                            <View style={{ alignItems: 'center', width: 120 }}><Text style={styles.stepperVal}>{meetupCapacity === 0 ? "∞" : meetupCapacity}</Text><Text style={styles.stepperLabel}>{meetupCapacity === 0 ? "Unlimited" : "Spots"}</Text></View>
                            <TouchableOpacity onPress={() => setMeetupCapacity(meetupCapacity + 1)} style={styles.stepperBtn}><Feather name="plus" size={24} color="#4FD1C5" /></TouchableOpacity>
                        </View>
                        <View style={styles.rowBtn}>
                            <TouchableOpacity onPress={() => setStep(2)} style={styles.backBtn}><Text style={styles.backBtnText}>Back</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => setStep(4)} style={styles.nextBtn}><Text style={styles.nextBtnText}>Next</Text></TouchableOpacity>
                        </View>
                    </View>
                )}

                {step === 4 && (
                    <View style={styles.wizardStep}>
                        <Text style={styles.wizardTitle}>Location Info</Text>
                        <TextInput 
                            style={styles.input} 
                            value={meetupLocation} 
                            onChangeText={setMeetupLocation} 
                            placeholder="e.g. Starbucks or Zoom link..." 
                            autoFocus 
                        />
                        <View style={styles.rowBtn}>
                            <TouchableOpacity onPress={() => setStep(3)} style={styles.backBtn}><Text style={styles.backBtnText}>Back</Text></TouchableOpacity>
                            <TouchableOpacity onPress={handleCreateMeetup} disabled={isSaving} style={styles.finishBtn}>
                                {isSaving ? <ActivityIndicator color="white" /> : <Text style={styles.finishBtnText}>Create Meetup</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContent: { flex: 1, backgroundColor: 'white', padding: 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
    modalHeaderTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    wizardStep: { flex: 1 },
    wizardTitle: { fontSize: 24, fontWeight: '900', color: '#111827', textAlign: 'center', marginBottom: 24 },
    calendarContainer: { backgroundColor: '#F9FAFB', borderRadius: 16, marginBottom: 20, overflow: 'hidden' },
    calendarNav: { flexDirection: 'row', justifyContent: 'space-between', padding: 15 },
    calendarMonthText: { fontWeight: 'bold', fontSize: 16 },
    calendarGridContainer: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
    calendarDayBox: { height: 45, alignItems: 'center', justifyContent: 'center' },
    calendarDayBoxSelected: { backgroundColor: '#4A90E2', borderRadius: 25 },
    calendarDayText: { fontSize: 14 },
    calendarDayTextSelected: { color: 'white', fontWeight: 'bold' },
    dayLabelText: { fontSize: 10, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase' },
    nextBtn: { backgroundColor: '#4A90E2', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 'auto' },
    nextBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    backBtn: { backgroundColor: '#F3F4F6', padding: 16, borderRadius: 12, alignItems: 'center', flex: 1 },
    backBtnText: { color: '#374151', fontWeight: 'bold' },
    finishBtn: { backgroundColor: '#4A90E2', padding: 16, borderRadius: 12, alignItems: 'center', flex: 2 },
    finishBtnText: { color: 'white', fontWeight: 'bold' },
    rowBtn: { flexDirection: 'row', gap: 12, marginTop: 'auto' },
    pickerLabel: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginTop: 24, marginBottom: 8, textAlign: 'center' },
    pickerWrapper: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, overflow: 'hidden' },
    stepperContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flex: 1 },
    stepperBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F5F7FF', alignItems: 'center', justifyContent: 'center' },
    stepperVal: { fontSize: 40, fontWeight: '900', color: '#111827' },
    stepperLabel: { fontSize: 10, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase' },
    input: { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 12, fontSize: 16, borderBottomWidth: 2, borderBottomColor: '#4A90E2' }
});

export default AddMeetupWizard;