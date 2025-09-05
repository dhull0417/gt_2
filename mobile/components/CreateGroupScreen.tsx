// mobile/components/CreateGroupScreen.tsx

import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TextInput, TouchableOpacity, Alert, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useCreateGroup } from '@/hooks/useCreateGroup';
import { RecurrenceRule } from '@/utils/api';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

type CreateGroupScreenProps = {
    onClose: () => void;
};
type Frequency = 'weekly' | 'monthly';

const CreateGroupScreen = ({ onClose }: CreateGroupScreenProps) => {
    const [groupName, setGroupName] = useState('');
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    
    const [recurrence, setRecurrence] = useState<RecurrenceRule>({
        frequency: 'weekly',
        interval: 1,
        daysOfWeek: [new Date().getDay()],
    });

    const { mutate, isPending } = useCreateGroup();

    // --- THIS IS THE CORRECTED LOGIC ---

    const handleFrequencyChange = (newFrequency: Frequency, newDate: Date = date) => {
        console.log(`Changing frequency to: ${newFrequency}`);
        
        let newRule: RecurrenceRule;
        if (newFrequency === 'weekly') {
            newRule = {
                frequency: 'weekly',
                interval: 1,
                daysOfWeek: [newDate.getDay()],
                daysOfMonth: undefined,
            };
        } else { // 'monthly'
            newRule = {
                frequency: 'monthly',
                interval: 1,
                daysOfWeek: undefined,
                daysOfMonth: [newDate.getDate()],
            };
        }
        
        console.log('Setting new recurrence rule:', newRule);
        setRecurrence(newRule);
    };

    const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
        setShowDatePicker(Platform.OS === 'ios'); // On iOS, the user must dismiss it manually
        if (selectedDate) {
            setDate(selectedDate);
            // After setting the date, re-sync the recurrence rule with the new date
            handleFrequencyChange(recurrence.frequency, selectedDate);
        }
    };
    
    const handleCreate = () => {
        if (!groupName.trim()) {
            Alert.alert("Error", "Group name is required.");
            return;
        }
        mutate({ name: groupName, eventStartDate: date, recurrence }, {
            onSuccess: () => {
                onClose();
            },
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

            <ScrollView className="p-4" keyboardShouldPersistTaps="handled">
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
                    <View className="bg-gray-50 rounded-lg my-2">
                        {Platform.OS === 'ios' && (
                            <TouchableOpacity onPress={() => setShowDatePicker(false)} className="items-end p-2">
                                 <Text className="text-blue-500">Done</Text>
                            </TouchableOpacity>
                        )}
                        <DateTimePicker
                            value={date}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={handleDateChange}
                            themeVariant="light" 
                        />
                    </View>
                )}

                <Text className="font-semibold text-gray-600 mt-6 mb-2">RECURRENCE</Text>
                <View className="flex-row bg-gray-100 rounded-lg p-1">
                    <TouchableOpacity 
                        className={`flex-1 p-2 rounded-md ${recurrence.frequency === 'weekly' ? 'bg-white shadow' : ''}`}
                        onPress={() => handleFrequencyChange('weekly')}
                    >
                        <Text className={`text-center font-bold ${recurrence.frequency === 'weekly' ? 'text-blue-500' : 'text-gray-500'}`}>
                            Weekly
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        className={`flex-1 p-2 rounded-md ${recurrence.frequency === 'monthly' ? 'bg-white shadow' : ''}`}
                        onPress={() => handleFrequencyChange('monthly')}
                    >
                        <Text className={`text-center font-bold ${recurrence.frequency === 'monthly' ? 'text-blue-500' : 'text-gray-500'}`}>
                            Monthly
                        </Text>
                    </TouchableOpacity>
                </View>

                <View className="p-4 mt-2 border border-gray-200 rounded-lg bg-gray-50">
                    <Text className="text-lg text-gray-800">
                        {recurrence.frequency === 'weekly' 
                            ? `Repeats weekly on ${date.toLocaleDateString('en-US', { weekday: 'long' })}`
                            // The line below was causing a crash, it's now fixed
                            : `Repeats monthly on day ${date.getDate()}`
                        }
                    </Text>
                </View>

                <Text className="text-sm text-gray-500 mt-2">
                    Advanced options (e.g., every 2nd Tuesday) can be built out from here.
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
};

export default CreateGroupScreen;