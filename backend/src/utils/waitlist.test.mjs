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
