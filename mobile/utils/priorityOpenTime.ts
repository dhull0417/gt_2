// Where the Priority RSVP screen's "RSVPs open" card starts. The series edit screen passes its
// unsaved RSVP rules as route params so the card matches what the organizer just picked; otherwise
// it's the saved series, or 1 day before at 9:00 AM when the series has no open time yet.
// Route params are strings; an empty deadline param means "no deadline". No React in here.
import type { RsvpRulesValue } from "./rsvpRules";

export interface SavedRsvpRules {
    generationLeadDays?: number | null;
    generationLeadTime?: string;
    generationDeadlineDays?: number | null;
    generationDeadlineTime?: string;
}

// A type (not an interface) so it satisfies expo-router's route-params constraint.
export type RsvpRulesParams = {
    leadDays?: string;
    leadTime?: string;
    deadlineDays?: string;
    deadlineTime?: string;
};

export const DEFAULT_OPEN_DAYS = 1;
export const DEFAULT_OPEN_TIME = "09:00 AM";

const dayCount = (v?: string): number | null => (v !== undefined && /^\d+$/.test(v) ? parseInt(v, 10) : null);

export const priorityOpenStart = (saved: SavedRsvpRules, params: RsvpRulesParams): RsvpRulesValue => {
    const paramLead = dayCount(params.leadDays);
    const useParams = paramLead !== null && !!params.leadTime;
    const leadDays = useParams ? paramLead! : saved.generationLeadDays ?? DEFAULT_OPEN_DAYS;
    const leadTime = useParams ? params.leadTime! : saved.generationLeadDays != null ? saved.generationLeadTime || DEFAULT_OPEN_TIME : DEFAULT_OPEN_TIME;

    const deadlineDays = useParams ? dayCount(params.deadlineDays) : saved.generationDeadlineDays ?? null;
    const deadlineTime = (useParams ? params.deadlineTime : saved.generationDeadlineTime) || "09:00 AM";

    return {
        rsvpRestricted: true,
        leadEnabled: true,
        leadDays,
        leadTime,
        deadlineEnabled: deadlineDays !== null,
        deadlineDays: deadlineDays ?? 0,
        deadlineTime,
        minAttendeesInput: "",
    };
};
