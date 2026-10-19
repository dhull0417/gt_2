// Run with: npm test (from backend/)
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.PREMIUM_TEST_CLERK_IDS = "user_test_premium";
const { ENV } = await import("../config/env.js");
const RC = await import("./revenuecat.js");
const { default: User } = await import("../models/user.model.js");
const { default: Group } = await import("../models/group.model.js");
const { default: Meetup } = await import("../models/meetup.model.js");

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

const realFetch = globalThis.fetch;
const saved = {};
let fetchCalls;

const stubFetch = (status, body) => {
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
};
const subscriber = (entitlement, subscriptions = { pro_monthly: { store: "app_store" } }) =>
  ({ subscriber: { entitlements: entitlement ? { premium: entitlement } : {}, subscriptions } });

beforeEach(() => {
  saved.ENV = { ...ENV };
  saved.User = { f: User.findByIdAndUpdate };
  saved.Group = { f: Group.find };
  saved.Meetup = { u: Meetup.updateMany };
  ENV.REVENUECAT_SECRET_API_KEY = "sk_test";
  ENV.REVENUECAT_WEBHOOK_AUTH = "whsec_123";
  ENV.REVENUECAT_ENTITLEMENT = "premium";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(ENV, saved.ENV);
  User.findByIdAndUpdate = saved.User.f;
  Group.find = saved.Group.f;
  Meetup.updateMany = saved.Meetup.u;
});

// ---------- webhookAuthorized ----------

test("webhookAuthorized: accepts the shared secret with or without Bearer", () => {
  assert.equal(RC.webhookAuthorized("whsec_123"), true);
  assert.equal(RC.webhookAuthorized("Bearer whsec_123"), true);
  assert.equal(RC.webhookAuthorized("bearer whsec_123"), true);
});

test("webhookAuthorized: rejects wrong, missing, or length-mismatched values", () => {
  assert.equal(RC.webhookAuthorized("whsec_124"), false);
  assert.equal(RC.webhookAuthorized("whsec_1234"), false);
  assert.equal(RC.webhookAuthorized(""), false);
  assert.equal(RC.webhookAuthorized(undefined), false);
});

test("webhookAuthorized: with no secret configured, nothing is authorized", () => {
  ENV.REVENUECAT_WEBHOOK_AUTH = undefined;
  assert.equal(RC.webhookAuthorized("anything"), false);
  assert.equal(RC.webhookAuthorized("Bearer undefined"), false);
});

// ---------- fetchPremiumStatus ----------

test("fetchPremiumStatus: calls RevenueCat with the secret key and an encoded user id", async () => {
  stubFetch(200, subscriber(null));
  await RC.fetchPremiumStatus("user/with space");
  assert.equal(fetchCalls[0].url, "https://api.revenuecat.com/v1/subscribers/user%2Fwith%20space");
  assert.equal(fetchCalls[0].init.headers.Authorization, "Bearer sk_test");
});

test("fetchPremiumStatus: throws without a secret key or on a server error; 404 => null", async () => {
  ENV.REVENUECAT_SECRET_API_KEY = undefined;
  await assert.rejects(() => RC.fetchPremiumStatus("u1"), /not set/);
  ENV.REVENUECAT_SECRET_API_KEY = "sk_test";
  stubFetch(500, {});
  await assert.rejects(() => RC.fetchPremiumStatus("u1"), /500/);
  stubFetch(404, {});
  assert.equal(await RC.fetchPremiumStatus("u1"), null);
});

test("fetchPremiumStatus: no entitlement => inactive", async () => {
  stubFetch(200, subscriber(null));
  assert.deepEqual(await RC.fetchPremiumStatus("u1"), { active: false, expiresAt: null, store: null, productId: null });
});

