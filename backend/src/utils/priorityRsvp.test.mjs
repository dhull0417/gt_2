// Run with: npm test (from backend/)
import { test } from "node:test";
import assert from "node:assert/strict";

const P = await import("./priorityRsvp.js");

const TZ = "America/Denver"; // UTC-6 on 2026-10-03/04
const at = (iso) => new Date(iso);
const mins = (d, n) => new Date(d.getTime() + n * 60000);

// ---------- addAwakeMinutes ----------

test("addAwakeMinutes: without quiet hours it is plain addition", () => {
  const start = at("2026-10-03T15:00:00Z");
  assert.equal(P.addAwakeMinutes(start, 90, { enabled: false }, TZ).toISOString(), "2026-10-03T16:30:00.000Z");
  assert.equal(P.addAwakeMinutes(start, 90, undefined, TZ).toISOString(), "2026-10-03T16:30:00.000Z");
});

test("addAwakeMinutes: time inside quiet hours doesn't count (crosses midnight)", () => {
  const quiet = { enabled: true, start: "10:00 PM", end: "08:00 AM" };
  // 8:00 PM MDT + 3h awake: 2h until 10 PM, sleep until 8 AM, 1h more => 9:00 AM MDT
  const out = P.addAwakeMinutes(at("2026-10-04T02:00:00Z"), 180, quiet, TZ);
  assert.equal(out.toISOString(), "2026-10-04T15:00:00.000Z");
});

test("addAwakeMinutes: starting inside quiet hours waits until quiet ends", () => {
  const quiet = { enabled: true, start: "10:00 PM", end: "08:00 AM" };
  // 11:00 PM MDT + 30 min awake => 8:30 AM MDT next morning
  const out = P.addAwakeMinutes(at("2026-10-04T05:00:00Z"), 30, quiet, TZ);
  assert.equal(out.toISOString(), "2026-10-04T14:30:00.000Z");
});

test("addAwakeMinutes: a window that fits before quiet hours is unaffected", () => {
  const quiet = { enabled: true, start: "10:00 PM", end: "08:00 AM" };
  const out = P.addAwakeMinutes(at("2026-10-03T15:00:00Z"), 60, quiet, TZ); // 9 AM + 1h
  assert.equal(out.toISOString(), "2026-10-03T16:00:00.000Z");
});

// ---------- resolveRsvpOpen ----------

const T0 = at("2026-10-03T15:00:00Z");
const schedule = {
  priorityTiers: [{ size: 2, windowMinutes: 60 }, { size: 1, windowMinutes: 120 }],
  priorityOrder: ["a", "b", "c", "d"],
};
const group = { members: ["a", "b", "c", "d", "e"], timezone: TZ };

test("resolveRsvpOpen: inactive (no Premium) or no base time => plain schedule", () => {
  const plain = { rsvpOpenDate: T0, priorityTiers: [], priorityOpened: [] };
  assert.deepEqual(P.resolveRsvpOpen({ schedule, group, baseOpen: T0, active: false }), plain);
  assert.deepEqual(
    P.resolveRsvpOpen({ schedule: { priorityTiers: [] }, group, baseOpen: T0, active: true }),
    plain
  );
  const none = P.resolveRsvpOpen({ schedule, group, baseOpen: null, active: true });
  assert.equal(none.rsvpOpenDate, null);
});

test("resolveRsvpOpen: tiers cascade and rsvpOpenDate is when everyone else opens", () => {
  const r = P.resolveRsvpOpen({ schedule, group, baseOpen: T0, active: true, now: mins(T0, -10) });
  assert.equal(r.priorityTiers.length, 2);
  assert.deepEqual(r.priorityTiers[0].members, ["a", "b"]);
  assert.deepEqual(r.priorityTiers[1].members, ["c"]);
  assert.equal(new Date(r.priorityTiers[0].opensAt).toISOString(), T0.toISOString());
  assert.equal(new Date(r.priorityTiers[1].opensAt).toISOString(), mins(T0, 60).toISOString());
  assert.equal(r.rsvpOpenDate.toISOString(), mins(T0, 180).toISOString());
  assert.deepEqual(r.priorityOpened, []);
});

test("resolveRsvpOpen: priorityOpened lists tiers already open while everyone else is locked out", () => {
  const mid = P.resolveRsvpOpen({ schedule, group, baseOpen: T0, active: true, now: mins(T0, 30) });
  assert.deepEqual(mid.priorityOpened, [0]);
  const later = P.resolveRsvpOpen({ schedule, group, baseOpen: T0, active: true, now: mins(T0, 90) });
  assert.deepEqual(later.priorityOpened, [0, 1]);
  const done = P.resolveRsvpOpen({ schedule, group, baseOpen: T0, active: true, now: mins(T0, 200) });
  assert.deepEqual(done.priorityOpened, []);
});

test("resolveRsvpOpen: ordered ids who left the group are skipped, empty tiers dropped", () => {
  const g = { members: ["c", "d"], timezone: TZ }; // a and b are gone
  const r = P.resolveRsvpOpen({ schedule, group: g, baseOpen: T0, active: true, now: mins(T0, -1) });
  // size-2 tier takes ordered[0..2] = [c, d]; size-1 tier then has nobody and is skipped
  assert.equal(r.priorityTiers.length, 1);
  assert.deepEqual(r.priorityTiers[0].members, ["c", "d"]);
  const empty = P.resolveRsvpOpen({ schedule, group: { members: ["x"], timezone: TZ }, baseOpen: T0, active: true });
  assert.deepEqual(empty.priorityTiers, []);
  assert.equal(empty.rsvpOpenDate, T0);
});

