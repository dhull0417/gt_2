// Run with: npm test (from backend/)  -- needs --experimental-test-module-mocks, which the npm script sets.
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.PREMIUM_TEST_CLERK_IDS = "user_test_premium";

const notifyCalls = [];
let notifyShouldFail = false;
mock.module(new URL("./push.notifications.js", import.meta.url).href, {
  namedExports: {
    notifyAndPersist: async (users, payload) => {
      notifyCalls.push({ users, payload });
      if (notifyShouldFail) throw new Error("push down");
    },
  },
});

const MH = await import("./minimumHeadcount.js");
const { default: Meetup } = await import("../models/meetup.model.js");
const { default: Group } = await import("../models/group.model.js");
const { default: User } = await import("../models/user.model.js");

// A query-ish object: chainable .select/.lean, and awaitable.
const chain = (value) => {
  const c = { select: () => c, lean: async () => value, then: (res, rej) => Promise.resolve(value).then(res, rej) };
  return c;
};

let state, updates;
const setup = (over = {}) => {
  state = {
    claimed: { _id: "m1", group: "g1", name: "Pickup", date: new Date("2026-10-10T18:00:00Z"), timezone: "America/Denver",
      minAttendees: 3, in: ["u1", "u2"], members: ["u1", "u2", "u3"],
      guests: [], ...over.meetup },
    ownerPremium: over.ownerPremium ?? true,
    inUsers: [{ _id: "u1", clerkId: "c1" }, { _id: "u2", clerkId: "c2" }],
    members: [{ _id: "u1", expoPushToken: "t1" }, { _id: "u2" }, { _id: "u3" }],
  };
};

beforeEach(() => {
  notifyCalls.length = 0;
  notifyShouldFail = false;
  updates = [];
  setup();
  Meetup.findOneAndUpdate = () => chain(state.claimed);
  Meetup.updateOne = async (filter, update) => { updates.push({ filter, update }); };
  Group.findById = () => chain({ owner: "owner1" });
  User.findById = () => chain({ clerkId: "owner", premium: state.ownerPremium ? { active: true } : { active: false } });
  User.find = (q) => (q?._id?.$in === state.claimed.in ? chain(state.inUsers) : chain(state.members));
});

test("dueForMinimumCheck: only scheduled, unchecked, past-deadline, future meetups with a minimum", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  const q = MH.dueForMinimumCheck({ group: "g1" }, now);
  assert.equal(q.group, "g1");
  assert.equal(q.status, "scheduled");
  assert.deepEqual(q.minAttendees, { $gt: 0 });
  assert.equal(q.minimumChecked, false);
  assert.deepEqual(q.rsvpCloseDate, { $lte: now });
  assert.deepEqual(q.startsAt, { $gte: now });
});

test("evaluateMinimumHeadcount: a meetup someone else already claimed is skipped", async () => {
  state.claimed = null;
  assert.equal(await MH.evaluateMinimumHeadcount("m1"), "skipped");
  assert.equal(updates.length, 0);
});

test("evaluateMinimumHeadcount: groups whose owner lost Premium are never cancelled", async () => {
  setup({ ownerPremium: false });
  assert.equal(await MH.evaluateMinimumHeadcount("m1"), "ok");
  assert.equal(updates.length, 0);
  assert.equal(notifyCalls.length, 0);
});

test("evaluateMinimumHeadcount: enough people (counting guests) keeps the meetup", async () => {
  setup({ meetup: { guests: [{ userId: "c1", count: 1 }] } }); // 2 members + 1 guest = 3
  assert.equal(await MH.evaluateMinimumHeadcount("m1"), "ok");
  assert.equal(updates.length, 0);
});

test("evaluateMinimumHeadcount: too few people cancels and notifies members", async () => {
  assert.equal(await MH.evaluateMinimumHeadcount("m1"), "cancelled");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].update.$set.status, "cancelled");
  assert.equal(updates[0].update.$set.cancelReason, "minimum-headcount");
  assert.equal(updates[0].filter.status, "scheduled"); // can't cancel something already changed
  assert.equal(notifyCalls.length, 1);
  assert.equal(notifyCalls[0].users.length, 3);
  assert.match(notifyCalls[0].payload.body, /only 2 of the 3 needed/);
  assert.equal(notifyCalls[0].payload.type, "meetup-cancelled");
});

test("evaluateMinimumHeadcount: a notification failure doesn't undo the cancellation", async () => {
  notifyShouldFail = true;
  const origError = console.error;
  console.error = () => {};
  try {
    assert.equal(await MH.evaluateMinimumHeadcount("m1"), "cancelled");
  } finally {
    console.error = origError;
  }
  assert.equal(updates.length, 1);
});

test("evaluateDueMeetups: counts checked and cancelled, survives a failure on one meetup", async () => {
  let n = 0;
  Meetup.find = () => chain([{ _id: "a" }, { _id: "b" }, { _id: "c" }]);
  Meetup.findOneAndUpdate = () => {
    n++;
    if (n === 2) throw new Error("boom");
    return chain(state.claimed);
  };
  const origError = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await MH.evaluateDueMeetups(), { checked: 3, cancelled: 2 });
  } finally {
    console.error = origError;
  }
});
