import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    Modal,
    ActivityIndicator,
    Platform,
    ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DateTime } from 'luxon';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import TimePicker from './TimePicker';
import { useCreatePoll } from '@/hooks/useCreatePoll';

interface CreatePollModalProps {
    visible: boolean;
    onClose: () => void;
    groupId: string;
    timezone: string;
}

const MAX_PROMPT_LENGTH = 100;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const PROMPT_PLACEHOLDER = "What time works best for everyone this weekend?";

const parseTimeString = (timeStr: string) => {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return { hours, minutes };
};

const combineDateAndTime = (date: Date, time: string, timezone: string): string => {
    const { hours, minutes } = parseTimeString(time);
    const isoDate = DateTime.fromJSDate(date).toISODate();
    return DateTime.fromISO(isoDate!, { zone: timezone })
        .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 })
        .toISO()!;
};

const CreatePollModal = ({ visible, onClose, groupId, timezone }: CreatePollModalProps) => {
    const { mutateAsync: createPoll, isPending } = useCreatePoll();

    const [prompt, setPrompt] = useState('');
    const [options, setOptions] = useState(['', '']);
    const [allowMultiple, setAllowMultiple] = useState(false);

    const [expiryDate, setExpiryDate] = useState<Date | null>(null);
    const [expiryTime, setExpiryTime] = useState<string | null>(null);

    const [expiryPickerOpen, setExpiryPickerOpen] = useState(false);
    const [tempExpiryDate, setTempExpiryDate] = useState(new Date());
    const [tempExpiryTime, setTempExpiryTime] = useState('09:00 PM');
    const [showAndroidDatePicker, setShowAndroidDatePicker] = useState(false);

    const filledOptionCount = options.filter(o => o.trim().length > 0).length;
    const hasExpiry = !!expiryDate && !!expiryTime;
    const canStartPoll = prompt.trim().length > 0 && filledOptionCount >= MIN_OPTIONS && hasExpiry;

    const resetAndClose = () => {
        setPrompt('');
        setOptions(['', '']);
        setAllowMultiple(false);
        setExpiryDate(null);
        setExpiryTime(null);
        onClose();
    };

    const updateOption = (index: number, text: string) => {
        setOptions(prev => prev.map((opt, i) => (i === index ? text : opt)));
    };

    const addOption = () => {
        if (options.length >= MAX_OPTIONS) return;
        setOptions(prev => [...prev, '']);
    };

    const toggleExpiryPicker = () => {
        if (!expiryPickerOpen) {
            setTempExpiryDate(expiryDate || new Date(Date.now() + 60 * 60 * 1000));
            setTempExpiryTime(expiryTime || '09:00 PM');
            if (Platform.OS === 'android') setShowAndroidDatePicker(true);
        }
        setExpiryPickerOpen(prev => !prev);
    };

    const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
        if (Platform.OS === 'android') setShowAndroidDatePicker(false);
        if (selectedDate) setTempExpiryDate(selectedDate);
    };

    const confirmExpiry = () => {
        setExpiryDate(tempExpiryDate);
        setExpiryTime(tempExpiryTime);
        setExpiryPickerOpen(false);
    };

    const handleStartPoll = async () => {
        if (!canStartPoll || !expiryDate || !expiryTime) return;
        try {
            await createPoll({
                groupId,
                prompt: prompt.trim(),
                options: options.map(o => o.trim()).filter(Boolean),
                allowMultiple,
                expiresAt: combineDateAndTime(expiryDate, expiryTime, timezone),
            });
            resetAndClose();
        } catch {
            // Errors are surfaced via the mutation's onError alert.
        }
    };

    const formattedExpiry = hasExpiry
        ? `${DateTime.fromJSDate(expiryDate!).toFormat('MMM d, yyyy')} at ${expiryTime}`
        : 'Select date & time';

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={resetAndClose}>
            <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                    <TouchableOpacity onPress={resetAndClose}>
                        <Feather name="x" size={24} color="#374151" />
                    </TouchableOpacity>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={styles.modalHeaderTitle}>Create A Poll</Text>
                        <Text style={styles.modalHeaderSubtitle}>The poll will appear in the chat</Text>
                    </View>
                    <View style={{ width: 24 }} />
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                    {/* --- Expiration --- */}
                    <TouchableOpacity
                        style={[styles.expiryRow, expiryPickerOpen && styles.expiryRowOpen]}
                        onPress={toggleExpiryPicker}
                    >
                        <View style={styles.expiryRowLeft}>
                            <Feather name="clock" size={16} color="#4A90E2" />
                            <Text style={styles.expiryRowLabel}>Poll Expiration</Text>
                        </View>
                        <View style={styles.expiryRowRight}>
                            <Text style={[styles.expiryRowValue, !hasExpiry && styles.expiryRowPlaceholder]}>
                                {formattedExpiry}
                            </Text>
                            <Feather name={expiryPickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#9CA3AF" />
                        </View>
                    </TouchableOpacity>

                    {expiryPickerOpen && (
                        <View style={styles.expiryPanel}>
                            <Text style={styles.sheetLabel}>Date</Text>
                            {Platform.OS === 'ios' ? (
                                <DateTimePicker
                                    value={tempExpiryDate}
                                    mode="date"
                                    display="spinner"
                                    minimumDate={new Date()}
                                    onChange={onDateChange}
                                    textColor="black"
                                />
                            ) : (
                                <>
                                    <TouchableOpacity style={styles.androidDateRow} onPress={() => setShowAndroidDatePicker(true)}>
                                        <Text style={styles.androidDateRowText}>
                                            {DateTime.fromJSDate(tempExpiryDate).toFormat('MMM d, yyyy')}
                                        </Text>
                                    </TouchableOpacity>
                                    {showAndroidDatePicker && (
                                        <DateTimePicker
                                            value={tempExpiryDate}
                                            mode="date"
                                            display="default"
                                            minimumDate={new Date()}
                                            onChange={onDateChange}
                                        />
                                    )}
                                </>
                            )}

                            <Text style={styles.sheetLabel}>Time</Text>
                            <TimePicker onTimeChange={setTempExpiryTime} initialValue={tempExpiryTime} hideLabel />

                            <TouchableOpacity onPress={confirmExpiry} style={styles.doneButton}>
                                <Text style={styles.doneButtonText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* --- Prompt --- */}
                    <Text style={styles.fieldLabel}>Prompt</Text>
                    <TextInput
                        style={styles.promptInput}
                        value={prompt}
                        onChangeText={(text) => setPrompt(text.slice(0, MAX_PROMPT_LENGTH))}
                        placeholder={PROMPT_PLACEHOLDER}
                        placeholderTextColor="#9CA3AF"
                        maxLength={MAX_PROMPT_LENGTH}
                        multiline
                    />
                    <Text style={styles.charCounter}>{prompt.length}/{MAX_PROMPT_LENGTH}</Text>

                    {/* --- Responses --- */}
                    <View style={styles.responsesHeader}>
                        <Text style={styles.sectionTitle}>Responses</Text>
                        <Text style={styles.responsesCounter}>{options.length}/{MAX_OPTIONS}</Text>
                    </View>

                    {options.map((option, index) => (
                        <View key={index} style={styles.optionRow}>
                            <Text style={styles.optionNumber}>{index + 1}</Text>
                            <TextInput
                                style={styles.optionInput}
                                value={option}
                                onChangeText={(text) => updateOption(index, text)}
                                placeholder="Type a response option here"
                                placeholderTextColor="#9CA3AF"
                            />
                        </View>
                    ))}

                    {options.length < MAX_OPTIONS ? (
                        <TouchableOpacity style={styles.addOptionBox} onPress={addOption}>
                            <Feather name="plus" size={20} color="#4A90E2" />
                        </TouchableOpacity>
                    ) : (
                        <Text style={styles.limitReachedText}>Limit of 10 responses reached</Text>
                    )}

                    {/* --- Single / Multiple --- */}
                    <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Response Type</Text>
                    <View style={styles.responseTypeRow}>
                        <TouchableOpacity
                            style={[styles.responseTypePill, !allowMultiple && styles.responseTypePillSelected]}
                            onPress={() => setAllowMultiple(false)}
                        >
                            <Text style={[styles.responseTypeText, !allowMultiple && styles.responseTypeTextSelected]}>
                                Single Answer
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.responseTypePill, allowMultiple && styles.responseTypePillSelected]}
                            onPress={() => setAllowMultiple(true)}
                        >
                            <Text style={[styles.responseTypeText, allowMultiple && styles.responseTypeTextSelected]}>
                                Multiple Answers
                            </Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>

                <TouchableOpacity
                    onPress={handleStartPoll}
                    disabled={!canStartPoll || isPending}
                    style={[styles.startBtn, (!canStartPoll || isPending) && styles.startBtnDisabled]}
                >
                    {isPending ? <ActivityIndicator color="white" /> : <Text style={styles.startBtnText}>Start Poll</Text>}
                </TouchableOpacity>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContent: { flex: 1, backgroundColor: 'white', padding: 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalHeaderTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    modalHeaderSubtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

    expiryRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#F9FAFB', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB',
        paddingVertical: 14, paddingHorizontal: 16, marginBottom: 24,
    },
    expiryRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    expiryRowLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
    expiryRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    expiryRowValue: { fontSize: 14, color: '#111827' },
    expiryRowPlaceholder: { color: '#9CA3AF' },
    expiryRowOpen: { marginBottom: 8, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },

    fieldLabel: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 8 },
    promptInput: {
        backgroundColor: '#F9FAFB', padding: 16, borderRadius: 12, fontSize: 16,
        borderBottomWidth: 2, borderBottomColor: '#4A90E2', minHeight: 70, textAlignVertical: 'top',
    },
    charCounter: { fontSize: 12, color: '#9CA3AF', textAlign: 'right', marginTop: 6, marginBottom: 20 },

    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
    responsesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    responsesCounter: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF' },

    optionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
    optionNumber: { width: 20, fontSize: 14, fontWeight: 'bold', color: '#9CA3AF', textAlign: 'center' },
    optionInput: {
        flex: 1, backgroundColor: '#F9FAFB', paddingVertical: 12, paddingHorizontal: 14,
        borderRadius: 12, fontSize: 15, borderWidth: 1, borderColor: '#E5E7EB',
    },
    addOptionBox: {
        marginLeft: 30, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: '#4A90E2',
        borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F9FF',
    },
    limitReachedText: { marginLeft: 30, fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginTop: 4 },

    responseTypeRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    responseTypePill: {
        flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
        backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    },
    responseTypePillSelected: { backgroundColor: '#4A90E2', borderColor: '#4A90E2' },
    responseTypeText: { fontSize: 13, fontWeight: '600', color: '#374151' },
    responseTypeTextSelected: { color: 'white' },

    startBtn: { backgroundColor: '#4A90E2', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
    startBtnDisabled: { backgroundColor: '#C7D2FE' },
    startBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    expiryPanel: {
        backgroundColor: '#F9FAFB', borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
        borderWidth: 1, borderTopWidth: 0, borderColor: '#E5E7EB',
        padding: 16, marginBottom: 24,
    },
    sheetLabel: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
    androidDateRow: {
        backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
        paddingVertical: 14, alignItems: 'center', marginBottom: 8,
    },
    androidDateRowText: { fontSize: 15, fontWeight: '600', color: '#111827' },
    doneButton: { backgroundColor: '#4A90E2', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 16 },
    doneButtonText: { color: 'white', fontSize: 18, fontWeight: '600' },
});

export default CreatePollModal;
