// Run with: npm test (from backend/)
import { test } from "node:test";
import assert from "node:assert/strict";

const D = await import("./date.utils.js");

const TZ = "America/Denver"; // MDT (UTC-6) until Nov 1 2026, then MST (UTC-7)
const at = (iso) => new Date(iso);
const iso = (d) => d.toISOString();

// Mon 2026-10-05 is the reference week; Oct 1 2026 is a Thursday.
const MON_6AM = at("2026-10-05T12:00:00Z");   // Mon Oct 5, 06:00 MDT

test("parseTimeString handles AM/PM, noon, midnight and missing values", () => {
  assert.deepEqual(D.parseTimeString("9:30 AM"), { hours: 9, minutes: 30 });
  assert.deepEqual(D.parseTimeString("12:00 AM"), { hours: 0, minutes: 0 });
  assert.deepEqual(D.parseTimeString("12:15 PM"), { hours: 12, minutes: 15 });
  assert.deepEqual(D.parseTimeString("1:05 PM"), { hours: 13, minutes: 5 });
  assert.deepEqual(D.parseTimeString(undefined), { hours: 9, minutes: 0 });
});

test("generation windows and reminder stages", () => {
  assert.equal(D.getGenerationWindowDays("daily"), 93);
  assert.equal(D.getGenerationWindowDays("weekly"), 364);
  assert.equal(D.getGenerationWindowDays("biweekly"), 364);
  assert.equal(D.getGenerationWindowDays("monthly"), 730);
  assert.equal(D.getGenerationWindowDays("ordinal"), 730);
  assert.equal(D.getGenerationWindowDays("bogus"), 30);

  for (const [freq, stages] of Object.entries(D.RSVP_REMINDER_STAGES)) {
    const hours = stages.map((s) => s.offsetHours);
    assert.deepEqual(hours, [...hours].sort((a, b) => b - a), `${freq} stages go from earliest to latest`);
    assert.equal(stages.at(-1).key, "6h", `${freq} ends with the 6h reminder`);
    assert.equal(new Set(stages.map((s) => s.key)).size, stages.length, `${freq} keys are unique`);
  }
});

// ---------- calculateNextMeetupDate ----------

test("once: the given date at the given local time", () => {
  assert.equal(iso(D.calculateNextMeetupDate("2026-10-20", "6:30 PM", TZ, "once")), "2026-10-21T00:30:00.000Z");
});

test("weekly: next matching weekday after the anchor", () => {
  const out = D.calculateNextMeetupDate(3, "7:00 PM", TZ, "weekly", MON_6AM); // Wednesday
  assert.equal(iso(out), "2026-10-08T01:00:00.000Z"); // Wed Oct 7 19:00 MDT
});

test("weekly: same weekday later today is today; already past is next week", () => {
  const laterToday = D.calculateNextMeetupDate(1, "7:00 PM", TZ, "weekly", at("2026-10-05T16:00:00Z"));
  assert.equal(iso(laterToday), "2026-10-06T01:00:00.000Z"); // Mon Oct 5 19:00 MDT
  const pastToday = D.calculateNextMeetupDate(1, "7:00 PM", TZ, "weekly", at("2026-10-06T02:00:00Z"));
  assert.equal(iso(pastToday), "2026-10-13T01:00:00.000Z"); // Mon Oct 12 19:00 MDT
});

test("weekly: day 0 is Sunday", () => {
  const out = D.calculateNextMeetupDate(0, "9:00 AM", TZ, "weekly", MON_6AM);
  assert.equal(iso(out), "2026-10-11T15:00:00.000Z"); // Sun Oct 11 09:00 MDT
});

test("a meetup exactly at the anchor is not returned again (anchor + 1s)", () => {
  // Anchor is Wed Oct 7 19:00 MDT; the next one must be the following Wednesday.
  const out = D.calculateNextMeetupDate(3, "7:00 PM", TZ, "weekly", at("2026-10-08T01:00:00Z"));
  assert.equal(iso(out), "2026-10-15T01:00:00.000Z");
});

test("biweekly: continuing from an anchor adds a week", () => {
  const out = D.calculateNextMeetupDate(3, "7:00 PM", TZ, "biweekly", MON_6AM);
  assert.equal(iso(out), "2026-10-15T01:00:00.000Z"); // Wed Oct 14 19:00 MDT
});

test("weekly: local time is preserved across the DST change", () => {
  // Sat Oct 31 -> Sun Nov 1 (clocks go back at 2 AM): 9:00 AM local is now 16:00Z, not 15:00Z
  const out = D.calculateNextMeetupDate(0, "9:00 AM", TZ, "weekly", at("2026-10-31T12:00:00Z"));
  assert.equal(iso(out), "2026-11-01T16:00:00.000Z");
});

test("monthly: this month if the day is still ahead, otherwise next month", () => {
  const ahead = D.calculateNextMeetupDate(15, "6:00 PM", TZ, "monthly", at("2026-10-10T12:00:00Z"));
  assert.equal(iso(ahead), "2026-10-16T00:00:00.000Z"); // Oct 15 18:00 MDT
  const passed = D.calculateNextMeetupDate(15, "6:00 PM", TZ, "monthly", at("2026-10-20T12:00:00Z"));
  assert.equal(iso(passed), "2026-11-16T01:00:00.000Z"); // Nov 15 18:00 MST
});

