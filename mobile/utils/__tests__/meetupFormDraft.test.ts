import { DateTime } from "luxon";
import { draftForNew, draftFromMeetup, validateDraft, createPayload, updatePayload, type MeetupDraft } from "../meetupFormDraft";
import type { Meetup, Group } from "../api";

const TZ = "America/Denver";
const start = DateTime.fromISO("2026-12-10T18:00", { zone: TZ });

const meetup = (over: Partial<Meetup> = {}): Meetup => ({
    _id: "m1", group: { _id: "g1", owner: "u1", name: "Hoops" }, name: "Hoops",
    date: start.toUTC().toISO()!, startsAt: start.toUTC().toISO()!, time: "06:00 PM", timezone: TZ,
    location: "Gym", description: "", status: "scheduled", capacity: 0, isOverride: false,
    members: [], undecided: [], in: [], out: [], waitlist: [], updatedAt: "",
    ...over,
} as Meetup);

describe("draftForNew", () => {
    it("seeds location, capacity and timezone from the group", () => {
        const d = draftForNew({ timezone: TZ, defaultLocation: "Park", defaultCapacity: 12 } as Group, "2026-12-01");
        expect(d).toMatchObject({ date: "2026-12-01", time: "05:00 PM", timezone: TZ, location: "Park", maxAttendeesMode: "limited", maxAttendeesInput: "12", rsvpRestricted: false, bringItems: [], ridesEnabled: false });
    });
});

describe("draftFromMeetup", () => {
    it("no RSVP window → Allow anytime", () => {
        const d = draftFromMeetup(meetup());
        expect(d.rsvpRestricted).toBe(false);
        expect(d.date).toBe("2026-12-10");
    });

    it("reads the meetup's own rules when it has them", () => {
        const d = draftFromMeetup(meetup({ customSettings: true, rsvpLeadDays: null, rsvpDeadlineDays: 0, rsvpDeadlineTime: "12:00 PM", minAttendees: 3 }));
        expect(d).toMatchObject({ rsvpRestricted: true, leadEnabled: false, deadlineEnabled: true, deadlineDays: 0, deadlineTime: "12:00 PM", minAttendeesInput: "3" });
    });

    it("works the rules out from a series meetup's window", () => {
        const d = draftFromMeetup(meetup({
            rsvpOpenDate: start.minus({ days: 3 }).set({ hour: 8 }).toUTC().toISO()!,
            rsvpCloseDate: start.minus({ days: 1 }).set({ hour: 20 }).toUTC().toISO()!,
        }));
        expect(d).toMatchObject({ rsvpRestricted: true, leadEnabled: true, leadDays: 3, leadTime: "08:00 AM", deadlineEnabled: true, deadlineDays: 1, deadlineTime: "08:00 PM" });
    });

    it("with priority groups, the first group's opening is the earliest RSVP time", () => {
        const first = start.minus({ days: 2 }).set({ hour: 9 }).toUTC().toISO()!;
        const d = draftFromMeetup(meetup({
            rsvpOpenDate: start.minus({ days: 1 }).toUTC().toISO()!,
            priorityTiers: [{ members: [], opensAt: first }],
        }));
        expect(d).toMatchObject({ leadEnabled: true, leadDays: 2, leadTime: "09:00 AM" });
    });

    it("keeps item ids", () => {
        const d = draftFromMeetup(meetup({ bringItems: [{ _id: "b1", name: "Chips", max: 2 }], ridesEnabled: true }));
        expect(d.bringItems).toEqual([expect.objectContaining({ _id: "b1", name: "Chips", max: "2" })]);
        expect(d.ridesEnabled).toBe(true);
    });
});

describe("updatePayload", () => {
    const base = () => draftFromMeetup(meetup({
        rsvpOpenDate: start.minus({ days: 3 }).set({ hour: 8 }).toUTC().toISO()!,
        rsvpCloseDate: start.minus({ days: 1 }).set({ hour: 20 }).toUTC().toISO()!,
    }));

    it("nothing changed → nothing sent", () => {
        expect(updatePayload(base(), base())).toEqual({});
    });

    it("only the location changed → only the location is sent (no settings, so not customized)", () => {
        expect(updatePayload(base(), { ...base(), location: "Park" })).toEqual({ location: "Park" });
    });

    it("turning off Limit RSVPs clears both sides and the minimum", () => {
        const before = { ...base(), minAttendeesInput: "3" };
        expect(updatePayload(before, { ...before, rsvpRestricted: false })).toEqual({
            rsvpLeadDays: null, rsvpLeadTime: "08:00 AM", rsvpDeadlineDays: null, rsvpDeadlineTime: "08:00 PM", minAttendees: 0,
        });
    });

    it("item edits send the whole list with ids", () => {
        const before: MeetupDraft = { ...base(), bringItems: [{ key: "k1", _id: "b1", name: "Chips", max: "" }] };
        const after: MeetupDraft = { ...before, bringItems: [...before.bringItems, { key: "k2", name: "Ice", max: "3" }] };
        expect(updatePayload(before, after)).toEqual({ bringItems: [{ _id: "b1", name: "Chips", max: null }, { name: "Ice", max: 3 }] });
    });

    it("date, capacity, rides", () => {
        expect(updatePayload(base(), { ...base(), date: "2026-12-12", maxAttendeesMode: "limited", maxAttendeesInput: "8", ridesEnabled: true }))
            .toEqual({ date: "2026-12-12", capacity: 8, ridesEnabled: true });
    });
});

describe("createPayload", () => {
    it("plain meetup sends no settings", () => {
        const d = draftForNew(undefined, "2026-12-01");
        expect(createPayload({ ...d, location: "Gym" })).toEqual({ date: "2026-12-01", time: "05:00 PM", endTime: null, timezone: d.timezone, capacity: 0, location: "Gym", description: "" });
    });

    it("sends RSVP rules, the minimum, items and rides when set", () => {
        const d: MeetupDraft = {
            ...draftForNew(undefined, "2026-12-01"),
            rsvpRestricted: true, leadEnabled: false, deadlineEnabled: true, deadlineDays: 0, deadlineTime: "12:00 PM", minAttendeesInput: "2",
            bringItems: [{ key: "k", name: " Ball ", max: "" }], ridesEnabled: true,
        };
        expect(createPayload(d)).toMatchObject({
            rsvpLeadDays: null, rsvpDeadlineDays: 0, rsvpDeadlineTime: "12:00 PM", minAttendees: 2,
            bringItems: [{ name: "Ball", max: null }], ridesEnabled: true,
        });
    });
});

describe("validateDraft", () => {
    const d = () => draftForNew(undefined, "2026-12-01");
    it("ok", () => expect(validateDraft(d())).toBeNull());
    it("max attendees", () => expect(validateDraft({ ...d(), maxAttendeesMode: "limited", maxAttendeesInput: "abc" })).toBe("Numbers only, please."));
    it("end time", () => expect(validateDraft({ ...d(), endTime: "05:00 PM" })).toBe("End time can't be the same as the start time."));
    it("minimum above max", () => expect(validateDraft({ ...d(), maxAttendeesMode: "limited", maxAttendeesInput: "4", rsvpRestricted: true, deadlineEnabled: true, minAttendeesInput: "6" })).toBe("Can't be more than the max attendees."));
    it("minimum ignored when the latest RSVP time is off", () => expect(validateDraft({ ...d(), rsvpRestricted: true, deadlineEnabled: false, minAttendeesInput: "abc" })).toBeNull());
    it("items", () => expect(validateDraft({ ...d(), bringItems: [{ key: "k", name: "", max: "" }] })).toBe("Give every item a name, or remove the empty row."));
});
