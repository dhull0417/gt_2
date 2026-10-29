import { useMemo } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { GroupAvatar } from "@/components/GroupAvatar";
import { StepDots } from "@/components/create-group/StepDots";
import { makeStyles } from "@/components/create-group/styles";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { useThemeColors } from "@/contexts/AppearanceContext";
import { ScheduleData, UserStub } from "@/utils/createGroupDraft";
import { getUserDisplayName } from "@/utils/groupDisplay";
import { DAYS_OF_WEEK, FREQ_LABELS, ordSfx } from "@/utils/scheduleConstants";
import { timezoneLabel } from "@/utils/timezones";
import { Feather } from "@expo/vector-icons";
import { DateTime } from "luxon";

export const ReviewScreen = ({ groupName, groupImage, members, schedules, timezone, onConfirm, onBack, isPending }: {
    groupName: string; groupImage?: string; members: UserStub[]; schedules: ScheduleData[]; timezone: string;
    onConfirm: () => void; onBack: () => void; isPending: boolean;
}) => {
    const colors = useThemeColors();
    const s = useMemo(() => makeStyles(colors), [colors]);
    return (
        <View style={s.screen}>
            <View style={s.screenHeader}>
                <PressableOpacity onPress={onBack} style={s.iconBtn}>
                    <Feather name="arrow-left" size={24} color={colors.textMuted} />
                </PressableOpacity>
                <StepDots total={4} current={2} />
                <View style={{ width: 36 }} />
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <Text style={s.screenTitle}>Review</Text>
                <Text style={s.screenSub}>Confirm before creating your group</Text>

                {/* Hero */}
                <View style={s.reviewHero}>
                    <GroupAvatar name={groupName || "?"} imageUrl={groupImage} size={88} borderRadius={22} />
                    <Text style={s.reviewHeroName} numberOfLines={2}>{groupName || "Untitled group"}</Text>
                </View>

                {/* Schedule(s) */}
                <View style={s.reviewSectionHeaderRow}>
                    <View style={[s.reviewIconChip, s.reviewIconChipAmber]}>
                        <Feather name="calendar" size={15} color={colors.warning} />
                    </View>
                    <Text style={s.reviewSectionTitle}>Series</Text>
                </View>

                {schedules.length === 0 ? (
                    <View style={s.reviewEmptyCard}>
                        <Feather name="calendar" size={18} color={colors.textFaint} />
                        <Text style={s.reviewMuted}>No series set — you can add one later</Text>
                    </View>
                ) : (
                    <>
                        <View style={s.reviewInlineRow}>
                            <Feather name="globe" size={13} color={colors.textFaint} />
                            <Text style={s.reviewInlineText}>{timezoneLabel(timezone)}</Text>
                        </View>
                        {schedules.map((schedule, idx) => {
                            const maxAttendeesLabel = schedule.maxAttendeesMode === "limited" && schedule.maxAttendeesInput
                                ? schedule.maxAttendeesInput
                                : "Unlimited";
                            return (
                                <View key={idx} style={[s.reviewScheduleCard, { marginTop: 10 }]}>
                                    <Text style={s.reviewScheduleName}>{schedule.name.trim() || groupName}</Text>
                                    <Text style={s.reviewScheduleFreq}>{FREQ_LABELS[schedule.frequency!] || schedule.frequency}</Text>

                                    <View style={{ marginTop: 10, gap: 7 }}>
                                        {schedule.location ? (
                                            <View style={s.reviewInlineRow}>
                                                <Feather name="map-pin" size={13} color={colors.textFaint} />
                                                <Text style={s.reviewInlineText}>{schedule.location}</Text>
                                            </View>
                                        ) : null}
                                        {schedule.frequency !== "biweekly" && (
                                            <View style={s.reviewInlineRow}>
                                                <Feather name="clock" size={13} color={colors.textFaint} />
                                                <Text style={s.reviewInlineText}>Starts {DateTime.fromISO(schedule.startDate).toLocaleString(DateTime.DATE_MED)}</Text>
                                            </View>
                                        )}
                                        <View style={s.reviewInlineRow}>
                                            <Feather name="users" size={13} color={colors.textFaint} />
                                            <Text style={s.reviewInlineText}>Max attendees: {maxAttendeesLabel}</Text>
                                        </View>
                                        {!schedule.rsvpRestricted || (!schedule.leadEnabled && !schedule.deadlineEnabled) ? (
                                            <View style={s.reviewInlineRow}>
                                                <Feather name="bell" size={13} color={colors.textFaint} />
                                                <Text style={s.reviewInlineText}>RSVPs open anytime</Text>
                                            </View>
                                        ) : (
                                            <>
                                                {schedule.leadEnabled && (
                                                    <View style={s.reviewInlineRow}>
                                                        <Feather name="unlock" size={13} color={colors.textFaint} />
                                                        <Text style={s.reviewInlineText}>Earliest time to RSVP: {schedule.leadDays} days before at {schedule.leadTime}</Text>
                                                    </View>
                                                )}
                                                {schedule.deadlineEnabled && (
                                                    <View style={s.reviewInlineRow}>
                                                        <Feather name="lock" size={13} color={colors.textFaint} />
                                                        <Text style={s.reviewInlineText}>Latest time to RSVP: {schedule.deadlineDays} days before at {schedule.deadlineTime}</Text>
                                                    </View>
                                                )}
                                            </>
                                        )}
                                    </View>

                                    <View style={s.reviewDetailSeparator} />

                                    <View style={{ gap: 4 }}>
                                        {schedule.frequency === "daily" && (schedule.dailySameTime
                                            ? <Text style={s.reviewMutedBullet}>Every day @ {schedule.dailySharedTime}</Text>
                                            : schedule.dailyRows.map(r => <Text key={r.id} style={s.reviewMutedBullet}>• {DAYS_OF_WEEK.find(dw => dw.value === r.day)?.label} @ {r.time}</Text>)
                                        )}
                                        {(schedule.frequency === "weekly" || schedule.frequency === "biweekly") && schedule.weekdayRows.filter(r => r.day !== null).map(r => (
                                            <Text key={r.id} style={s.reviewMutedBullet}>
                                                • {DAYS_OF_WEEK.find(dw => dw.value === r.day)?.label} @ {r.time}
                                                {schedule.frequency === "biweekly" && r.startDate ? ` (from ${DateTime.fromISO(r.startDate).toLocaleString(DateTime.DATE_MED)})` : ""}
                                            </Text>
                                        ))}
                                        {schedule.frequency === "monthly" && schedule.monthlyMode === "date" && schedule.monthlyDates.map(e => (
                                            <Text key={e.id} style={s.reviewMutedBullet}>• {e.date}{ordSfx(e.date)} of month @ {e.time}</Text>
                                        ))}
                                        {schedule.frequency === "monthly" && schedule.monthlyMode === "ordinal" && schedule.ordinalEntries.map(e => (
                                            <Text key={e.id} style={s.reviewMutedBullet}>• {e.occurrence} {DAYS_OF_WEEK.find(dw => dw.value === e.day)?.label} @ {e.time}</Text>
                                        ))}
                                        {schedule.frequency === "custom" && (
                                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                                                {schedule.builtRoutines.map(r => (
                                                    <View key={r.id} style={s.reviewRoutineChip}>
                                                        <Text style={s.reviewRoutineChipText}>{r.label}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                </View>
                            );
                        })}
                    </>
                )}

                {/* Members */}
                <View style={[s.detailsCard, { marginTop: 10, marginBottom: 0 }]}>
                    <View style={s.detailItem}>
                        <Text style={s.detailLabel}>Members</Text>
                        <Text style={s.detailValue}>
                            {members.length === 0
                                ? "Just you — invite friends after creating"
                                : members.map(m => getUserDisplayName(m)).join(', ')}
                        </Text>
                    </View>
                </View>
            </ScrollView>
            <View style={s.screenFooter}>
                <View style={{ flex: 1 }} />
                <PressableOpacity style={s.primaryBtn} onPress={onConfirm} disabled={isPending}>
                    {isPending
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <><Text style={s.primaryBtnText}>Create Group</Text><Feather name="check" size={18} color="#fff" style={{ marginLeft: 6 }} /></>
                    }
                </PressableOpacity>
            </View>
        </View>
    );
};
