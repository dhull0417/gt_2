import test from 'node:test';
import assert from 'node:assert/strict';
import { MUTE_KINDS, kindOf, isMutedFor } from './groupMute.js';

const G = '64b000000000000000000001';
const OTHER = '64b000000000000000000002';
const oid = (s) => ({ toString: () => s }); // ObjectId-like

test('MUTE_KINDS lists the seven kinds in UI order', () => {
  assert.deepEqual(MUTE_KINDS, ['chat', 'rsvps', 'changes', 'cancellations', 'reminders', 'polls', 'groupUpdates']);
});

test('kindOf maps every notification type to its kind', () => {
  const table = {
    chat: 'chat',
    'meetup-rsvp-in': 'rsvps', 'meetup-rsvp-out': 'rsvps', 'meetup-waitlist-join': 'rsvps',
    'meetup-created': 'changes', 'meetup-updated': 'changes', 'meetup-restored': 'changes', 'schedule-removed': 'changes', 'schedule-updated': 'changes',
    'meetup-cancelled': 'cancellations',
    'meetup-rsvp-reminder': 'reminders', 'meetup-rsvp-open': 'reminders', 'meetup-starting-soon': 'reminders',
    'poll-created': 'polls', 'poll-closed': 'polls',
    'group-updated': 'groupUpdates', 'group-member-joined': 'groupUpdates',
  };
  for (const [type, kind] of Object.entries(table)) assert.equal(kindOf(type), kind, type);
});

test('never-muted and unknown types have no kind and are never muted', () => {
  const user = { groupMutes: [{ group: G, until: 'indefinite', mutedTypes: [...MUTE_KINDS] }], mutedGroups: [G] };
  for (const type of ['group-invite', 'group-added', 'group-removed', 'group-deleted', 'ownership-transferred',
    'waitlist-promotion', 'priority-bumped', 'meetup-rsvp-admin-in', 'meetup-rsvp-admin-out', 'something-new', undefined]) {
    assert.equal(kindOf(type), null, String(type));
    assert.equal(isMutedFor(user, G, type, { muteAll: true }), false, String(type));
  }
});

test('a groupMutes entry mutes only its kinds, whatever the flag', () => {
  const user = { groupMutes: [{ group: oid(G), until: 'indefinite', mutedTypes: ['chat'] }] };
  for (const muteAll of [true, false]) {
    assert.equal(isMutedFor(user, G, 'chat', { muteAll }), true);
    assert.equal(isMutedFor(user, G, 'meetup-cancelled', { muteAll, aboutNextMeetup: true }), false);
    assert.equal(isMutedFor(user, G, 'meetup-rsvp-in', { muteAll }), false);
  }
  assert.equal(isMutedFor(user, OTHER, 'chat', { muteAll: true }), false);
});

test('an entry wins over the legacy lists', () => {
  const user = { groupMutes: [{ group: G, until: 'indefinite', mutedTypes: ['polls'] }], mutedGroups: [G] };
  assert.equal(isMutedFor(user, G, 'chat', { muteAll: true }), false);
  assert.equal(isMutedFor(user, G, 'poll-created', { muteAll: false }), true);
});

for (const list of ['mutedGroups', 'mutedUntilNextMeetup']) {
  test(`legacy ${list} only: chat and reminders always muted, others follow the flag`, () => {
    const user = { [list]: [oid(G)] };
    assert.equal(isMutedFor(user, G, 'chat', { muteAll: false }), true);
    assert.equal(isMutedFor(user, G, 'meetup-starting-soon', { muteAll: false }), true);
    assert.equal(isMutedFor(user, G, 'meetup-rsvp-reminder', { muteAll: false }), true);
    assert.equal(isMutedFor(user, G, 'meetup-updated', { muteAll: false }), false);
    assert.equal(isMutedFor(user, G, 'meetup-updated', { muteAll: false, aboutNextMeetup: true }), true);
    assert.equal(isMutedFor(user, G, 'meetup-updated', { muteAll: true }), true);
    assert.equal(isMutedFor(user, G, 'poll-created', { muteAll: true }), true);
  });
}

