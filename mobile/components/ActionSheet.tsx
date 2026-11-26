import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';

export type ActionSheetItem = {
    key: string;
    label: string;
    /** Icon element rendered inside the tinted tile. */
    icon: React.ReactNode;
    /** Tile background; caller picks the light/dark value. */
    iconBg: string;
    /** Omit for a display-only row (doesn't close the sheet). */
    onPress?: () => void;
};

type Props = {
    visible: boolean;
    onClose: () => void;
    items: ActionSheetItem[];
    /** Optional heading under the drag handle. */
    title?: string;
};

/**
 * Slide-up list of actions (Material-style modal bottom sheet).
 * Closes on backdrop tap and Android back; tapping a row closes the sheet, then runs the action.
 */
export function ActionSheet({ visible, onClose, items, title }: Props) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();

    return (
        <Modal transparent visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
            <Pressable testID="action-sheet-backdrop" style={styles.backdrop} onPress={onClose}>
                <Pressable
                    style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(24, insets.bottom + 12) }]}
                    onPress={() => {}}
                >
                    <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
                    {title ? <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text> : null}
                    {items.map((item, index) => (
                        <React.Fragment key={item.key}>
                            {index > 0 && (
                                <View testID="action-sheet-divider" style={[styles.divider, { backgroundColor: colors.border }]} />
                            )}
                            {item.onPress ? (
                                <PressableOpacity
                                    style={styles.row}
                                    activeOpacity={0.6}
                                    accessibilityLabel={item.label}
                                    onPress={() => {
                                        onClose();
                                        item.onPress?.();
                                    }}
                                >
                                    <View style={[styles.iconTile, { backgroundColor: item.iconBg }]}>{item.icon}</View>
                                    <Text style={[styles.label, { color: colors.textPrimary }]}>{item.label}</Text>
                                </PressableOpacity>
                            ) : (
                                <View style={styles.row} accessibilityLabel={item.label}>
                                    <View style={[styles.iconTile, { backgroundColor: item.iconBg }]}>{item.icon}</View>
                                    <Text style={[styles.label, { color: colors.textPrimary }]}>{item.label}</Text>
                                </View>
                            )}
                        </React.Fragment>
                    ))}
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10 },
    handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
    title: { fontSize: 16, fontWeight: '800', paddingHorizontal: 20, marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 56, paddingHorizontal: 20 },
    iconTile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 16, fontWeight: '600' },
    divider: { height: StyleSheet.hairlineWidth, marginLeft: 70 },
});
