import React, { useState } from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface InfoBubbleProps {
    title: string;
    description: string;
    iconSize?: number;
    iconColor?: string;
    style?: any;
}

// Small "i" button that pops a dismissible explainer card over the page content.
export default function InfoBubble({ title, description, iconSize = 14, iconColor = '#9CA3AF', style }: InfoBubbleProps) {
    const [visible, setVisible] = useState(false);

    return (
        <>
            <TouchableOpacity
                onPress={() => setVisible(true)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[styles.trigger, style]}
            >
                <Feather name="info" size={iconSize} color={iconColor} />
            </TouchableOpacity>

            <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
                <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
                    <Pressable style={styles.card} onPress={() => {}}>
                        <View style={styles.header}>
                            <Text style={styles.title}>{title}</Text>
                            <TouchableOpacity onPress={() => setVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Feather name="x" size={18} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.description}>{description}</Text>
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
