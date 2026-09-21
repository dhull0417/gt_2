const INDEX_NAME = "uniq_group_schedule_date_time";

module.exports = {
  /**
   * Removes duplicate schedule-generated meetups (same group/schedule/date/time)
   * left over from the race in generateMeetupsForSchedule, then adds the unique
   * index that prevents new ones. Must dedupe first — Mongo refuses to build a
   * unique index over data that already violates it.
   *
   * For each duplicated slot, keeps the copy with the most RSVP activity
   * (in/out/waitlist) so real user responses aren't lost; ties go to the
   * oldest document (the original, not the racing duplicate).
   *
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async up(db, client) {
    const meetups = db.collection("meetups");

    console.log("Scanning for duplicate schedule-generated meetups...");
    const duplicateGroups = await meetups
      .aggregate([
        // Only schedule-generated/linked meetups are deduped — one-off
        // meetups (schedule: null) can legitimately share a date/time.
        { $match: { schedule: { $type: "objectId" } } },
        {
          $group: {
            _id: { group: "$group", schedule: "$schedule", date: "$date", time: "$time" },
            count: { $sum: 1 },
            docs: {
              $push: {
                _id: "$_id",
                createdAt: "$createdAt",
                engagement: {
                  $add: [
                    { $size: { $ifNull: ["$in", []] } },
                    { $size: { $ifNull: ["$out", []] } },
                    { $size: { $ifNull: ["$waitlist", []] } },
                  ],
                },
              },
            },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();

    console.log(`Found ${duplicateGroups.length} duplicated slot(s).`);

    const idsToDelete = [];
    for (const group of duplicateGroups) {
      const sorted = [...group.docs].sort((a, b) => {
        if (b.engagement !== a.engagement) return b.engagement - a.engagement;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
      const [, ...duplicates] = sorted; // keep sorted[0], drop the rest
      idsToDelete.push(...duplicates.map((d) => d._id));
    }

    if (idsToDelete.length > 0) {
      const result = await meetups.deleteMany({ _id: { $in: idsToDelete } });
      console.log(`Deleted ${result.deletedCount} duplicate meetup(s).`);
    } else {
      console.log("No duplicates to delete.");
    }

    console.log("Creating unique index on (group, schedule, date, time)...");
    await meetups.createIndex(
      { group: 1, schedule: 1, date: 1, time: 1 },
      {
        unique: true,
        partialFilterExpression: { schedule: { $type: "objectId" } },
        name: INDEX_NAME,
      }
    );
    console.log("Index created.");
  },

  /**
   * Deduping deleted data isn't reversible — this only drops the constraint.
   *
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async down(db, client) {
    await db.collection("meetups").dropIndex(INDEX_NAME);
  },
};
