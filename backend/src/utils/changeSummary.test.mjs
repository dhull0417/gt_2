import test from 'node:test';
import assert from 'node:assert/strict';
import { meetupChanges, scheduleChanges, pushBody, truncate } from './changeSummary.js';

const TZ = 'America/New_York';
const NOW = new Date('2026-11-07T15:00:00Z');
// Thu Nov 13 2026, 7:00 PM Eastern
const base = () => ({
  date: new Date('2026-11-14T00:00:00Z'), time: '07:00 PM', endTime: null, timezone: TZ,
  location: 'Lincoln Rec Center', capacity: 12, description: 'Bring water',
});
const labels = (c) => c.map((x) => x.label);

test('no change -> empty list', () => {
  assert.deepEqual(meetupChanges(base(), base(), { now: NOW }), []);
});

test('only changed fields are listed, in When/Location/Spots/Description order', () => {
  const after = { ...base(), location: 'City Park', capacity: 0, description: '' };
  const c = meetupChanges(base(), after, { now: NOW });
  assert.deepEqual(c.map((x) => [x.field, x.label, x.value]), [
    ['location', 'Location', 'City Park'],
    ['capacity', 'Spots', 'No limit'],
    ['description', 'Description', 'Removed'],
  ]);
});

test('clearing the location says Removed', () => {
  const c = meetupChanges(base(), { ...base(), location: '' }, { now: NOW });
  assert.equal(c[0].value, 'Removed');
});

test('new date shows weekday, month, day and time in the group timezone', () => {
  const after = { ...base(), date: new Date('2026-11-21T00:00:00Z'), time: '08:00 PM' };
  const c = meetupChanges(base(), after, { now: NOW });
  assert.deepEqual(c.map((x) => [x.field, x.value]), [['when', 'Fri, Nov 20 at 8:00 PM']]);
});

test('end time makes a range; shared AM/PM collapses; year added when not current', () => {
  const a = meetupChanges(base(), { ...base(), endTime: '09:00 PM' }, { now: NOW });
  assert.equal(a[0].value, 'Fri, Nov 13, 7:00 – 9:00 PM');
  const b = meetupChanges(base(), { ...base(), date: new Date('2027-01-09T00:00:00Z'), endTime: '01:00 PM', time: '11:00 AM' }, { now: NOW });
  assert.equal(b[0].value, 'Fri, Jan 8, 2027, 11:00 AM – 1:00 PM');
});

test('changing only the end time is a When change', () => {
  const a = { ...base(), endTime: '09:00 PM' };
  const c = meetupChanges(a, { ...a, endTime: '10:00 PM' }, { now: NOW });
  assert.deepEqual(labels(c), ['When']);
});

test('capacity compared as numbers', () => {
  assert.deepEqual(meetupChanges(base(), { ...base(), capacity: '12' }, { now: NOW }), []);
});

test('long description is cut to 200 in the list and 80 in the push', () => {
  const long = 'x'.repeat(300);
  const c = meetupChanges(base(), { ...base(), description: long }, { now: NOW });
  assert.equal(c[0].value.length, 200);
  assert.ok(c[0].value.endsWith('…'));
  assert.ok(pushBody(c).length <= 'Description: '.length + 80);
});

test('truncate leaves short text alone', () => {
  assert.equal(truncate('hello', 80), 'hello');
});

test('pushBody puts one change per line', () => {
  const body = pushBody([{ label: 'When', value: 'Fri, Nov 20 at 8:00 PM' }, { label: 'Spots', value: '12' }]);
  assert.equal(body, 'When: Fri, Nov 20 at 8:00 PM\nSpots: 12');
});

// ---- schedules ----
const sched = () => ({
  name: 'Basketball', timezone: TZ,
  routines: [{ frequency: 'weekly', dayTimes: [{ day: 2, time: '06:00 PM' }], rules: [] }],
  defaultLocation: 'Lincoln Rec Center', defaultCapacity: 12, defaultMinAttendees: 0, defaultDescription: '',
  generationLeadDays: 2, generationLeadTime: '09:00 AM', generationDeadlineDays: 1, generationDeadlineTime: '05:00 PM',
});

test('schedule: identical snapshots (editor resends everything) -> nothing', () => {
  assert.deepEqual(scheduleChanges(sched(), sched(), { now: NOW }), []);
});