// ---------- tier helpers / canRsvpNow ----------

const T1 = mins(T0, 60);
const T2 = mins(T0, 180);
const meetup = (over = {}) => ({
  priorityTiers: [
    { members: ["a", "b"], opensAt: T0 },
    { members: ["c"], opensAt: T1 },
  ],
  rsvpOpenDate: T2,
  members: ["a", "b", "c", "d"],
  in: [], out: [], waitlist: [],
  ...over,
});

test("userTierIndex / userOpensAt", () => {
  const m = meetup();
  assert.equal(P.userTierIndex(m, "a"), 0);
  assert.equal(P.userTierIndex(m, "c"), 1);
  assert.equal(P.userTierIndex(m, "d"), -1);
  assert.equal(P.userTierIndex(m, { _id: "b" }), 0);
  assert.equal(P.userOpensAt(m, "c"), T1);
  assert.equal(P.userOpensAt(m, "d"), T2);
  assert.equal(P.userOpensAt(m, "a", false), T0); // priority off: everyone opens at first tier's time
});

test("canRsvpNow: nobody can RSVP before the first group opens", () => {
  const m = meetup();
  const now = mins(T0, -1);
  for (const u of ["a", "c", "d"]) assert.equal(P.canRsvpNow(m, u, true, now), false);
});

test("canRsvpNow: each group opens on schedule, others stay locked", () => {
  const m = meetup();
  const now = mins(T0, 5);
  assert.equal(P.canRsvpNow(m, "a", true, now), true);
  assert.equal(P.canRsvpNow(m, "c", true, now), false);
  assert.equal(P.canRsvpNow(m, "d", true, now), false);
});

test("canRsvpNow: a group opens early once the previous group has fully answered", () => {
  const m = meetup({ in: ["a"], out: ["b"] });
  const now = mins(T0, 10);
  assert.equal(P.isTierComplete(m, 0), true);
  assert.equal(P.isTierOpen(m, 1, now), true);
  assert.equal(P.canRsvpNow(m, "c", true, now), true);
  assert.equal(P.canRsvpNow(m, "d", true, now), false);
});

test("canRsvpNow: a waitlisted member counts as having answered", () => {
  const m = meetup({ in: ["a"], waitlist: ["b"] });
  assert.equal(P.isTierComplete(m, 0), true);
});

test("canRsvpNow: members who left the meetup don't block a tier from completing", () => {
  const m = meetup({ members: ["a", "c", "d"], in: ["a"] }); // b left
  assert.equal(P.isTierComplete(m, 0), true);
});

test("canRsvpNow: everyone else opens early after every group has answered, or at the general time", () => {
  const answered = meetup({ in: ["a", "c"], out: ["b"] });
  const now = mins(T0, 10);
  assert.equal(P.allTiersAnswered(answered, now), true);
  assert.equal(P.canRsvpNow(answered, "d", true, now), true);

  const pending = meetup({ in: ["a"], out: ["b"] });
  assert.equal(P.allTiersAnswered(pending, now), false);
  assert.equal(P.canRsvpNow(pending, "d", true, now), false);
  assert.equal(P.canRsvpNow(pending, "d", true, mins(T2, 1)), true);
});

test("canRsvpNow: lapsed Premium ignores priority, opening at the first group's time", () => {
  const m = meetup();
  assert.equal(P.everyoneOpensAt(m, false), T0);
  assert.equal(P.canRsvpNow(m, "d", false, mins(T0, -1)), false);
  assert.equal(P.canRsvpNow(m, "d", false, mins(T0, 1)), true);
});

test("canRsvpNow: meetups with no priority and no open date are always open", () => {
  assert.equal(P.canRsvpNow({ priorityTiers: [], rsvpOpenDate: null }, "x"), true);
  assert.equal(P.canRsvpNow({ priorityTiers: [], rsvpOpenDate: mins(new Date(), -5) }, "x"), true);
});

// ---------- pickWaitlistIndex ----------

test("pickWaitlistIndex: highest-priority group first, then longest waiting", () => {
  const m = meetup({ waitlist: ["d", "c", "a", "b"] });
  assert.equal(P.pickWaitlistIndex(m), 2);          // a is tier 0 and earliest of tier 0 in the line
  assert.equal(P.pickWaitlistIndex(meetup({ waitlist: ["d", "c"] })), 1); // c beats unlisted d
  assert.equal(P.pickWaitlistIndex(meetup({ waitlist: ["d", "e"] })), 0); // both unlisted: front of line
});

test("pickWaitlistIndex: empty list, and priority off => front of line", () => {
  assert.equal(P.pickWaitlistIndex(meetup()), -1);
  assert.equal(P.pickWaitlistIndex(meetup({ waitlist: ["d", "a"] }), false), 0);
  assert.equal(P.pickWaitlistIndex({ waitlist: ["x", "y"], priorityTiers: [] }), 0);
});
