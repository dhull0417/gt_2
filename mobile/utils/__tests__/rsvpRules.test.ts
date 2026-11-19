import { toggleLead, toggleDeadline, stepLead, stepDeadline, setLeadTime, setDeadlineTime, type RsvpRulesValue } from "../rsvpRules";

const v = (over: Partial<RsvpRulesValue> = {}): RsvpRulesValue => ({
    rsvpRestricted: true, leadEnabled: false, leadDays: 1, leadTime: "09:00 AM",
    deadlineEnabled: false, deadlineDays: 0, deadlineTime: "09:00 AM", minAttendeesInput: "", ...over,
});

describe("rsvp rules", () => {
    it("turning on Earliest keeps it at or before Latest", () => {
        expect(toggleLead(v({ deadlineEnabled: true, deadlineDays: 3, leadDays: 1 }), true)).toEqual({ leadEnabled: true, leadDays: 3 });
        expect(toggleLead(v({ deadlineEnabled: true, deadlineDays: 1, deadlineTime: "08:00 AM", leadDays: 1, leadTime: "05:00 PM" }), true))
            .toEqual({ leadEnabled: true, leadDays: 1, leadTime: "08:00 AM" });
    });
    it("turning on Latest keeps it at or after Earliest", () => {
        expect(toggleDeadline(v({ leadEnabled: true, leadDays: 1, deadlineDays: 4 }), true)).toEqual({ deadlineEnabled: true, deadlineDays: 1 });
    });
    it("steppers stop where the other side is", () => {
        expect(stepLead(v({ leadEnabled: true, leadDays: 2, deadlineEnabled: true, deadlineDays: 2 }), -1)).toEqual({ leadDays: 2 });
        expect(stepLead(v({ leadDays: 0 }), -1)).toEqual({ leadDays: 0 });
        expect(stepLead(v({ leadDays: 1 }), 1)).toEqual({ leadDays: 2 });
        expect(stepDeadline(v({ leadEnabled: true, leadDays: 2, deadlineDays: 2 }), 1)).toEqual({ deadlineDays: 2 });
        expect(stepDeadline(v({ deadlineDays: 0 }), -1)).toEqual({ deadlineDays: 0 });
    });
    it("times on the same day are capped, with a message", () => {
        const r = setLeadTime(v({ leadEnabled: true, leadDays: 1, deadlineEnabled: true, deadlineDays: 1, deadlineTime: "10:00 AM" }), "11:00 AM");
        expect(r.patch).toEqual({ leadTime: "10:00 AM" });
        expect(r.alert?.title).toBe("Earliest RSVP time must be before the latest RSVP time");
        const ok = setDeadlineTime(v({ deadlineEnabled: true, deadlineDays: 0 }), "06:00 PM");
        expect(ok).toEqual({ patch: { deadlineTime: "06:00 PM" } });
        const capped = setDeadlineTime(v({ leadEnabled: true, leadDays: 0, leadTime: "12:00 PM", deadlineEnabled: true, deadlineDays: 0 }), "10:00 AM");
        expect(capped.patch).toEqual({ deadlineTime: "12:00 PM" });
        expect(capped.alert?.title).toBe("Latest RSVP time must be after the earliest RSVP time");
    });
});