test("monthly: the 29th-31st land on the last day of shorter months", () => {
  // Nov has 30 days: the 31st becomes Nov 30 (6 PM MST = 01:00Z next day)
  assert.equal(iso(D.calculateNextMeetupDate(31, "6:00 PM", TZ, "monthly", at("2026-11-01T12:00:00Z"))), "2026-12-01T01:00:00.000Z");
  // Feb 2027 has 28 days: the 30th and 31st both become Feb 28
  assert.equal(iso(D.calculateNextMeetupDate(31, "6:00 PM", TZ, "monthly", at("2027-02-01T12:00:00Z"))), "2027-03-01T01:00:00.000Z");
  assert.equal(iso(D.calculateNextMeetupDate(30, "6:00 PM", TZ, "monthly", at("2027-02-01T12:00:00Z"))), "2027-03-01T01:00:00.000Z");
  // Leap year: Feb 2028 has 29 days, so the 29th is a real date there but the 31st clamps to the 29th
  assert.equal(iso(D.calculateNextMeetupDate(29, "6:00 PM", TZ, "monthly", at("2028-02-01T12:00:00Z"))), "2028-03-01T01:00:00.000Z");
  assert.equal(iso(D.calculateNextMeetupDate(31, "6:00 PM", TZ, "monthly", at("2028-02-01T12:00:00Z"))), "2028-03-01T01:00:00.000Z");
});

test("monthly: a series on the 31st walks through every month without skipping or doubling up", () => {
  let anchor = at("2026-10-01T12:00:00Z");
  const days = [];
  for (let i = 0; i < 8; i++) {
    const next = D.calculateNextMeetupDate(31, "6:00 PM", TZ, "monthly", anchor);
    days.push(next.toLocaleDateString("en-CA", { timeZone: TZ }));
    anchor = next;
  }
  assert.deepEqual(days, ["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"]);
});

test("monthly: rolls to next month's clamped day when this month's has passed", () => {
  // Anchor is Jan 31 6 PM; next is Feb 28, not Mar 3
  const out = D.calculateNextMeetupDate(31, "6:00 PM", TZ, "monthly", at("2027-02-01T01:00:00Z"));
  assert.equal(iso(out), "2027-03-01T01:00:00.000Z");
});

test("ordinal: 2nd Wednesday of the month, rolling to next month once passed", () => {
  const rule = { type: "byDay", day: 3, occurrence: "2nd" };
  const thisMonth = D.calculateNextMeetupDate(rule, "7:00 PM", TZ, "ordinal", at("2026-10-01T12:00:00Z"), rule);
  assert.equal(iso(thisMonth), "2026-10-15T01:00:00.000Z"); // Oct 14 19:00 MDT
  const nextMonth = D.calculateNextMeetupDate(rule, "7:00 PM", TZ, "ordinal", at("2026-10-20T12:00:00Z"), rule);
  assert.equal(iso(nextMonth), "2026-11-12T02:00:00.000Z"); // Nov 11 19:00 MST
});

test("ordinal: Last Sunday", () => {
  const rule = { type: "byDay", day: 0, occurrence: "Last" };
  const oct = D.calculateNextMeetupDate(rule, "9:00 AM", TZ, "ordinal", at("2026-10-01T12:00:00Z"), rule);
  assert.equal(iso(oct), "2026-10-25T15:00:00.000Z"); // Oct 25 09:00 MDT
  const nov = D.calculateNextMeetupDate(rule, "9:00 AM", TZ, "ordinal", at("2026-10-26T12:00:00Z"), rule);
  assert.equal(iso(nov), "2026-11-29T16:00:00.000Z"); // Nov 29 09:00 MST
});

// ---------- computeNextGenerationAt ----------

test("computeNextGenerationAt: lead days/time before the next occurrence", () => {
  const out = D.computeNextGenerationAt(
    { generationLeadDays: 2, generationLeadTime: "08:00 AM" }, TZ, MON_6AM,
    { frequency: "weekly" }, { day: 3, time: "7:00 PM" }
  );
  assert.equal(iso(out), "2026-10-05T14:00:00.000Z"); // Mon Oct 5 08:00 MDT (2 days before Wed Oct 7)
});

test("computeNextGenerationAt: defaults to 1 day before at 9:00 AM; monthly reads dtEntry.date", () => {
  const weekly = D.computeNextGenerationAt({}, TZ, MON_6AM, { frequency: "weekly" }, { day: 3, time: "7:00 PM" });
  assert.equal(iso(weekly), "2026-10-06T15:00:00.000Z"); // Tue Oct 6 09:00 MDT
  const monthly = D.computeNextGenerationAt({}, TZ, at("2026-10-10T12:00:00Z"), { frequency: "monthly" }, { date: 15, time: "6:00 PM" });
  assert.equal(iso(monthly), "2026-10-14T15:00:00.000Z"); // Oct 14 09:00 MDT
});
