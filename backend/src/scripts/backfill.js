/**
 * One-time backfill script — run once after deploying the startsAt / nextGenerationAt changes.
 *
 * What it does:
 *   1. Computes and sets startsAt on every existing Meetup
 *   2. Marks past scheduled meetups as 'expired' (fixing the accumulation of stale records)
 *   3. Computes and sets nextGenerationAt on every Group that has a schedule
 *
 * Run with:
 *   node --env-file=.env src/scripts/backfill.js
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { DateTime } from "luxon";
import Group from "../models/group.model.js";
import Meetup from "../models/meetup.model.js";
import User from "../models/user.model.js";
import { calculateNextMeetupDate, computeNextGenerationAt } from "../utils/date.utils.js";

const parseTimeString = (timeStr) => {
  if (!timeStr) return { hours: 9, minutes: 0 };
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return { hours, minutes };
};

async function backfill() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  // ── Step 1: Set startsAt on all meetups ──────────────────────────────────────
  console.log("\nStep 1: Computing startsAt for all meetups...");
  const meetups = await Meetup.find({}, 'date time timezone');
  let startsAtUpdated = 0;

  for (const meetup of meetups) {
    const { hours, minutes } = parseTimeString(meetup.time);
    const startsAt = DateTime.fromJSDate(meetup.date)
      .setZone(meetup.timezone)
      .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 })
      .toJSDate();

    await Meetup.updateOne({ _id: meetup._id }, { $set: { startsAt } });
    startsAtUpdated++;
  }
  console.log(`  ✓ Set startsAt on ${startsAtUpdated} meetup(s).`);

  // ── Step 2: Expire past scheduled meetups ────────────────────────────────────
  console.log("\nStep 2: Expiring past scheduled meetups...");
  const now = new Date();

  const toExpire = await Meetup.find(
    { status: 'scheduled', startsAt: { $lte: now } },
    'group'
  );

  if (toExpire.length > 0) {
    const groupIds = [...new Set(toExpire.map(m => m.group.toString()))];
    const expireResult = await Meetup.updateMany(
      { status: 'scheduled', startsAt: { $lte: now } },
      { $set: { status: 'expired' } }
    );
    // Clear any stale mutes from the groups that just expired
    if (groupIds.length > 0) {
      await User.updateMany(
        { mutedUntilNextMeetup: { $in: groupIds } },
        { $pull: { mutedUntilNextMeetup: { $in: groupIds } } }
      );
    }
    console.log(`  ✓ Expired ${expireResult.modifiedCount} past meetup(s) and cleared stale mutes.`);
  } else {
    console.log("  ✓ No past meetups to expire.");
  }

  // ── Step 3: Set nextGenerationAt on all scheduled groups ─────────────────────
  console.log("\nStep 3: Computing nextGenerationAt for all groups...");
  const groups = await Group.find({
    'schedule.routines': { $exists: true, $not: { $size: 0 } }
  });

  let groupsUpdated = 0;

  for (const group of groups) {
    let earliestNextTrigger = null;

    for (const routine of group.schedule.routines) {
      for (const dtEntry of routine.dayTimes) {
        // Use the latest future meetup as the anchor so we generate the one AFTER it
        const latestFuture = await Meetup.findOne(
          { group: group._id, startsAt: { $gte: now } },
          'date'
        ).sort({ startsAt: -1 });

        const anchor = latestFuture ? latestFuture.date : null;
        const trigger = computeNextGenerationAt(group, anchor, routine, dtEntry);

        if (!earliestNextTrigger || trigger < earliestNextTrigger) {
          earliestNextTrigger = trigger;
        }
      }
    }

    if (earliestNextTrigger) {
      await Group.updateOne({ _id: group._id }, { $set: { nextGenerationAt: earliestNextTrigger } });
      groupsUpdated++;
    }
  }
  console.log(`  ✓ Set nextGenerationAt on ${groupsUpdated} group(s).`);

  console.log("\nBackfill complete. You can now push to Vercel and add the new cron jobs.");
  await mongoose.connection.close();
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
