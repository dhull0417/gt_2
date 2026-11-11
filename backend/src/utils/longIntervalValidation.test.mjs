// Run with: npm test (from backend/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLongIntervalRoutines, keepLongIntervalRoutinesForLegacy } from "./longIntervalValidation.js";

const first = new Date("2027-01-15T00:00:00Z");
const ok = (extra = {}) => ({ frequency: "quarterly", repeatBy: "date", dayTimes: [{ startDate: first, date: 15, time: "06:00 PM" }], rules: [], ...extra });

test("a valid long-interval routine and existing frequencies pass", () => {
  assert.equal(validateLongIntervalRoutines([ok()]), null);
  assert.equal(validateLongIntervalRoutines([ok({ frequency: "yearly", repeatBy: "weekday", rules: [{ type: "byDay", occurrence: "3rd", day: 5 }] })]), null);
  assert.equal(validateLongIntervalRoutines([{ frequency: "monthly", dayTimes: [{ date: 1, time: "06:00 PM" }, { date: 15, time: "06:00 PM" }] }]), null);
  assert.equal(validateLongIntervalRoutines(undefined), null);
});

test("long-interval routines take exactly one date", () => {
  const two = ok({ dayTimes: [ok().dayTimes[0], ok().dayTimes[0]] });
  assert.equal(validateLongIntervalRoutines([two]), "Quarterly, semi-annual and yearly schedules take one date.");
  assert.equal(validateLongIntervalRoutines([ok({ dayTimes: [] })]), "Quarterly, semi-annual and yearly schedules take one date.");
});

test("a first date is required", () => {
  assert.equal(validateLongIntervalRoutines([ok({ dayTimes: [{ date: 15, time: "06:00 PM" }] })]), "Pick a first date.");
  assert.equal(validateLongIntervalRoutines([ok({ dayTimes: [{ startDate: "not a date", time: "06:00 PM" }] })]), "Pick a first date.");
});

test("repeatBy must be date or weekday, and weekday needs its rule", () => {
  const msg = "Choose same date or same weekday.";
  assert.equal(validateLongIntervalRoutines([ok({ repeatBy: undefined })]), msg);
  assert.equal(validateLongIntervalRoutines([ok({ repeatBy: "month" })]), msg);
  assert.equal(validateLongIntervalRoutines([ok({ repeatBy: "weekday", rules: [] })]), msg);
});

test("old apps keep every stored routine when any of them is long-interval", () => {
  const monthly = { frequency: "monthly", dayTimes: [{ date: 1, time: "06:00 PM" }] };
  const incoming = [{ frequency: "monthly", dayTimes: [{ date: 2, time: "07:00 PM" }] }];
  assert.deepEqual(keepLongIntervalRoutinesForLegacy(incoming, [monthly, ok({ frequency: "yearly" })]), [monthly, ok({ frequency: "yearly" })]);
  assert.equal(keepLongIntervalRoutinesForLegacy(incoming, [monthly]), incoming);
  assert.equal(keepLongIntervalRoutinesForLegacy(incoming, undefined), incoming);
});