test('schedule: biweekly start date alone is not a visible change', () => {
  const a = sched(); a.routines = [{ frequency: 'biweekly', dayTimes: [{ day: 2, time: '06:00 PM', startDate: new Date('2026-11-10') }], rules: [] }];
  const b = structuredClone(a); b.routines[0].dayTimes[0].startDate = new Date('2026-11-17');
  assert.deepEqual(scheduleChanges(a, b, { now: NOW }), []);
});

test('schedule: When lists each day/time row', () => {
  const after = sched();
  after.routines = [{ frequency: 'weekly', dayTimes: [{ day: 2, time: '06:00 PM' }, { day: 4, time: '07:00 PM', endTime: '09:00 PM' }], rules: [] }];
  const c = scheduleChanges(sched(), after, { now: NOW });
  assert.deepEqual(c.map((x) => [x.label, x.value]), [['When', 'Tuesdays at 6:00 PM, Thursdays at 7:00 – 9:00 PM']]);
});

test('schedule: frequency wording', () => {
  const mk = (routine) => { const a = sched(); a.routines = [routine]; return scheduleChanges(sched(), a, { now: NOW })[0].value; };
  assert.equal(mk({ frequency: 'daily', dayTimes: [{ day: 0, time: '06:00 PM' }], rules: [] }), 'Every day at 6:00 PM');
  assert.equal(mk({ frequency: 'biweekly', dayTimes: [{ day: 2, time: '06:00 PM' }], rules: [] }), 'Every other Tuesday at 6:00 PM');
  assert.equal(mk({ frequency: 'monthly', dayTimes: [{ date: 15, time: '06:00 PM' }], rules: [] }), 'Monthly on the 15th at 6:00 PM');
  assert.equal(mk({ frequency: 'ordinal', dayTimes: [{ day: 3, time: '06:00 PM' }], rules: [{ type: 'ordinal', occurrence: '2nd', day: 3 }] }), '2nd Wednesday of the month at 6:00 PM');
});

test('schedule: more than 3 rows shows first 3 plus +N more', () => {
  const after = sched();
  after.routines = [{ frequency: 'weekly', dayTimes: [1, 2, 3, 4, 5].map((day) => ({ day, time: '06:00 PM' })), rules: [] }];
  assert.equal(scheduleChanges(sched(), after, { now: NOW })[0].value, 'Mondays at 6:00 PM, Tuesdays at 6:00 PM, Wednesdays at 6:00 PM, +2 more');
});

test('schedule: a timezone change is a When change and names the zone', () => {
  const after = { ...sched(), timezone: 'America/Denver' };
  const c = scheduleChanges(sched(), after, { now: NOW });
  assert.equal(c[0].label, 'When');
  assert.equal(c[0].value, 'Tuesdays at 6:00 PM (Mountain Time)');
});

test('schedule: other fields and their wording, in spec order', () => {
  const after = {
    ...sched(), name: 'Hoops', defaultLocation: '', defaultCapacity: 0, defaultMinAttendees: 6, defaultDescription: 'Bring a ball',
    generationLeadDays: null, generationDeadlineDays: null,
  };
  const c = scheduleChanges(sched(), after, { now: NOW });
  assert.deepEqual(c.map((x) => [x.label, x.value]), [
    ['Name', 'Hoops'], ['Location', 'Removed'], ['Spots', 'No limit'], ['Minimum', '6 people'],
    ['RSVPs open', 'Anytime'], ['RSVPs close', 'No deadline'], ['Description', 'Bring a ball'],
  ]);
});

test('schedule: RSVP window wording', () => {
  const after = { ...sched(), generationLeadDays: 0, generationLeadTime: '08:00 AM', generationDeadlineDays: 3, generationDeadlineTime: '06:00 PM', defaultMinAttendees: 1 };
  const c = scheduleChanges({ ...sched(), defaultMinAttendees: 5 }, after, { now: NOW });
  assert.deepEqual(c.map((x) => [x.label, x.value]), [
    ['Minimum', '1 person'], ['RSVPs open', 'Day of at 8:00 AM'], ['RSVPs close', '3 days before at 6:00 PM'],
  ]);
});

test('schedule: turning the minimum off says Off', () => {
  const c = scheduleChanges({ ...sched(), defaultMinAttendees: 4 }, sched(), { now: NOW });
  assert.deepEqual(c.map((x) => [x.label, x.value]), [['Minimum', 'Off']]);
});
