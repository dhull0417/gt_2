// Per-meetup settings (RSVP rules, minimum to meet, things to bring, rides) through the real
// create-one-off and edit-meetup handlers. Models are stubbed per test; pushes are captured.
// Run with: npm test (from backend/) -- needs --experimental-test-module-mocks.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';

const pushes = [];
const premium = { on: true };
mock.module('@clerk/express', {
  namedExports: {
    getAuth: (req) => ({ userId: req.clerkId }),
    clerkClient: {},
    createClerkClient: () => ({}),
    clerkMiddleware: () => (req, res, next) => next(),
  },
});
mock.module(new URL('../utils/push.notifications.js', import.meta.url).href, {
  namedExports: {
    notifyAndPersist: async (users, payload) => { pushes.push(payload); },
    notifyUsers: async () => {},
    sendPushNotifications: async () => {},
    tokensOf: () => [],
    inQuietHours: () => false,
    userWantsPush: () => true,
    isGroupMuted: () => false,
  },
});
mock.module(new URL('../utils/premium.js', import.meta.url).href, {
  namedExports: {
    hasPremium: () => premium.on,
    groupHasPremium: async () => premium.on,
    groupHasWaitlist: async () => true,
    serializeUser: (u) => u,
    withGroupPremium: async (m) => m,
  },
});

