// Settings that can belong to a single meetup (RSVP rules, minimum to meet, things to
// bring, rides): validation shared by the schedule and meetup endpoints, and the RSVP
// window a meetup's own rules produce.
import { DateTime } from "luxon";
import { parseTimeString } from "./date.utils.js";
import { groupHasPremium } from "./premium.js";

/**
 * Minimum headcount is checked at the RSVP deadline, so it needs one, and it
 * can't exceed the capacity. Returns { status, body } to respond with, or
 * null when the values are fine. (Premium is checked separately.)
 */
export const minHeadcountProblem = ({ min, capacity, deadlineDays }) => {
    if (!min) return null;
    if (!Number.isInteger(min) || min < 1) {
        return { status: 400, body: { error: "Minimum headcount must be a whole number of at least 1." } };
    }
    if (deadlineDays == null) {
        return { status: 400, body: { error: "Set an RSVP deadline to use a minimum headcount." } };
    }
    if (capacity > 0 && min > capacity) {
        return { status: 400, body: { error: "Minimum headcount can't be higher than the maximum attendees." } };
    }
    return null;
};

export const MIN_HEADCOUNT_PREMIUM_REQUIRED = {
    error: "premium_required",
    message: "Minimum headcount requires GroupThat Premium.",
};

export const MAX_BRING_ITEMS = 20;

export const ASSIGNMENTS_PREMIUM_REQUIRED = {
    error: "premium_required",
    message: "Meetup assignments require GroupThat Premium.",
};

/**
 * Validates the "things to bring" list from a request. `max` is optional (null =
 * as many as people want to bring). Returns { items } or { error }.
 */
export const parseBringItems = (raw) => {
    if (raw == null) return { items: [] };
    if (!Array.isArray(raw)) return { error: "Items to bring must be a list." };
    if (raw.length > MAX_BRING_ITEMS) return { error: `You can list at most ${MAX_BRING_ITEMS} items.` };
    const seen = new Set();
    const items = [];
    for (const r of raw) {
        const name = String(r?.name ?? "").trim();
        if (!name) return { error: "Each item needs a name." };
        if (name.length > 40) return { error: "Item names can be at most 40 characters." };
        const key = name.toLowerCase();
        if (seen.has(key)) return { error: `"${name}" is listed twice.` };
        seen.add(key);
        let max = null;
        if (r.max !== null && r.max !== undefined && r.max !== "") {
            max = Number(r.max);
            if (!Number.isInteger(max) || max < 1 || max > 99) {
                return { error: `The number for "${name}" must be a whole number from 1 to 99.` };
            }
        }
        items.push({ _id: r._id, name, max });
    }
    return { items };
};

// Keeps an item's _id only when it already exists on the series, so claims
// follow edits to the same item and clients can't mint ids.
export const withExistingIds = (items, existing = []) => {
    const known = new Set(existing.map((i) => i._id.toString()));
    return items.map((i) => ({
        ...(i._id && known.has(String(i._id)) ? { _id: i._id } : {}),
        name: i.name,
        max: i.max,
    }));
};

const TIME_RE = /^(0?[1-9]|1[0-2]):[0-5]\d (AM|PM)$/;
const minutesOf = (t) => { const { hours, minutes } = parseTimeString(t); return hours * 60 + minutes; };

/**
 * Reads a meetup's RSVP rules from a request body (rsvpLeadDays/Time, rsvpDeadlineDays/Time).
 * Fields left out of the body are left out of `rules`; null days = no limit on that side.
 * The earliest/latest order is checked against `existing` for the sides not sent.
 * Returns { rules } or { error }.
 */
export const parseRsvpRules = (body, existing = {}) => {
    const rules = {};
    for (const [field, key] of [["rsvpLeadDays", "leadDays"], ["rsvpDeadlineDays", "deadlineDays"]]) {
        if (body[field] === undefined) continue;
        if (body[field] === null) { rules[key] = null; continue; }
        const n = Number(body[field]);
        if (!Number.isInteger(n) || n < 0 || n > 365) return { error: "Days must be from 0 to 365." };
        rules[key] = n;
    }
    for (const [field, key] of [["rsvpLeadTime", "leadTime"], ["rsvpDeadlineTime", "deadlineTime"]]) {
        if (body[field] === undefined) continue;
        const t = String(body[field] ?? "").trim();
        if (!TIME_RE.test(t)) return { error: 'Times must look like "09:00 AM".' };
        rules[key] = t;
    }
    const merged = { leadTime: "09:00 AM", deadlineTime: "09:00 AM", ...existing, ...rules };
    if (merged.leadDays != null && merged.deadlineDays != null) {
        const leadBefore = merged.leadDays > merged.deadlineDays
            || (merged.leadDays === merged.deadlineDays && minutesOf(merged.leadTime) <= minutesOf(merged.deadlineTime));
        if (!leadBefore) return { error: "The earliest time to RSVP must be before the latest." };
    }
    return { rules };
};

/** When RSVPs open and close for a meetup starting at `startsAt`, from "N days before at a time" rules. */
export const computeRsvpWindow = ({ startsAt, timezone, rules }) => {
    const start = DateTime.fromJSDate(new Date(startsAt)).setZone(timezone);
    const at = (days, time) => {
        if (days == null) return null;
        const { hours, minutes } = parseTimeString(time || "09:00 AM");
        return start.minus({ days }).set({ hour: hours, minute: minutes, second: 0, millisecond: 0 }).toJSDate();
    };
    return {
        rsvpOpenDate: at(rules.leadDays, rules.leadTime),
        rsvpCloseDate: at(rules.deadlineDays, rules.deadlineTime),
    };
};

