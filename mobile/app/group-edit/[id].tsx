import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useUpdateGroup } from '@/hooks/useUpdateGroup';
import TimePicker from '@/components/TimePicker';
import SchedulePicker, { Schedule } from '@/components/SchedulePicker';
import { Picker } from '@react-native-picker/picker';

const usaTimezones = [
    { label: "Eastern (ET)", value: "America/New_York" },
    { label: "Central (CST)", value: "America/Chicago" },
    { label: "Mountain (MT)", value: "America/Denver" },
    { label: "Mountain (no DST)", value: "America/Phoenix" },
    { label: "Pacific (PST)", value: "America/Los_Angeles" },
    { label: "Alaska (AKST)", value: "America/Anchorage" },
    { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
];

const GroupEditScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();

    const { data: groupDetails, isLoading } = useGetGroupDetails(id);
    const { mutate: updateGroup, isPending } = useUpdateGroup();

    const [meetTime, setMeetTime] = useState<string | undefined>();
    const [timezone, setTimezone] = useState<string | undefined>();
    const [schedule, setSchedule] = useState<Schedule | undefined>();

    useEffect(() => {
        if (groupDetails) {
            setMeetTime(groupDetails.time);
            setTimezone(groupDetails.timezone);
            setSchedule(groupDetails.schedule);
        }
    }, [groupDetails]);

    const handleSaveChanges = () => {
        if (!id || !meetTime || !schedule || !timezone) return;
        updateGroup({ groupId: id, time: meetTime, schedule, timezone });
    };

    if (isLoading || !groupDetails || !schedule) {
        return <ActivityIndicator size="large" style={{ marginTop: 32 }} />;
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
            <ScrollView style={{ padding: 24 }} keyboardShouldPersistTaps="handled">
                <TimePicker onTimeChange={setMeetTime} initialValue={groupDetails.time} />
                <View style={styles.timezoneContainer}>
                    <Text style={styles.timezoneTitle}>Select Timezone</Text>
                    <View style={styles.pickerWrapper}>
                        <Picker 
                            selectedValue={timezone} 
                            onValueChange={setTimezone}
                            // --- THIS IS THE FIX for the invisible text ---
                            itemStyle={styles.pickerItem}
                        >
                            {usaTimezones.map(tz => <Picker.Item key={tz.value} label={tz.label} value={tz.value} />)}
                        </Picker>
                    </View>
                </View>
                
                <SchedulePicker onScheduleChange={setSchedule} initialValue={schedule} />
                
                <TouchableOpacity
                    onPress={handleSaveChanges}
                    disabled={isPending}
                    style={[styles.saveButton, isPending && { backgroundColor: '#A5B4FC' }]}
                >
                    <Text style={styles.saveButtonText}>{isPending ? "Saving..." : "Save Changes"}</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', marginBottom: 8 },
    headerSubtitle: { fontSize: 18, color: '#4B5563', marginBottom: 24 },
    timezoneContainer: { width: '100%', marginVertical: 16 },
    timezoneTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 8, textAlign: 'center' },
    pickerWrapper: { backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', overflow: 'hidden' },
    saveButton: { width: '100%', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 24, backgroundColor: '#4F46E5' },
    saveButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
    pickerItem: {
        color: 'black',
        fontSize: 18,
    }
});

export default GroupEditScreen;