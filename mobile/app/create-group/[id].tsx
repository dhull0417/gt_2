import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet, Image } from "react-native";
import { useCreateGroup } from "@/hooks/useCreateGroup";
import TimePicker from "@/components/TimePicker";
import SchedulePicker, { Schedule } from "@/components/SchedulePicker";
import { Picker } from "@react-native-picker/picker";
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";

const GroupImage = require('../../assets/images/group-image.jpeg');

const usaTimezones = [
    { label: "Eastern (ET)", value: "America/New_York" },
    { label: "Central (CST)", value: "America/Chicago" },
    { label: "Mountain (MT)", value: "America/Denver" },
    { label: "Mountain (no DST)", value: "America/Phoenix" },
    { label: "Pacific (PST)", value: "America/Los_Angeles" },
    { label: "Alaska (AKST)", value: "America/Anchorage" },
    { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
];

const CreateGroupScreen = () => {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [groupName, setGroupName] = useState("");
  const [meetTime, setMeetTime] = useState("05:00 PM");
  const [schedule, setSchedule] = useState<Schedule>({ frequency: 'weekly', days: [1] });
  const [timezone, setTimezone] = useState("America/Denver");
  
  const { mutate, isPending } = useCreateGroup();

  const handleCreateGroup = () => {
    const variables = { name: groupName, time: meetTime, schedule, timezone };
    // On success, the hook now handles navigation back to the tabs
    mutate(variables, {
        onSuccess: () => {
            router.back();
        }
    });
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.headerTitle}>What's your Group name?</Text>
            <View style={styles.imagePlaceholder}>
                <Image source={GroupImage} style={styles.image} resizeMode="cover" />
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="Your group name here"
              placeholderTextColor="#999"
              value={groupName}
              onChangeText={setGroupName}
              maxLength={30}
            />
            <View style={styles.footerNavRight}>
                <TouchableOpacity onPress={() => setStep(2)} disabled={groupName.trim().length === 0}>
                    <Feather name="arrow-right-circle" size={48} color={groupName.trim().length === 0 ? "#D1D5DB" : "#4F46E5"} />
                </TouchableOpacity>
            </View>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.headerTitle}>How often will you meet?</Text>
            <SchedulePicker onScheduleChange={setSchedule} initialValue={schedule} />
            <View style={styles.footerNavSpread}>
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
            <View style={styles.stepContainer}>
                <Text style={styles.headerTitle}>Choose a time for your group</Text>
                <TimePicker onTimeChange={setMeetTime} initialValue={meetTime} />
                <View style={styles.timezoneContainer}>
                    <Text style={styles.pickerTitle}>Select Timezone</Text>
                    <View style={styles.pickerWrapper}>
                        <Picker selectedValue={timezone} onValueChange={setTimezone} itemStyle={styles.pickerItem}>
                            {usaTimezones.map(tz => <Picker.Item key={tz.value} label={tz.label} value={tz.value} />)}
                        </Picker>
                    </View>
                </View>
                <View style={styles.footerNavSpread}>
                    <TouchableOpacity onPress={() => setStep(2)}>
                        <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.createButton, isPending && { backgroundColor: '#A5B4FC' }]}
                        onPress={handleCreateGroup}
                        disabled={isPending}
                    >
                        <Text style={styles.createButtonText}>{isPending ? "Creating..." : "Create Group"}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <View style={{ padding: 24, flex: 1 }}>
                {renderStepContent()}
            </View>
        </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    stepContainer: { flex: 1, justifyContent: 'space-between' },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', textAlign: 'center', marginBottom: 24 },
    imagePlaceholder: { width: '80%', aspectRatio: 16/9, marginVertical: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
    image: { width: '100%', height: '100%', borderRadius: 8 },
    textInput: { width: '100%', padding: 16, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, backgroundColor: '#FFFFFF', fontSize: 16 },
    footerNavRight: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', marginTop: 24 },
    footerNavSpread: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
    pickerTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 8, textAlign: 'center' },
    timezoneContainer: { width: '100%', marginVertical: 16 },
    pickerWrapper: { backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', overflow: 'hidden' },
    pickerItem: { color: 'black', fontSize: 18, height: 120 },
    createButton: { paddingVertical: 16, paddingHorizontal: 32, borderRadius: 8, alignItems: 'center', backgroundColor: '#4F46E5', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1.41, elevation: 2 },
    createButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
});

export default CreateGroupScreen;