import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/user.model.js';
import { withLiveDmParticipants } from './group.controller.js';

const stubUsers = (users) => {
  User.find = () => ({ select: () => ({ lean: async () => users }) });
};

test('withLiveDmParticipants replaces stale DM names and adds the current photo', async () => {
  stubUsers([{ clerkId: 'u1', firstName: 'Ann', lastName: 'Lee', profilePicture: 'https://img/ann.jpg' }]);
  const groups = [
    { _id: 'g1', isDM: true, name: 'Old Name & Bob', dmParticipants: [{ userId: 'u1', name: 'Old Name' }, { userId: 'u2', name: 'Bob' }] },
  ];
  const [dm] = await withLiveDmParticipants(groups);
  assert.deepEqual(dm.dmParticipants[0], { userId: 'u1', name: 'Ann Lee', profilePicture: 'https://img/ann.jpg' });
  // Someone who no longer exists keeps the name that was stored.
  assert.deepEqual(dm.dmParticipants[1], { userId: 'u2', name: 'Bob' });
});

test('withLiveDmParticipants leaves ordinary groups alone and skips the lookup when there are no DMs', async () => {
  let called = false;
  User.find = () => { called = true; return { select: () => ({ lean: async () => [] }) }; };
  const groups = [{ _id: 'g2', isDM: false, name: 'Hikers' }];
  const out = await withLiveDmParticipants(groups);
  assert.equal(out, groups);
  assert.equal(called, false);
});
