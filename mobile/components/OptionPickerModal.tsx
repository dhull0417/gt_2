import React, { useRef } from 'react';
import { Text, Modal, StyleSheet, ScrollView } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Feather } from '@expo/vector-icons';
import { useAppearance, useThemeColors } from '@/contexts/AppearanceContext';

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
// A plain scrolling list (no search box), opened scrolled to the current choice.
const OptionPickerModal: React.FC<OptionPickerModalProps> = ({ title, options, selectedKey, onSelect, onClose }) => {
    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const isDark = scheme === 'dark';
    const activeRowBg = isDark ? '#1A2A42' : '#EEF6FF';
    const activeText = isDark ? '#93C5FD' : '#1D4ED8';
    const scrollRef = useRef<ScrollView>(null);
    const scrolledToSelected = useRef(false);

    return (
        <Modal animationType="fade" transparent visible onRequestClose={onClose}>
            <PressableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <PressableOpacity activeOpacity={1} style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
                    <Text style={[styles.title, { color: colors.textFaint }]}>{title}</Text>
                    <ScrollView ref={scrollRef} style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                        {options.map(opt => {
                            const active = opt.key === selectedKey;
                            return (
                                <PressableOpacity key={opt.key} style={[styles.row, active && { backgroundColor: activeRowBg }]}
                                    onLayout={active ? (e) => {
                                        if (scrolledToSelected.current) return;
                                        scrolledToSelected.current = true;
                                        scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 120), animated: false });
                                    } : undefined}
                                    onPress={() => onSelect(opt.key)}>
                                    <Text style={[styles.rowText, { color: colors.textSecondary }, active && { color: activeText, fontWeight: '800' }]}>{opt.label}</Text>
                                    {active && <Feather name="check" size={18} color={colors.brand} />}
                                </PressableOpacity>
                            );
                        })}
                    </ScrollView>
                </PressableOpacity>
            </PressableOpacity>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 24 },
    card: { width: '100%', maxWidth: 340, backgroundColor: 'white', borderRadius: 20, padding: 16 },
    title: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, textAlign: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 10, borderRadius: 10 },
    rowText: { fontSize: 15, color: '#374151', fontWeight: '600' },
});

export default OptionPickerModal;
