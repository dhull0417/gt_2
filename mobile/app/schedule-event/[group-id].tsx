import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Modal, Platform } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useCreateOneOffEvent } from '@/hooks/useCreateOneOffEvent';
import TimePicker from '@/components/TimePicker';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Alert } from 'react-native';

const usaTimezones = [
    { label: "Eastern (ET)", value: "America/New_York" },
    { label: "Central (CST)", value: "America/Chicago" },
    { label: "Mountain (MT)", value: "America/Denver" },
    { label: "Mountain (no DST)", value: "America/Phoenix" },
    { label: "Pacific (PST)", value: "America/Los_Angeles" },
    { label: "Alaska (AKST)", value: "America/Anchorage" },
    { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
];

const ScheduleEventScreen = () => {
    const { "group-id": groupId } = useLocalSearchParams<{ "group-id": string }>();
    const { mutate: createOneOffEvent, isPending } = useCreateOneOffEvent();
    
    const [date, setDate] = useState(new Date());
    const [tempDate, setTempDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [meetTime, setMeetTime] = useState("05:00 PM");
    const [timezone, setTimezone] = useState("America/Denver");

    const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
        }
        if (selectedDate) {
            setTempDate(selectedDate);
        }
    };

    const confirmDate = () => {
        setDate(tempDate);
        setShowDatePicker(false);
    };
    
    const handleScheduleEvent = () => {
        if (!groupId) {
            Alert.alert("Error", "Could not find the group ID to schedule this event for.");
            return;
        };
        createOneOffEvent({ groupId, date, time: meetTime, timezone });
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
            <ScrollView style={{ padding: 24 }} keyboardShouldPersistTaps="handled">
                 <View style={{ marginBottom: 24 }}>
                    <Text style={styles.title}>Select Date</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateButton}>
                        <Text style={styles.dateButtonText}>{date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
                    </TouchableOpacity>
                </View>
                
                <TimePicker onTimeChange={setMeetTime} initialValue={meetTime} />

                <View style={styles.timezoneContainer}>
                    <Text style={styles.title}>Select Timezone</Text>
                    <View style={styles.pickerWrapper}>
                        <Picker 
                            selectedValue={timezone} 
                            onValueChange={setTimezone}
                            itemStyle={styles.pickerItem}
                        >
                            {usaTimezones.map(tz => <Picker.Item key={tz.value} label={tz.label} value={tz.value} />)}
                        </Picker>
                    </View>
                </View>
                
                <TouchableOpacity
                    onPress={handleScheduleEvent}
                    disabled={isPending}
                    style={[styles.saveButton, isPending && { backgroundColor: '#A5B4FC' }]}
                >
                    <Text style={styles.saveButtonText}>{isPending ? "Scheduling..." : "Schedule Event"}</Text>
                </TouchableOpacity>
            </ScrollView>

            {showDatePicker && (
                 Platform.OS === 'ios' ? (
                    <Modal
                        animationType="slide"
                        transparent={true}
                        visible={showDatePicker}
                        onRequestClose={() => setShowDatePicker(false)}
                    >
                        <View style={styles.modalContainer}>
                            <View style={styles.datePickerContent}>
                                <DateTimePicker
                                    value={tempDate}
                                    mode="date"
                                    display="spinner"
                                    onChange={onDateChange}
                                    textColor='black'
                                />
                                <TouchableOpacity onPress={confirmDate} style={styles.doneButton}>
                                    <Text style={styles.doneButtonText}>Done</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Modal>
                ) : (
                    <DateTimePicker
                        value={tempDate}
                        mode="date"
                        display="default"
                        onChange={onDateChange}
                    />
                )
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    title: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 8, textAlign: 'center' },
    dateButton: { paddingVertical: 16, backgroundColor: 'white', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, alignItems: 'center' },
    dateButtonText: { color: '#4F46E5', fontSize: 18 },
    timezoneContainer: { width: '100%', marginVertical: 16 },
    pickerWrapper: { backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', overflow: 'hidden' },
    saveButton: { width: '100%', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 24, backgroundColor: '#4F46E5' },
    saveButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
    pickerItem: { color: 'black', fontSize: 18 },
    modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    datePickerContent: { backgroundColor: 'white', borderTopRightRadius: 20, borderTopLeftRadius: 20, padding: 16 },
    doneButton: { backgroundColor: '#4F46E5', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
    doneButtonText: { color: 'white', fontSize: 18, fontWeight: '600' },
});

export default ScheduleEventScreen;