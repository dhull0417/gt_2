/**
 * One-time backfill: for Apple Sign In users who have no firstName or no lastName
 * (Apple only hands over the real name on the very first authorization ever, so it's
 * unrecoverable once missed — see fixAppleNames.js), set firstName to "No Profile" and
 * lastName to "Pat" so the app always has a display name to fall back to.
 *
 * Only touches users whose Clerk account signed in via Apple (externalAccounts
 * provider "oauth_apple"); non-Apple users with missing names are left untouched.
 *
 * Run: node --env-file=.env src/scripts/backfillAppleNoProfileNames.js
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { createClerkClient } from "@clerk/express";
import User from "../models/user.model.js";

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const isMissing = (value) => !value || value.trim() === "";

async function backfillAppleNoProfileNames() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  const candidates = await User.find({
    $or: [{ firstName: { $in: [null, ""] } }, { lastName: { $in: [null, ""] } }],
  });

  console.log(`Found ${candidates.length} user(s) with a missing first or last name.`);

  let fixed = 0;
  let skipped = 0;
  for (const user of candidates) {
    if (!isMissing(user.firstName) && !isMissing(user.lastName)) continue;

    let clerkUser;
    try {
      clerkUser = await clerkClient.users.getUser(user.clerkId);
    } catch (err) {
      console.warn(`  ! Could not look up Clerk user for ${user.clerkId}: ${err.message}`);
      skipped++;
      continue;
    }

    const isAppleUser = clerkUser.externalAccounts?.some((account) => account.provider === "oauth_apple");
    if (!isAppleUser) {
      skipped++;
      continue;
    }

    await User.updateOne({ _id: user._id }, { $set: { firstName: "No Profile", lastName: "Pat" } });
    console.log(`  ✓ Set default name for Apple user ${user.clerkId} (was "${user.firstName}" "${user.lastName}")`);
    fixed++;
  }

  console.log(`\nDone. Updated ${fixed} Apple user(s). Skipped ${skipped} non-Apple/unresolvable user(s).`);
  await mongoose.connection.close();
}

backfillAppleNoProfileNames().catch((err) => {
  console.error("backfillAppleNoProfileNames failed:", err);
  process.exit(1);
});
