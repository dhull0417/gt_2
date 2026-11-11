// Shared "first date + repeat by" section for Quarterly / Semi-annually / Yearly schedules.
// Used by Create Group (main picker and Multiple Rules) and Edit Schedule.
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { DateTime } from "luxon";
import EndTimeField from "@/components/EndTimeField";
import NativeTimePicker from "@/components/NativeTimePicker";
import { CalendarPickerModal } from "@/components/create-group/CalendarPickerModal";
import { makeStyles } from "@/components/create-group/styles";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { useThemeColors } from "@/contexts/AppearanceContext";
import { FREQ_LABELS } from "@/utils/scheduleConstants";
import { repeatChoiceLabels, type LongDraft, type LongFrequency, type RepeatBy } from "@/utils/longInterval";

export const LongIntervalOptions = ({ frequency, value, onChange }: {
    frequency: LongFrequency;
    value: LongDraft;
    onChange: (patch: Partial<LongDraft>) => void;
}) => {
    const colors = useThemeColors();
    const s = useMemo(() => makeStyles(colors), [colors]);
    const [showCalendar, setShowCalendar] = useState(false);
    const [showTime, setShowTime] = useState(false);
    const [showEnd, setShowEnd] = useState(false);
    const today = DateTime.now().toISODate()!;
    const labels = repeatChoiceLabels(frequency, value.longFirstDate);
    const every = frequency === "quarterly" ? "every 3 months" : frequency === "semiannual" ? "every 6 months" : "every year";

    const choice = (mode: RepeatBy, icon: "hash" | "repeat", title: string, example: string) => {
        const active = value.longRepeatBy === mode;
        const disabled = !labels;
        return (
            <PressableOpacity key={mode} disabled={disabled}
                style={[s.monthlyModeCard, active && s.monthlyModeCardActive, disabled && { opacity: 0.5 }]}
                onPress={() => onChange({ longRepeatBy: mode })}
                accessibilityRole="radio" accessibilityState={{ checked: active, disabled }}>
                <View style={[s.monthlyModeRadio, active && s.monthlyModeRadioActive]}>
                    {active && <View style={s.monthlyModeRadioDot} />}
                </View>
                <View style={[s.monthlyModeIcon, active && s.monthlyModeIconActive]}>
                    <Feather name={icon} size={16} color={active ? "#fff" : colors.textFaint} />
                </View>
                <View style={s.monthlyModeCopy}>
                    <Text style={[s.monthlyModeTitle, active && s.monthlyModeTitleActive]}>{title}</Text>
                    <Text style={s.monthlyModeExample}>{example}</Text>
                </View>
            </PressableOpacity>
        );
    };

    return (
        <View style={s.expandBox}>
            <Text style={s.expandBoxTitle}>{FREQ_LABELS[frequency]} Options</Text>

            <Text style={s.fieldLabel}>First date</Text>
            <PressableOpacity style={s.dateFieldRow} onPress={() => setShowCalendar(true)}>
                <Feather name="calendar" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                <Text style={value.longFirstDate ? s.dateFieldText : s.dayPickerPlaceholder}>
                    {value.longFirstDate ? DateTime.fromISO(value.longFirstDate).toLocaleString(DateTime.DATE_FULL) : "Pick the first date"}
                </Text>
                <Feather name="chevron-down" size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
            </PressableOpacity>
            <CalendarPickerModal title="First Date" visible={showCalendar}
                value={value.longFirstDate ?? today} minDate={today}
                onChange={iso => { setShowCalendar(false); onChange({ longFirstDate: iso }); }}
                onCancel={() => setShowCalendar(false)} />

            <Text style={s.fieldLabel}>Time</Text>
            <PressableOpacity style={s.dateFieldRow} onPress={() => { setShowEnd(false); setShowTime(!showTime); }}>
                <Feather name="clock" size={16} color={colors.textFaint} style={{ marginRight: 10 }} />
                <Text style={s.dateFieldText}>{value.longTime}</Text>
                <Feather name={showTime ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
            </PressableOpacity>
            {showTime && (
                <NativeTimePicker value={value.longTime}
                    onChange={t => onChange({ longTime: t })}
                    onClose={() => setShowTime(false)} />
            )}
            <EndTimeField startTime={value.longTime} endTime={value.longEndTime}
                onChange={t => onChange({ longEndTime: t })}
                open={showEnd} onOpenChange={o => { setShowTime(false); setShowEnd(o); }}
                labelStyle={s.fieldLabel} fieldStyle={s.dateFieldRow} textStyle={s.dateFieldText} />

            <Text style={s.fieldLabel}>Repeat {every} on</Text>
            <View style={s.monthlyModeList}>
                {choice("date", "hash", "Same date", labels ? labels.date : "Pick a first date")}
                {choice("weekday", "repeat", "Same weekday", labels ? labels.weekday : "Pick a first date")}
            </View>
        </View>
    );
};
