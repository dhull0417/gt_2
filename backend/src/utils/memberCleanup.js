import Meetup from "../models/meetup.model.js";
import Group from "../models/group.model.js";
import { promoteWaitlist } from "./waitlist.js";

/**
 * Removes a person's footprint from a group's upcoming meetups: their RSVP and
 * everything hanging off it (guests, things they signed up to bring, ride, answers,
 * team spot, priority spot). Spots they free up go to the waitlist.
 *
 * Pass `groupId` to scope it to one group (leaving / being removed); omit it to
 * clean every upcoming meetup the person is a member of (account deletion).
 */
export const scrubMemberFromUpcomingMeetups = async ({ userId, clerkId, groupId }) => {
  const scope = { date: { $gte: new Date() }, ...(groupId ? { group: groupId } : { members: userId }) };

  // Remember where they held a spot so those meetups can be offered to the waitlist afterwards.
  const heldSpot = await Meetup.find({ ...scope, in: userId, 'waitlist.0': { $exists: true } }).select('_id').lean();

  await Meetup.updateMany(scope, {
    $pull: {
      members: userId,
      in: userId,
      out: userId,
      undecided: userId,
      waitlist: userId,
      bringClaims: { user: userId },
      rides: { user: userId },
      answers: { user: userId },
      guests: { userId: clerkId },
    },
  });

  // Nested arrays are cleaned in separate steps that only touch documents where the
  // person actually appears (array updates fail on documents missing the array).
  await Meetup.updateMany(
    { ...scope, 'teams.members': userId },
    { $pull: { 'teams.$[].members': userId } }
  );
  await Meetup.updateMany(
    { ...scope, 'priorityTiers.members': userId },
    { $pull: { 'priorityTiers.$[].members': userId } }
  );

  // Priority rankings live on each series.
  await Group.updateMany(
    { ...(groupId ? { _id: groupId } : {}), 'schedules.priorityOrder': userId },
    { $pull: { 'schedules.$[].priorityOrder': userId } }
  );

  for (const { _id } of heldSpot) {
    try {
      await promoteWaitlist(_id);
    } catch (err) {
      console.error('Waitlist promotion after member removal failed:', err);
    }
  }
};
