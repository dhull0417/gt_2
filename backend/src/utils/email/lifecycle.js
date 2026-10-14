import crypto from "crypto";
import { DateTime, IANAZone } from "luxon";
import User from "../../models/user.model.js";
import Group from "../../models/group.model.js";
import EmailLog from "../../models/emailLog.model.js";
import { ENV } from "../../config/env.js";
import { hasPremium } from "../premium.js";
import { renderEmail, PRICE_TEXT } from "./templates.js";
import { sendEmail, emailConfigured } from "./resend.js";

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

// A due email more than this late is dropped (e.g. after a cron outage) instead
// of landing days after it made sense.
export const STALE_MS = 5 * DAY;
export const WINDOW_START_HOUR = 9;  // 9:00 AM local, inclusive
export const WINDOW_END_HOUR = 19;   // 7:00 PM local, exclusive
export const MAX_SENDS_PER_RUN = 60;
const SEND_CONCURRENCY = 5;
const FALLBACK_ZONE = "America/Denver";

/**
 * anchor:  which user date the schedule counts from
 * afterMs: how long after the anchor the email is due
 * window:  must land inside the recipient's 9am-7pm local window
 * cap:     counts toward / is blocked by the one-email-per-day limit
 * marketing: needs an unsubscribe link and honors the marketing opt-out
 *
 * U1 waits 5 minutes so an invite redemption (which happens right after
 * signup) is recorded before the welcome email is written.
 */
export const RULES = {
  U1: { anchor: "enrolledAt",   afterMs: 5 * MIN,  window: false, cap: false, marketing: false },
  U2: { anchor: "enrolledAt",   afterMs: 3 * DAY,  window: true,  cap: true,  marketing: false },
  U3: { anchor: "enrolledAt",   afterMs: 7 * DAY,  window: true,  cap: true,  marketing: true },
  U4: { anchor: "enrolledAt",   afterMs: 14 * DAY, window: true,  cap: true,  marketing: true },
  O1: { anchor: "firstGroupAt", afterMs: 0,        window: false, cap: false, marketing: false },
  O2: { anchor: "firstGroupAt", afterMs: 7 * DAY,  window: true,  cap: true,  marketing: true },
  O3: { anchor: "firstGroupAt", afterMs: 21 * DAY, window: true,  cap: true,  marketing: true },
};

// ---------- pure helpers (unit-tested in lifecycle.test.mjs) ----------

export const resolveZone = (tz) => (typeof tz === "string" && tz && IANAZone.isValidZone(tz) ? tz : null);

export const inSendWindow = (now, zone) => {
  const hour = DateTime.fromJSDate(now, { zone }).hour;
  return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR;
};

export const startOfLocalDay = (now, zone) => DateTime.fromJSDate(now, { zone }).startOf("day").toJSDate();

/** Due once `afterMs` has passed since the anchor, until it goes stale. */
export const isDue = (key, anchorDate, now) => {
  if (!anchorDate) return false;
  const due = new Date(anchorDate).getTime() + RULES[key].afterMs;
  return now.getTime() >= due && now.getTime() <= due + STALE_MS;
};

/**
 * Stop conditions from the plan. `user.lifecycle.groupsCreated` is a counter
 * kept by createGroup, so these never depend on a group still existing.
 *  U3/U4: stop once they've created a group.   O2: stop once they've created a 2nd.
 *  O3: stop once they're Premium.
 */