test('no mute → never muted', () => {
  assert.equal(isMutedFor({}, G, 'chat', { muteAll: true }), false);
  assert.equal(isMutedFor({ groupMutes: [], mutedGroups: [] }, G, 'chat', { muteAll: true }), false);
  assert.equal(isMutedFor(null, G, 'chat'), false);
  assert.equal(isMutedFor({ mutedGroups: [G] }, null, 'chat'), false);
});

// --- Task 2: storing a mute ---------------------------------------------------
import { applyMuteChange } from './groupMute.js';

const fresh = () => ({ groupMutes: [], mutedGroups: [], mutedUntilNextMeetup: [] });
const ids = (list) => list.map(String);

test('applyMuteChange: no kinds given = full mute, mirrored to the legacy list', () => {
  const u = fresh();
  applyMuteChange(u, G, 'untilNext');
  assert.equal(u.groupMutes.length, 1);
  assert.equal(String(u.groupMutes[0].group), G);
  assert.equal(u.groupMutes[0].until, 'nextMeetup');
  assert.deepEqual(u.groupMutes[0].mutedTypes, MUTE_KINDS);
  assert.ok(u.groupMutes[0].updatedAt instanceof Date);
  assert.deepEqual(ids(u.mutedUntilNextMeetup), [G]);
  assert.deepEqual(ids(u.mutedGroups), []);

  applyMuteChange(u, G, 'indefinite', [...MUTE_KINDS].reverse());
  assert.equal(u.groupMutes[0].until, 'indefinite');
  assert.deepEqual(u.groupMutes[0].mutedTypes, MUTE_KINDS, 'stored in canonical order');
  assert.deepEqual(ids(u.mutedGroups), [G]);
  assert.deepEqual(ids(u.mutedUntilNextMeetup), []);
});

test('applyMuteChange: a partial mute is never in a legacy list', () => {
  const u = fresh();
  applyMuteChange(u, G, 'indefinite'); // full first
  applyMuteChange(u, G, 'indefinite', ['chat', 'polls', 'chat']);
  assert.equal(u.groupMutes.length, 1, 'one entry per group');
  assert.deepEqual(u.groupMutes[0].mutedTypes, ['chat', 'polls']);
  assert.deepEqual(ids(u.mutedGroups), []);
  assert.deepEqual(ids(u.mutedUntilNextMeetup), []);
});

test('applyMuteChange: none, or a duration with no kinds, removes the mute', () => {
  for (const [muteType, kinds] of [['none', undefined], ['indefinite', []], ['untilNext', []]]) {
    const u = fresh();
    applyMuteChange(u, OTHER, 'indefinite', ['chat']);
    applyMuteChange(u, G, 'indefinite');
    applyMuteChange(u, G, muteType, kinds);
    assert.deepEqual(u.groupMutes.map((m) => String(m.group)), [OTHER], `${muteType} ${kinds}`);
    assert.deepEqual(ids(u.mutedGroups), []);
  }
});

test('applyMuteChange: unknown kinds or a bad list are a 400', () => {
  for (const bad of [['bogus'], 'chat', [1]]) {
    assert.throws(() => applyMuteChange(fresh(), G, 'indefinite', bad), (e) => e.status === 400, JSON.stringify(bad));
  }
});

test('applyMuteChange: works when the user has no mute fields yet', () => {
  const u = {};
  applyMuteChange(u, G, 'indefinite', ['chat']);
  assert.deepEqual(u.groupMutes.map((m) => m.mutedTypes), [['chat']]);
});

// --- Task 4: clearing "until next meetup" mutes --------------------------------
import { clearNextMeetupMutesUpdate } from './groupMute.js';

test('clearNextMeetupMutesUpdate pulls only nextMeetup entries (and the legacy list) for those groups', () => {
  const { filter, update } = clearNextMeetupMutesUpdate([G, OTHER]);
  assert.deepEqual(filter, {
    $or: [
      { mutedUntilNextMeetup: { $in: [G, OTHER] } },
      { groupMutes: { $elemMatch: { group: { $in: [G, OTHER] }, until: 'nextMeetup' } } },
    ],
  });
  assert.deepEqual(update, {
    $pull: {
      mutedUntilNextMeetup: { $in: [G, OTHER] },
      groupMutes: { group: { $in: [G, OTHER] }, until: 'nextMeetup' },
    },
  });
});
