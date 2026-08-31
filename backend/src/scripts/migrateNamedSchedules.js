/**
 * One-time migration — converts the old single `schedule` embedded object on
 * each Group into the new `schedules` array (named, multi-schedule support),
 * and backfills `schedule` on every existing Meetup to point at the
 * migrated schedule it belongs to.
 *
 * Deliberately uses the RAW MongoDB driver (mongoose.connection.db.collection)
 * instead of the Group/Meetup Mongoose models. The new Mongoose schema no
 * longer declares the old `schedule` field, so hydrating documents through it
 * would silently drop that data before this script ever saw it — reading and
 * writing through the raw collections instead means this script works
 * correctly whether it's run just before or just after the new backend code
 * is deployed.
 *
 * Idempotent: a group that already has a `schedules` field (even an empty
 * array) is left untouched, so this is safe to re-run.
 *
 * Run with:
 *   node --env-file=.env src/scripts/migrateNamedSchedules.js
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  const db = mongoose.connection.db;
  const groups = db.collection('groups');
  const meetups = db.collection('meetups');

  // ── Step 1: Wrap each group's legacy `schedule` into `schedules: [...]` ──
  console.log("\nStep 1: Migrating groups to the `schedules` array...");

  const candidates = await groups.find({ schedules: { $exists: false } }).toArray();
  console.log(`  Found ${candidates.length} group(s) not yet migrated.`);

  let groupsMigrated = 0;
  let groupsWithSchedule = 0;
  const scheduleIdByGroupId = new Map();

  for (const group of candidates) {
    const legacy = group.schedule;
    let newSchedules = [];

    if (legacy?.routines?.length > 0) {
      const scheduleId = new mongoose.Types.ObjectId();
      const now = new Date();
      newSchedules = [{
        _id: scheduleId,
        name: group.name || "Schedule",
        startDate: legacy.startDate ?? null,
        routines: legacy.routines,
        defaultLocation: group.defaultLocation || "",
        defaultCapacity: group.defaultCapacity || 0,
        generationLeadDays: group.generationLeadDays ?? 1,
        generationLeadTime: group.generationLeadTime || "09:00 AM",
        generationDeadlineDays: group.generationDeadlineDays ?? null,
        generationDeadlineTime: group.generationDeadlineTime || "09:00 AM",
        nextGenerationAt: group.nextGenerationAt ?? null,
        active: true,
        createdAt: now,
        updatedAt: now,
      }];
      scheduleIdByGroupId.set(group._id.toString(), scheduleId);
      groupsWithSchedule++;
    }

    await groups.updateOne({ _id: group._id }, { $set: { schedules: newSchedules } });
    groupsMigrated++;
  }

  console.log(`  ✓ Migrated ${groupsMigrated} group(s) (${groupsWithSchedule} carried a schedule forward).`);

  // ── Step 2: Backfill `schedule` on every meetup belonging to a migrated group ──
  console.log("\nStep 2: Backfilling Meetup.schedule...");

  let meetupsUpdated = 0;
  for (const [groupIdStr, scheduleId] of scheduleIdByGroupId.entries()) {
    const result = await meetups.updateMany(
      { group: new mongoose.Types.ObjectId(groupIdStr), schedule: { $exists: false } },
      { $set: { schedule: scheduleId } }
    );
    meetupsUpdated += result.modifiedCount;
  }

  console.log(`  ✓ Backfilled schedule on ${meetupsUpdated} meetup(s).`);

  // Any remaining meetups with no `schedule` field belong to groups that never
  // had a schedule (DM groups, or groups created with "No" to "Set Schedule
  // Now?") — those are correctly one-off/schedule-less and are left as-is;
  // the new Mongoose model's `default: null` covers them on read.

  console.log("\nMigration complete.");
  await mongoose.connection.close();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
