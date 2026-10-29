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
