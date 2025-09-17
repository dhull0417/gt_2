import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Modal, Platform } from 'react-native';
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateEvent } from '@/hooks/useUpdateEvent';
import { Event } from '@/utils/api';
import TimePicker from '@/components/TimePicker';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

const usaTimezones = [
    { label: "Eastern (ET)", value: "America/New_York" },
    { label: "Central (CST)", value: "America/Chicago" },
    { label: "Mountain (MT)", value: "America/Denver" },
    { label: "Mountain (no DST)", value: "America/Phoenix" },
    { label: "Pacific (PST)", value: "America/Los_Angeles" },
    { label: "Alaska (AKST)", value: "America/Anchorage" },
    { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
];

const EventEditScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const queryClient = useQueryClient();
    const { mutate: updateEvent, isPending } = useUpdateEvent();
    
    const eventToEdit = queryClient.getQueryData<Event[]>(['events'])?.find(e => e._id === id);

    const [date, setDate] = useState(new Date());
    const [tempDate, setTempDate] = useState(new Date()); // Temporary state for the picker
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [meetTime, setMeetTime] = useState("05:00 PM");
    const [timezone, setTimezone] = useState("America/Denver");

    useEffect(() => {
        if (eventToEdit) {
            const initialDate = new Date(eventToEdit.date);
            setDate(initialDate);
            setTempDate(initialDate);
            setMeetTime(eventToEdit.time);
            setTimezone(eventToEdit.timezone);
        }
    }, [eventToEdit]);

    const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
        }
        if (selectedDate) {
            setTempDate(selectedDate); // Only update temp date during selection
        }
    };

    const confirmDate = () => {
        setDate(tempDate); // Finalize the date selection
        setShowDatePicker(false);
    };
    
    const handleSaveChanges = () => {
        if (!id) return;
        updateEvent({ eventId: id, date, time: meetTime, timezone });
    };

    if (!eventToEdit) {
        return <Text style={{textAlign: 'center', marginTop: 20}}>Event not found. Please go back and try again.</Text>;
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
            <ScrollView style={{ padding: 24 }} keyboardShouldPersistTaps="handled">
                 <View style={{ marginBottom: 24 }}>
                    <Text style={styles.title}>Set New Date</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateButton}>
                        <Text style={styles.dateButtonText}>{date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</Text>
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
                    onPress={handleSaveChanges}
                    disabled={isPending}
                    style={[styles.saveButton, isPending && { backgroundColor: '#A5B4FC' }]}
                >
                    <Text style={styles.saveButtonText}>{isPending ? "Saving..." : "Save Changes"}</Text>
                </TouchableOpacity>
            </ScrollView>

            {/* --- THIS IS THE NEW MODAL FOR THE DATE PICKER --- */}
            {showDatePicker && (
                // On Android, the default picker is a modal, so we only need the custom modal for iOS
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
                                    textColor='black' // Fix for invisible text
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

export default EventEditScreen;