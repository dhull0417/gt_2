import test from 'node:test';
import assert from 'node:assert/strict';
import { tokensOf, inQuietHours, userWantsPush, isGroupMuted } from './push.notifications.js';

test('tokensOf merges the latest token with the device list, without duplicates', () => {
  assert.deepEqual(tokensOf({ expoPushToken: 'a', expoPushTokens: ['b', 'a'] }), ['a', 'b']);
  assert.deepEqual(tokensOf({}), []);
});

test('inQuietHours handles ranges that cross midnight, in the member\'s own timezone', () => {
  const user = { timezone: 'America/Denver', notificationPrefs: { quietHours: { enabled: true, start: '10:00 PM', end: '08:00 AM' } } };
  // 2026-07-01 05:00 UTC = 23:00 in Denver (MDT, UTC-6)
  assert.equal(inQuietHours(user, new Date('2026-07-01T05:00:00Z')), true);
  // 2026-07-01 17:00 UTC = 11:00 in Denver
  assert.equal(inQuietHours(user, new Date('2026-07-01T17:00:00Z')), false);
  assert.equal(inQuietHours({ notificationPrefs: { quietHours: { enabled: false } } }, new Date()), false);
});

test('userWantsPush respects the per-type switch and quiet hours (with exemptions)', () => {
  const night = new Date('2026-07-01T05:00:00Z');
  const user = {
    timezone: 'America/Denver',
    notificationPrefs: { polls: false, quietHours: { enabled: true, start: '10:00 PM', end: '08:00 AM' } },
  };
  assert.equal(userWantsPush(user, 'poll-created', new Date('2026-07-01T17:00:00Z')), false); // polls off
  assert.equal(userWantsPush(user, 'meetup-created', night), false); // quiet hours
  assert.equal(userWantsPush(user, 'meetup-cancelled', night), true); // exempt
  assert.equal(userWantsPush({}, 'meetup-rsvp-in', night), true); // no prefs = everything on
});

test('isGroupMuted covers both mute kinds', () => {
  assert.equal(isGroupMuted({ mutedGroups: ['g1'] }, 'g1'), true);
  assert.equal(isGroupMuted({ mutedUntilNextMeetup: ['g1'] }, 'g1'), true);
  assert.equal(isGroupMuted({ mutedGroups: ['g2'] }, 'g1'), false);
});
