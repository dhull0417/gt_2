import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, Alert, Dimensions } from "react-native";
import { useCreateGroup } from "@/hooks/useCreateGroup";
import TimePicker from "@/components/TimePicker";
import { Picker } from "@react-native-picker/picker";
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

const GroupImage = require('../../assets/images/group-image.png');
const { width } = Dimensions.get('window');

// --- Types ---
type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom' | null;
type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

const usaTimezones = [
    { label: "Eastern (ET)", value: "America/New_York" },
    { label: "Central (CST)", value: "America/Chicago" },
    { label: "Mountain (MT)", value: "America/Denver" },
    { label: "Mountain (no DST)", value: "America/Phoenix" },
    { label: "Pacific (PST)", value: "America/Los_Angeles" },
    { label: "Alaska (AKST)", value: "America/Anchorage" },
    { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
];

const daysOfWeek = [
    { label: "Sunday", value: 0 },
    { label: "Monday", value: 1 },
    { label: "Tuesday", value: 2 },
    { label: "Wednesday", value: 3 },
    { label: "Thursday", value: 4 },
    { label: "Friday", value: 5 },
    { label: "Saturday", value: 6 },
];

const CreateGroupScreen = () => {
  const router = useRouter();
  
  // --- State ---
  const [step, setStep] = useState(1);
  const [groupName, setGroupName] = useState("");
  
  // Scheduling State
  const [frequency, setFrequency] = useState<Frequency>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]); // 0-6 for weekly/biweekly
  const [selectedDates, setSelectedDates] = useState<number[]>([]); // 1-31 for monthly
  
  // Time State
  const [meetTime, setMeetTime] = useState("05:00 PM");
  const [timezone, setTimezone] = useState("America/Denver");
  
  const { mutate, isPending } = useCreateGroup();

  // --- Logic ---

  const handleCreateGroup = () => {
    // Construct the schedule object based on our new UI state
    let finalSchedule: any = { frequency };

    if (frequency === 'weekly' || frequency === 'biweekly') {
        finalSchedule.days = selectedDays;
    } else if (frequency === 'monthly') {
        finalSchedule.days = selectedDates;
    } else if (frequency === 'daily') {
        finalSchedule.days = []; // logic handled by backend usually
    } else if (frequency === 'custom') {
        // Placeholder for Phase 3/4
        finalSchedule.rules = []; 
    }

    const variables = { 
        name: groupName, 
        time: meetTime, 
        schedule: finalSchedule, 
        timezone 
    };

    mutate(variables, {
        onSuccess: () => {
            router.back();
        }
    });
  };

  const handleNext = () => {
    if (step === 2) {
        if (frequency === 'daily') {
            setStep(4); // Skip details, go to Time
        } else {
            setStep(3); // Go to Details (Weekly/Monthly/Custom)
        }
    } else {
        setStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (step === 4 && frequency === 'daily') {
        setStep(2); // Go back to Frequency, skipping details
    } else {
        setStep(prev => prev - 1);
    }
  };

  const toggleDaySelection = (dayIndex: number) => {
    setSelectedDays(prev => 
        prev.includes(dayIndex) 
            ? prev.filter(d => d !== dayIndex) 
            : [...prev, dayIndex]
    );
  };

  const toggleDateSelection = (date: number) => {
    setSelectedDates(prev => {
        if (prev.includes(date)) return prev.filter(d => d !== date);
        if (prev.length >= 10) {
            Alert.alert("Limit Reached", "You can only select up to 10 dates.");
            return prev;
        }
        return [...prev, date];
    });
  };

  // --- Render Steps ---

  const renderStep1_Name = () => (
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
          <TouchableOpacity onPress={handleNext} disabled={groupName.trim().length === 0}>
              <Feather name="arrow-right-circle" size={48} color={groupName.trim().length === 0 ? "#D1D5DB" : "#4F46E5"} />
          </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep2_Frequency = () => {
    const options: { label: string, value: Frequency }[] = [
        { label: "Daily", value: 'daily' },
        { label: "Weekly", value: 'weekly' },
        { label: "Every 2 Weeks", value: 'biweekly' },
        { label: "Monthly", value: 'monthly' },
        { label: "Custom", value: 'custom' },
    ];

    return (
        <View style={styles.stepContainer}>
            <Text style={styles.headerTitle}>How often will you meet?</Text>
            <View style={{ flex: 1, justifyContent: 'center' }}>
                {options.map((option) => {
                    const isSelected = frequency === option.value;
                    return (
                        <TouchableOpacity 
                            key={option.value}
                            style={[styles.frequencyButton, isSelected && styles.frequencyButtonSelected]}
                            onPress={() => setFrequency(option.value)}
                        >
                            <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]} />
                            <Text style={[styles.frequencyText, isSelected && styles.frequencyTextSelected]}>
                                {option.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            <View style={styles.footerNavSpread}>
                <TouchableOpacity onPress={handleBack}>
                    <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleNext} disabled={!frequency}>
                    <Feather name="arrow-right-circle" size={48} color={!frequency ? "#D1D5DB" : "#4F46E5"} />
                </TouchableOpacity>
            </View>
        </View>
    );
  };

  const renderStep3_Details = () => {
    if (frequency === 'custom') {
        // PLACEHOLDER FOR PHASE 3
        return (
            <View style={styles.stepContainer}>
                <Text style={styles.headerTitle}>Add up to 5 routines</Text>
                <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
                    <Text style={{color: '#6B7280', fontSize: 16, textAlign: 'center'}}>
                        Custom Routine Builder Coming Soon...
                    </Text>
                </View>
                <View style={styles.footerNavSpread}>
                    <TouchableOpacity onPress={handleBack}>
                        <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleNext}>
                        <Feather name="arrow-right-circle" size={48} color="#4F46E5" />
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const isMonthly = frequency === 'monthly';
    const isValid = isMonthly ? selectedDates.length > 0 : selectedDays.length > 0;

    return (
        <View style={styles.stepContainer}>
            <Text style={styles.headerTitle}>
                {isMonthly ? "Which day(s) will you meet?" : "Which day(s) will you meet?"}
            </Text>
            
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
                {isMonthly ? (
                    // Monthly Calendar Grid
                    <View style={styles.calendarGrid}>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((date) => {
                            const isSelected = selectedDates.includes(date);
                            return (
                                <TouchableOpacity 
                                    key={date}
                                    style={[styles.dateBox, isSelected && styles.dateBoxSelected]}
                                    onPress={() => toggleDateSelection(date)}
                                >
                                    <Text style={[styles.dateText, isSelected && styles.dateTextSelected]}>{date}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ) : (
                    // Weekly / Bi-Weekly List
                    <View>
                        {daysOfWeek.map((day) => {
                            const isSelected = selectedDays.includes(day.value);
                            return (
                                <TouchableOpacity 
                                    key={day.value}
                                    style={[styles.frequencyButton, isSelected && styles.frequencyButtonSelected]}
                                    onPress={() => toggleDaySelection(day.value)}
                                >
                                    <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]} />
                                    <Text style={[styles.frequencyText, isSelected && styles.frequencyTextSelected]}>
                                        {day.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </ScrollView>

            <View style={styles.footerNavSpread}>
                <TouchableOpacity onPress={handleBack}>
                    <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleNext} disabled={!isValid}>
                    <Feather name="arrow-right-circle" size={48} color={!isValid ? "#D1D5DB" : "#4F46E5"} />
                </TouchableOpacity>
            </View>
        </View>
    );
  };

  const renderStep4_Time = () => (
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
            <TouchableOpacity onPress={handleBack}>
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <View style={{ padding: 24, flex: 1 }}>
            {step === 1 && renderStep1_Name()}
            {step === 2 && renderStep2_Frequency()}
            {step === 3 && renderStep3_Details()}
            {step === 4 && renderStep4_Time()}
        </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    stepContainer: { flex: 1, justifyContent: 'space-between' },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', textAlign: 'center', marginBottom: 24 },
    imagePlaceholder: { width: '80%', aspectRatio: 16/9, marginVertical: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
    image: { width: '100%', height: '100%', borderRadius: 8 },
    textInput: { width: '100%', padding: 16, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, backgroundColor: '#FFFFFF', fontSize: 16 },
    
    // Frequency Button Styles
    frequencyButton: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8 },
    frequencyButtonSelected: { backgroundColor: '#E0E7FF', borderColor: '#4F46E5' },
    frequencyText: { fontSize: 18, color: '#374151', marginLeft: 12 },
    frequencyTextSelected: { color: '#4F46E5', fontWeight: '600' },
    radioCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: '#FFF' },
    radioCircleSelected: { borderColor: '#4F46E5', backgroundColor: '#4F46E5' },

    // Calendar Styles
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    dateBox: { width: width / 7 - 12, height: width / 7 - 12, justifyContent: 'center', alignItems: 'center', margin: 4, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFF' },
    dateBoxSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
    dateText: { fontSize: 16, color: '#374151' },
    dateTextSelected: { color: '#FFF', fontWeight: 'bold' },

    footerNavRight: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', marginTop: 24 },
    footerNavSpread: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
    
    // Time picker specific
    pickerTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 8, textAlign: 'center' },
    timezoneContainer: { width: '100%', marginVertical: 16 },
    pickerWrapper: { backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', overflow: 'hidden' },
    pickerItem: { color: 'black', fontSize: 18, height: 120 },
    createButton: { paddingVertical: 16, paddingHorizontal: 32, borderRadius: 8, alignItems: 'center', backgroundColor: '#4F46E5', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1.41, elevation: 2 },
    createButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
});

export default CreateGroupScreen;