import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';

export interface PickerOption {
    key: string;
    label: string;
}

interface OptionPickerModalProps {
    title: string;
    options: PickerOption[];
    selectedKey: string;
    onSelect: (key: string) => void;
    onClose: () => void;
}

// Tap-to-select popup list, presented the same way as NativeTimePicker's sheet.
const OptionPickerModal: React.FC<OptionPickerModalProps> = ({ title, options, selectedKey, onSelect, onClose }) => {
    return (
        <Modal animationType="fade" transparent visible onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
                    <Text style={styles.title}>{title}</Text>
                    <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                        {options.map(opt => {
                            const active = opt.key === selectedKey;
                            return (
                                <TouchableOpacity key={opt.key} style={[styles.row, active && styles.rowActive]}
                                    onPress={() => onSelect(opt.key)}>
                                    <Text style={[styles.rowText, active && styles.rowTextActive]}>{opt.label}</Text>
                                    {active && <Feather name="check" size={18} color="#4A90E2" />}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 24 },
    card: { width: '100%', maxWidth: 340, backgroundColor: 'white', borderRadius: 20, padding: 16 },
    title: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, textAlign: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 10, borderRadius: 10 },
    rowActive: { backgroundColor: '#EEF6FF' },
    rowText: { fontSize: 15, color: '#374151', fontWeight: '600' },
    rowTextActive: { color: '#1D4ED8', fontWeight: '800' },
});

export default OptionPickerModal;
