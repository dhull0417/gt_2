import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, StyleSheet } from "react-native";
import { useCreateGroup } from "@/hooks/useCreateGroup";
import TimePicker from "./TimePicker";
import SchedulePicker, { Schedule } from "./SchedulePicker";
import { Picker } from "@react-native-picker/picker";

const usaTimezones = [
    { label: "Eastern (ET)", value: "America/New_York" },
    { label: "Central (CST)", value: "America/Chicago" },
    { label: "Mountain (MT)", value: "America/Denver" },
    { label: "Mountain (no DST)", value: "America/Phoenix" },
    { label: "Pacific (PST)", value: "America/Los_Angeles" },
    { label: "Alaska (AKST)", value: "America/Anchorage" },
    { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
];

interface CreateGroupPopupProps { onClose: () => void; }

const CreateGroupPopup: React.FC<CreateGroupPopupProps> = ({ onClose }) => {
  const [groupName, setGroupName] = useState("");
  const [meetTime, setMeetTime] = useState("05:00 PM");
  // --- THIS IS THE FIX ---
  // The schedule state now correctly uses a 'days' array to match the new type
  const [schedule, setSchedule] = useState<Schedule>({ frequency: 'weekly', days: [1] });
  const [timezone, setTimezone] = useState("America/Denver");
  
  const { mutate, isPending } = useCreateGroup();

  const handleCreateGroup = () => {
    const variables = { name: groupName, time: meetTime, schedule, timezone };
    mutate(variables, { onSuccess: onClose });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.kav}>
      <View className="bg-white rounded-xl w-11/12 max-w-lg shadow-lg relative max-h-[90%] p-6">
        <TouchableOpacity className="absolute top-2 right-4 p-2 z-10" onPress={onClose}>
          <Text className="text-gray-500 text-xl font-bold">X</Text>
        </TouchableOpacity>
        <ScrollView showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
          <Text className="text-3xl font-bold mb-2 text-gray-800 text-center">Create Your Group</Text>
          <Text className="text-lg mb-4 text-gray-600 text-center">Enter group details below</Text>
          <TextInput
            className="w-full p-4 border border-gray-300 rounded-lg mb-4 bg-gray-50 text-base text-gray-800"
            placeholder="Your group name here"
            placeholderTextColor="#999"
            value={groupName}
            onChangeText={setGroupName}
            maxLength={30}
          />
          <TimePicker onTimeChange={setMeetTime} />
          <View className="w-full my-4">
            <Text className="text-lg font-semibold text-gray-700 mb-2 text-center">Select Timezone</Text>
            <View className="bg-white rounded-lg border border-gray-300 overflow-hidden">
              <Picker selectedValue={timezone} onValueChange={setTimezone} itemStyle={styles.pickerItem}>
                {usaTimezones.map(tz => <Picker.Item key={tz.value} label={tz.label} value={tz.value} />)}
              </Picker>
            </View>
          </View>
          <SchedulePicker onScheduleChange={setSchedule} />
          <TouchableOpacity
            className={`w-full p-4 rounded-lg items-center mt-4 ${
              isPending || groupName.length === 0 ? "bg-indigo-300" : "bg-indigo-600"
            }`}
            onPress={handleCreateGroup}
            disabled={isPending || groupName.length === 0}
          >
            <Text className="text-white text-lg font-bold">{isPending ? "Creating..." : "Create Group"}</Text>
          </TouchableOpacity>
          <TouchableOpacity className="mt-4 mb-6 items-center" onPress={onClose}>
            <Text className="text-indigo-600 font-semibold">Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
    kav: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
    pickerItem: { color: 'black', fontSize: 18, height: 120 }
});

export default CreateGroupPopup;