import test from 'node:test';
import assert from 'node:assert/strict';
import { headcountOf } from './waitlist.js';

test('headcountOf counts people who are In plus every guest, whatever their host did', () => {
  const meetup = {
    in: ['u1', 'u2', 'u3'],
    // c9's host is Out (kept their guests) or waitlisted: those guests still hold their spots
    guests: [{ userId: 'c1', count: 2 }, { userId: 'c9', count: 5 }, { userId: 'c0', count: 0 }],
  };
  const clerk = new Map([['u1', 'c1'], ['u2', 'c2'], ['u3', 'c3']]);
  assert.equal(headcountOf(meetup, clerk), 10);
  assert.equal(headcountOf({ in: [], guests: [] }, new Map()), 0);
  assert.equal(headcountOf({ in: ['u1'] }, new Map()), 1);
});

test('guestRoom: an Out host with kept guests is changing them, not adding to them', async () => {
  const { guestRoom } = await import('./waitlist.js');
  const clerk = new Map();
  // capacity 6: 3 In + the Out host's 2 kept guests = 5 used
  const meetup = { capacity: 6, in: ['u1', 'u2', 'u3'], guests: [{ userId: 'c-out', count: 2 }] };
  // the host's own spot is reserved too: 6 - (5 - 2 + 1) = 2 room for guests
  assert.deepEqual(guestRoom(meetup, clerk, { hostId: 'out', hostClerkId: 'c-out', nextCount: 2 }), { ok: true, room: 2 });
  assert.deepEqual(guestRoom(meetup, clerk, { hostId: 'out', hostClerkId: 'c-out', nextCount: 3 }), { ok: false, room: 2 });
  // someone else's guests: 6 - (5 + 1) = 0
  assert.deepEqual(guestRoom(meetup, clerk, { hostId: 'x', hostClerkId: 'c-x', nextCount: 1 }), { ok: false, room: 0 });
});

test('guestRoom refuses guests beyond open spots whether or not the host is In', async () => {
  const { guestRoom } = await import('./waitlist.js');
  const ids = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'host'];
  const clerk = new Map(ids.map((id) => [id, `c-${id}`]));
  clerk.set('out', 'c-out');
  // capacity 8, the host plus 6 others In, nobody has guests: 1 spot left
  const meetup = { capacity: 8, in: ids, guests: [] };
  assert.deepEqual(guestRoom(meetup, clerk, { hostId: 'host', hostClerkId: 'c-host', nextCount: 1 }), { ok: true, room: 1 });
  assert.deepEqual(guestRoom(meetup, clerk, { hostId: 'host', hostClerkId: 'c-host', nextCount: 2 }), { ok: false, room: 1 });

  // host is Out; 7 others In: the last spot would be the host's own, so no room for guests
  const outMeetup = { capacity: 8, in: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'], guests: [] };
  clerk.set('u7', 'c-u7');
  assert.deepEqual(guestRoom(outMeetup, clerk, { hostId: 'out', hostClerkId: 'c-out', nextCount: 1 }), { ok: false, room: 0 });

  // the host's existing guests are replaced, not added to
  const withGuests = { capacity: 8, in: ['u1', 'u2', 'u3', 'u4', 'host'], guests: [{ userId: 'c-host', count: 2 }] };
  assert.deepEqual(guestRoom(withGuests, clerk, { hostId: 'host', hostClerkId: 'c-host', nextCount: 3 }), { ok: true, room: 3 });

  // capacity 0 means unlimited
  assert.equal(guestRoom({ capacity: 0, in: ids, guests: [] }, clerk, { hostId: 'host', hostClerkId: 'c-host', nextCount: 40 }).ok, true);
});

test('canEditGuestsOf: the host, the owner, or a moderator over a regular member', async () => {
  const { canEditGuestsOf } = await import('./waitlist.js');
  const group = { owner: 'owner', moderators: ['mod', 'mod2'], members: ['owner', 'mod', 'mod2', 'm1', 'm2'] };
  assert.equal(canEditGuestsOf('m1', 'm1', group), true);      // own guests
  assert.equal(canEditGuestsOf('owner', 'm1', group), true);   // owner on a member
  assert.equal(canEditGuestsOf('owner', 'mod', group), true);  // owner on a moderator
  assert.equal(canEditGuestsOf('mod', 'm1', group), true);     // moderator on a member
  assert.equal(canEditGuestsOf('mod', 'owner', group), false); // moderator on the owner
  assert.equal(canEditGuestsOf('mod', 'mod2', group), false);  // moderator on another moderator
  assert.equal(canEditGuestsOf('m2', 'm1', group), false);     // member on someone else
});
