import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Schedule } from '@/utils/api';
import { useThemeColors } from '@/contexts/AppearanceContext';

interface SchedulePickerProps {
    onScheduleChange: (schedule: Schedule) => void;
    initialValue?: Schedule;
}

const daysOfWeek = [
    { label: "Sunday", value: 0 },
    { label: "Monday", value: 1 },
    { label: "Tuesday", value: 2 },
    { label: "Wednesday", value: 3 },
    { label: "Thursday", value: 4 },
    { label: "Friday", value: 5 },
    { label: "Saturday", value: 6 },
];

const SchedulePicker: React.FC<SchedulePickerProps> = ({ onScheduleChange, initialValue }) => {
    const colors = useThemeColors();
    // Defaults to 'weekly' unless initialValue specifies otherwise
    const [frequency, setFrequency] = useState<Schedule['frequency']>(initialValue?.frequency || 'weekly');
    const [selectedDays, setSelectedDays] = useState<number[]>(initialValue?.days || []);

    // 'days' array doubles as monthly dates (1-31)
    const [selectedDates, setSelectedDates] = useState<number[]>(initialValue?.frequency === 'monthly' ? (initialValue.days || []) : []);

useEffect(() => {
        const newSchedule: Schedule = {
            frequency,
            days: []
        };

        if (frequency === 'weekly' || frequency === 'biweekly') {
            newSchedule.days = selectedDays;
        } else if (frequency === 'monthly') {
            newSchedule.days = selectedDates;
        } else if (frequency === 'daily') {
            // Send all 7 days, matching create-group convention
            newSchedule.days = [0, 1, 2, 3, 4, 5, 6];
        }

        onScheduleChange(newSchedule);
    }, [frequency, selectedDays, selectedDates]);

    const toggleDay = (dayIndex: number) => {
        setSelectedDays(prev =>
            prev.includes(dayIndex) ? prev.filter(d => d !== dayIndex) : [...prev, dayIndex]
        );
    };

    const toggleDate = (date: number) => {
        setSelectedDates(prev => {
            if (prev.includes(date)) return prev.filter(d => d !== date);
            if (prev.length >= 10) {
                Alert.alert("Limit Reached", "You can only select up to 10 dates.");
                return prev;
            }
            return [...prev, date];
        });
    };

    return (
        <View>
            {/* Frequency Selector */}
            <View style={styles.row}>
                {(['daily', 'weekly', 'biweekly', 'monthly'] as const).map((freq) => (
                    <TouchableOpacity
                        key={freq}
                        style={[styles.freqButton, { backgroundColor: colors.surface, borderColor: colors.borderStrong }, frequency === freq && { backgroundColor: colors.brand, borderColor: colors.brand }]}
                        onPress={() => setFrequency(freq)}
                    >
                        <Text style={[styles.freqText, { color: colors.textSecondary }, frequency === freq && styles.textActive]}>
                            {freq.charAt(0).toUpperCase() + freq.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Weekly / Bi-Weekly UI */}
            {(frequency === 'weekly' || frequency === 'biweekly') && (
                <View style={styles.daysContainer}>
                    {daysOfWeek.map((day) => (
                        <TouchableOpacity
                            key={day.value}
                            style={[styles.dayButton, { backgroundColor: colors.surface, borderColor: colors.border }, selectedDays.includes(day.value) && { backgroundColor: colors.brand, borderColor: colors.brand }]}
                            onPress={() => toggleDay(day.value)}
                        >
                            <Text style={[styles.dayText, { color: colors.textSecondary }, selectedDays.includes(day.value) && styles.textActive]}>
                                {day.label.slice(0, 3)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Monthly UI */}
            {frequency === 'monthly' && (
                <View style={styles.calendarGrid}>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((date) => (
                        <TouchableOpacity
                            key={date}
                            style={[styles.dateBox, { backgroundColor: colors.surface, borderColor: colors.border }, selectedDates.includes(date) && { backgroundColor: colors.brand, borderColor: colors.brand }]}
                            onPress={() => toggleDate(date)}
                        >
                            <Text style={[styles.dateText, { color: colors.textSecondary }, selectedDates.includes(date) && styles.textActive]}>{date}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Daily UI */}
            {frequency === 'daily' && (
                <Text style={[styles.infoText, { color: colors.textMuted }]}>Meetup will occur every day.</Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 },
    freqButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: '#D1D5DB', marginRight: 8, marginBottom: 8, backgroundColor: '#FFF' },
    freqText: { color: '#374151', fontSize: 14, fontWeight: '500' },
    textActive: { color: '#FFF' },

    daysContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    dayButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', margin: 4, backgroundColor: '#FFF' },
    dayText: { fontSize: 12, color: '#374151' },

    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    dateBox: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', margin: 3, backgroundColor: '#FFF' },
    dateText: { fontSize: 12, color: '#374151' },

    infoText: { textAlign: 'center', color: '#6B7280', marginTop: 8, fontStyle: 'italic' }
});

export default SchedulePicker;