const { default: Meetup } = await import('../models/meetup.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: Group } = await import('../models/group.model.js');
const meetupCtrl = await import('./meetup.controller.js');
const groupCtrl = await import('./group.controller.js');

const TZ = 'America/Denver';
const q = (v) => { const c = { select: () => c, lean: () => c, populate: () => c, sort: () => c, then: (r, j) => Promise.resolve(v).then(r, j) }; return c; };
const person = (name) => ({ _id: new mongoose.Types.ObjectId(), clerkId: `c-${name}`, firstName: name });

let owner, member, users, group, doc, created;

// A day well in the future, at 6:00 PM in the group's timezone.
const day = (plusDays) => DateTime.now().setZone(TZ).plus({ days: plusDays }).startOf('day');
const at6 = (d) => d.set({ hour: 18 }).toJSDate();

const makeGroup = (scheduleOver = {}) => {
  const g = new Group({
    name: 'Hoops', timezone: TZ, owner: owner._id, members: users.map((u) => u._id),
    schedules: [{ name: 'Tuesdays', generationLeadDays: 3, generationLeadTime: '08:00 AM', generationDeadlineDays: 1, generationDeadlineTime: '08:00 PM', ...scheduleOver }],
  });
  g.save = async function save() { return this; };
  return g;
};

// A meetup doc whose `group` reads as the populated group (as .populate('group') gives).
const makeMeetup = (over = {}) => {
  const startsAt = at6(day(10));
  const m = new Meetup({
    group: group._id, name: 'Hoops', date: startsAt, startsAt, time: '06:00 PM', timezone: TZ,
    members: users.map((u) => u._id), capacity: 0, ...over,
  });
  Object.defineProperty(m, 'group', { value: group, writable: true });
  m.save = async function save() { return this; };
  return m;
};

beforeEach(() => {
  pushes.length = 0;
  premium.on = true;
  owner = person('Olive');
  member = person('Max');
  users = [owner, member];
  group = makeGroup();
  created = null;
  User.findOne = (f) => q(users.find((u) => u.clerkId === f.clerkId) ?? null);
  User.find = () => q(users);
  Group.findById = () => q(group);
  Meetup.findById = () => q(doc);
  Meetup.find = () => q([]);
  Meetup.create = async (data) => { created = new Meetup(data); return created; };
});

const call = async (handler, { as, params = {}, body = {} }) => {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let failure;
  await handler({ clerkId: as.clerkId, params, body, headers: {} }, res, (e) => { failure = e; });
  if (failure) throw failure;
  return res;
};
const createOneOff = (body, as = owner) => call(groupCtrl.createOneOffMeetup, { as, params: { groupId: String(group._id) }, body });
const update = (body, as = owner) => call(meetupCtrl.updateMeetup, { as, params: { meetupId: String(doc._id) }, body });

const baseCreate = () => ({ date: day(10).toISODate(), time: '06:00 PM', timezone: TZ, capacity: 0, location: 'Gym', description: '' });

// --- createOneOffMeetup ---

test('one-off with RSVP rules, a minimum and items saves them and its RSVP window', async () => {
  const res = await createOneOff({
    ...baseCreate(), rsvpLeadDays: 2, rsvpLeadTime: '09:00 AM', rsvpDeadlineDays: 0, rsvpDeadlineTime: '12:00 PM',
    minAttendees: 2, bringItems: [{ name: 'Ball' }], ridesEnabled: true,
  });
  assert.equal(res.code, 201);
  assert.equal(created.customSettings, true);
  assert.equal(created.minAttendees, 2);
  assert.deepEqual(created.bringItems.map((i) => i.name), ['Ball']);
  assert.equal(created.ridesEnabled, true);
  assert.equal(created.rsvpOpenDate.getTime(), day(8).set({ hour: 9 }).toMillis());
  assert.equal(created.rsvpCloseDate.getTime(), day(10).set({ hour: 12 }).toMillis());
  assert.equal(created.rsvpNotified, false);
  assert.equal(created.minimumChecked, false);
});

test('one-off without settings works as before', async () => {
  const res = await createOneOff(baseCreate());
  assert.equal(res.code, 201);
  assert.equal(created.customSettings, false);
  assert.equal(created.rsvpOpenDate ?? null, null);
  assert.equal(created.rsvpCloseDate ?? null, null);
});

test('one-off settings need Premium; plain RSVP rules do not', async () => {
  premium.on = false;
  let res = await createOneOff({ ...baseCreate(), bringItems: [{ name: 'Ball' }] });
  assert.equal(res.code, 403);
  assert.equal(created, null);
  res = await createOneOff({ ...baseCreate(), rsvpDeadlineDays: 1 });
  assert.equal(res.code, 201);
  assert.equal(created.rsvpCloseDate.getTime(), day(9).set({ hour: 9 }).toMillis());
});

test('one-off with a minimum but no latest RSVP time is refused', async () => {
  const res = await createOneOff({ ...baseCreate(), minAttendees: 3 });
  assert.equal(res.code, 400);
});

// --- updateMeetup ---

test('changing a series meetup\'s items marks it customized and copies the series RSVP rules onto it', async () => {
  const sched = group.schedules[0];
  doc = makeMeetup({ schedule: sched._id });
  const res = await update({ bringItems: [{ name: 'Water' }] });
  assert.equal(res.code, 200);
  assert.equal(doc.customSettings, true);
  assert.deepEqual(doc.bringItems.map((i) => i.name), ['Water']);
  assert.equal(doc.rsvpLeadDays, 3);
  assert.equal(doc.rsvpLeadTime, '08:00 AM');
  assert.equal(doc.rsvpDeadlineDays, 1);
  assert.equal(doc.rsvpDeadlineTime, '08:00 PM');
});

test('rescheduling a customized meetup moves its window by its own rules', async () => {
  const sched = group.schedules[0];
  doc = makeMeetup({ schedule: sched._id, customSettings: true, rsvpLeadDays: 2, rsvpLeadTime: '10:00 AM', rsvpDeadlineDays: 0, rsvpDeadlineTime: '05:00 PM' });
  const res = await update({ date: day(17).toISODate() });
  assert.equal(res.code, 200);
  assert.equal(doc.rsvpOpenDate.getTime(), day(15).set({ hour: 10 }).toMillis());
  assert.equal(doc.rsvpCloseDate.getTime(), day(17).set({ hour: 17 }).toMillis());
});

test('rescheduling an ordinary series meetup still uses the series rules', async () => {
  const sched = group.schedules[0];
  doc = makeMeetup({ schedule: sched._id });
  await update({ date: day(17).toISODate() });
  assert.equal(doc.rsvpOpenDate.getTime(), day(14).set({ hour: 8 }).toMillis());
  assert.equal(doc.rsvpCloseDate.getTime(), day(16).set({ hour: 20 }).toMillis());
  assert.equal(doc.customSettings, false);
});

test('changing only the RSVP rules recomputes the window and re-arms the minimum check', async () => {
  doc = makeMeetup({ customSettings: true, rsvpDeadlineDays: 9, minAttendees: 2, minimumChecked: true });
  const res = await update({ rsvpDeadlineDays: 0, rsvpDeadlineTime: '12:00 PM' });
  assert.equal(res.code, 200);
  assert.equal(doc.rsvpCloseDate.getTime(), day(10).set({ hour: 12 }).toMillis());
  assert.equal(doc.minimumChecked, false);
});

test('without Premium: location edits and clearing work, turning a minimum on does not', async () => {
  premium.on = false;
  doc = makeMeetup({ customSettings: true, rsvpDeadlineDays: 1, minAttendees: 2 });
  let res = await update({ location: 'Park' });
  assert.equal(res.code, 200);
  assert.equal(doc.location, 'Park');
  res = await update({ minAttendees: 0 });
  assert.equal(res.code, 200);
  assert.equal(doc.minAttendees, 0);
  res = await update({ minAttendees: 2 });
  assert.equal(res.code, 403);
  assert.equal(doc.minAttendees, 0);
});

test('a plain edit does not mark a series meetup customized', async () => {
  doc = makeMeetup({ schedule: group.schedules[0]._id });
  await update({ description: 'Bring water' });
  assert.equal(doc.customSettings, false);
});

test('members who are not managers or the creator cannot change settings', async () => {
  doc = makeMeetup();
  const res = await update({ ridesEnabled: true }, member);
  assert.equal(res.code, 403);
  assert.equal(doc.ridesEnabled, false);
});

// --- PUT /meetups/:meetupId/questions ---

const setQuestions = (body, as = owner) => call(meetupCtrl.updateMeetupQuestions, { as, params: { meetupId: String(doc._id) }, body });

test('a manager sets one meetup\'s questions; it becomes customized', async () => {
  doc = makeMeetup({ schedule: group.schedules[0]._id });
  const res = await setQuestions({ questions: [{ prompt: 'Shirt size?', type: 'text' }, { prompt: 'Diet?', type: 'choice', options: ['Veg', 'Any'] }] });
  assert.equal(res.code, 200);
  assert.deepEqual(doc.questions.map((x) => x.prompt), ['Shirt size?', 'Diet?']);
  assert.equal(doc.customSettings, true);
  assert.equal(doc.rsvpLeadDays, 3); // started from the series' RSVP rules
});

test('answers to a removed question are dropped; answers to kept ones stay', async () => {
  doc = makeMeetup({ customSettings: true, questions: [{ prompt: 'A?' }, { prompt: 'B?' }] });
  const [a, b] = doc.questions;
  doc.answers = [{ user: member._id, question: a._id, value: 'x' }, { user: member._id, question: b._id, value: 'y' }];
  const res = await setQuestions({ questions: [{ _id: String(a._id), prompt: 'A?' }] });
  assert.equal(res.code, 200);
  assert.equal(doc.answers.length, 1);
  assert.equal(String(doc.answers[0].question), String(a._id));
});

test('questions: limits, Premium, permission and past meetups', async () => {
  doc = makeMeetup();
  let res = await setQuestions({ questions: Array.from({ length: 6 }, (_, i) => ({ prompt: `Q${i}?` })) });
  assert.equal(res.code, 400);
  premium.on = false;
  res = await setQuestions({ questions: [{ prompt: 'Q?' }] });
  assert.equal(res.code, 403);
  assert.equal(res.body.error, 'premium_required');
  res = await setQuestions({ questions: [] });
  assert.equal(res.code, 200);
  premium.on = true;
  res = await setQuestions({ questions: [{ prompt: 'Q?' }] }, member);
  assert.equal(res.code, 403);
  doc = makeMeetup({ date: new Date(Date.now() - 864e5) });
  res = await setQuestions({ questions: [{ prompt: 'Q?' }] });
  assert.equal(res.code, 400);
});

test('changing settings without rescheduling does not re-send RSVP reminders already sent', async () => {
  doc = makeMeetup({ schedule: group.schedules[0]._id, rsvpReminderStagesSent: ['24h'] });
  await update({ bringItems: [{ name: 'Water' }] });
  assert.deepEqual([...doc.rsvpReminderStagesSent], ['24h']);
  await update({ rsvpDeadlineDays: 0 });
  assert.deepEqual([...doc.rsvpReminderStagesSent], ['24h']);
});
