import { View, Text, ScrollView, ActivityIndicator, StyleSheet, Modal, Platform } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateMeetup } from '@/hooks/useUpdateMeetup';
import { Meetup } from '@/utils/api';
import NativeTimePicker from '@/components/NativeTimePicker';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useThemeColors } from '@/contexts/AppearanceContext';

const usaTimezones = [
    { label: "Eastern (ET)", value: "America/New_York" },
    { label: "Central (CST)", value: "America/Chicago" },
    { label: "Mountain (MT)", value: "America/Denver" },
    { label: "Mountain (no DST)", value: "America/Phoenix" },
    { label: "Pacific (PST)", value: "America/Los_Angeles" },
    { label: "Alaska (AKST)", value: "America/Anchorage" },
    { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
];

const MeetupEditScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const queryClient = useQueryClient();
    const { mutate: updateMeetup, isPending } = useUpdateMeetup();
    const colors = useThemeColors();

    const meetupToEdit = queryClient.getQueryData<Meetup[]>(['meetups'])?.find(e => e._id === id);

    const [date, setDate] = useState(new Date());
    const [tempDate, setTempDate] = useState(new Date()); // Temporary state for the picker
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [meetTime, setMeetTime] = useState("05:00 PM");
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [timezone, setTimezone] = useState("America/Denver");

    useEffect(() => {
        if (meetupToEdit) {
            const initialDate = new Date(meetupToEdit.date);
            setDate(initialDate);
            setTempDate(initialDate);
            setMeetTime(meetupToEdit.time);
            setTimezone(meetupToEdit.timezone);
        }
    }, [meetupToEdit]);

    const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            // Android has no "Done" button — event.type 'set' IS the confirm; 'dismissed' must leave `date` untouched
            setShowDatePicker(false);
            if (event.type === 'set' && selectedDate) {
                setDate(selectedDate);
                setTempDate(selectedDate);
            }
            return;
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
        // Timezone omitted — backend uses the group's default
        updateMeetup({ meetupId: id, date, time: meetTime });
    };

    if (!meetupToEdit) {
        return <Text style={{textAlign: 'center', marginTop: 20, color: colors.textPrimary}}>Meetup not found. Please go back and try again.</Text>;
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView style={{ padding: 24 }} keyboardShouldPersistTaps="handled">
                 <View style={{ marginBottom: 24 }}>
                    <Text style={[styles.title, { color: colors.textSecondary }]}>Set New Date</Text>
                    <PressableOpacity onPress={() => setShowDatePicker(true)} style={[styles.dateButton, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}>
                        <Text style={[styles.dateButtonText, { color: colors.brand }]}>{date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: meetupToEdit?.timezone })}</Text>
                    </PressableOpacity>
                </View>

                <View style={{ marginBottom: 24 }}>
                    <Text style={[styles.title, { color: colors.textSecondary }]}>Set New Time</Text>
                    <PressableOpacity onPress={() => setShowTimePicker(true)} style={[styles.dateButton, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}>
                        <Text style={[styles.dateButtonText, { color: colors.brand }]}>{meetTime}</Text>
                    </PressableOpacity>
                </View>

                <View style={styles.timezoneContainer}>
                    <Text style={[styles.title, { color: colors.textSecondary }]}>Select Timezone</Text>
                    <View style={[styles.pickerWrapper, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}>
                        <Picker
                            selectedValue={timezone}
                            onValueChange={setTimezone}
                            itemStyle={[styles.pickerItem, { color: colors.textPrimary }]}
                            style={{ color: colors.textPrimary, backgroundColor: colors.surface }}
                            dropdownIconColor={colors.textSecondary}
                        >
                            {usaTimezones.map(tz => <Picker.Item key={tz.value} label={tz.label} value={tz.value} />)}
                        </Picker>
                    </View>
                </View>

                <PressableOpacity
                    onPress={handleSaveChanges}
                    disabled={isPending}
                    style={[styles.saveButton, { backgroundColor: colors.accentTeal }, isPending && { backgroundColor: colors.accentTeal, opacity: 0.7 }]}
                >
                    <Text style={styles.saveButtonText}>{isPending ? "Saving..." : "Save Changes"}</Text>
                </PressableOpacity>
            </ScrollView>

            {showDatePicker && (
                // Android's picker is already a modal; iOS needs this custom wrapper
                Platform.OS === 'ios' ? (
                    <Modal
                        animationType="slide"
                        transparent={true}
                        visible={showDatePicker}
                        onRequestClose={() => setShowDatePicker(false)}
                    >
                        <View style={[styles.modalContainer, { backgroundColor: colors.overlay }]}>
                            <View style={[styles.datePickerContent, { backgroundColor: colors.surface }]}>
                                <DateTimePicker
                                    value={tempDate}
                                    mode="date"
                                    display="spinner"
                                    onChange={onDateChange}
                                    textColor={colors.textPrimary} // Fix for invisible text
                                />
                                <PressableOpacity onPress={confirmDate} style={[styles.doneButton, { backgroundColor: colors.brand }]}>
                                    <Text style={styles.doneButtonText}>Done</Text>
                                </PressableOpacity>
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

            {showTimePicker && (
                <NativeTimePicker value={meetTime} onChange={setMeetTime} onClose={() => setShowTimePicker(false)} />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    title: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 8, textAlign: 'center' },
    dateButton: { paddingVertical: 16, backgroundColor: 'white', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, alignItems: 'center' },
    dateButtonText: { color: '#4A90E2', fontSize: 18 },
    timezoneContainer: { width: '100%', marginVertical: 16 },
    pickerWrapper: { backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', overflow: 'hidden' },
    saveButton: { width: '100%', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 24, backgroundColor: '#4FD1C5' },
    saveButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
    pickerItem: { color: 'black', fontSize: 18 },
    modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    datePickerContent: { backgroundColor: 'white', borderTopRightRadius: 20, borderTopLeftRadius: 20, padding: 16 },
    doneButton: { backgroundColor: '#4A90E2', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
    doneButtonText: { color: 'white', fontSize: 18, fontWeight: '600' },
});

export default MeetupEditScreen;