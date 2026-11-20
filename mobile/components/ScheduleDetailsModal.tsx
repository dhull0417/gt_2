import React from 'react';
import { Modal, View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useAppearance, useThemeColors } from '@/contexts/AppearanceContext';
import type { GroupDetails } from '@/utils/api';
import { tzAbbr } from '@/utils/timezones';
import { formatTimeRange } from '@/utils/timeString';
import { FREQ_LABELS } from '@/utils/scheduleConstants';
import { isLongFrequency, repeatChoiceLabels } from '@/utils/longInterval';

interface Props {
    visible: boolean;
    onClose: () => void;
    groupDetails: GroupDetails;
    /** Owner or moderator: show Edit / notifications on each schedule and Add Schedule. */
    canManage?: boolean;
    onEditSchedule?: (scheduleId: string) => void;
    onScheduleNotifications?: (scheduleId: string) => void;
    onAddSchedule?: () => void;
}

// Same cap as the server and the old Settings list.
export const MAX_ACTIVE_SCHEDULES = 5;

const daysOfWeekFull = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The group's schedules (routines, location, capacity, RSVP window), opened from the Schedule tile
// on Group Details. Owners and moderators also edit, add and set notifications for schedules here
// (moved out of Group Settings, 2026-11-19).
export const ScheduleDetailsModal = ({
    visible, onClose, groupDetails, canManage = false, onEditSchedule, onScheduleNotifications, onAddSchedule,
}: Props) => {
    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const isDark = scheme === 'dark';

    const chipBlue = { backgroundColor: isDark ? '#1A2A42' : '#EEF6FF', borderColor: isDark ? '#2C4870' : '#BFDBFE' };
    const chipGreen = { backgroundColor: isDark ? '#132A1E' : '#F0FDF4', borderColor: isDark ? '#1F4A34' : '#BBF7D0' };
    const chipPurple = { backgroundColor: isDark ? '#241B3D' : '#F5F3FF', borderColor: isDark ? '#3B2E63' : '#DDD6FE' };
    const chipAmber = { backgroundColor: isDark ? '#3A2E12' : '#FFFBEB', borderColor: isDark ? '#5C4A1E' : '#FDE68A' };

    // `rules` is the specific routine's own ordinal rules — must be indexed by
    // this dayTime's position, not always rules[0], since dayTimes/rules are
    // parallel arrays for ordinal routines (dayTimes[1] pairs with rules[1], etc).
    const renderScheduleLines = (frequency: string, dayTimes: any[], rules?: any[], repeatBy?: 'date' | 'weekday') => {
        const groupTimezoneAbbr = tzAbbr(groupDetails.timezone);
        const timeEntries = dayTimes && dayTimes.length > 0 ? dayTimes : [{ time: "Time TBD" }];

        if (frequency === 'daily') {
            return daysOfWeekFull.map((dayName, dayIdx) => {
                let matches = timeEntries.filter(dt => dt.day === dayIdx);
                if (matches.length === 0) {
                    matches = timeEntries.filter(dt => dt.day === undefined || dt.day === null);
                }

                return matches.map((mt, mtIdx) => (
                    <Text key={`daily-${dayIdx}-${mtIdx}`} style={[styles.scheduleDetailText, { color: colors.textSecondary }]}>
                        • {dayName} @ {formatTimeRange(mt.time, mt.endTime)} {groupTimezoneAbbr}
                    </Text>
                ));
            });
        }

        return timeEntries.map((dt, dtIdx) => {
            let dayLabel = "";
            const longLabels = isLongFrequency(frequency) ? repeatChoiceLabels(frequency, dt.startDate ?? null) : null;
            if (longLabels) {
                const what = repeatBy === 'weekday' ? longLabels.weekday : longLabels.date;
                dayLabel = what.charAt(0).toUpperCase() + what.slice(1);
            } else if (frequency === 'ordinal' && rules?.[dtIdx]) {
                const ruleDay = rules[dtIdx].day;
                const dayName = typeof ruleDay === 'number' ? daysOfWeekFull[ruleDay] : "";
                dayLabel = `${rules[dtIdx].occurrence} ${dayName}`;
            } else if (typeof dt.date === 'number') {
                const d = dt.date;
                const sfx = d === 1 || d === 21 || d === 31 ? 'st' :
                            d === 2 || d === 22 ? 'nd' :
                            d === 3 || d === 23 ? 'rd' : 'th';
                dayLabel = `The ${d}${sfx}`;
            } else if (typeof dt.day === 'number') {
                dayLabel = daysOfWeekFull[dt.day];
            } else {
                dayLabel = "Meetup";
            }

            return (
                <Text key={dtIdx} style={[styles.scheduleDetailText, { color: colors.textSecondary }]}>
                    • {dayLabel} @ {formatTimeRange(dt.time, dt.endTime)} {groupTimezoneAbbr}
                </Text>
            );
        });
    };

    const activeSchedules = (groupDetails.schedules ?? []).filter(sch => sch.active !== false);

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.backgroundAlt }} edges={['top', 'bottom', 'left', 'right']}>
                <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Meetup Details</Text>
                    <PressableOpacity accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                        <Feather name="x" size={24} color={colors.textSecondary} />
                    </PressableOpacity>
                </View>
                <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
                    {activeSchedules.length === 0 ? (
                        <View style={[styles.card, { backgroundColor: colors.surface }]}>
                            <View style={[styles.infoRow, { marginBottom: 0 }]}>
                                <View style={[styles.iconWrap, chipBlue]}>
                                    <Feather name="calendar" size={16} color={colors.brand} />
                                </View>
                                <Text style={[styles.infoText, { color: colors.textSecondary }]}>No schedule defined</Text>
                            </View>
                        </View>
                    ) : activeSchedules.map((sch) => (
                        <View key={sch._id} style={[styles.card, { backgroundColor: colors.surface }]}>
                            <View style={styles.scheduleHeader}>
                                <Text style={[styles.scheduleNameLabel, { color: colors.textPrimary, marginBottom: 0, flex: 1 }]}>{sch.name}</Text>
                                {canManage && (
                                    <View style={styles.manageButtons}>
                                        <PressableOpacity
                                            accessibilityLabel={`Notifications for ${sch.name}`}
                                            onPress={() => onScheduleNotifications?.(sch._id)}
                                            hitSlop={6}
                                            style={[styles.iconBtn, chipAmber]}
                                        >
                                            <Feather name="bell" size={16} color="#D97706" />
                                        </PressableOpacity>
                                        <PressableOpacity
                                            accessibilityLabel={`Edit ${sch.name}`}
                                            onPress={() => onEditSchedule?.(sch._id)}
                                            hitSlop={6}
                                            style={[styles.editBtn, { backgroundColor: colors.brand }]}
                                        >
                                            <Feather name="edit-2" size={14} color="#fff" />
                                            <Text style={styles.editBtnText}>Edit</Text>
                                        </PressableOpacity>
                                    </View>
                                )}
                            </View>

                            {/* Routines */}
                            <View style={styles.infoRowTop}>
                                <View style={[styles.iconWrap, chipBlue]}>
                                    <Feather name="calendar" size={16} color={colors.brand} />
                                </View>
                                <View style={styles.scheduleContent}>
                                    {(sch.routines ?? []).map((routine, rIdx) => (
                                        <View key={rIdx} style={styles.routineBlock}>
                                            <Text style={[styles.frequencyLabel, { color: colors.brand }]}>
                                                {routine.frequency === 'biweekly' ? 'Every 2 Weeks' : isLongFrequency(routine.frequency) ? FREQ_LABELS[routine.frequency] : routine.frequency.charAt(0).toUpperCase() + routine.frequency.slice(1)}
                                            </Text>
                                            {renderScheduleLines(routine.frequency, routine.dayTimes, routine.rules, routine.repeatBy)}
                                        </View>
                                    ))}
                                </View>
                            </View>

                            {/* Location */}
                            <View style={styles.infoRow}>
                                <View style={[styles.iconWrap, chipGreen]}>
                                    <Feather name="map-pin" size={16} color="#16A34A" />
                                </View>
                                <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                                    {sch.defaultLocation || "No location set"}
                                </Text>
                            </View>

                            {/* Capacity */}
                            <View style={styles.infoRow}>
                                <View style={[styles.iconWrap, chipPurple]}>
                                    <Feather name="users" size={16} color="#7C3AED" />
                                </View>
                                <Text style={[styles.infoText, { color: colors.textSecondary }]}>{sch.defaultCapacity === 0 ? "Unlimited Attendees" : sch.defaultCapacity}</Text>
                            </View>

                            {/* RSVP window */}
                            <View style={[styles.infoRow, { marginBottom: 0 }]}>
                                <View style={[styles.iconWrap, chipAmber]}>
                                    <Feather name="bell" size={16} color="#D97706" />
                                </View>
                                <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                                    {sch.generationLeadDays == null && sch.generationDeadlineDays == null
                                        ? "RSVPs open anytime"
                                        : [
                                            sch.generationLeadDays != null
                                                ? `Opens ${sch.generationLeadDays} day${sch.generationLeadDays !== 1 ? 's' : ''} before @ ${sch.generationLeadTime}`
                                                : null,
                                            sch.generationDeadlineDays != null
                                                ? `Deadline ${sch.generationDeadlineDays} day${sch.generationDeadlineDays !== 1 ? 's' : ''} before @ ${sch.generationDeadlineTime}`
                                                : null,
                                        ].filter(Boolean).join(' · ')}
                                </Text>
                            </View>
                        </View>
                    ))}

                    {canManage && activeSchedules.length < MAX_ACTIVE_SCHEDULES && (
                        <PressableOpacity
                            onPress={() => onAddSchedule?.()}
                            activeOpacity={0.75}
                            style={[styles.addBtn, { borderColor: colors.brand }]}
                        >
                            <Feather name="plus" size={18} color={colors.brand} />
                            <Text style={[styles.addBtnText, { color: colors.brand }]}>Add Schedule</Text>
                        </PressableOpacity>
                    )}
                </ScrollView>
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
    headerTitle: { fontSize: 18, fontWeight: '900' },
    closeBtn: { padding: 4 },
    card: { padding: 16, borderRadius: 20, borderCurve: 'continuous', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 14 },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    infoRowTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
    infoText: { marginLeft: 12, fontSize: 16, fontWeight: '600', flex: 1 },
    scheduleNameLabel: { fontSize: 15, fontWeight: '900', marginBottom: 10 },
    scheduleContent: { marginLeft: 12, flex: 1 },
    routineBlock: { marginBottom: 8 },
    frequencyLabel: { fontSize: 14, fontWeight: '800', marginBottom: 4, textTransform: 'capitalize' },
    scheduleDetailText: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
    scheduleHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
    manageButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 10 },
    editBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', marginTop: 2 },
    addBtnText: { fontSize: 15, fontWeight: '800' },
    iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});

export default ScheduleDetailsModal;
