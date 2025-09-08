import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';

// Define the shape of the schedule object
export interface Schedule {
  frequency: 'weekly' | 'monthly';
  day: number; // 0-6 for weekly (Sun-Sat), 1-31 for monthly
}

interface SchedulePickerProps {
  schedule: Schedule | null;
  onScheduleChange: (schedule: Schedule | null) => void;
}

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const daysOfMonth = Array.from({ length: 31 }, (_, i) => i + 1);

const SchedulePicker: React.FC<SchedulePickerProps> = ({ schedule, onScheduleChange }) => {
  const isActive = !!schedule;

  const handleToggleActive = () => {
    if (isActive) {
      onScheduleChange(null); // Deactivate
    } else {
      // Activate with default values
      onScheduleChange({ frequency: 'weekly', day: 1 }); 
    }
  };

  const setFrequency = (frequency: 'weekly' | 'monthly') => {
    // Reset day when frequency changes to avoid invalid states
    const newDay = frequency === 'weekly' ? 1 : 15;
    onScheduleChange({ frequency, day: newDay });
  };

  const setDay = (day: number) => {
    if (schedule) {
      onScheduleChange({ ...schedule, day });
    }
  };

  return (
    <View className="w-full my-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-lg font-semibold text-gray-700">Set Recurring Schedule</Text>
        <TouchableOpacity onPress={handleToggleActive} className="flex-row items-center">
          <Text className="text-base text-indigo-600 mr-2 font-semibold">{isActive ? 'Disable' : 'Enable'}</Text>
          <View className={`w-12 h-7 rounded-full p-1 ${isActive ? 'bg-indigo-600' : 'bg-gray-300'}`}>
            <View className={`w-5 h-5 bg-white rounded-full shadow-md transform ${isActive ? 'translate-x-5' : 'translate-x-0'}`} />
          </View>
        </TouchableOpacity>
      </View>

      {isActive && schedule && (
        <View>
          {/* Frequency Selector */}
          <View className="flex-row justify-center bg-gray-200 rounded-lg p-1 mb-4">
            <TouchableOpacity 
              onPress={() => setFrequency('weekly')}
              className={`flex-1 py-2 rounded-md items-center ${schedule.frequency === 'weekly' ? 'bg-white shadow' : ''}`}
            >
              <Text className={`font-semibold ${schedule.frequency === 'weekly' ? 'text-indigo-600' : 'text-gray-600'}`}>Weekly</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => setFrequency('monthly')}
              className={`flex-1 py-2 rounded-md items-center ${schedule.frequency === 'monthly' ? 'bg-white shadow' : ''}`}
            >
              <Text className={`font-semibold ${schedule.frequency === 'monthly' ? 'text-indigo-600' : 'text-gray-600'}`}>Monthly</Text>
            </TouchableOpacity>
          </View>

          {/* Day Selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(schedule.frequency === 'weekly' ? daysOfWeek : daysOfMonth).map((dayLabel, index) => {
              const dayValue = schedule.frequency === 'weekly' ? index : (dayLabel as number);
              const isSelected = schedule.day === dayValue;
              return (
                <TouchableOpacity
                  key={dayValue}
                  onPress={() => setDay(dayValue)}
                  className={`h-12 w-12 rounded-full items-center justify-center mr-2 ${isSelected ? 'bg-indigo-600' : 'bg-white border border-gray-300'}`}
                >
                  <Text className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-gray-700'}`}>{dayLabel}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

export default SchedulePicker;
