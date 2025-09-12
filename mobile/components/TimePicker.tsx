import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface TimePickerProps {
  onTimeChange: (time: string) => void;
}

const TimePicker: React.FC<TimePickerProps> = ({ onTimeChange }) => {
  const [hour, setHour] = useState(5);
  const [minute, setMinute] = useState(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('PM');

  useEffect(() => {
    const formattedMinute = minute.toString().padStart(2, '0');
    onTimeChange(`${hour}:${formattedMinute} ${period}`);
  }, [hour, minute, period, onTimeChange]);

  const handleHourChange = (amount: number) => {
    let newHour = hour + amount;
    if (newHour > 12) newHour = 1;
    if (newHour < 1) newHour = 12;
    setHour(newHour);
  };

  const handleMinuteChange = (amount: number) => {
    let newMinute = minute + amount;
    if (newMinute > 59) newMinute = 0;
    if (newMinute < 0) newMinute = 59;
    setMinute(newMinute);
  };

  const togglePeriod = () => {
    setPeriod(current => (current === 'AM' ? 'PM' : 'AM'));
  };
  
  const PickerControl: React.FC<{ value: string | number, onIncrease: () => void, onDecrease: () => void }> = ({ value, onIncrease, onDecrease }) => (
    <View style={styles.pickerControl}>
      <TouchableOpacity onPress={onIncrease}><Feather name="chevron-up" size={28} color="#4f46e5" /></TouchableOpacity>
      <Text style={styles.pickerText}>{String(value).padStart(2, '0')}</Text>
      <TouchableOpacity onPress={onDecrease}><Feather name="chevron-down" size={28} color="#4f46e5" /></TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
        <Text style={styles.title}>Set Meeting Time</Text>
        <View style={styles.pickersContainer}>
            <PickerControl value={hour} onIncrease={() => handleHourChange(1)} onDecrease={() => handleHourChange(-1)} />
            <Text style={styles.separator}>:</Text>
            <PickerControl value={minute} onIncrease={() => handleMinuteChange(1)} onDecrease={() => handleMinuteChange(-1)} />
            <TouchableOpacity onPress={togglePeriod} style={styles.periodControl}>
                <Text style={styles.pickerPeriodText}>{period}</Text>
            </TouchableOpacity>
        </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', marginVertical: 16 },
  title: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: '#374151', marginBottom: 8, textAlign: 'center' },
  pickersContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  pickerControl: { alignItems: 'center', backgroundColor: '#F3F4F6', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8 },
  pickerText: { fontSize: 30, lineHeight: 36, fontWeight: 'bold', color: '#1F2937', marginVertical: 8, width: 64, textAlign: 'center' },
  pickerPeriodText: { fontSize: 30, lineHeight: 36, fontWeight: 'bold', color: '#1F2937', paddingHorizontal: 8 },
  separator: { fontSize: 30, lineHeight: 36, fontWeight: 'bold', color: '#1F2937', paddingBottom: 24 },
  periodControl: { backgroundColor: '#F3F4F6', padding: 8, borderRadius: 8, marginLeft: 8, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
});

export default TimePicker;