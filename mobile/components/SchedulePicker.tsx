import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

export interface Schedule {
  frequency: 'weekly' | 'monthly';
  day: number;
}
export interface SchedulePickerRef {
  getSchedule: () => Schedule;
}
const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const daysOfMonth = Array.from({ length: 31 }, (_, i) => i + 1);

const SchedulePicker = forwardRef<SchedulePickerRef, {}>((props, ref) => {
  const [schedule, setSchedule] = useState<Schedule>({ frequency: 'weekly', day: 1 });

  useImperativeHandle(ref, () => ({
    getSchedule: () => schedule,
  }));

  const setFrequency = (frequency: 'weekly' | 'monthly') => {
    const newDay = frequency === 'weekly' ? 1 : 15;
    setSchedule({ frequency, day: newDay });
  };
  const setDay = (day: number) => {
    setSchedule({ ...schedule, day });
  };

  return (
    <View className="w-full my-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-lg font-semibold text-gray-700">Set Recurring Schedule</Text>
      </View>
      <View>
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
    </View>
  );
});
export default SchedulePicker;