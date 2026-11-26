// Run with: npm test (from backend/)
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PREMIUM_TEST_CLERK_IDS = "user_test_premium";
const { hasPremium, serializeUser } = await import("./premium.js");

const DAY = 24 * 60 * 60 * 1000;
const inFuture = () => new Date(Date.now() + DAY);
const inPast = () => new Date(Date.now() - DAY);

test("hasPremium: no user, or no premium block, is not premium", () => {
  assert.equal(hasPremium(null), false);
  assert.equal(hasPremium(undefined), false);
  assert.equal(hasPremium({ clerkId: "u1" }), false);
  assert.equal(hasPremium({ clerkId: "u1", premium: {} }), false);
});

test("hasPremium: inactive is never premium, even with a future expiry", () => {
  assert.equal(hasPremium({ clerkId: "u1", premium: { active: false, expiresAt: inFuture() } }), false);
});

test("hasPremium: active with no expiry (lifetime/manual) is premium", () => {
  assert.equal(hasPremium({ clerkId: "u1", premium: { active: true, expiresAt: null } }), true);
  assert.equal(hasPremium({ clerkId: "u1", premium: { active: true } }), true);
});

test("hasPremium: active respects expiry", () => {
  assert.equal(hasPremium({ clerkId: "u1", premium: { active: true, expiresAt: inFuture() } }), true);
  assert.equal(hasPremium({ clerkId: "u1", premium: { active: true, expiresAt: inPast() } }), false);
  // Strings (serialized dates) work too
  assert.equal(hasPremium({ clerkId: "u1", premium: { active: true, expiresAt: inPast().toISOString() } }), false);
});

test("hasPremium: allow-listed test clerk ids are premium without a subscription", () => {
  assert.equal(hasPremium({ clerkId: "user_test_premium" }), true);
  assert.equal(hasPremium({ clerkId: "user_test_premium", premium: { active: false } }), true);
});

test("serializeUser: adds computed isPremium, keeps other fields, passes null through", () => {
  assert.equal(serializeUser(null), null);
  const out = serializeUser({ clerkId: "u1", name: "A", premium: { active: true, expiresAt: inFuture() } });
  assert.equal(out.isPremium, true);
  assert.equal(out.name, "A");
  assert.equal(serializeUser({ clerkId: "u2" }).isPremium, false);
  // Mongoose-style docs expose toJSON
  const doc = { toJSON: () => ({ clerkId: "u3", premium: { active: true } }) };
  assert.equal(serializeUser(doc).isPremium, true);
});
