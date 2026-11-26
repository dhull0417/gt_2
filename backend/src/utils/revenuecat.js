import crypto from "node:crypto";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import Meetup from "../models/meetup.model.js";
import { ENV } from "../config/env.js";

const API = "https://api.revenuecat.com/v1";
const entitlementName = () => ENV.REVENUECAT_ENTITLEMENT || "premium";

/** Constant-time check of the webhook's Authorization header against our shared secret. */
export const webhookAuthorized = (headerValue) => {
  const secret = ENV.REVENUECAT_WEBHOOK_AUTH;
  if (!secret || !headerValue) return false;
  const given = headerValue.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * Asks RevenueCat what this customer owns right now. RevenueCat is the source of truth,
 * so nothing a webhook (or the app) claims is ever trusted without this lookup.
 * Returns { active, expiresAt, store, productId } or null when RevenueCat has never seen them.
 */
export const fetchPremiumStatus = async (appUserId) => {
  if (!ENV.REVENUECAT_SECRET_API_KEY) throw new Error("REVENUECAT_SECRET_API_KEY is not set.");
  const res = await fetch(`${API}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${ENV.REVENUECAT_SECRET_API_KEY}`, "Content-Type": "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`RevenueCat responded ${res.status}`);
  const { subscriber } = await res.json();

  const ent = subscriber?.entitlements?.[entitlementName()];
  if (!ent) return { active: false, expiresAt: null, store: null, productId: null };

  // Lifetime / promotional-forever entitlements have no expiry. A billing-retry grace
  // period keeps access on past the nominal expiry.
  const candidates = [ent.expires_date, ent.grace_period_expires_date].filter(Boolean).map((d) => new Date(d));
  const expiresAt = ent.expires_date === null ? null : candidates.length ? new Date(Math.max(...candidates)) : null;
  const active = expiresAt === null || expiresAt > new Date();
  const sub = subscriber.subscriptions?.[ent.product_identifier];
  return { active, expiresAt, store: sub?.store ?? null, productId: ent.product_identifier ?? null };
};

/** Nudges clients to re-sync meetups of groups this user owns (their snapshot carries isPremium). */
const touchOwnedGroupMeetups = async (userId) => {
  const groups = await Group.find({ owner: userId }).select("_id").lean();
  if (groups.length === 0) return;
  await Meetup.updateMany(
    { group: { $in: groups.map((g) => g._id) }, date: { $gte: new Date() } },
    { $set: { updatedAt: new Date() } }
  );
};

/**
 * Looks up RevenueCat and writes the result to user.premium. Returns the updated user (lean).
 * Manual grants (store "manual") are never downgraded by RevenueCat.
 */
export const syncPremiumForUser = async (user) => {
  const status = await fetchPremiumStatus(user.clerkId);
  if (!status) return user; // RevenueCat doesn't know them: leave as is

  const existing = user.premium;
  if (existing?.store === "manual" && existing.active && !status.active) return user;

  const changed =
    !existing ||
    existing.active !== status.active ||
    (existing.expiresAt?.getTime?.() ?? null) !== (status.expiresAt?.getTime() ?? null) ||
    existing.productId !== status.productId;

  const updated = await User.findByIdAndUpdate(
    user._id,
    { $set: { premium: { ...status, updatedAt: new Date() } } },
    { new: true }
  ).lean();

  if (changed) await touchOwnedGroupMeetups(user._id);
  return updated;
};
