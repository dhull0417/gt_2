// reconcileScheduleMeetups against a stubbed Meetup model: which meetups an end-date edit removes.
// Run with: npm test (needs --experimental-test-module-mocks).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const calls = { find: [], deleteMany: [] };
let upcoming = [];
const chain = (rows) => ({ select: () => ({ lean: async () => rows }) });
mock.module(new URL('../models/meetup.model.js', import.meta.url).href, {
  defaultExport: {
    find: (filter) => { calls.find.push(filter); return chain(upcoming.filter((m) => filter.isOverride === undefined || m.isOverride === filter.isOverride)); },
    deleteMany: async (filter) => { calls.deleteMany.push(filter); },
    updateMany: async () => {},
    bulkWrite: async () => {},
  },
});
mock.module(new URL('./tournament/cleanup.js', import.meta.url).href, {
  namedExports: { deleteUnfinishedTournaments: async () => {} },
});

const { reconcileScheduleMeetups } = await import('./meetupGeneration.js');

test('Delete removes regular meetups after the end date but never hand-edited ones', async () => {
  const later = new Date(Date.now() + 40 * 86400000);
  upcoming = [
    { _id: 'regular', date: later, time: '06:00 PM', isOverride: false },
    { _id: 'edited', date: later, time: '07:00 PM', isOverride: true },
  ];
  const yesterday = new Date(Date.now() - 86400000);
  const schedule = { _id: 's1', routines: [], endDate: new Date(yesterday.toISOString().slice(0, 10) + 'T00:00:00Z') };
  await reconcileScheduleMeetups({ _id: 'g1', timezone: 'America/Denver' }, schedule, { removeAfterEnd: true });
  assert.equal(calls.find[0].isOverride, false);
  assert.deepEqual(calls.deleteMany.at(-1), { _id: { $in: ['regular'] } });
});
