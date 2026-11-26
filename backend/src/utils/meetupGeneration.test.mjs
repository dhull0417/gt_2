import test from 'node:test';
import assert from 'node:assert/strict';
import { computeScheduleCandidates, generateMeetupsForGroup, pickStaleMeetupIds } from './meetupGeneration.js';

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

// ---- End date ----
const denverNow = () => DateTime.now().setZone('America/Denver');
// The Nth upcoming Sunday strictly after today (keeps "today at a past time" out of the count).
const nthSunday = (n) => {
  let d = denverNow().startOf('day').plus({ days: 1 });
  while (d.weekday !== 7) d = d.plus({ days: 1 });
  return d.plus({ weeks: n - 1 });
};
const sundays = (time, endDT) => ({
  name: 'League', startDate: dateOnly(denverNow().plus({ days: 1 })), endDate: endDT ? dateOnly(endDT) : null,
  routines: [{ frequency: 'weekly', dayTimes: [{ day: 0, time }], rules: [] }],
});

test('a weekly series stops on its end date, and the end date itself is included', () => {
  const end = nthSunday(4);
  const { candidates } = computeScheduleCandidates(group, sundays('06:00 PM', end));
  assert.equal(candidates.length, 4);
  assert.equal(candidates.at(-1).nextMeetupDT.toISODate(), end.toISODate());
});

test('an 11 PM slot on the end date (already the next day in UTC) is still generated', () => {
  const end = nthSunday(3);
  const { candidates } = computeScheduleCandidates(group, sundays('11:00 PM', end));
  assert.equal(candidates.length, 3);
  assert.equal(candidates.at(-1).nextMeetupDT.toISODate(), end.toISODate());
});

test('a biweekly series with a first date stops at the end date', () => {
  const first = nthSunday(1);
  const end = nthSunday(7);
  const schedule = {
    name: 'Biweekly', startDate: null, endDate: dateOnly(end),
    routines: [{ frequency: 'biweekly', rules: [], dayTimes: [{ day: 0, time: '06:00 PM', startDate: dateOnly(first) }] }],
  };
  const { candidates } = computeScheduleCandidates(group, schedule);
  assert.deepEqual(candidates.map((c) => c.nextMeetupDT.toISODate()),
    [first, first.plus({ weeks: 2 }), first.plus({ weeks: 4 }), first.plus({ weeks: 6 })].map((d) => d.toISODate()));
});

test('a yearly series stops at the end date', () => {
  const schedule = { ...longSchedule('yearly', in10), endDate: dateOnly(in10.plus({ years: 1, days: 5 })) };
  const { candidates } = computeScheduleCandidates(group, schedule);
  assert.equal(candidates.length, 2);
});

test('no end date leaves the series unbounded', () => {
  const { candidates } = computeScheduleCandidates(group, sundays('06:00 PM', null));
  assert.ok(candidates.length >= 50, `got ${candidates.length}`);
});

test('a schedule whose end date has passed is finished: no slots and no next trigger', () => {
  const r = computeScheduleCandidates(group, { ...sundays('06:00 PM', denverNow().minus({ days: 1 })), startDate: null });
  assert.deepEqual(r.candidates, []);
  assert.equal(r.finished, true);
  assert.equal(r.earliestNextTrigger, null);
});

test('a schedule with slots past the generation window but before its end date is not finished', () => {
  const r = computeScheduleCandidates(group, sundays('06:00 PM', nthSunday(70)));
  assert.equal(r.finished, false);
  assert.ok(r.earliestNextTrigger instanceof Date);
});

test('generating a finished schedule clears nextGenerationAt and saves the group once', async () => {
  const schedule = { ...sundays('06:00 PM', denverNow().minus({ days: 1 })), startDate: null, nextGenerationAt: new Date() };
  let saves = 0;
  const g = { _id: 'g1', timezone: 'America/Denver', schedules: [schedule], save: async () => { saves++; } };
  const { generatedCount } = await generateMeetupsForGroup(g);
  assert.equal(generatedCount, 0);
  assert.equal(schedule.nextGenerationAt, null);
  assert.equal(saves, 1);
});

test('a schedule whose last slots all fit in this pass is finished once they are generated', () => {
  const r = computeScheduleCandidates(group, sundays('06:00 PM', nthSunday(3)));
  assert.equal(r.candidates.length, 3);
  assert.equal(r.finished, true);
});

// ---- Reconcile: which upcoming series meetups get removed ----
const endB = DateTime.fromISO('2027-03-15T23:59:59.999', { zone: 'America/Denver' });
const m = (id, iso, time = '06:00 PM') => ({ _id: id, date: new Date(iso), time });
const before = m('before', '2027-03-14T00:00:00Z');
const after = m('after', '2027-03-21T00:00:00Z');
const key = (x) => `${x.date.toISOString()}|${x.time}`;

test('a meetup after the end date is kept unless the organizer chose to delete', () => {
  assert.deepEqual(pickStaleMeetupIds([after], new Set(), { endBoundary: endB, removeAfterEnd: false }), []);
});

test('a meetup after the end date is removed when the organizer chose to delete', () => {
  assert.deepEqual(pickStaleMeetupIds([after], new Set(), { endBoundary: endB, removeAfterEnd: true }), ['after']);
});

test('before the end date, slots no longer in the series are removed and wanted ones kept', () => {
  const other = m('other', '2027-03-07T00:00:00Z');
  assert.deepEqual(pickStaleMeetupIds([before, other], new Set([key(other)]), { endBoundary: endB }), ['before']);
});

test('resetAll removes everything, including meetups after the end date', () => {
  assert.deepEqual(pickStaleMeetupIds([before, after], new Set([key(before)]), { resetAll: true, endBoundary: endB }), ['before', 'after']);
});

test('with no end date, unwanted slots are removed as before', () => {
  assert.deepEqual(pickStaleMeetupIds([after], new Set(), { endBoundary: null }), ['after']);
});
