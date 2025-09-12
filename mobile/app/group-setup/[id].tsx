import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import React, { useState, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useUpdateGroupDetails } from '@/hooks/useUpdateGroupDetails';
import TimePicker from '@/components/TimePicker';
import SchedulePicker, { SchedulePickerRef } from '@/components/SchedulePicker';
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

const GroupSetupScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { data: groupDetails, isLoading } = useGetGroupDetails(id);
    const { mutate: updateDetails, isPending } = useUpdateGroupDetails();
    const [meetTime, setMeetTime] = useState("05:00 PM");
    const [timezone, setTimezone] = useState("America/Denver");
    const schedulePickerRef = useRef<SchedulePickerRef>(null);

    const handleSaveDetails = () => {
        const schedule = schedulePickerRef.current?.getSchedule();
        if (!schedule || !id) return;
        
        updateDetails({
            groupId: id,
            time: meetTime,
            schedule,
            timezone
        });
    };

    if (isLoading) {
        return <ActivityIndicator size="large" className="mt-8" />;
    }
    if (!groupDetails) {
        return <Text className="text-center mt-8">Group not found.</Text>;
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <ScrollView className="p-6" keyboardShouldPersistTaps="handled">
                <Text className="text-2xl font-bold text-gray-800 mb-2">Setting up '{groupDetails.name}'</Text>
                <Text className="text-lg text-gray-600 mb-6">Choose the schedule and time for your group.</Text>
                <TimePicker onTimeChange={setMeetTime} />
                <View className="w-full my-4">
                    <Text className="text-lg font-semibold text-gray-700 mb-2 text-center">Select Timezone</Text>
                    <View className="bg-white rounded-lg border border-gray-300 overflow-hidden">
                        <Picker
                            selectedValue={timezone}
                            onValueChange={(itemValue) => setTimezone(itemValue)}
                        >
                            {usaTimezones.map(tz => (
                                <Picker.Item key={tz.value} label={tz.label} value={tz.value} />
                            ))}
                        </Picker>
                    </View>
                </View>
                <SchedulePicker ref={schedulePickerRef} />
                <TouchableOpacity
                    onPress={handleSaveDetails}
                    disabled={isPending}
                    className={`w-full p-4 rounded-lg items-center mt-6 ${isPending ? 'bg-indigo-300' : 'bg-indigo-600'}`}
                >
                    <Text className="text-white text-lg font-bold">{isPending ? "Saving..." : "Save and Finish"}</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
};
export default GroupSetupScreen;