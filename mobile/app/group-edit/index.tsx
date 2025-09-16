import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
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

    const { data: groupDetails, isLoading } = useGetGroupDetails(id);
    const { mutate: updateGroup, isPending } = useUpdateGroup();

    // State for the form, initialized as empty
    const [meetTime, setMeetTime] = useState<string | undefined>();
    const [timezone, setTimezone] = useState<string | undefined>();
    const [schedule, setSchedule] = useState<Schedule | undefined>();

    // When the group data loads, pre-fill the form state
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

    if (isLoading || !groupDetails) {
        return <ActivityIndicator size="large" className="mt-8" />;
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <ScrollView className="p-6">
                <TimePicker onTimeChange={setMeetTime} initialValue={groupDetails.time} />
                <View className="w-full my-4">
                    <Text className="text-lg font-semibold text-gray-700 mb-2 text-center">Select Timezone</Text>
                    <View className="bg-white rounded-lg border border-gray-300 overflow-hidden">
                        <Picker selectedValue={timezone} onValueChange={setTimezone}>
                            {usaTimezones.map(tz => <Picker.Item key={tz.value} label={tz.label} value={tz.value} />)}
                        </Picker>
                    </View>
                </View>
                {/* Ensure the SchedulePicker is only rendered when we have an initial value */}
                {schedule && (
                    <SchedulePicker onScheduleChange={setSchedule} initialValue={schedule} />
                )}
                <TouchableOpacity
                    onPress={handleSaveChanges}
                    disabled={isPending}
                    className={`w-full p-4 rounded-lg items-center mt-6 ${isPending ? 'bg-indigo-300' : 'bg-indigo-600'}`}
                >
                    <Text className="text-white text-lg font-bold">{isPending ? "Saving..." : "Save Changes"}</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
};

export default GroupEditScreen;