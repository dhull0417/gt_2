// mobile/components/CreateGroupScreen.tsx (NEW FILE)

import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useCreateGroup } from '@/hooks/useCreateGroup';
import { RecurrenceRule } from '@/utils/api';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

type CreateGroupScreenProps = {
    onClose: () => void;
};

const CreateGroupScreen = ({ onClose }: CreateGroupScreenProps) => {
    const [groupName, setGroupName] = useState('');
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    
    // For now, we will use a simple fixed recurrence rule. 
    // You can build out the full "Natural Language Builder" UI here later.
    const [recurrence, setRecurrence] = useState<RecurrenceRule>({
        frequency: 'weekly',
        interval: 1,
        daysOfWeek: [new Date().getDay()], // Defaults to today's day of the week
    });

    const { mutate, isPending } = useCreateGroup();

    const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
        const currentDate = selectedDate || date;
        setShowDatePicker(false);
        setDate(currentDate);
        // Also update the recurrence day of the week to match
        setRecurrence(prev => ({ ...prev, daysOfWeek: [currentDate.getDay()] }));
    };

    const handleCreate = () => {
        if (!groupName.trim()) {
            Alert.alert("Error", "Group name is required.");
            return;
        }
        mutate({ name: groupName, eventStartDate: date, recurrence }, {
            onSuccess: () => {
                Alert.alert("Success!", "Your group has been created.");
                onClose();
            },
            onError: (error) => {
                Alert.alert("Creation Failed", error.message);
            }
        });
    };

    return (
        <SafeAreaView className="flex-1 bg-white">
            <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200">
                <TouchableOpacity onPress={onClose}>
                    <Text className="text-blue-500 text-lg">Cancel</Text>
                </TouchableOpacity>
                <Text className="text-xl font-bold">New Group</Text>
                <TouchableOpacity onPress={handleCreate} disabled={isPending}>
                    <Text className={`text-lg font-bold ${isPending ? 'text-gray-400' : 'text-blue-500'}`}>
                        {isPending ? "Creating..." : "Create"}
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView className="p-4">
                <Text className="font-semibold text-gray-600 mb-2">GROUP NAME</Text>
                <TextInput
                    placeholder="e.g., Thursday Night Basketball"
                    className="p-4 border border-gray-300 rounded-lg text-lg"
                    value={groupName}
                    onChangeText={setGroupName}
                />

                <Text className="font-semibold text-gray-600 mt-6 mb-2">FIRST EVENT</Text>
                <TouchableOpacity
                    onPress={() => setShowDatePicker(true)}
                    className="p-4 border border-gray-300 rounded-lg"
                >
                    <Text className="text-lg">{date.toDateString()}</Text>
                </TouchableOpacity>
                {showDatePicker && (
                    <DateTimePicker
                        value={date}
                        mode="date"
                        display="spinner"
                        onChange={handleDateChange}
                    />
                )}

                <Text className="font-semibold text-gray-600 mt-6 mb-2">RECURRENCE</Text>
                <View className="p-4 border border-gray-300 rounded-lg">
                    <Text className="text-lg">
                        Repeats weekly on {date.toLocaleDateString('en-US', { weekday: 'long' })}
                    </Text>
                </View>
                <Text className="text-sm text-gray-500 mt-2">
                    Advanced recurrence options can be built out here.
                </Text>

            </ScrollView>
        </SafeAreaView>
    );
};

export default CreateGroupScreen;