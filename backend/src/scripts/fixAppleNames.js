/**
 * One-time backfill: clears firstName/lastName for users where the value is actually
 * an email address (Apple private-relay or otherwise) rather than a real name. This
 * happened for Apple Sign In users before the useAppleAuth fix, because Apple only
 * hands over the user's name on the very first authorization and the app was dropping
 * it, so downstream code ended up storing/displaying the account's email instead.
 *
 * This can't recover the real name — only the user, or a fresh Apple authorization
 * after revoking the app's access in Settings, can supply that. It just clears the
 * bad value so the app's display-name fallback ("New Member") kicks in instead.
 *
 * Run: node --env-file=.env src/scripts/fixAppleNames.js
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import User from "../models/user.model.js";

const looksLikeEmail = (value) => typeof value === "string" && value.includes("@");

async function fixAppleNames() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  const candidates = await User.find({
    $or: [{ firstName: /@/ }, { lastName: /@/ }],
  });

  console.log(`Found ${candidates.length} user(s) with an email-like name.`);

  let fixed = 0;
  for (const user of candidates) {
    const update = {};
    if (looksLikeEmail(user.firstName)) update.firstName = "";
    if (looksLikeEmail(user.lastName)) update.lastName = "";
    if (Object.keys(update).length === 0) continue;

    await User.updateOne({ _id: user._id }, { $set: update });
    console.log(`  ✓ Cleared ${Object.keys(update).join(" & ")} for user ${user.clerkId} (was "${user.firstName} ${user.lastName}")`);
    fixed++;
  }

  console.log(`\nDone. Cleared bad name data on ${fixed} user(s).`);
  await mongoose.connection.close();
}

fixAppleNames().catch((err) => {
  console.error("fixAppleNames failed:", err);
  process.exit(1);
});
