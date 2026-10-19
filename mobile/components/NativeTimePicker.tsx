import React, { useState, useEffect } from 'react';
import { View, Text, Modal, Platform, StyleSheet } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useThemeColors, useAppearance } from '@/contexts/AppearanceContext';

import { timeStringToDate, dateToTimeString } from '@/utils/timeString';

// Re-exported so existing imports from this file keep working.
export { timeStringToDate, dateToTimeString };

interface NativeTimePickerProps {
    value: string;
    onChange: (time: string) => void;
    onClose: () => void;
    // Set when already inside a Modal (e.g. MeetupDetailModal) to render as a
    // plain overlay instead of stacking a second native Modal. Render as a
    // sibling of the caller's KeyboardAvoidingView, not nested — see LocationSearchModal.
    asOverlay?: boolean;
}

// iOS: inline spinner sheet with a Done button. Android: system dialog, commits on pick.
// Caller controls mount/unmount via its own "show picker" flag.
const NativeTimePicker: React.FC<NativeTimePickerProps> = ({ value, onChange, onClose, asOverlay }) => {
    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const [temp, setTemp] = useState<Date>(() => timeStringToDate(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { setTemp(timeStringToDate(value)); }, []);

    const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            // event.type 'set' confirms; a dismiss (back/tap outside) must not commit.
            onClose();
            if (event.type === 'set' && selectedDate) {
                onChange(dateToTimeString(selectedDate));
            }
            return;
        }
        if (selectedDate) {
            setTemp(selectedDate);
        }
    };

    if (Platform.OS === 'android') {
        return <DateTimePicker value={temp} mode="time" display="default" onChange={handleChange} />;
    }

    const content = (
        <View style={[styles.modalContainer, { backgroundColor: colors.overlay }]}>
            <View style={[styles.pickerModalContent, { backgroundColor: colors.surface }]}>
                <DateTimePicker value={temp} mode="time" display="spinner" onChange={handleChange} textColor={scheme === 'dark' ? 'white' : 'black'} />
                <PressableOpacity onPress={() => { onChange(dateToTimeString(temp)); onClose(); }} style={[styles.doneButton, { backgroundColor: colors.brand }]}>
                    <Text style={styles.doneButtonText}>Done</Text>
                </PressableOpacity>
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
