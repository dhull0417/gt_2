// Run with: node --test src/utils/email/
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret";
process.env.PUBLIC_BASE_URL = "https://example.test";
process.env.PREMIUM_TEST_CLERK_IDS = "user_test_premium";

const L = await import("./lifecycle.js");
const { renderEmail, EMAIL_KEYS, PRICE_TEXT } = await import("./templates.js");

const MDT = "America/Denver"; // UTC-6 on 2026-10-03
const at = (iso) => new Date(iso);

test("send window is 9:00 inclusive to 19:00 exclusive, in the user's zone", () => {
  assert.equal(L.inSendWindow(at("2026-10-03T14:59:00Z"), MDT), false); // 8:59 local
  assert.equal(L.inSendWindow(at("2026-10-03T15:00:00Z"), MDT), true);  // 9:00
  assert.equal(L.inSendWindow(at("2026-10-04T00:59:00Z"), MDT), true);  // 18:59
  assert.equal(L.inSendWindow(at("2026-10-04T01:00:00Z"), MDT), false); // 19:00
  assert.equal(L.inSendWindow(at("2026-10-03T15:00:00Z"), "America/New_York"), true); // 11:00 ET
  assert.equal(L.inSendWindow(at("2026-10-03T12:00:00Z"), "America/Los_Angeles"), false); // 5:00 PT
});

test("start of local day respects timezone", () => {
  assert.equal(L.startOfLocalDay(at("2026-10-03T20:00:00Z"), MDT).toISOString(), "2026-10-03T06:00:00.000Z");
});

test("resolveZone accepts IANA names only", () => {
  assert.equal(L.resolveZone("America/Denver"), "America/Denver");
  assert.equal(L.resolveZone("Not/AZone"), null);
  assert.equal(L.resolveZone(""), null);
  assert.equal(L.resolveZone(undefined), null);
  assert.equal(L.resolveZone({ $ne: 1 }), null);
});

test("emails are due on the plan's days and go stale after 5 days", () => {
  const signup = at("2026-10-01T12:00:00Z");
  const plus = (ms) => new Date(signup.getTime() + ms);
  const D = 86400000;
  assert.equal(L.isDue("U1", signup, plus(4 * 60000)), false);
  assert.equal(L.isDue("U1", signup, plus(5 * 60000)), true);
  assert.equal(L.isDue("U2", signup, plus(3 * D - 1)), false);
  assert.equal(L.isDue("U2", signup, plus(3 * D)), true);
  assert.equal(L.isDue("U2", signup, plus(8 * D)), true);
  assert.equal(L.isDue("U2", signup, plus(8 * D + 1)), false); // stale
  assert.equal(L.isDue("U3", signup, plus(7 * D)), true);
  assert.equal(L.isDue("U4", signup, plus(14 * D)), true);
  assert.equal(L.isDue("O1", signup, plus(0)), true);
  assert.equal(L.isDue("O2", signup, plus(7 * D)), true);
  assert.equal(L.isDue("O3", signup, plus(21 * D)), true);
  assert.equal(L.isDue("O3", null, plus(21 * D)), false);
});

test("stop conditions match the plan", () => {
  const user = (lifecycle = {}, extra = {}) => ({ clerkId: "u1", lifecycle, ...extra });
  assert.equal(L.shouldStop("U3", user()), false);
  assert.equal(L.shouldStop("U3", user({ groupsCreated: 1 })), true);
  assert.equal(L.shouldStop("U4", user({ firstGroupAt: new Date() })), true);
  assert.equal(L.shouldStop("U2", user({ groupsCreated: 3 })), false); // U2 never stops
  assert.equal(L.shouldStop("O2", user({ groupsCreated: 1 })), false);
  assert.equal(L.shouldStop("O2", user({ groupsCreated: 2 })), true);  // even if a group was deleted since
  assert.equal(L.shouldStop("O3", user()), false);
  assert.equal(L.shouldStop("O3", user({}, { premium: { active: true, expiresAt: null } })), true);
  assert.equal(L.shouldStop("O3", user({}, { premium: { active: true, expiresAt: new Date(Date.now() - 1000) } })), false);
  assert.equal(L.shouldStop("O3", { clerkId: "user_test_premium", lifecycle: {} }), true);
});

