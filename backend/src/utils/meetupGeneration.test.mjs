import test from 'node:test';
import assert from 'node:assert/strict';
import { computeScheduleCandidates } from './meetupGeneration.js';

const group = { timezone: 'America/Denver' };
const weeklySchedule = (extra = {}) => ({
  name: 'Sunday Dinner',
  startDate: null,
  routines: [{ frequency: 'weekly', dayTimes: [{ day: 0, time: '06:00 PM' }], rules: [] }],
  ...extra,
});

test('a weekly routine produces about a year of Sunday slots, all in the future', () => {
  const { candidates } = computeScheduleCandidates(group, weeklySchedule());
  assert.ok(candidates.length >= 50 && candidates.length <= 54, `got ${candidates.length}`);
  for (const c of candidates) {
    assert.equal(c.nextMeetupDT.weekday, 7); // Sunday
    assert.equal(c.nextMeetupDT.hour, 18);
  }
  const times = candidates.map((c) => c.nextDate.getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test('changing the time moves every slot (the reconcile step would replace them)', () => {
  const a = computeScheduleCandidates(group, weeklySchedule()).candidates.map((c) => c.nextDate.getTime());
  const b = computeScheduleCandidates(group, weeklySchedule({
    routines: [{ frequency: 'weekly', dayTimes: [{ day: 0, time: '07:00 PM' }], rules: [] }],
  })).candidates.map((c) => c.nextDate.getTime());
  assert.equal(a.filter((t) => b.includes(t)).length, 0);
});

test('editing something that is not a slot (description, location) leaves the slots identical', () => {
  const a = computeScheduleCandidates(group, weeklySchedule()).candidates.map((c) => c.nextDate.getTime());
  const b = computeScheduleCandidates(group, weeklySchedule({ defaultDescription: 'New', defaultLocation: 'Elsewhere' })).candidates.map((c) => c.nextDate.getTime());
  assert.deepEqual(a, b);
});

test('a schedule without routines has no slots', () => {
  assert.deepEqual(computeScheduleCandidates(group, { routines: [] }).candidates, []);
});

// ---- Quarterly / semiannual / yearly ----
import { DateTime } from 'luxon';
const dateOnly = (dt) => new Date(dt.toISODate() + 'T00:00:00Z');
const longSchedule = (frequency, startDT, time = '06:00 PM') => ({
  name: 'Board', startDate: null,
  routines: [{ frequency, repeatBy: 'date', rules: [], dayTimes: [{ startDate: dateOnly(startDT), date: startDT.day, time }] }],
});
const in10 = DateTime.now().setZone('America/Denver').plus({ days: 10 });

test('quarterly fills two years (8), semiannual three years (6), yearly three years (3)', () => {
  for (const [f, n] of [['quarterly', 8], ['semiannual', 6], ['yearly', 3]]) {
    const { candidates } = computeScheduleCandidates(group, longSchedule(f, in10));
    assert.equal(candidates.length, n, `${f}: got ${candidates.length}`);
    for (const c of candidates) {
      assert.equal(c.routine.frequency, f);
      assert.equal(c.nextMeetupDT.hour, 18);
    }
  }
});

test('a yearly first date of today at a time already past starts next year', () => {
  const now = DateTime.now().setZone('America/Denver');
  if (now.hour === 0 && now.minute < 2) return; // nothing is "earlier today" just after midnight
  const past = now.minus({ minutes: 1 });
  const time = past.toFormat('hh:mm a');
  const { candidates } = computeScheduleCandidates(group, longSchedule('yearly', now, time));
  assert.ok(candidates.length >= 1);
  assert.ok(candidates[0].nextDate > new Date(), 'first slot must be in the future');
  assert.equal(candidates[0].nextMeetupDT.year, now.year + 1);
});
