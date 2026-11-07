import test from 'node:test';
import assert from 'node:assert/strict';
import { headcountOf } from './waitlist.js';

test('headcountOf counts people who are In plus their guests', () => {
  const meetup = {
    in: ['u1', 'u2', 'u3'],
    guests: [{ userId: 'c1', count: 2 }, { userId: 'c9', count: 5 }], // c9 is not In, so doesn't count
  };
  const clerk = new Map([['u1', 'c1'], ['u2', 'c2'], ['u3', 'c3']]);
  assert.equal(headcountOf(meetup, clerk), 5);
  assert.equal(headcountOf({ in: [], guests: [] }, new Map()), 0);
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