test("unsubscribe tokens verify and reject tampering", () => {
  const sig = L.signUnsubscribe("507f1f77bcf86cd799439011");
  assert.equal(L.verifyUnsubscribe("507f1f77bcf86cd799439011", sig), true);
  assert.equal(L.verifyUnsubscribe("507f1f77bcf86cd799439012", sig), false);
  assert.equal(L.verifyUnsubscribe("507f1f77bcf86cd799439011", sig + "x"), false);
  assert.equal(L.verifyUnsubscribe("507f1f77bcf86cd799439011", ""), false);
});

const ctx = (extra = {}) => ({
  firstName: "Sam", logoUrl: "https://example.test/logo.png", postalAddress: "1 Main St, Springfield",
  unsubscribeUrl: "https://example.test/api/email/unsubscribe?u=1&t=2",
  urls: { meetups: "https://e.test/a", open: "https://e.test/b", createGroup: "https://e.test/c", shareInvite: "https://e.test/d", premium: "https://e.test/e" },
  ...extra,
});

test("every email renders with the plan's subject, no leftover placeholders", () => {
  const subjects = {
    U1: "Welcome! Let's get you in (or out).", U2: "Two moves that make you a great group member",
    U3: "Quick question: what do you do on repeat?", U4: "Your first group, in 3 steps",
    O1: "You made a group! Now let's fill it.", O2: "Your next group is hiding in plain sight",
    O3: "Meet Premium: organizer superpowers",
  };
  assert.deepEqual([...EMAIL_KEYS].sort(), Object.keys(subjects).sort());
  for (const key of EMAIL_KEYS) {
    const e = renderEmail(key, ctx({ groupName: "Thursday Pickleball" }));
    assert.equal(e.subject, subjects[key]);
    for (const out of [e.html, e.text]) assert.doesNotMatch(out, /\{[a-z_]+\}|undefined|\*\*/, `${key} has a leftover placeholder`);
    assert.match(e.html, /href="https:\/\/e\.test\/[a-e]"/); // button link present
  }
});

test("only marketing emails (U3, U4, O2, O3) carry an unsubscribe link and address", () => {
  for (const key of EMAIL_KEYS) {
    const e = renderEmail(key, ctx());
    const marketing = ["U3", "U4", "O2", "O3"].includes(key);
    assert.equal(e.marketing, marketing, key);
    assert.equal(/unsubscribe/i.test(e.html), marketing, `${key} html`);
    assert.equal(/Springfield/.test(e.html), marketing, `${key} address`);
    assert.equal(/unsubscribe/i.test(e.text), marketing, `${key} text`);
  }
});

test("U1 shows the invite line only for invited users; O3 shows the price", () => {
  assert.doesNotMatch(renderEmail("U1", ctx()).text, /added you to/);
  const invited = renderEmail("U1", ctx({ organizerName: "Pat Lee", groupName: "Book Club" }));
  assert.match(invited.text, /Pat Lee added you to Book Club, so you're already set\./);
  assert.match(renderEmail("O3", ctx()).text, new RegExp(`All of it for ${PRICE_TEXT.replace(/[$.]/g, "\\$&")}\\.`));
  assert.equal(PRICE_TEXT, "$4.99 per month or $39.99 per year");
});

test("user-supplied names are HTML-escaped", () => {
  const e = renderEmail("O1", ctx({ firstName: "<img src=x onerror=1>", groupName: "A&B <b>" }));
  assert.doesNotMatch(e.html, /<img src=x/);
  assert.match(e.html, /A&amp;B &lt;b&gt;/);
});
