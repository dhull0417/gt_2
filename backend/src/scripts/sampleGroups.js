// Helpers for scripts/deleteSampleGroups.js, kept apart so they can be tested without a database.

// Sample groups were marked isDemo: true. The Group schema no longer has that field, so ask the raw
// collection rather than the model.
export const findSampleGroups = (groupCollection) =>
  groupCollection.find({ isDemo: true }).toArray();

export const summarize = (groups, meetupCountByGroupId) => ({
  groups: groups.length,
  withOtherMembers: groups.filter((g) => (g.members ?? []).some((m) => String(m) !== String(g.owner))).length,
  meetups: groups.reduce((n, g) => n + (meetupCountByGroupId[String(g._id)] ?? 0), 0),
});

// Deletes each group with deleteFn, one at a time, logging a line per group. A failure is recorded
// and the rest still go.
export async function deleteAll(groups, deleteFn, log) {
  let deleted = 0;
  const failed = [];
  for (const group of groups) {
    try {
      await deleteFn(group);
      deleted += 1;
      log(`  deleted ${group._id} "${group.name ?? ''}"`);
    } catch (e) {
      failed.push({ id: group._id, error: e?.message ?? String(e) });
      log(`  FAILED  ${group._id}: ${e?.message ?? e}`);
    }
  }
  return { deleted, failed };
}
