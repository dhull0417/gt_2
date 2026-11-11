// Removing tournaments when what they belong to goes away. Finished events outlive their
// meetup (group Stats use them); unfinished ones go with it. Errors are logged, never thrown,
// so a failed cleanup can't block the deletion that triggered it.
import Tournament from "../../models/tournament.model.js";

export const deleteTournamentsForGroup = async (groupId) => {
  try {
    await Tournament.deleteMany({ group: groupId });
  } catch (err) {
    console.error("Deleting the group's tournaments failed:", err);
  }
};

export const deleteUnfinishedTournaments = async (meetupIds) => {
  const ids = (Array.isArray(meetupIds) ? meetupIds : [meetupIds]).filter(Boolean);
  if (!ids.length) return;
  try {
    await Tournament.deleteMany({ meetup: { $in: ids }, status: 'active' });
  } catch (err) {
    console.error("Deleting unfinished tournaments failed:", err);
  }
};
