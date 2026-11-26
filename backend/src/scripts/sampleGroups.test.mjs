// The pieces of scripts/deleteSampleGroups.js that decide what to delete and report it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSampleGroups, summarize, deleteAll } from './sampleGroups.js';

const g = (id, members) => ({ _id: id, owner: 'o', members });

test('findSampleGroups asks the raw collection for isDemo: true (the schema no longer has the field)', async () => {
  let seen;
  const collection = { find: (filter) => { seen = filter; return { toArray: async () => [g('a', ['o'])] }; } };
  const found = await findSampleGroups(collection);
  assert.deepEqual(seen, { isDemo: true });
  assert.deepEqual(found.map((x) => x._id), ['a']);
});

test('summarize counts groups, ones with members besides the owner, and meetups', () => {
  const groups = [g('a', ['o']), g('b', ['o', 'x']), g('c', ['o'])];
  assert.deepEqual(summarize(groups, { a: 1, b: 4 }), { groups: 3, withOtherMembers: 1, meetups: 5 });
});

test('deleteAll deletes every group and carries on past a failure', async () => {
  const done = [];
  const lines = [];
  const result = await deleteAll(
    [g('a', ['o']), g('b', ['o']), g('c', ['o'])],
    async (group) => { if (group._id === 'b') throw new Error('boom'); done.push(group._id); },
    (line) => lines.push(line),
  );
  assert.deepEqual(done, ['a', 'c']);
  assert.equal(result.deleted, 2);
  assert.deepEqual(result.failed, [{ id: 'b', error: 'boom' }]);
  assert.equal(lines.length, 3);
});
