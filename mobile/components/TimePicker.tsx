import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface TimePickerProps {
  // Callback to send the formatted time string to the parent
  onTimeChange: (time: string) => void;
}

const TimePicker: React.FC<TimePickerProps> = ({ onTimeChange }) => {
  const [hour, setHour] = useState(5);
  const [minute, setMinute] = useState(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('PM');

  // Notify the parent component whenever the time changes
  useEffect(() => {
    // Format minute with a leading zero if needed
    const formattedMinute = minute.toString().padStart(2, '0');
    const formattedTime = `${hour}:${formattedMinute} ${period}`;
    onTimeChange(formattedTime);
  }, [hour, minute, period, onTimeChange]);

  const handleHourChange = (amount: number) => {
    let newHour = hour + amount;
    if (newHour > 12) newHour = 1;
    if (newHour < 1) newHour = 12;
    setHour(newHour);
  };

  const handleMinuteChange = (amount: number) => {
    let newMinute = minute + amount;
    if (newMinute > 59) newMinute = 0;
    if (newMinute < 0) newMinute = 59;
    setMinute(newMinute);
  };

  const togglePeriod = () => {
    setPeriod(current => (current === 'AM' ? 'PM' : 'AM'));
  };

  // Helper component for the picker controls
  const PickerControl: React.FC<{ value: string | number, onIncrease: () => void, onDecrease: () => void }> = ({ value, onIncrease, onDecrease }) => (
    <View className="items-center bg-gray-100 p-2 rounded-lg">
      <TouchableOpacity onPress={onIncrease}>
        <Feather name="chevron-up" size={28} color="#4f46e5" />
      </TouchableOpacity>
      <Text className="text-3xl font-bold text-gray-800 my-2 w-16 text-center">{value.toString().padStart(2, '0')}</Text>
      <TouchableOpacity onPress={onDecrease}>
        <Feather name="chevron-down" size={28} color="#4f46e5" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View className="w-full my-4">
        <Text className="text-lg font-semibold text-gray-700 mb-2 text-center">Set Meeting Time</Text>
        <View className="flex-row justify-center items-center space-x-2">
            {/* Hour Picker */}
            <PickerControl 
                value={hour} 
                onIncrease={() => handleHourChange(1)} 
                onDecrease={() => handleHourChange(-1)} 
            />

            <Text className="text-3xl font-bold text-gray-800 pb-6">:</Text>

            {/* Minute Picker */}
            <PickerControl 
                value={minute} 
                onIncrease={() => handleMinuteChange(1)} 
                onDecrease={() => handleMinuteChange(-1)} 
            />

            {/* AM/PM Toggle */}
            <TouchableOpacity 
                onPress={togglePeriod} 
                className="bg-gray-100 p-2 rounded-lg ml-2 items-center justify-center self-stretch"
            >
                <Text className="text-3xl font-bold text-gray-800 px-2">{period}</Text>
            </TouchableOpacity>
        </View>
    </View>
  );
};

export default TimePicker;