const SETTINGS_FIELDS = [
    "rsvpLeadDays", "rsvpLeadTime", "rsvpDeadlineDays", "rsvpDeadlineTime",
    "minAttendees", "bringItems", "ridesEnabled",
];

const rulesOf = (meetup) => (meetup ? {
    leadDays: meetup.rsvpLeadDays ?? null,
    leadTime: meetup.rsvpLeadTime || "09:00 AM",
    deadlineDays: meetup.rsvpDeadlineDays ?? null,
    deadlineTime: meetup.rsvpDeadlineTime || "09:00 AM",
} : {});

/**
 * Validates a meetup's own settings from a request body: RSVP rules, minimum to meet,
 * things to bring and rides. `meetup` is the existing meetup (null when creating); fields
 * left out of the body stay as they are. Premium (the group owner's) is needed to turn a
 * Premium setting on, never to clear it.
 *
 * @returns {Promise<{ patch: object, touched: boolean } | { status: number, body: object }>}
 *   `patch` holds Meetup fields to set; `touched` is true when the body sent any setting.
 */
export const parseMeetupSettings = async (body, { meetup = null, group, capacity } = {}) => {
    const touched = SETTINGS_FIELDS.some((f) => body[f] !== undefined);
    if (!touched) return { patch: {}, touched: false };
    const patch = {};

    const existingRules = rulesOf(meetup);
    const parsedRules = parseRsvpRules(body, existingRules);
    if (parsedRules.error) return { status: 400, body: { error: parsedRules.error } };
    const keyToField = { leadDays: "rsvpLeadDays", leadTime: "rsvpLeadTime", deadlineDays: "rsvpDeadlineDays", deadlineTime: "rsvpDeadlineTime" };
    for (const [k, v] of Object.entries(parsedRules.rules)) patch[keyToField[k]] = v;
    const rules = { ...existingRules, ...parsedRules.rules };

    let needsPremium = null;

    const min = body.minAttendees !== undefined ? Number(body.minAttendees) || 0 : (meetup?.minAttendees || 0);
    if (body.minAttendees !== undefined || patch.rsvpDeadlineDays !== undefined) {
        const cap = capacity !== undefined ? Number(capacity) || 0 : (meetup?.capacity || 0);
        const problem = minHeadcountProblem({ min, capacity: cap, deadlineDays: rules.deadlineDays ?? null });
        if (problem) return problem;
    }
    if (body.minAttendees !== undefined) {
        patch.minAttendees = min;
        if (min > 0) needsPremium = MIN_HEADCOUNT_PREMIUM_REQUIRED;
    }

    if (body.bringItems !== undefined) {
        const parsed = parseBringItems(body.bringItems);
        if (parsed.error) return { status: 400, body: { error: parsed.error } };
        patch.bringItems = withExistingIds(parsed.items, meetup?.bringItems || []);
        const kept = new Set(patch.bringItems.filter((i) => i._id).map((i) => String(i._id)));
        patch.bringClaims = (meetup?.bringClaims || []).filter((c) => kept.has(String(c.item)));
        if (patch.bringItems.length > 0) needsPremium = needsPremium || ASSIGNMENTS_PREMIUM_REQUIRED;
    }

    if (body.ridesEnabled !== undefined) {
        patch.ridesEnabled = !!body.ridesEnabled;
        if (!patch.ridesEnabled) patch.rides = [];
        else needsPremium = needsPremium || ASSIGNMENTS_PREMIUM_REQUIRED;
    }

    if (needsPremium && !(await groupHasPremium(group))) return { status: 403, body: needsPremium };
    return { patch, touched: true };
};

/** Did the request send any per-meetup setting? */
export const settingsTouched = (body) => SETTINGS_FIELDS.some((f) => body?.[f] !== undefined);

/**
 * The first time a series meetup gets its own settings, it starts from the series' RSVP rules,
 * so changing only (say) its items doesn't drop its RSVP window. Mutates `meetup`.
 */
export const seedRulesFromSchedule = (meetup, schedule) => {
    if (meetup.customSettings || !schedule) return;
    meetup.rsvpLeadDays = schedule.generationLeadDays ?? null;
    meetup.rsvpLeadTime = schedule.generationLeadTime || "09:00 AM";
    meetup.rsvpDeadlineDays = schedule.generationDeadlineDays ?? null;
    meetup.rsvpDeadlineTime = schedule.generationDeadlineTime || "09:00 AM";
};

/** The RSVP window from a meetup's own rule fields, plus the flags that go with it. */
export const ownRsvpWindow = (meetup, now = new Date()) => {
    const { rsvpOpenDate, rsvpCloseDate } = computeRsvpWindow({ startsAt: meetup.startsAt || meetup.date, timezone: meetup.timezone, rules: rulesOf(meetup) });
    return {
        rsvpOpenDate,
        rsvpCloseDate,
        rsvpNotified: !rsvpOpenDate || rsvpOpenDate <= now,
        minimumChecked: !!(rsvpCloseDate && rsvpCloseDate <= now),
    };
};
