// mobile/components/CreateGroupModal.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Modal, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { TimePickerModal } from './TimePickerModal';

export interface GroupScheduleData {
  groupName: string;
  schedule: {
    frequency: 'weekly' | 'monthly';
    day: number; // For weekly: 0 (Sun) - 6 (Sat). For monthly: 1 - 31.
    time: string; // "HH:mm" format
  };
}

interface CreateGroupModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (data: GroupScheduleData) => void;
  isSubmitting: boolean;
}

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function CreateGroupModal({ isVisible, onClose, onSubmit, isSubmitting }: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [time, setTime] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(0);
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);

  const handleConfirmTime = (selectedTime: Date) => {
    setTime(selectedTime);
    setTimePickerVisible(false);
  };

  const handleSubmit = () => {
    if (!groupName.trim()) {
      alert('Please enter a group name.');
      return;
    }
    const formattedTime = time.toTimeString().substring(0, 5); // "HH:mm"
    const scheduleData: GroupScheduleData = {
      groupName,
      schedule: {
        frequency,
        day: selectedDay,
        time: formattedTime,
      },
    };
    onSubmit(scheduleData);
  };
  
  const handleFrequencyChange = (newFreq: 'weekly' | 'monthly') => {
    setFrequency(newFreq);
    setSelectedDay(newFreq === 'weekly' ? 0 : 1);
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/50">
        <View className="w-11/12 bg-white p-5 rounded-xl gap-y-4">
          <Text className="text-xl font-bold text-center mb-2">Create New Group</Text>

          <TextInput
            className="border border-gray-300 p-3 rounded-lg text-base"
            placeholder="Group Name"
            value={groupName}
            onChangeText={setGroupName}
          />
          
          <TouchableOpacity onPress={() => setTimePickerVisible(true)} className="border border-gray-300 p-3 rounded-lg items-center">
            <Text className="text-base">Time: {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </TouchableOpacity>

          {/* --- THIS IS THE RESTORED CODE --- */}
          <View className="flex-row border border-blue-600 rounded-lg overflow-hidden">
            <TouchableOpacity
              className={`flex-1 p-2.5 items-center ${frequency === 'weekly' ? 'bg-blue-600' : 'bg-white'}`}
              onPress={() => handleFrequencyChange('weekly')}>
              <Text className={`font-semibold ${frequency === 'weekly' ? 'text-white' : 'text-blue-600'}`}>Weekly</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 p-2.5 items-center ${frequency === 'monthly' ? 'bg-blue-600' : 'bg-white'}`}
              onPress={() => handleFrequencyChange('monthly')}>
              <Text className={`font-semibold ${frequency === 'monthly' ? 'text-white' : 'text-blue-600'}`}>Monthly</Text>
            </TouchableOpacity>
          </View>

          <Text className="text-base mt-2 font-medium">Select Day:</Text>
          <ScrollView horizontal className="max-h-12" showsHorizontalScrollIndicator={false}>
            {frequency === 'weekly'
              ? WEEK_DAYS.map((day, index) => (
                  <TouchableOpacity
                    key={day}
                    className={`px-4 py-2 mx-1 border rounded-full justify-center ${selectedDay === index ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
                    onPress={() => setSelectedDay(index)}>
                    <Text className={selectedDay === index ? 'text-white font-bold' : 'text-gray-700'}>{day}</Text>
                  </TouchableOpacity>
                ))
              : MONTH_DAYS.map((day) => (
                  <TouchableOpacity
                    key={day}
                    className={`w-10 h-10 mx-1 border rounded-full justify-center items-center ${selectedDay === day ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
                    onPress={() => setSelectedDay(day)}>
                    <Text className={selectedDay === day ? 'text-white font-bold' : 'text-gray-700'}>{day}</Text>
                  </TouchableOpacity>
                ))}
          </ScrollView>
          {/* --- END OF RESTORED CODE --- */}

          <View className="flex-row justify-end mt-5 gap-x-4">
            <TouchableOpacity onPress={onClose} className="py-2 px-6 rounded-lg">
                <Text className="text-gray-600 font-semibold text-base">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSubmit} disabled={isSubmitting} className="bg-blue-600 py-2 px-6 rounded-lg flex-row items-center">
                {isSubmitting ? (
                    <ActivityIndicator size="small" color="white" className="mr-2"/>
                ) : (
                    <Text className="text-white font-semibold text-base">Create</Text>
                )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <TimePickerModal
        isVisible={isTimePickerVisible}
        initialTime={time}
        onClose={() => setTimePickerVisible(false)}
        onConfirm={handleConfirmTime}
      />
    </Modal>
  );
}