import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRsvpWindow, parseRsvpRules } from './meetupSettings.js';

const startsAt = new Date('2026-12-11T01:00:00Z'); // Dec 10, 6:00 PM in Denver

test('computeRsvpWindow: days before at a time, in the meetup timezone', () => {
  const w = computeRsvpWindow({
    startsAt, timezone: 'America/Denver',
    rules: { leadDays: 2, leadTime: '09:00 AM', deadlineDays: 0, deadlineTime: '12:00 PM' },
  });
  assert.equal(w.rsvpOpenDate.toISOString(), '2026-12-08T16:00:00.000Z');
  assert.equal(w.rsvpCloseDate.toISOString(), '2026-12-10T19:00:00.000Z');
});

test('computeRsvpWindow: no rules means no window', () => {
  const w = computeRsvpWindow({ startsAt, timezone: 'America/Denver', rules: { leadDays: null, leadTime: '09:00 AM', deadlineDays: null, deadlineTime: '09:00 AM' } });
  assert.equal(w.rsvpOpenDate, null);
  assert.equal(w.rsvpCloseDate, null);
});

test('parseRsvpRules: omitted fields stay omitted', () => {
  assert.deepEqual(parseRsvpRules({}), { rules: {} });
  assert.deepEqual(parseRsvpRules({ rsvpDeadlineDays: 1 }), { rules: { deadlineDays: 1 } });
  assert.deepEqual(parseRsvpRules({ rsvpLeadDays: null }), { rules: { leadDays: null } });
});

test('parseRsvpRules: earliest must come before latest', () => {
  assert.equal(parseRsvpRules({ rsvpLeadDays: 0, rsvpDeadlineDays: 1 }).error, 'The earliest time to RSVP must be before the latest.');
  assert.equal(
    parseRsvpRules({ rsvpLeadDays: 1, rsvpLeadTime: '05:00 PM', rsvpDeadlineDays: 1, rsvpDeadlineTime: '09:00 AM' }).error,
    'The earliest time to RSVP must be before the latest.',
  );
  assert.equal(parseRsvpRules({ rsvpLeadDays: 1, rsvpLeadTime: '09:00 AM', rsvpDeadlineDays: 1, rsvpDeadlineTime: '05:00 PM' }).error, undefined);
});

test('parseRsvpRules: bad days and times', () => {
  assert.equal(parseRsvpRules({ rsvpLeadDays: 366 }).error, 'Days must be from 0 to 365.');
  assert.equal(parseRsvpRules({ rsvpDeadlineDays: 1.5 }).error, 'Days must be from 0 to 365.');
  assert.equal(parseRsvpRules({ rsvpLeadTime: '25:00' }).error, 'Times must look like "09:00 AM".');
});

test('parseRsvpRules: compares against existing rules when only one side is sent', () => {
  const existing = { leadDays: 0, leadTime: '09:00 AM', deadlineDays: null, deadlineTime: '09:00 AM' };
  assert.equal(parseRsvpRules({ rsvpDeadlineDays: 2 }, existing).error, 'The earliest time to RSVP must be before the latest.');
});
