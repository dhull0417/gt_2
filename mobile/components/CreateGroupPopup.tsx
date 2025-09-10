import React, { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Keyboard,
  TouchableWithoutFeedback, ScrollView,
} from "react-native";
import { useCreateGroup } from "@/hooks/useCreateGroup";
import TimePicker from "./TimePicker";
import SchedulePicker, { Schedule, SchedulePickerRef } from "./SchedulePicker";
import { useQueryClient } from "@tanstack/react-query";

interface CreateGroupPopupProps {
  onClose: () => void;
}

const CreateGroupPopup: React.FC<CreateGroupPopupProps> = ({ onClose }) => {
  const [groupName, setGroupName] = useState("");
  const [meetTime, setMeetTime] = useState("05:00 PM");
  const schedulePickerRef = useRef<SchedulePickerRef>(null);
  
  const { mutate, isPending } = useCreateGroup();
  const queryClient = useQueryClient();

  const handleCreateGroup = () => {
    const schedule = schedulePickerRef.current?.getSchedule() || null;
    
    // 1. Get the user's IANA timezone identifier
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; // e.g., "America/Denver"

    // 2. Include it in the variables sent to the backend
    const variables = { name: groupName, time: meetTime, schedule, timezone };

    mutate(variables, {
      onSuccess: () => {
        // We now invalidate events here as well
        queryClient.invalidateQueries({ queryKey: ['events'] });
        onClose();
      }
    });
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View className="bg-white rounded-xl w-11/12 max-w-lg shadow-lg relative max-h-[90%] p-6">
        <TouchableOpacity
          className="absolute top-2 right-4 p-2 z-10"
          onPress={onClose}
        >
          <Text className="text-gray-500 text-xl font-bold">X</Text>
        </TouchableOpacity>
        <ScrollView
          style={{ width: '100%' }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-3xl font-bold mb-2 text-gray-800 text-center">
            Create Your Group
          </Text>
          <Text className="text-lg mb-4 text-gray-600 text-center">
            Enter group details below
          </Text>
          <TextInput
            className="w-full p-4 border border-gray-300 rounded-lg mb-4 bg-gray-50 text-base text-gray-800"
            placeholder="Your group name here"
            placeholderTextColor="#999"
            value={groupName}
            onChangeText={setGroupName}
            maxLength={30}
          />
          <TimePicker onTimeChange={setMeetTime} />
          <SchedulePicker ref={schedulePickerRef} />
          <TouchableOpacity
            className={`w-full p-4 rounded-lg items-center mt-4 ${
              isPending || groupName.length === 0
                ? "bg-indigo-300"
                : "bg-indigo-600"
            }`}
            onPress={handleCreateGroup}
            disabled={isPending || groupName.length === 0}
          >
            <Text className="text-white text-lg font-bold">
              {isPending ? "Creating..." : "Create Group"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity className="mt-4 mb-6 items-center" onPress={onClose}>
            <Text className="text-indigo-600 font-semibold">Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </TouchableWithoutFeedback>
  );
};

export default CreateGroupPopup;