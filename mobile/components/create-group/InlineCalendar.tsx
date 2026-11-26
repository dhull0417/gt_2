import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { makeCalStyles } from "@/components/create-group/styles";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { useThemeColors } from "@/contexts/AppearanceContext";
import { Feather } from "@expo/vector-icons";
import { DateTime } from "luxon";

export const InlineCalendar = ({ value, onChange, minDate, maxDate, bare, large }: {
    value: string; onChange: (iso: string) => void; minDate?: string; maxDate?: string; bare?: boolean; large?: boolean;
}) => {
    const colors = useThemeColors();
    const cal = useMemo(() => makeCalStyles(colors), [colors]);
    const [month, setMonth] = useState(
        value ? DateTime.fromISO(value).startOf("month") : DateTime.now().startOf("month")
    );
    // Chunked into 7-cell rows explicitly — flex-wrap leaves Yoga reserving a phantom
    // blank trailing row whenever the day count isn't a multiple of 7.
    const weeks = useMemo(() => {
        const start = month.startOf("month");
        const firstDow = start.weekday === 7 ? 0 : start.weekday;
        const cells: (DateTime | null)[] = [];
        for (let i = 0; i < firstDow; i++) cells.push(null);
        for (let d = 1; d <= month.daysInMonth!; d++) cells.push(month.set({ day: d }));
        while (cells.length % 7 !== 0) cells.push(null);
        const chunks: (DateTime | null)[][] = [];
        for (let i = 0; i < cells.length; i += 7) chunks.push(cells.slice(i, i + 7));
        return chunks;
    }, [month]);
    const minDT = minDate ? DateTime.fromISO(minDate) : DateTime.now().startOf("day");
    const maxDT = maxDate ? DateTime.fromISO(maxDate) : null;
    const canGoNext = !maxDT || month.plus({ months: 1 }).startOf("month") <= maxDT.startOf("month");
    return (
        <View style={bare ? cal.containerBare : cal.container}>
            <View style={[cal.nav, large && cal.navLarge]}>
                <PressableOpacity onPress={() => setMonth(m => m.minus({ months: 1 }))} style={[cal.navBtn, large && cal.navBtnLarge]}>
                    <Feather name="chevron-left" size={large ? 22 : 18} color={colors.brand} />
                </PressableOpacity>
                <Text style={[cal.monthLabel, large && cal.monthLabelLarge]}>{month.toFormat("MMMM yyyy")}</Text>
                <PressableOpacity
                    onPress={() => canGoNext && setMonth(m => m.plus({ months: 1 }))}
                    disabled={!canGoNext}
                    style={[cal.navBtn, large && cal.navBtnLarge, !canGoNext && cal.navBtnDisabled]}
                >
                    <Feather name="chevron-right" size={large ? 22 : 18} color={canGoNext ? colors.brand : colors.textFaint} />
                </PressableOpacity>
            </View>
            <View style={[cal.weekRow, large && cal.weekRowLarge]}>
                {["S","M","T","W","T","F","S"].map((d, i) => (
                    <Text key={i} style={[cal.dayHeader, large && cal.dayHeaderLarge]}>{d}</Text>
                ))}
            </View>
            {weeks.map((week, wi) => (
                <View key={wi} style={cal.weekRow}>
                    {week.map((day, i) => {
                        if (!day) return <View key={`e-${wi}-${i}`} style={[cal.cell, large && cal.cellLarge]} />;
                        const iso = day.toISODate()!;
                        const selected = iso === value;
                        const disabled = day < minDT || (maxDT != null && day > maxDT);
                        return (
                            <PressableOpacity
                                key={iso}
                                style={[cal.cell, large && cal.cellLarge, selected && cal.cellSelected, disabled && cal.cellDisabled]}
                                onPress={() => !disabled && onChange(iso)}
                                disabled={disabled}
                            >
                                <Text style={[cal.cellText, large && cal.cellTextLarge, selected && cal.cellTextSelected, disabled && cal.cellTextDisabled]}>
                                    {day.day}
                                </Text>
                            </PressableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>
    );
};
