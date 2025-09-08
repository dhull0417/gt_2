import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { useCreateGroup } from "@/hooks/useCreateGroup";
import TimePicker from "./TimePicker"; // Import the new component

interface CreateGroupPopupProps {
  onClose: () => void;
}

const CreateGroupPopup: React.FC<CreateGroupPopupProps> = ({ onClose }) => {
  const [groupName, setGroupName] = useState("");
  // Add state to store the meeting time from the picker
  const [meetTime, setMeetTime] = useState("05:00 PM");
  const { mutate, isPending } = useCreateGroup();

  const handleCreateGroup = () => {
    // Pass both name and time to the mutation
    mutate({ name: groupName, time: meetTime });
  };

  return (
    // TouchableWithoutFeedback allows dismissing the keyboard by tapping outside
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View className="bg-white rounded-xl p-6 w-11/12 max-w-lg items-center shadow-lg relative">
        <TouchableOpacity
          className="absolute top-2 right-4 p-2"
          onPress={onClose}
        >
          <Text className="text-gray-500 text-xl font-bold">X</Text>
        </TouchableOpacity>
        <Text className="text-3xl font-bold mb-2 text-gray-800 text-center">Create Your Group</Text>
        <Text className="text-lg mb-4 text-gray-600 text-center">Enter a name and meeting time</Text>

        <TextInput
          className="w-full p-4 border border-gray-300 rounded-lg mb-4 bg-gray-50 text-base text-gray-800"
          placeholder="Your group name here"
          placeholderTextColor="#999"
          value={groupName}
          onChangeText={setGroupName}
          maxLength={30}
        />

        {/* --- ADD THE TIME PICKER HERE --- */}
        <TimePicker onTimeChange={setMeetTime} />
        
        <TouchableOpacity
          className={`w-full p-4 rounded-lg items-center ${
            isPending || groupName.length === 0 ? "bg-indigo-300" : "bg-indigo-600"
          }`}
          onPress={handleCreateGroup}
          disabled={isPending || groupName.length === 0}
        >
          <Text className="text-white text-lg font-bold">
            {isPending ? "Creating..." : "Create Group"}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          className="mt-4"
          onPress={onClose}
        >
          <Text className="text-indigo-600 font-semibold">Cancel</Text>
        </TouchableOpacity>
      </View>
    </TouchableWithoutFeedback>
  );
};

export default CreateGroupPopup;