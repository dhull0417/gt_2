import { useMemo } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { InlineCalendar } from "@/components/create-group/InlineCalendar";
import { makeStyles } from "@/components/create-group/styles";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { useThemeColors } from "@/contexts/AppearanceContext";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

// Biweekly "Start Date" as a focused overlay instead of an inline calendar expanding the page

export const CalendarPickerModal = ({ visible, value, minDate, maxDate, onChange, onCancel }: {
    visible: boolean; value: string; minDate?: string; maxDate?: string; onChange: (iso: string) => void; onCancel: () => void;
}) => {
    const colors = useThemeColors();
    const s = useMemo(() => makeStyles(colors), [colors]);
    return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={s.dayPickerPopupWrap}>
            <View style={s.calendarPopupCard}>
                <View style={s.dayPickerPopupHeader}>
                    <Text style={s.dayPickerPopupTitle}>Start Date</Text>
                    <PressableOpacity onPress={onCancel} style={{ padding: 4 }} activeOpacity={0.7}>
                        <Feather name="x" size={20} color={colors.textFaint} />
                    </PressableOpacity>
                </View>
                <View style={{ padding: 8 }}>
                    {visible && <InlineCalendar value={value} onChange={onChange} minDate={minDate} maxDate={maxDate} bare large />}
                </View>
            </View>
        </View>
    </Modal>
    );
};
