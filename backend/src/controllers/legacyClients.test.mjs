import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollForClient, LEGACY_NO_END } from './poll.controller.js';
import { appVersionUpdate } from './user.controller.js';

test('pollForClient gives old apps an end date for no-end polls and leaves everything else alone', () => {
  const noEnd = { _id: 'p1', prompt: 'Pizza?', expiresAt: null };
  assert.equal(pollForClient(noEnd, true).expiresAt, LEGACY_NO_END);
  assert.equal(pollForClient(noEnd, false).expiresAt, null);
  const dated = { _id: 'p2', expiresAt: '2026-11-01T00:00:00.000Z' };
  assert.equal(pollForClient(dated, true).expiresAt, '2026-11-01T00:00:00.000Z');
  assert.equal(pollForClient(null, true), null);
});

test('appVersionUpdate records versions, throttled to every 6 hours', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  const hourAgo = new Date('2026-11-01T11:00:00Z');
  const dayAgo = new Date('2026-10-31T12:00:00Z');
  // Old app: only the "last seen" time, and not more often than every 6 hours.
  assert.deepEqual(appVersionUpdate({}, { version: null, isLegacy: true }, now), { legacyAppSeenAt: now });
  assert.equal(appVersionUpdate({ legacyAppSeenAt: hourAgo }, { version: null, isLegacy: true }, now), null);
  // New app: version changes are written right away, the same version at most every 6 hours.
  assert.deepEqual(
    appVersionUpdate({ appVersion: '1.4.1', appVersionSeenAt: hourAgo }, { version: '1.4.2', isLegacy: false }, now),
    { appVersion: '1.4.2', appVersionSeenAt: now }
  );
  assert.equal(appVersionUpdate({ appVersion: '1.4.2', appVersionSeenAt: hourAgo }, { version: '1.4.2', isLegacy: false }, now), null);
  assert.deepEqual(
    appVersionUpdate({ appVersion: '1.4.2', appVersionSeenAt: dayAgo }, { version: '1.4.2', isLegacy: false }, now),
    { appVersion: '1.4.2', appVersionSeenAt: now }
  );
  assert.equal(appVersionUpdate({}, undefined, now), null);
});
