import React, { useState } from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';

interface InfoBubbleProps {
    title: string;
    description: string;
    iconSize?: number;
    iconColor?: string;
    style?: any;
}

// Small "i" button that pops a dismissible explainer card over the page content.
export default function InfoBubble({ title, description, iconSize = 14, iconColor, style }: InfoBubbleProps) {
    const colors = useThemeColors();
    const [visible, setVisible] = useState(false);
    const resolvedIconColor = iconColor ?? colors.textFaint;

    return (
        <>
            <TouchableOpacity
                onPress={() => setVisible(true)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[styles.trigger, { backgroundColor: colors.backgroundAlt }, style]}
            >
                <Feather name="info" size={iconSize} color={resolvedIconColor} />
            </TouchableOpacity>

            <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
                <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
                    <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
                        <View style={styles.header}>
                            <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
                            <TouchableOpacity onPress={() => setVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Feather name="x" size={18} color={colors.textFaint} />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.description, { color: colors.textMuted }]}>{description}</Text>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    trigger: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
    card: {
        backgroundColor: '#fff', borderRadius: 18, padding: 20, width: '100%', maxWidth: 360,
        shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 6,
    },
    header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
    title: { fontSize: 16, fontWeight: '800', color: '#111827', flex: 1, marginRight: 12 },
    description: { fontSize: 14, color: '#4B5563', lineHeight: 20 },
});
