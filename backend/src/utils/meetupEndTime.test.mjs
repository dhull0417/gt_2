// Run with: npm test (from backend/)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DURATION_MS, validateEndTime, computeEndsAt, effectiveEnd, slotEndFields,
  buildEndTimeUpdates, validateRoutineEndTimes, preserveLegacyEndTimes,
  applyEndTimeEdit, expiryFilter, isMeetupOver,
} from './meetupEndTime.js';

const TZ = 'America/Denver';
const at = (iso) => new Date(iso);

test('computeEndsAt puts the end on the same day when it is after the start', () => {
  // Tue Oct 6 2026, 5 PM MDT = 23:00Z
  assert.equal(computeEndsAt(at('2026-10-06T23:00:00Z'), '08:00 PM', TZ).toISOString(), '2026-10-07T02:00:00.000Z');
});

test('computeEndsAt rolls an earlier end time to the next day', () => {
  // 9 PM MDT Oct 6 -> 1 AM MDT Oct 7
  assert.equal(computeEndsAt(at('2026-10-07T03:00:00Z'), '01:00 AM', TZ).toISOString(), '2026-10-07T07:00:00.000Z');
});

test('computeEndsAt rollover across the Nov 1 DST change', () => {
  // Sat Oct 31 9 PM MDT = 2026-11-01T03:00Z; 1 AM Nov 1 (first, MDT) = 07:00Z
  assert.equal(computeEndsAt(at('2026-11-01T03:00:00Z'), '01:00 AM', TZ).toISOString(), '2026-11-01T07:00:00.000Z');
});

test('computeEndsAt with no end time is null', () => {
  assert.equal(computeEndsAt(at('2026-10-06T23:00:00Z'), null, TZ), null);
  assert.equal(computeEndsAt(at('2026-10-06T23:00:00Z'), undefined, TZ), null);
});

test('validateEndTime', () => {
  assert.equal(validateEndTime('05:00 PM', null), null);
  assert.equal(validateEndTime('05:00 PM', undefined), null);
  assert.equal(validateEndTime('05:00 PM', '08:00 PM'), null);
  assert.equal(validateEndTime('05:00 PM', '8:00 PM'), null);
  assert.equal(validateEndTime('05:00 PM', '05:00 PM'), "End time can't be the same as the start time.");
  assert.equal(validateEndTime('5:00 PM', '05:00 PM'), "End time can't be the same as the start time.");
  assert.equal(validateEndTime('05:00 PM', '25:00 PM'), 'Invalid end time.');
  assert.equal(validateEndTime('05:00 PM', 'soon'), 'Invalid end time.');
});

test('effectiveEnd uses endsAt, else start + 1 hour', () => {
  assert.equal(DEFAULT_DURATION_MS, 3600000);
  const startsAt = at('2026-10-06T23:00:00Z');
  assert.equal(effectiveEnd({ startsAt, endsAt: at('2026-10-07T02:00:00Z') }).toISOString(), '2026-10-07T02:00:00.000Z');
  assert.equal(effectiveEnd({ startsAt, endsAt: null }).toISOString(), '2026-10-07T00:00:00.000Z');
});

test('slotEndFields copies a row end time and computes endsAt', () => {
  const sunday6pm = at('2026-10-12T00:00:00Z'); // Sun Oct 11, 6 PM MDT
  const r = slotEndFields({ time: '06:00 PM', endTime: '09:00 PM' }, sunday6pm, TZ);
  assert.equal(r.endTime, '09:00 PM');
  assert.equal(r.endsAt.toISOString(), '2026-10-12T03:00:00.000Z');
  assert.deepEqual(slotEndFields({ time: '06:00 PM' }, sunday6pm, TZ), { endTime: null, endsAt: null });
});

// Series edits keep meetups whose date + start time still match; their end times
// must still follow the edited row.
const SUN = at('2026-10-12T00:00:00Z'); // Sun Oct 11, 6 PM MDT
const cand = (endTime) => [{ nextDate: SUN, dtEntry: { day: 0, time: '06:00 PM', ...(endTime !== undefined ? { endTime } : {}) } }];
const kept = (over = {}) => ({ _id: 'm1', date: SUN, time: '06:00 PM', endTime: '09:00 PM', isOverride: false, ...over });

test('buildEndTimeUpdates sets the new end on a kept meetup', () => {
  const ops = buildEndTimeUpdates([kept()], cand('10:00 PM'), TZ);
  assert.equal(ops.length, 1);
  assert.deepEqual(ops[0].updateOne.filter, { _id: 'm1' });
  assert.equal(ops[0].updateOne.update.$set.endTime, '10:00 PM');
  assert.equal(ops[0].updateOne.update.$set.endsAt.toISOString(), '2026-10-12T04:00:00.000Z');
});

test('buildEndTimeUpdates leaves unchanged meetups alone', () => {
  assert.deepEqual(buildEndTimeUpdates([kept()], cand('09:00 PM'), TZ), []);
  assert.deepEqual(buildEndTimeUpdates([kept({ endTime: null })], cand(), TZ), []);
});

test('buildEndTimeUpdates never touches individually edited meetups', () => {
  assert.deepEqual(buildEndTimeUpdates([kept({ isOverride: true, endTime: '11:00 PM' })], cand('10:00 PM'), TZ), []);
});

test('buildEndTimeUpdates clears the end when the row no longer has one', () => {
  const ops = buildEndTimeUpdates([kept()], cand(null), TZ);
  assert.deepEqual(ops[0].updateOne.update.$set, { endTime: null, endsAt: null });
});

