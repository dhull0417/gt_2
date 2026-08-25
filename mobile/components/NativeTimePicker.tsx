import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform, StyleSheet } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

// Converts between this app's "hh:mm AM/PM" time strings and the Date objects
// the native picker requires.
export const timeStringToDate = (time: string): Date => {
    const [t, period] = time.split(' ');
    let [h, m] = t.split(':').map(Number);
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
};

export const dateToTimeString = (date: Date): string => {
    let h = date.getHours();
    const m = date.getMinutes();
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
};

interface NativeTimePickerProps {
    value: string;
    onChange: (time: string) => void;
    onClose: () => void;
    // React Native doesn't reliably stack a second native <Modal> on top of one
    // that's already open. Pass this when rendering from inside a screen that's
    // already presented as a Modal (e.g. MeetupDetailModal's edit modal) so this
    // renders as a plain absolutely-positioned overlay instead. Callers must
    // render this outside their own KeyboardAvoidingView (a sibling, not a
    // descendant) — see LocationSearchModal for the same rule.
    asOverlay?: boolean;
}

// Platform-native time picker: an inline spinner in a bottom sheet on iOS (with a
// Done button to commit), or the system dialog on Android (which commits on pick).
// Caller controls mount/unmount — render this only while its own "show picker" flag is true.
const NativeTimePicker: React.FC<NativeTimePickerProps> = ({ value, onChange, onClose, asOverlay }) => {
    const [temp, setTemp] = useState<Date>(() => timeStringToDate(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { setTemp(timeStringToDate(value)); }, []);

    const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
        const currentDate = selectedDate || temp;
        if (Platform.OS === 'android') {
            onClose();
            onChange(dateToTimeString(currentDate));
        } else {
            setTemp(currentDate);
        }
    };

    if (Platform.OS === 'android') {
        return <DateTimePicker value={temp} mode="time" display="default" onChange={handleChange} />;
    }

    const content = (
        <View style={styles.modalContainer}>
            <View style={styles.pickerModalContent}>
                <DateTimePicker value={temp} mode="time" display="spinner" onChange={handleChange} textColor="black" />
                <TouchableOpacity onPress={() => { onChange(dateToTimeString(temp)); onClose(); }} style={styles.doneButton}>
                    <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    if (asOverlay) {
        return <View style={StyleSheet.absoluteFillObject}>{content}</View>;
    }

    return (
        <Modal animationType="slide" transparent visible onRequestClose={onClose}>
            {content}
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 24 },
    pickerModalContent: { alignSelf: 'center', backgroundColor: 'white', borderRadius: 20, padding: 16, overflow: 'hidden' },
    doneButton: { backgroundColor: '#4A90E2', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
    doneButtonText: { color: 'white', fontSize: 18, fontWeight: '600' },
});

export default NativeTimePicker;
