import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

export interface Schedule {
  frequency: 'weekly' | 'monthly';
  day: number;
}

interface SchedulePickerProps {
    onScheduleChange: (schedule: Schedule) => void;
    initialValue?: Schedule; // Can accept an initial schedule object
}

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const daysOfMonth = Array.from({ length: 31 }, (_, i) => i + 1);

const SchedulePicker: React.FC<SchedulePickerProps> = ({ onScheduleChange, initialValue }) => {
  // Initialize state with the initialValue if provided, otherwise use a default
  const [schedule, setSchedule] = useState<Schedule>(initialValue || { frequency: 'weekly', day: 1 });

  useEffect(() => {
    onScheduleChange(schedule);
  }, [schedule, onScheduleChange]);

  const setFrequency = (frequency: 'weekly' | 'monthly') => {
    setSchedule({ frequency, day: frequency === 'weekly' ? 1 : 15 });
  };
  const setDay = (day: number) => {
    setSchedule(currentSchedule => ({ ...currentSchedule, day }));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set Recurring Schedule</Text>
      <View>
        <View style={styles.freqContainer}>
          <TouchableOpacity onPress={() => setFrequency('weekly')} style={[styles.freqButton, schedule.frequency === 'weekly' && styles.freqButtonActive]}>
            <Text style={[styles.freqText, schedule.frequency === 'weekly' && styles.freqTextActive]}>Weekly</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFrequency('monthly')} style={[styles.freqButton, schedule.frequency === 'monthly' && styles.freqButtonActive]}>
            <Text style={[styles.freqText, schedule.frequency === 'monthly' && styles.freqTextActive]}>Monthly</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(schedule.frequency === 'weekly' ? daysOfWeek : daysOfMonth).map((dayLabel, index) => {
            const dayValue = schedule.frequency === 'weekly' ? index : (dayLabel as number);
            const isSelected = schedule.day === dayValue;
            return (
              <TouchableOpacity
                key={dayValue}
                onPress={() => setDay(dayValue)}
                style={[styles.dayButton, isSelected && styles.dayButtonSelected]}
              >
                <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>{dayLabel}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', marginVertical: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, backgroundColor: '#F9FAFB' },
  title: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: '#374151', marginBottom: 16, textAlign: 'center' },
  freqContainer: { flexDirection: 'row', justifyContent: 'center', backgroundColor: '#E5E7EB', borderRadius: 8, padding: 4, marginBottom: 16 },
  freqButton: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  freqButtonActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1.41, elevation: 2 },
  freqText: { fontWeight: '600', color: '#4B5563' },
  freqTextActive: { color: '#4F46E5' },
  dayButton: { height: 48, width: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB' },
  dayButtonSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  dayText: { fontWeight: 'bold', fontSize: 14, color: '#374151' },
  dayTextSelected: { color: '#FFFFFF' },
});

export default SchedulePicker;