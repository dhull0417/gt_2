import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, TextInput, Image, Dimensions } from 'react-native'; 
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useUpdateGroup } from '@/hooks/useUpdateGroup';
import TimePicker from '@/components/TimePicker';
// 👇 CHANGED: Only import the component default, not the type
import SchedulePicker from '@/components/SchedulePicker';
// 👇 NEW: Import the correct Schedule type from your API definition
import { Schedule } from '@/utils/api';
import { Picker } from '@react-native-picker/picker';
import { Feather } from '@expo/vector-icons';

const GroupImage = require('../../assets/images/group-image.png'); // Ensure extension matches your file (.jpeg vs .png)

const { width } = Dimensions.get('window'); 
const IMAGE_WIDTH = width * 0.7; 
const IMAGE_HEIGHT = IMAGE_WIDTH * (9 / 16); 

const usaTimezones = [
    { label: "Eastern (ET)", value: "America/New_York" },
    { label: "Central (CST)", value: "America/Chicago" },
    { label: "Mountain (MT)", value: "America/Denver" },
    { label: "Mountain (no DST)", value: "America/Phoenix" },
    { label: "Pacific (PST)", value: "America/Los_Angeles" },
    { label: "Alaska (AKST)", value: "America/Anchorage" },
    { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
];

const GroupEditScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();

    const { data: groupDetails, isLoading } = useGetGroupDetails(id);
    const { mutate: updateGroup, isPending } = useUpdateGroup();

    const [step, setStep] = useState(1);
    const [groupName, setGroupName] = useState('');
    const [meetTime, setMeetTime] = useState<string | undefined>();
    const [timezone, setTimezone] = useState<string | undefined>();
    
    // Now this state accepts the full API Schedule type
    const [schedule, setSchedule] = useState<Schedule | undefined>();

    useEffect(() => {
        if (groupDetails) {
            setGroupName(groupDetails.name);
            setMeetTime(groupDetails.time);
            setTimezone(groupDetails.timezone);
            setSchedule(groupDetails.schedule);
        }
    }, [groupDetails]);

    const handleSaveChanges = () => {
        if (!id || !meetTime || !schedule || !timezone) return;
        updateGroup({ groupId: id, name: groupName, time: meetTime, schedule, timezone });
    };

    if (isLoading || !groupDetails || !schedule) {
        return <ActivityIndicator size="large" style={{ marginTop: 32 }} />;
    }

    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <View style={styles.stepContainer}>
                        <Text style={styles.headerTitle}>Edit Group Name</Text>
                        <TextInput
                            style={styles.nameInput}
                            value={groupName}
                            onChangeText={setGroupName}
                            placeholder="Enter new group name"
                        />
                        
                        <View style={[styles.imagePlaceholder, { width: IMAGE_WIDTH, height: IMAGE_HEIGHT }]}>
                            <Image source={GroupImage} style={{ width: '100%', height: '100%', borderRadius: 8 }} resizeMode="cover" />
                        </View>
                        <View style={styles.footerNav}>
                            <View /> 
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
                        {/* Ensure SchedulePicker accepts the API Schedule type in its props */}
                        <SchedulePicker onScheduleChange={setSchedule} initialValue={schedule} />
                        <View style={styles.footerNav}>
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
                        <Text style={styles.headerTitle}>Choose a new time for your group</Text>
                        <TimePicker onTimeChange={setMeetTime} initialValue={meetTime} />
                        <View style={styles.timezoneContainer}>
                            <Text style={styles.title}>Select Timezone</Text>
                            <View style={styles.pickerWrapper}>
                                <Picker selectedValue={timezone} onValueChange={setTimezone} itemStyle={styles.pickerItem}>
                                    {usaTimezones.map(tz => <Picker.Item key={tz.value} label={tz.label} value={tz.value} />)}
                                </Picker>
                            </View>
                        </View>
                        <View style={styles.footerNav}>
                            <TouchableOpacity onPress={() => setStep(2)}>
                                <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleSaveChanges}
                                disabled={isPending}
                                style={[styles.saveButton, isPending && { backgroundColor: '#A5B4FC' }]}
                            >
                                <Text style={styles.saveButtonText}>{isPending ? "Saving..." : "Save Changes"}</Text>
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
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                <View style={{ padding: 24 }}>
                    {renderStepContent()}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    stepContainer: { justifyContent: 'space-between' },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', textAlign: 'center', marginBottom: 24 },
    nameInput: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#4F46E5',
        textAlign: 'center',
        padding: 10,
        borderBottomWidth: 2,
        borderBottomColor: '#D1D5DB'
    },
    imagePlaceholder: { marginVertical: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
    footerNav: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
    title: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 8, textAlign: 'center' },
    timezoneContainer: { width: '100%', marginVertical: 16 },
    pickerWrapper: { backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', overflow: 'hidden' },
    pickerItem: { color: 'black', fontSize: 18, height: 120 },
    saveButton: { paddingVertical: 16, paddingHorizontal: 32, borderRadius: 8, alignItems: 'center', backgroundColor: '#4F46E5', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1.41, elevation: 2 },
    saveButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
});

export default GroupEditScreen;