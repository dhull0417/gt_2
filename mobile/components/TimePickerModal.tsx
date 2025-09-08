// mobile/components/TimePickerModal.tsx
import React, { useState } from 'react';
import { View, Modal, Platform, TouchableOpacity, Text } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

interface TimePickerModalProps {
  isVisible: boolean;
  initialTime: Date;
  onClose: () => void;
  onConfirm: (date: Date) => void;
}

export const TimePickerModal = ({ isVisible, initialTime, onClose, onConfirm }: TimePickerModalProps) => {
  const [tempTime, setTempTime] = useState(initialTime);

  const handleTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      onClose(); 
      if (event.type === 'set' && selectedDate) {
        onConfirm(selectedDate);
      }
    } else {
      if (selectedDate) {
        setTempTime(selectedDate);
      }
    }
  };
  
  const handleIosConfirm = () => {
    onConfirm(tempTime);
    onClose();
  };

  if (Platform.OS === 'android' && !isVisible) {
    return null;
  }
  
  return (
    <>
      {Platform.OS === 'ios' ? (
        <Modal visible={isVisible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View className="flex-1 justify-end">
                <View className="bg-white/95 backdrop-blur-xl">
                    <View className="flex-row justify-between p-3 border-b border-gray-200">
                        <TouchableOpacity onPress={onClose}>
                            <Text className="text-blue-600 text-lg">Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleIosConfirm}>
                            <Text className="text-blue-600 text-lg font-bold">Done</Text>
                        </TouchableOpacity>
                    </View>
                    <DateTimePicker
                        value={tempTime}
                        mode="time"
                        is24Hour={false}
                        display="spinner"
                        onChange={handleTimeChange}
                        // --- Add these two lines ---
                        themeVariant="light" // Forces the picker background to be light
                        textColor="black"   // Forces the picker text (numbers/letters) to be black
                    />
                </View>
            </View>
        </Modal>
      ) : (
        <DateTimePicker
            value={initialTime}
            mode="time"
            is24Hour={false}
            display="default"
            onChange={handleTimeChange}
        />
      )}
    </>
  );
};