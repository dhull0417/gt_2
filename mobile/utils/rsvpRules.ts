// The "Earliest / Latest time to RSVP" rules shared by the schedule screens and the meetup form:
// each change returns the fields to update, keeping Earliest at or before Latest. No React in here.
import { timeToMinutes } from "./scheduleConstants";

export interface RsvpRulesValue {
    rsvpRestricted: boolean;
    leadEnabled: boolean;
    leadDays: number;
    leadTime: string;
    deadlineEnabled: boolean;
    deadlineDays: number;
    deadlineTime: string;
    minAttendeesInput: string;
}

export type RsvpRulesPatch = Partial<RsvpRulesValue>;
export interface RsvpTimeResult { patch: RsvpRulesPatch; alert?: { title: string; message: string } }

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export const toggleLead = (d: RsvpRulesValue, on: boolean): RsvpRulesPatch => {
    const leadDays = on && d.deadlineEnabled && d.leadDays < d.deadlineDays ? d.deadlineDays : d.leadDays;
    const sameDayViolation = on && d.deadlineEnabled && leadDays === d.deadlineDays && timeToMinutes(d.leadTime) > timeToMinutes(d.deadlineTime);
    return { leadEnabled: on, leadDays, ...(sameDayViolation ? { leadTime: d.deadlineTime } : {}) };
};

export const toggleDeadline = (d: RsvpRulesValue, on: boolean): RsvpRulesPatch => {
    const deadlineDays = on && d.leadEnabled && d.deadlineDays > d.leadDays ? d.leadDays : d.deadlineDays;
    const sameDayViolation = on && d.leadEnabled && deadlineDays === d.leadDays && timeToMinutes(d.deadlineTime) < timeToMinutes(d.leadTime);
    return { deadlineEnabled: on, deadlineDays, ...(sameDayViolation ? { deadlineTime: d.leadTime } : {}) };
};

export const stepLead = (d: RsvpRulesValue, by: 1 | -1): RsvpRulesPatch => {
    if (by > 0) return { leadDays: d.leadDays + 1 };
    const leadDays = Math.max(d.deadlineEnabled ? d.deadlineDays : 0, d.leadDays - 1);
    const sameDayViolation = d.deadlineEnabled && leadDays === d.deadlineDays && timeToMinutes(d.leadTime) > timeToMinutes(d.deadlineTime);
    return { leadDays, ...(sameDayViolation ? { leadTime: d.deadlineTime } : {}) };
};

export const stepDeadline = (d: RsvpRulesValue, by: 1 | -1): RsvpRulesPatch => {
    if (by < 0) return { deadlineDays: Math.max(0, d.deadlineDays - 1) };
    const deadlineDays = d.leadEnabled ? Math.min(d.leadDays, d.deadlineDays + 1) : d.deadlineDays + 1;
    const sameDayViolation = d.leadEnabled && deadlineDays === d.leadDays && timeToMinutes(d.deadlineTime) < timeToMinutes(d.leadTime);
    return { deadlineDays, ...(sameDayViolation ? { deadlineTime: d.leadTime } : {}) };
};

export const setLeadTime = (d: RsvpRulesValue, t: string): RsvpTimeResult => {
    const capped = d.deadlineEnabled && d.leadDays === d.deadlineDays && timeToMinutes(t) > timeToMinutes(d.deadlineTime);
    if (!capped) return { patch: { leadTime: t } };
    return {
        patch: { leadTime: d.deadlineTime },
        alert: {
            title: "Earliest RSVP time must be before the latest RSVP time",
            message: `• Both are ${days(d.leadDays)} before the meetup\n• Earliest time can't be later than ${d.deadlineTime}\n• Earliest time set to ${d.deadlineTime}`,
        },
    };
};

export const setDeadlineTime = (d: RsvpRulesValue, t: string): RsvpTimeResult => {
    const capped = d.leadEnabled && d.deadlineDays === d.leadDays && timeToMinutes(t) < timeToMinutes(d.leadTime);
    if (!capped) return { patch: { deadlineTime: t } };
    return {
        patch: { deadlineTime: d.leadTime },
        alert: {
            title: "Latest RSVP time must be after the earliest RSVP time",
            message: `• Both are ${days(d.deadlineDays)} before the meetup\n• Latest time can't be earlier than ${d.leadTime}\n• Latest time set to ${d.leadTime}`,
        },
    };
};
