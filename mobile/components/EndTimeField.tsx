import React from 'react';
import { StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import NativeTimePicker from '@/components/NativeTimePicker';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { addHour, endTimeError } from '@/utils/timeString';

export const END_TIME_LABEL = 'End Time (Opt.)';

interface EndTimeFieldProps {
    /** The start time this end belongs to ("05:00 PM"). */
    startTime: string;
    endTime: string | null | undefined;
    onChange: (endTime: string | null) => void;
    /** Whether the picker is showing (the caller owns this flag, like its start-time picker). */
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /**
     * false when the caller renders the picker itself (e.g. inside a Modal, where the
     * overlay picker must be a sibling of the KeyboardAvoidingView). Default true.
     */
    renderPicker?: boolean;
    style?: StyleProp<ViewStyle>;
    /** The screen's own label / field / value styles so the field matches its start-time field. */
    labelStyle?: StyleProp<TextStyle>;
    fieldStyle?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
}

/**
 * Optional meetup end time, always shown under a start-time field. Shows "None" until set,
 * and an ✕ to clear it once set. An end earlier than the start means the next day.
 */
const EndTimeField: React.FC<EndTimeFieldProps> = ({
    startTime, endTime, onChange, open, onOpenChange, renderPicker = true, style, labelStyle, fieldStyle, textStyle,
}) => {
    const colors = useThemeColors();
    const error = endTimeError(startTime, endTime);

    return (
        <View style={style}>
            <Text style={labelStyle ?? { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 6 }}>{END_TIME_LABEL}</Text>
            <PressableOpacity
                style={fieldStyle}
                onPress={() => onOpenChange(!open)}
                accessibilityLabel={endTime ? `End time ${endTime}` : 'Add end time'}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                    <Text style={[textStyle, !endTime && { color: colors.textFaint, fontWeight: '500' }]}>{endTime || 'None'}</Text>
                    {endTime ? (
                        <PressableOpacity
                            onPress={() => { onChange(null); onOpenChange(false); }}
                            hitSlop={10}
                            style={{ marginLeft: 'auto' }}
                            accessibilityLabel="Clear end time"
                        >
                            <Feather name="x" size={16} color={colors.textFaint} />
                        </PressableOpacity>
                    ) : (
                        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} style={{ marginLeft: 'auto' }} />
                    )}
                </View>
            </PressableOpacity>
            {!!error && <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text>}
            {renderPicker && open && (
                <NativeTimePicker
                    value={endTime || addHour(startTime)}
                    onChange={(t) => onChange(t)}
                    onClose={() => onOpenChange(false)}
                />
            )}
        </View>
    );
};

export default EndTimeField;