test("fetchPremiumStatus: future expiry is active and reports store/product", async () => {
  stubFetch(200, subscriber({ expires_date: iso(DAY), product_identifier: "pro_monthly" }));
  const s = await RC.fetchPremiumStatus("u1");
  assert.equal(s.active, true);
  assert.equal(s.store, "app_store");
  assert.equal(s.productId, "pro_monthly");
  assert.ok(s.expiresAt > new Date());
});

test("fetchPremiumStatus: null expiry (lifetime) is active forever", async () => {
  stubFetch(200, subscriber({ expires_date: null, product_identifier: "pro_monthly" }));
  const s = await RC.fetchPremiumStatus("u1");
  assert.equal(s.active, true);
  assert.equal(s.expiresAt, null);
});

test("fetchPremiumStatus: expired is inactive, unless a billing grace period is still running", async () => {
  stubFetch(200, subscriber({ expires_date: iso(-DAY), product_identifier: "pro_monthly" }));
  assert.equal((await RC.fetchPremiumStatus("u1")).active, false);

  stubFetch(200, subscriber({ expires_date: iso(-DAY), grace_period_expires_date: iso(2 * DAY), product_identifier: "pro_monthly" }));
  const grace = await RC.fetchPremiumStatus("u1");
  assert.equal(grace.active, true);
  assert.ok(grace.expiresAt > new Date());
});

test("fetchPremiumStatus: honors a custom entitlement name", async () => {
  ENV.REVENUECAT_ENTITLEMENT = "gold";
  stubFetch(200, { subscriber: { entitlements: { gold: { expires_date: null, product_identifier: "p" } }, subscriptions: {} } });
  assert.equal((await RC.fetchPremiumStatus("u1")).active, true);
});

// ---------- syncPremiumForUser ----------

const stubWrites = () => {
  const calls = { update: [], groupFind: 0, touch: [] };
  User.findByIdAndUpdate = (id, update) => {
    calls.update.push({ id, update });
    return { lean: async () => ({ _id: id, premium: update.$set.premium }) };
  };
  Group.find = () => { calls.groupFind++; return { select: () => ({ lean: async () => [{ _id: "g1" }] }) }; };
  Meetup.updateMany = async (filter, update) => { calls.touch.push({ filter, update }); };
  return calls;
};

test("syncPremiumForUser: unknown to RevenueCat => user left untouched", async () => {
  stubFetch(404, {});
  const calls = stubWrites();
  const user = { _id: "1", clerkId: "u1", premium: { active: true } };
  assert.equal(await RC.syncPremiumForUser(user), user);
  assert.equal(calls.update.length, 0);
});

test("syncPremiumForUser: manual grants are never downgraded by RevenueCat", async () => {
  stubFetch(200, subscriber(null));
  const calls = stubWrites();
  const user = { _id: "1", clerkId: "u1", premium: { active: true, store: "manual" } };
  assert.equal(await RC.syncPremiumForUser(user), user);
  assert.equal(calls.update.length, 0);
});

test("syncPremiumForUser: a change is saved and owned groups' future meetups are touched", async () => {
  stubFetch(200, subscriber({ expires_date: iso(DAY), product_identifier: "pro_monthly" }));
  const calls = stubWrites();
  const updated = await RC.syncPremiumForUser({ _id: "1", clerkId: "u1", premium: { active: false } });
  assert.equal(updated.premium.active, true);
  assert.equal(calls.update.length, 1);
  assert.equal(calls.touch.length, 1);
  assert.deepEqual(calls.touch[0].filter.group, { $in: ["g1"] });
});

test("syncPremiumForUser: an unchanged status is still written but doesn't touch meetups", async () => {
  const expiresAt = new Date(Date.now() + DAY);
  stubFetch(200, subscriber({ expires_date: expiresAt.toISOString(), product_identifier: "pro_monthly" }));
  const calls = stubWrites();
  await RC.syncPremiumForUser({ _id: "1", clerkId: "u1", premium: { active: true, expiresAt, productId: "pro_monthly" } });
  assert.equal(calls.update.length, 1);
  assert.equal(calls.touch.length, 0);
});
