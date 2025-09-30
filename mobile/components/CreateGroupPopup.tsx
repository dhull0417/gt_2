import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet, Image } from "react-native";
import { useCreateGroup } from "@/hooks/useCreateGroup";
import TimePicker from "./TimePicker";
import SchedulePicker, { Schedule } from "./SchedulePicker";
import { Picker } from "@react-native-picker/picker";
import { Feather } from '@expo/vector-icons';

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
  const [step, setStep] = useState(1);

  const [groupName, setGroupName] = useState("");
  const [meetTime, setMeetTime] = useState("05:00 PM");
  const [schedule, setSchedule] = useState<Schedule>({ frequency: 'weekly', days: [1] });
  const [timezone, setTimezone] = useState("America/Denver");
  
  const { mutate, isPending } = useCreateGroup();

  const handleCreateGroup = () => {
    const variables = { name: groupName, time: meetTime, schedule, timezone };
    mutate(variables, { onSuccess: onClose });
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <View className="items-center">
            <Text className="text-3xl font-bold mb-2 text-gray-800 text-center">What's your Group name?</Text>
            <View className="w-48 h-48 bg-gray-200 rounded-lg my-6 items-center justify-center">
                <Feather name="image" size={60} color="#9CA3AF" />
                <Text className="text-gray-500 mt-2">Fun Image Here</Text>
            </View>
            <TextInput
              className="w-full p-4 border border-gray-300 rounded-lg bg-gray-50 text-base text-gray-800"
              placeholder="Your group name here"
              placeholderTextColor="#999"
              value={groupName}
              onChangeText={setGroupName}
              maxLength={30}
            />
            <View className="w-full flex-row justify-end mt-6">
                <TouchableOpacity onPress={() => setStep(2)} disabled={groupName.trim().length === 0}>
                    <Feather name="arrow-right-circle" size={48} color={groupName.trim().length === 0 ? "#D1D5DB" : "#4F46E5"} />
                </TouchableOpacity>
            </View>
          </View>
        );
      
      case 2:
        return (
          <View>
            <Text className="text-3xl font-bold mb-6 text-gray-800 text-center">How often will you meet?</Text>
            <SchedulePicker onScheduleChange={setSchedule} initialValue={schedule} />
            <View className="w-full flex-row justify-between items-center mt-6">
                <TouchableOpacity onPress={() => setStep(1)}>
                    <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setStep(3)}>
                    <Feather name="arrow-right-circle" size={48} color="#4F46E5" />
                </TouchableOpacity>
            </View>
          </View>
        );

      case 3:
        return (
            <View>
                <Text className="text-3xl font-bold mb-2 text-gray-800 text-center">Choose a time for your group</Text>
                <TimePicker onTimeChange={setMeetTime} initialValue={meetTime} />
                <View className="w-full my-4">
                    <Text className="text-lg font-semibold text-gray-700 mb-2 text-center">Select Timezone</Text>
                    <View className="bg-white rounded-lg border border-gray-300 overflow-hidden">
                        <Picker selectedValue={timezone} onValueChange={setTimezone} itemStyle={styles.pickerItem}>
                            {usaTimezones.map(tz => <Picker.Item key={tz.value} label={tz.label} value={tz.value} />)}
                        </Picker>
                    </View>
                </View>
                <View className="w-full flex-row justify-between items-center mt-6">
                    <TouchableOpacity onPress={() => setStep(2)}>
                        <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        className={`py-4 px-8 rounded-lg items-center shadow ${isPending ? "bg-indigo-300" : "bg-indigo-600"}`}
                        onPress={handleCreateGroup}
                        disabled={isPending}
                    >
                        <Text className="text-white text-lg font-bold">{isPending ? "Creating..." : "Create Group"}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.kav}>
      <View className="bg-white rounded-xl w-11/12 max-w-lg shadow-lg relative max-h-[90%] p-6 pt-12">
        {/* --- THIS IS THE NEW BUTTON --- */}
        <TouchableOpacity className="absolute top-2 left-4 p-2 z-10" onPress={onClose}>
          <Text className="text-red-500 text-2xl font-bold">X</Text>
        </TouchableOpacity>
        
        <View>
          {renderStepContent()}
        </View>
        
        {/* The button that was here has been removed */}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
    kav: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
    pickerItem: { color: 'black', fontSize: 18, height: 120 }
});

export default CreateGroupPopup;