test('buildEndTimeUpdates ignores meetups whose slot is gone', () => {
  assert.deepEqual(buildEndTimeUpdates([kept({ time: '07:00 PM' })], cand('10:00 PM'), TZ), []);
});

const weekly = (dayTimes) => [{ frequency: 'weekly', dayTimes, rules: [] }];

test('validateRoutineEndTimes reports the first bad row', () => {
  assert.equal(validateRoutineEndTimes(weekly([{ day: 0, time: '06:00 PM', endTime: '09:00 PM' }])), null);
  assert.equal(validateRoutineEndTimes(undefined), null);
  assert.equal(
    validateRoutineEndTimes(weekly([{ day: 0, time: '06:00 PM' }, { day: 2, time: '06:00 PM', endTime: '06:00 PM' }])),
    "End time can't be the same as the start time.",
  );
});

test('preserveLegacyEndTimes keeps an end time an old app does not know about', () => {
  const existing = weekly([{ day: 0, time: '06:00 PM', endTime: '09:00 PM' }]);
  const out = preserveLegacyEndTimes(weekly([{ day: 0, time: '06:00 PM' }]), existing);
  assert.equal(out[0].dayTimes[0].endTime, '09:00 PM');
});

test('preserveLegacyEndTimes drops the end when the start time moved', () => {
  const existing = weekly([{ day: 0, time: '06:00 PM', endTime: '09:00 PM' }]);
  const out = preserveLegacyEndTimes(weekly([{ day: 0, time: '07:00 PM' }]), existing);
  assert.equal(out[0].dayTimes[0].endTime, undefined);
});

test('preserveLegacyEndTimes respects an explicit clear', () => {
  const existing = weekly([{ day: 0, time: '06:00 PM', endTime: '09:00 PM' }]);
  const out = preserveLegacyEndTimes(weekly([{ day: 0, time: '06:00 PM', endTime: null }]), existing);
  assert.equal(out[0].dayTimes[0].endTime, null);
});

test('preserveLegacyEndTimes matches monthly rows by date', () => {
  const existing = [{ frequency: 'monthly', dayTimes: [{ date: 15, time: '06:00 PM', endTime: '08:00 PM' }] }];
  const out = preserveLegacyEndTimes([{ frequency: 'monthly', dayTimes: [{ date: 15, time: '06:00 PM' }, { date: 1, time: '06:00 PM' }] }], existing);
  assert.equal(out[0].dayTimes[0].endTime, '08:00 PM');
  assert.equal(out[0].dayTimes[1].endTime, undefined);
});

const meetupAt = (over = {}) => ({ time: '05:00 PM', startsAt: at('2026-10-06T23:00:00Z'), timezone: TZ, endTime: null, endsAt: null, ...over });

test('applyEndTimeEdit sets an end time', () => {
  const m = meetupAt();
  assert.deepEqual(applyEndTimeEdit(m, '08:00 PM'), { error: null, changed: true });
  assert.equal(m.endTime, '08:00 PM');
  assert.equal(m.endsAt.toISOString(), '2026-10-07T02:00:00.000Z');
});

test('applyEndTimeEdit clears with null or empty string', () => {
  for (const clear of [null, '']) {
    const m = meetupAt({ endTime: '08:00 PM', endsAt: at('2026-10-07T02:00:00Z') });
    assert.deepEqual(applyEndTimeEdit(m, clear), { error: null, changed: true });
    assert.equal(m.endTime, null);
    assert.equal(m.endsAt, null);
  }
});

test('applyEndTimeEdit without a new end keeps it but follows a moved start', () => {
  const m = meetupAt({ endTime: '08:00 PM', endsAt: at('2026-10-07T02:00:00Z'), startsAt: at('2026-10-07T23:00:00Z') });
  assert.deepEqual(applyEndTimeEdit(m, undefined), { error: null, changed: false });
  assert.equal(m.endTime, '08:00 PM');
  assert.equal(m.endsAt.toISOString(), '2026-10-08T02:00:00.000Z');
});

test('applyEndTimeEdit rejects an end equal to the start and changes nothing', () => {
  const m = meetupAt();
  assert.deepEqual(applyEndTimeEdit(m, '05:00 PM'), { error: "End time can't be the same as the start time.", changed: false });
  assert.equal(m.endTime, null);
});

test('applyEndTimeEdit catches a start moved onto the existing end', () => {
  const m = meetupAt({ time: '08:00 PM', endTime: '08:00 PM' });
  assert.equal(applyEndTimeEdit(m, undefined).error, "End time can't be the same as the start time.");
});

test('expiryFilter: past their end, or 1 hour after start when there is no end', () => {
  const now = at('2026-10-07T03:00:00Z');
  assert.deepEqual(expiryFilter(now), {
    status: 'scheduled',
    $or: [
      { endsAt: { $lte: now } },
      { endsAt: null, startsAt: { $lte: at('2026-10-07T02:00:00Z') } },
    ],
  });
});

test('isMeetupOver: RSVPs stay open until the end time, else 1 hour after start', () => {
  const startsAt = at('2026-10-06T23:00:00Z'); // 5 PM MDT
  const ninetyMinIn = at('2026-10-07T00:30:00Z');
  assert.equal(isMeetupOver({ startsAt, endsAt: at('2026-10-07T02:00:00Z') }, ninetyMinIn), false);
  assert.equal(isMeetupOver({ startsAt, endsAt: null }, ninetyMinIn), true);
  assert.equal(isMeetupOver({ date: startsAt }, ninetyMinIn), true); // old docs without startsAt
  assert.equal(isMeetupOver({ startsAt, endsAt: at('2026-10-07T02:00:00Z') }, at('2026-10-07T02:00:00Z')), true);
});
