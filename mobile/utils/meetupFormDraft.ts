// Pure data/logic behind the meetup form (Add Meetup and Edit Meetup): the editable draft, how it's
// filled from a group or a meetup, its validation, and the API payloads. No React in here.
import { DateTime } from "luxon";
import type { Group, Meetup, MeetupSettingsPayload } from "./api";
import { getMaxAttendeesError } from "./scheduleConstants";
import { endTimeError } from "./timeString";
import { getBringItemsError, getMinAttendeesError, newBringItemKey, type BringItemDraft } from "./editScheduleDraft";
import { deviceTimeZone } from "./timezones";
import { meetupIssues } from "./formIssues";
import type { QuestionDraft } from "./questionDrafts";

export interface MeetupDraft {
    /** Calendar day in the meetup's timezone, "YYYY-MM-DD". */
    date: string;
    time: string;
    endTime: string | null;
    timezone: string;
    location: string;
    description: string;
    maxAttendeesMode: "unlimited" | "limited";
    maxAttendeesInput: string;
    // RSVP Rules (same names as the schedule screens use)
    rsvpRestricted: boolean;
    leadEnabled: boolean;
    leadDays: number;
    leadTime: string;
    deadlineEnabled: boolean;
    deadlineDays: number;
    deadlineTime: string;
    minAttendeesInput: string;
    // Premium
    bringItems: BringItemDraft[];
    ridesEnabled: boolean;
    /** Premium: RSVP questions written before it exists (saved right after it's created). */
    questions?: QuestionDraft[];
}

const RSVP_DEFAULTS = { leadDays: 1, leadTime: "09:00 AM", deadlineDays: 0, deadlineTime: "09:00 AM" };

export const draftForNew = (group: Pick<Group, "timezone" | "defaultLocation" | "defaultCapacity"> | undefined, today: string = DateTime.now().toISODate()!): MeetupDraft => ({
    date: today,
    time: "05:00 PM",
    endTime: null,
    timezone: group?.timezone || deviceTimeZone(),
    location: group?.defaultLocation || "",
    description: "",
    maxAttendeesMode: group?.defaultCapacity ? "limited" : "unlimited",
    maxAttendeesInput: group?.defaultCapacity ? String(group.defaultCapacity) : "",
    rsvpRestricted: false,
    leadEnabled: false,
    deadlineEnabled: false,
    ...RSVP_DEFAULTS,
    minAttendeesInput: "",
    bringItems: [],
    ridesEnabled: false,
});

/** "N days before at a time" for a moment relative to the meetup's start, in its timezone. */
const daysBeforeAt = (start: DateTime, iso: string | null | undefined): { days: number; time: string } | null => {
    if (!iso) return null;
    const at = DateTime.fromISO(iso).setZone(start.zoneName ?? undefined);
    if (!at.isValid) return null;
    const days = Math.round(start.startOf("day").diff(at.startOf("day"), "days").days);
    return { days: Math.max(0, days), time: at.toFormat("hh:mm a") };
};

export const draftFromMeetup = (m: Meetup): MeetupDraft => {
    const tz = m.timezone || deviceTimeZone();
    const start = DateTime.fromISO((m as any).startsAt || m.date).setZone(tz);

    let lead: { days: number; time: string } | null;
    let deadline: { days: number; time: string } | null;
    if (m.customSettings) {
        lead = m.rsvpLeadDays != null ? { days: m.rsvpLeadDays, time: m.rsvpLeadTime || "09:00 AM" } : null;
        deadline = m.rsvpDeadlineDays != null ? { days: m.rsvpDeadlineDays, time: m.rsvpDeadlineTime || "09:00 AM" } : null;
    } else {
        // A series meetup that follows its series: work its rules out from its window. With
        // priority groups, the first group's opening is the series' "earliest time".
        lead = daysBeforeAt(start, m.priorityTiers?.[0]?.opensAt ?? m.rsvpOpenDate);
        deadline = daysBeforeAt(start, m.rsvpCloseDate);
    }

    return {
        date: start.toISODate()!,
        time: m.time,
        endTime: m.endTime ?? null,
        timezone: tz,
        location: m.location || "",
        description: m.description || "",
        maxAttendeesMode: m.capacity > 0 ? "limited" : "unlimited",
        maxAttendeesInput: m.capacity > 0 ? String(m.capacity) : "",
        rsvpRestricted: !!(lead || deadline),
        leadEnabled: !!lead,
        leadDays: lead?.days ?? RSVP_DEFAULTS.leadDays,
        leadTime: lead?.time ?? RSVP_DEFAULTS.leadTime,
        deadlineEnabled: !!deadline,
        deadlineDays: deadline?.days ?? RSVP_DEFAULTS.deadlineDays,
        deadlineTime: deadline?.time ?? RSVP_DEFAULTS.deadlineTime,
        minAttendeesInput: m.minAttendees ? String(m.minAttendees) : "",
        bringItems: (m.bringItems ?? []).map(i => ({ key: newBringItemKey(), _id: i._id, name: i.name, max: i.max ? String(i.max) : "" })),
        ridesEnabled: !!m.ridesEnabled,
    };
};

