import { ENV } from "../config/env.js";
import User from "../models/user.model.js";

// Clerk ids that count as Premium without a subscription (testing only).
// Evaluated at read time so nothing is ever written to the database.
const testClerkIds = () =>
  (ENV.PREMIUM_TEST_CLERK_IDS || "user_3JRLGwTK9kOXntq10b9DOdsi5Dt")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Single source of truth for "is this user Premium right now?".
 * Accepts a lean object or a Mongoose doc (needs `clerkId` and `premium`).
 */
export const hasPremium = (user) => {
  if (!user) return false;
  if (testClerkIds().includes(user.clerkId)) return true;

  const premium = user.premium;
  if (!premium?.active) return false;
  // No expiry = active until a webhook flips it off (e.g. lifetime / manual grant).
  return !premium.expiresAt || new Date(premium.expiresAt) > new Date();
};

/**
 * Premium features belong to a group while its owner (the organizer) is
 * subscribed. `group.owner` can be an id or a populated user.
 */
export const groupHasPremium = async (group) => {
  const ownerId = group?.owner?._id ?? group?.owner;
  if (!ownerId) return false;
  const owner = await User.findById(ownerId).select("clerkId premium").lean();
  return hasPremium(owner);
};

/** Shape a user for API responses: the stored doc plus a computed `isPremium`. */
export const serializeUser = (user) => {
  if (!user) return user;
  const plain = typeof user.toJSON === "function" ? user.toJSON() : user;
  return { ...plain, isPremium: hasPremium(plain) };
};

/**
 * Adds `group.isPremium` (is the group's owner subscribed?) to meetups whose
 * `group` is populated with `owner`. Accepts one meetup or an array and returns
 * plain objects of the same shape. The app uses the flag only to pick button
 * labels; the server still enforces every Premium rule itself.
 */
export const withGroupPremium = async (meetups) => {
  const isArray = Array.isArray(meetups);
  const plain = (isArray ? meetups : [meetups]).map((m) =>
    m && typeof m.toJSON === "function" ? m.toJSON() : m
  );

  const ownerIds = [
    ...new Set(plain.map((m) => m?.group?.owner?.toString()).filter(Boolean)),
  ];
  const owners = ownerIds.length
    ? await User.find({ _id: { $in: ownerIds } }).select("clerkId premium").lean()
    : [];
  const premiumByOwner = new Map(owners.map((o) => [o._id.toString(), hasPremium(o)]));

  const result = plain.map((m) => {
    const ownerId = m?.group?.owner?.toString();
    if (!ownerId) return m;
    return { ...m, group: { ...m.group, isPremium: premiumByOwner.get(ownerId) === true } };
  });
  return isArray ? result : result[0];
};
