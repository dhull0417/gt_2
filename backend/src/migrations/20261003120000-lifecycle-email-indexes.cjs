module.exports = {
  /**
   * Indexes for the lifecycle email system. Additive only: the new collection
   * is empty and the users indexes are sparse/partial, so nothing here can
   * fail on existing data. (Production has autoIndex off.)
   *
   * @param db {import('mongodb').Db}
   */
  async up(db) {
    await db.collection("emaillogs").createIndex({ user: 1, key: 1 }, { unique: true, name: "uniq_emaillog_user_key" });
    await db.collection("emaillogs").createIndex({ user: 1, sentAt: -1 }, { name: "emaillog_user_sentAt" });
    await db.collection("users").createIndex(
      { "lifecycle.enrolledAt": 1 },
      { name: "user_lifecycle_enrolledAt", partialFilterExpression: { "lifecycle.enrolledAt": { $type: "date" } } }
    );
    await db.collection("users").createIndex(
      { "lifecycle.firstGroupAt": 1 },
      { name: "user_lifecycle_firstGroupAt", partialFilterExpression: { "lifecycle.firstGroupAt": { $type: "date" } } }
    );
  },

  /** @param db {import('mongodb').Db} */
  async down(db) {
    await db.collection("emaillogs").dropIndex("uniq_emaillog_user_key").catch(() => {});
    await db.collection("emaillogs").dropIndex("emaillog_user_sentAt").catch(() => {});
    await db.collection("users").dropIndex("user_lifecycle_enrolledAt").catch(() => {});
    await db.collection("users").dropIndex("user_lifecycle_firstGroupAt").catch(() => {});
  },
};
