import React, { useMemo, useState } from 'react';
import { View, Text, Modal, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
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
    /** Adds a search box on top (for long lists such as timezones). */
    searchable?: boolean;
}

// Tap-to-select popup list, presented the same way as NativeTimePicker's sheet.
const OptionPickerModal: React.FC<OptionPickerModalProps> = ({ title, options, selectedKey, onSelect, onClose, searchable }) => {
    const [query, setQuery] = useState('');
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.key.toLowerCase().includes(q)) : options;
    }, [options, query]);
    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const isDark = scheme === 'dark';
    const activeRowBg = isDark ? '#1A2A42' : '#EEF6FF';
    const activeText = isDark ? '#93C5FD' : '#1D4ED8';

    return (
        <Modal animationType="fade" transparent visible onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <PressableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <PressableOpacity activeOpacity={1} style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
                    <Text style={[styles.title, { color: colors.textFaint }]}>{title}</Text>
                    {searchable && (
                        <TextInput
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Search"
                            placeholderTextColor={colors.placeholder}
                            autoCorrect={false}
                            autoCapitalize="none"
                            clearButtonMode="while-editing"
                            style={[styles.search, { backgroundColor: colors.backgroundAlt, color: colors.textSecondary, borderColor: colors.border }]}
                        />
                    )}
                    <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        {shown.length === 0 && <Text style={{ color: colors.textFaint, textAlign: 'center', paddingVertical: 20 }}>No matches</Text>}
                        {shown.map(opt => {
                            const active = opt.key === selectedKey;
                            return (
                                <PressableOpacity key={opt.key} style={[styles.row, active && { backgroundColor: activeRowBg }]}
                                    onPress={() => onSelect(opt.key)}>
                                    <Text style={[styles.rowText, { color: colors.textSecondary }, active && { color: activeText, fontWeight: '800' }]}>{opt.label}</Text>
                                    {active && <Feather name="check" size={18} color={colors.brand} />}
                                </PressableOpacity>
                            );
                        })}
                    </ScrollView>
                </PressableOpacity>
            </PressableOpacity>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 24 },
    card: { width: '100%', maxWidth: 340, backgroundColor: 'white', borderRadius: 20, padding: 16 },
    title: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, textAlign: 'center' },
    search: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 40, fontSize: 15, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 10, borderRadius: 10 },
    rowText: { fontSize: 15, color: '#374151', fontWeight: '600' },
});

export default OptionPickerModal;