/** The first problem with the draft, or null when it can be saved. */
export const validateDraft = (d: MeetupDraft): string | null => meetupIssues(d)[0]?.message ?? null;

const capacityOf = (d: MeetupDraft) => (d.maxAttendeesMode === "limited" ? parseInt(d.maxAttendeesInput, 10) || 0 : 0);
// The minimum is checked at the latest RSVP time, so without one it's sent as off.
const minOf = (d: MeetupDraft) => (d.rsvpRestricted && d.deadlineEnabled && d.minAttendeesInput !== "" ? parseInt(d.minAttendeesInput, 10) : 0);
const rulesOf = (d: MeetupDraft) => ({
    rsvpLeadDays: d.rsvpRestricted && d.leadEnabled ? d.leadDays : null,
    rsvpLeadTime: d.leadTime,
    rsvpDeadlineDays: d.rsvpRestricted && d.deadlineEnabled ? d.deadlineDays : null,
    rsvpDeadlineTime: d.deadlineTime,
});
const itemsOf = (d: MeetupDraft) => d.bringItems.map(i => ({
    ...(i._id ? { _id: i._id } : {}),
    name: i.name.trim(),
    max: i.max === "" ? null : parseInt(i.max, 10),
}));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Body for createOneOffMeetup. Settings are only sent when they're used, so a plain meetup stays plain. */
export const createPayload = (d: MeetupDraft) => {
    const settings: MeetupSettingsPayload = {};
    if (d.rsvpRestricted && (d.leadEnabled || d.deadlineEnabled)) Object.assign(settings, rulesOf(d));
    if (minOf(d) > 0) settings.minAttendees = minOf(d);
    if (d.bringItems.length > 0) settings.bringItems = itemsOf(d);
    if (d.ridesEnabled) settings.ridesEnabled = true;
    return {
        date: d.date,
        time: d.time,
        endTime: d.endTime,
        timezone: d.timezone,
        capacity: capacityOf(d),
        location: d.location,
        description: d.description,
        ...settings,
    };
};

/**
 * Body for updateMeetup: only what changed. Untouched settings aren't sent, so saving (say) a new
 * location doesn't give a series meetup settings of its own.
 */
export const updatePayload = (before: MeetupDraft, after: MeetupDraft) => {
    const out: Record<string, unknown> = {};
    if (after.date !== before.date) out.date = after.date;
    if (after.time !== before.time) out.time = after.time;
    if ((after.endTime ?? null) !== (before.endTime ?? null)) out.endTime = after.endTime ?? null;
    if (after.location !== before.location) out.location = after.location;
    if (after.description !== before.description) out.description = after.description;
    if (capacityOf(after) !== capacityOf(before)) out.capacity = capacityOf(after);
    if (!same(rulesOf(after), rulesOf(before))) Object.assign(out, rulesOf(after));
    if (minOf(after) !== minOf(before)) out.minAttendees = minOf(after);
    if (!same(itemsOf(after), itemsOf(before))) out.bringItems = itemsOf(after);
    if (after.ridesEnabled !== before.ridesEnabled) out.ridesEnabled = after.ridesEnabled;
    return out;
};