export const shouldStop = (key, user) => {
  const created = user.lifecycle?.groupsCreated ?? 0;
  const hasGroup = !!user.lifecycle?.firstGroupAt || created >= 1;
  if (key === "U3" || key === "U4") return hasGroup;
  if (key === "O2") return created >= 2;
  if (key === "O3") return hasPremium(user);
  return false;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const hasUsableEmail = (user) => typeof user.email === "string" && EMAIL_RE.test(user.email);

// ---------- unsubscribe tokens ----------

const unsubSecret = () => ENV.EMAIL_UNSUBSCRIBE_SECRET;

export const signUnsubscribe = (userId) =>
  crypto.createHmac("sha256", unsubSecret()).update(String(userId)).digest("base64url");

export const verifyUnsubscribe = (userId, sig) => {
  if (!unsubSecret() || !userId || !sig) return false;
  const expected = Buffer.from(signUnsubscribe(userId));
  const given = Buffer.from(String(sig));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

const baseUrl = () => (ENV.PUBLIC_BASE_URL || "").replace(/\/+$/, "");

export const unsubscribeUrl = (userId) =>
  `${baseUrl()}/api/email/unsubscribe?u=${userId}&t=${signUnsubscribe(userId)}`;

// ---------- sending ----------

const fullName = (u) => `${u?.firstName || ""} ${u?.lastName || ""}`.trim();

const buildContext = async (user, key, { groupId } = {}) => {
  const base = baseUrl();
  const ctx = {
    firstName: user.firstName?.trim() || "there",
    price: PRICE_TEXT,
    logoUrl: `${base}/logo.png`,
    postalAddress: ENV.EMAIL_POSTAL_ADDRESS,
    urls: {
      meetups: `${base}/go/meetups`,
      open: `${base}/go/open`,
      createGroup: `${base}/go/create-group`,
      shareInvite: `${base}/go/groups`,
      premium: `${base}/go/premium`,
    },
  };

  if (key === "U1" && user.lifecycle?.joinedViaGroup) {
    const group = await Group.findById(user.lifecycle.joinedViaGroup).select("name owner").lean();
    if (group && String(group.owner) !== String(user._id)) {
      const owner = await User.findById(group.owner).select("firstName lastName").lean();
      if (owner) { ctx.groupName = group.name; ctx.organizerName = fullName(owner) || "Someone"; }
    }
  }

  if (key === "O1") {
    const group = groupId
      ? await Group.findById(groupId).select("name").lean()
      : await Group.findOne({ owner: user._id, isDM: { $ne: true } }).sort({ createdAt: 1 }).select("name").lean();
    if (group) {
      ctx.groupName = group.name;
      ctx.urls.shareInvite = `${base}/go/group/${group._id}`;
    }
  }

  if (RULES[key].marketing) ctx.unsubscribeUrl = unsubscribeUrl(user._id);
  return ctx;
};

/**
 * Sends one lifecycle email, exactly once per (user, key).
 * Returns: 'sent' | 'duplicate' | 'retry' | 'failed' | 'disabled' | 'blocked'.
 * The EmailLog row is inserted FIRST (unique index) and only the winner sends;
 * a transient failure removes the row so the next run retries.
 */
export const sendLifecycleEmail = async (user, key, opts = {}) => {
  if (!emailConfigured()) return "disabled";
  const rule = RULES[key];
  if (!hasUsableEmail(user) || user.emailPrefs?.suppressed) return "blocked";
  if (rule.marketing) {
    // marketing mail needs a working unsubscribe link and a postal address
    if (user.emailPrefs?.marketingOptOut || !unsubSecret() || !ENV.EMAIL_POSTAL_ADDRESS || !baseUrl()) return "blocked";
  }

  const ctx = await buildContext(user, key, opts);
  const email = renderEmail(key, ctx);

  let claim;
  try {
    claim = await EmailLog.create({ user: user._id, key });
  } catch (err) {
    if (err?.code === 11000) return "duplicate";
    throw err;
  }

  const headers = email.marketing
    ? { "List-Unsubscribe": `<${ctx.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : undefined;

  const result = await sendEmail({
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers,
    idempotencyKey: `lifecycle-${user._id}-${key}`,
    tags: [{ name: "lifecycle", value: key }],
  });

  if (result.ok) {
    await EmailLog.updateOne({ _id: claim._id }, { $set: { status: "sent", providerId: result.id, sentAt: new Date() } });
    return "sent";
  }
  if (result.permanent) {
    await EmailLog.updateOne({ _id: claim._id }, { $set: { status: "failed", error: String(result.error).slice(0, 300) } });
    return "failed";
  }
  await EmailLog.deleteOne({ _id: claim._id });
  console.error(`[lifecycle] transient send failure for ${key}: ${result.error}`);
  return "retry";
};

// ---------- event hooks (called from controllers; never throw) ----------

/** Called after a group is created. Sends O1 immediately on a user's first group. */
export const onGroupCreated = async (userId, groupId) => {
  try {
    const firstTime = await User.updateOne(
      { _id: userId, "lifecycle.firstGroupAt": null },
      { $set: { "lifecycle.firstGroupAt": new Date() } }
    );
    await User.updateOne({ _id: userId }, { $inc: { "lifecycle.groupsCreated": 1 } });

    if (firstTime.modifiedCount === 1) {
      const user = await User.findById(userId).lean();
      if (user?.lifecycle?.enrolledAt) await sendLifecycleEmail(user, "O1", { groupId });
    }
  } catch (err) {
    console.error("[lifecycle] onGroupCreated failed:", err);
  }
};

/** Called when someone joins a group by invite link: remembered for the welcome email. */
export const onInviteRedeemed = async (userId, groupId) => {
  try {
    await User.updateOne(
      { _id: userId, "lifecycle.enrolledAt": { $type: "date" }, "lifecycle.joinedViaGroup": null },
      { $set: { "lifecycle.joinedViaGroup": groupId } }
    );
  } catch (err) {
    console.error("[lifecycle] onInviteRedeemed failed:", err);
  }
};

// ---------- the scheduled job ----------

const zoneFor = async (user) => {
  const own = resolveZone(user.timezone);
  if (own) return own;
  const group = await Group.findOne({ members: user._id, isDM: { $ne: true } }).select("timezone").lean();
  return resolveZone(group?.timezone) || FALLBACK_ZONE;
};

/**
 * Finds every email that is due, applies the plan's rules, and sends.
 * Safe to run as often as you like: the EmailLog unique index prevents repeats.
 * With dryRun it reports who WOULD be emailed (ids only) and sends/records nothing.
 */
export const processDueEmails = async ({ dryRun = false, now = new Date() } = {}) => {
  if (!dryRun && !emailConfigured()) return { skipped: "lifecycle emails are disabled or not configured" };

  const stats = { considered: 0, sent: 0, retry: 0, failed: 0, blocked: 0, skipped: { stopped: 0, outsideWindow: 0, dailyCap: 0, alreadyHandled: 0 } };
  const candidates = [];

  for (const [key, rule] of Object.entries(RULES)) {
    const lo = new Date(now.getTime() - rule.afterMs - STALE_MS);
    const hi = new Date(now.getTime() - rule.afterMs);
    const and = [
      { [`lifecycle.${rule.anchor}`]: { $gte: lo, $lte: hi } },
      { "lifecycle.enrolledAt": { $type: "date" } }, // only people who signed up after launch
      { email: { $type: "string", $ne: "" } },
      { "emailPrefs.suppressed": { $ne: true } },
    ];
    if (rule.marketing) and.push({ "emailPrefs.marketingOptOut": { $ne: true } });

    const users = await User.find({ $and: and })
      .select("clerkId email firstName lastName premium timezone lifecycle emailPrefs")
      .lean();
    if (users.length === 0) continue;

    const logged = new Set(
      (await EmailLog.find({ user: { $in: users.map((u) => u._id) }, key }).select("user").lean()).map((l) => String(l.user))
    );
    for (const user of users) {
      if (logged.has(String(user._id))) { stats.skipped.alreadyHandled++; continue; }
      const anchor = user.lifecycle?.[rule.anchor];
      if (!isDue(key, anchor, now)) continue;
      candidates.push({ user, key, dueAt: new Date(anchor).getTime() + rule.afterMs });
    }
  }

  // oldest-due first: when two emails land the same day, the older goes today, the newer waits
  candidates.sort((a, b) => a.dueAt - b.dueAt);

  const chosen = [];
  const usersThisRun = new Set();
  for (const c of candidates) {
    if (chosen.length >= MAX_SENDS_PER_RUN) break;
    stats.considered++;
    const id = String(c.user._id);
    if (usersThisRun.has(id)) continue; // at most one email per user per run
    const rule = RULES[c.key];

    if (shouldStop(c.key, c.user)) { stats.skipped.stopped++; continue; }

    if (rule.window || rule.cap) {
      const zone = await zoneFor(c.user);
      if (rule.window && !inSendWindow(now, zone)) { stats.skipped.outsideWindow++; continue; }
      if (rule.cap) {
        const sentToday = await EmailLog.exists({ user: c.user._id, status: "sent", sentAt: { $gte: startOfLocalDay(now, zone) } });
        if (sentToday) { stats.skipped.dailyCap++; continue; }
      }
    }
    usersThisRun.add(id);
    chosen.push(c);
  }

  if (dryRun) {
    return { dryRun: true, ...stats, wouldSend: chosen.map((c) => ({ userId: String(c.user._id), key: c.key })) };
  }

  for (let i = 0; i < chosen.length; i += SEND_CONCURRENCY) {
    const batch = chosen.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.all(batch.map(async (c) => {
      try {
        return await sendLifecycleEmail(c.user, c.key);
      } catch (err) {
        console.error(`[lifecycle] ${c.key} for ${c.user._id} threw:`, err);
        return "retry";
      }
    }));
    for (const r of results) {
      if (r === "sent") stats.sent++;
      else if (r === "retry") stats.retry++;
      else if (r === "failed") stats.failed++;
      else if (r === "blocked" || r === "disabled") stats.blocked++;
    }
  }
  return stats;
};
