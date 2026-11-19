// Series edits leave a meetup's own settings alone once it has them (customSettings).
// Meetup queries run against an in-memory list with a small filter matcher.
// Run with: npm test (needs --experimental-test-module-mocks).
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';

mock.module(new URL('./premium.js', import.meta.url).href, {
  namedExports: {
    hasPremium: () => true,
    groupHasPremium: async () => true,
    groupHasWaitlist: async () => true,
    serializeUser: (u) => u,
    withGroupPremium: async (m) => m,
  },
});

const { default: Meetup } = await import('../models/meetup.model.js');
const { default: Group } = await import('../models/group.model.js');
const { refreshOverrideMeetupWindows, refreshOverrideAssignments } = await import('./meetupGeneration.js');
const { refreshSeriesQuestions } = await import('./rsvpQuestions.js');
const { refreshPriorityTiers } = await import('./priorityRsvp.js');

const TZ = 'America/Denver';
const id = () => new mongoose.Types.ObjectId();

const matches = (doc, filter) => Object.entries(filter).every(([k, cond]) => {
  const v = doc[k];
  if (cond && typeof cond === 'object' && !(cond instanceof mongoose.Types.ObjectId) && !(cond instanceof Date)) {
    if ('$ne' in cond && v === cond.$ne) return false;
    if ('$gte' in cond && !(new Date(v) >= new Date(cond.$gte))) return false;
    if ('$in' in cond && !cond.$in.map(String).includes(String(v))) return false;
    return true;
  }
  return String(v) === String(cond);
});

let store, group, schedule;
const q = (v) => { const c = { select: () => c, lean: () => c, populate: () => c, sort: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };

beforeEach(() => {
  const owner = id();
  const a = id();
  group = new Group({
    name: 'Hoops', timezone: TZ, owner, members: [owner, a],
    schedules: [{
      name: 'Tuesdays', generationLeadDays: 3, generationDeadlineDays: 1, defaultMinAttendees: 4,
      defaultBringItems: [{ name: 'Ball' }], defaultRidesEnabled: true,
      defaultQuestions: [{ prompt: 'Shirt size?', type: 'text' }],
      priorityEnabled: true, priorityOrder: [a], priorityTiers: [{ size: 1, windowMinutes: 60 }],
    }],
  });
  schedule = group.schedules[0];
  const startsAt = DateTime.now().setZone(TZ).plus({ days: 10 }).startOf('day').set({ hour: 18 }).toJSDate();
  const base = { group: group._id, schedule: schedule._id, status: 'scheduled', date: startsAt, startsAt, timezone: TZ, isOverride: true };
  const mine = id();
  store = [
    { _id: id(), ...base, customSettings: false, bringItems: [], bringClaims: [], rides: [], answers: [] },
    {
      _id: id(), ...base, customSettings: true, minAttendees: 0,
      rsvpLeadDays: 1, rsvpLeadTime: '09:00 AM', rsvpDeadlineDays: null, rsvpOpenDate: null, rsvpCloseDate: null,
      bringItems: [{ _id: mine, name: 'Cake', max: null }], bringClaims: [{ user: a, item: mine }],
      ridesEnabled: false, rides: [], questions: [], answers: [],
    },
  ];
  Meetup.findOne = () => q(null);
  Meetup.findById = () => q(null);
  Meetup.find = (filter) => q(store.filter((m) => matches(m, filter)));
  Meetup.bulkWrite = async (ops) => {
    for (const { updateOne } of ops) {
      const m = store.find((x) => String(x._id) === String(updateOne.filter._id));
      if (m && matches(m, updateOne.filter)) Object.assign(m, updateOne.update.$set);
    }
  };
});

const [plain, custom] = [0, 1];

test('RSVP windows and minimum: only the ordinary meetup follows the series', async () => {
  await refreshOverrideMeetupWindows(group, schedule, { includeSeries: true });
  assert.equal(store[plain].minAttendees, 4);
  assert.ok(store[plain].rsvpCloseDate);
  assert.equal(store[custom].minAttendees, 0);
  assert.equal(store[custom].rsvpCloseDate, null);
});

test('items and rides: the customized meetup keeps its own (and its claims)', async () => {
  await refreshOverrideAssignments(group, schedule, { includeSeries: true });
  assert.deepEqual(store[plain].bringItems.map((i) => i.name), ['Ball']);
  assert.equal(store[plain].ridesEnabled, true);
  assert.deepEqual(store[custom].bringItems.map((i) => i.name), ['Cake']);
  assert.equal(store[custom].bringClaims.length, 1);
  assert.equal(store[custom].ridesEnabled, false);
});

test('questions: the customized meetup keeps its own', async () => {
  await refreshSeriesQuestions(group, schedule);
  assert.deepEqual(store[plain].questions.map((x) => x.prompt), ['Shirt size?']);
  assert.deepEqual(store[custom].questions, []);
});

test('priority groups on a customized meetup open from its own RSVP time', async () => {
  await refreshPriorityTiers(group, schedule);
  const ownOpen = DateTime.fromJSDate(store[custom].startsAt).setZone(TZ).minus({ days: 1 }).set({ hour: 9 }).toMillis();
  assert.equal(new Date(store[custom].priorityTiers[0].opensAt).getTime(), ownOpen);
  const seriesOpen = DateTime.fromJSDate(store[plain].startsAt).setZone(TZ).minus({ days: 3 }).set({ hour: 9 }).toMillis();
  assert.equal(new Date(store[plain].priorityTiers[0].opensAt).getTime(), seriesOpen);
});
