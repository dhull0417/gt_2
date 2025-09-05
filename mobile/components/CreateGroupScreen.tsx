// mobile/components/CreateGroupScreen.tsx

import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TextInput, TouchableOpacity, Alert, Platform } from 'react-native';
import { useCreateGroup } from '@/hooks/useCreateGroup';
import { RecurrenceRule } from '@/utils/api';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

type CreateGroupScreenProps = {
    onClose: () => void;
};
type Frequency = 'weekly' | 'monthly';
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

    // --- THIS IS THE FIX ---
    // 1. Update the function signature to accept a second optional argument.
    const handleFrequencyChange = (newFrequency: Frequency, baseDate: Date = date) => {
        if (newFrequency === 'weekly') {
            setRecurrence({
                frequency: 'weekly',
                interval: 1,
                // 2. Use 'baseDate' here instead of the stale 'date' from state.
                daysOfWeek: [baseDate.getDay()], 
                daysOfMonth: undefined,
            });
        } else { // 'monthly'
            setRecurrence({
                frequency: 'monthly',
                interval: 1,
                daysOfWeek: undefined,
                // 3. Use 'baseDate' here as well.
                daysOfMonth: [baseDate.getDate()],
            });
        }
    };
    // --- END OF FIX ---

    const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
        setShowDatePicker(Platform.OS === 'ios');
        if (selectedDate) {
            setDate(selectedDate);
            // Now this call correctly matches the updated function definition.
            handleFrequencyChange(recurrence.frequency, selectedDate);
        }
    };
    
    const handleDayOfWeekSelect = (dayIndex: number) => {
        setRecurrence(prev => ({...prev, daysOfWeek: [dayIndex]}));
    };

    const handleCreate = () => { /* ... unchanged ... */ };
    
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
                {/* ... The rest of your JSX is unchanged and correct ... */}
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

                {recurrence.frequency === 'weekly' && (
                    <View className="mt-4">
                        <Text className="text-lg text-gray-700 mb-3">Repeats on:</Text>
                        <View className="flex-row justify-around">
                            {WEEK_DAYS.map((day, index) => (
                                <TouchableOpacity 
                                    key={day}
                                    onPress={() => handleDayOfWeekSelect(index)}
                                    className={`size-10 rounded-full items-center justify-center ${recurrence.daysOfWeek?.includes(index) ? 'bg-blue-500' : 'bg-gray-200'}`}
                                >
                                    <Text className={`font-bold ${recurrence.daysOfWeek?.includes(index) ? 'text-white' : 'text-gray-700'}`}>{day.charAt(0)}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {recurrence.frequency === 'monthly' && (
                    <View className="mt-4">
                        <Text className="text-lg text-gray-700">
                            Repeats on day {date.getDate()} of the month.
                        </Text>
                        <Text className="text-sm text-gray-500 mt-1">
                            Based on the date selected for the first event.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

export default CreateGroupScreen;