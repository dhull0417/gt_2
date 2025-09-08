import React, { useState, forwardRef, useImperativeHandle, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';

// The types we export remain the same, so the parent component won't break.
export interface Schedule {
  frequency: 'weekly' | 'monthly';
  day: number;
}
export interface SchedulePickerRef {
  getSchedule: () => Schedule | null;
}

const daysOfWeek = [
    { label: 'Sunday', value: 0 }, { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 }, { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 }, { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 }
];
const daysOfMonth = Array.from({ length: 31 }, (_, i) => ({ label: `${i + 1}`, value: i + 1 }));

const SchedulePicker = forwardRef<SchedulePickerRef, {}>((props, ref) => {
  const [isActive, setIsActive] = useState(false);
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [day, setDay] = useState<number>(1); // Default to Monday

  useImperativeHandle(ref, () => ({
    getSchedule: () => {
      if (!isActive) {
        return null;
      }
      return { frequency, day };
    },
  }));

  const onFrequencyChange = (newFrequency: 'weekly' | 'monthly') => {
    setFrequency(newFrequency);
    // Reset day to a sensible default when frequency changes
    setDay(newFrequency === 'weekly' ? 1 : 15);
  };

  const dayOptions = useMemo(() => {
    return frequency === 'weekly' ? daysOfWeek : daysOfMonth;
  }, [frequency]);

  return (
    <View className="w-full my-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-lg font-semibold text-gray-700">Set Recurring Schedule</Text>
        <TouchableOpacity onPress={() => setIsActive(!isActive)} className="flex-row items-center">
          <Text className="text-base text-indigo-600 mr-2 font-semibold">{isActive ? 'Disable' : 'Enable'}</Text>
          <View className={`w-12 h-7 rounded-full p-1 ${isActive ? 'bg-indigo-600' : 'bg-gray-300'}`}>
            <View className={`w-5 h-5 bg-white rounded-full shadow-md transform ${isActive ? 'translate-x-5' : 'translate-x-0'}`} />
          </View>
        </TouchableOpacity>
      </View>

      {isActive && (
        <View>
          {/* Frequency Picker */}
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={frequency}
              onValueChange={(itemValue) => onFrequencyChange(itemValue)}
              style={styles.picker}
              // This is an iOS-only prop to style the text of each item
              itemStyle={styles.pickerItem}
            >
              <Picker.Item label="Weekly" value="weekly" />
              <Picker.Item label="Monthly" value="monthly" />
            </Picker>
          </View>

          {/* Day Picker */}
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={day}
              onValueChange={(itemValue) => setDay(itemValue)}
              style={styles.picker}
              // This is an iOS-only prop to style the text of each item
              itemStyle={styles.pickerItem}
            >
              {dayOptions.map(option => (
                <Picker.Item key={option.value} label={option.label.toString()} value={option.value} />
              ))}
            </Picker>
          </View>
        </View>
      )}
    </View>
  );
});

// Using a dedicated StyleSheet for more control over the Picker component
const styles = StyleSheet.create({
    pickerWrapper: {
        marginTop: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#D1D5DB',
        // This helps contain the picker view on both platforms
        overflow: 'hidden',
        backgroundColor: 'white',
    },
    picker: {
        width: '100%',
        // On Android, height is determined by the component itself.
        // On iOS, we must provide an explicit height for it to be visible.
        height: Platform.OS === 'ios' ? 150 : 'auto',
    },
    // This style is only applied on iOS to ensure the text is visible
    pickerItem: {
        color: 'black',
        height: 150,
    }
});

export default SchedulePicker;