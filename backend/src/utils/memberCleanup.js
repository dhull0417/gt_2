import Meetup from "../models/meetup.model.js";
import Group from "../models/group.model.js";
import { loadClerkIds, promoteWaitlist } from "./waitlist.js";
import { guestCountFn, normalizeRides } from "./rides.js";
import { notifyRideChanges } from "./rideNotify.js";

/**
 * Removes a person's footprint from a group's upcoming meetups: their RSVP and
 * everything hanging off it (guests, things they signed up to bring, ride, answers,
 * priority spot, saved tournament rankings). Spots they free up go to the waitlist.
 *
 * Pass `groupId` to scope it to one group (leaving / being removed); omit it to
 * clean every upcoming meetup the person is a member of (account deletion).
 */
export const scrubMemberFromUpcomingMeetups = async ({ userId, clerkId, groupId }) => {
  const scope = { date: { $gte: new Date() }, ...(groupId ? { group: groupId } : { members: userId }) };

  // Remember where they held a spot so those meetups can be offered to the waitlist afterwards.
  const heldSpot = await Meetup.find({ ...scope, in: userId, 'waitlist.0': { $exists: true } }).select('_id').lean();

  // Rides first, one meetup at a time, so the people who rode with them (or drove them) are told.
  const withRide = await Meetup.find({ ...scope, 'rides.user': userId }).select('_id').lean();
  for (const { _id } of withRide) {
    try {
      const meetup = await Meetup.findById(_id);
      if (!meetup?.rides?.length) continue;
      const stillIn = meetup.in.filter((id) => String(id) !== String(userId));
      const { rides, released } = normalizeRides(meetup.rides, stillIn, guestCountFn(meetup, await loadClerkIds(stillIn)));
      meetup.rides = rides;
      await meetup.save();
      await notifyRideChanges(meetup, released, userId);
    } catch (err) {
      console.error('Releasing rides after member removal failed:', err);
    }
  }

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
    { ...scope, 'priorityTiers.members': userId },
    { $pull: { 'priorityTiers.$[].members': userId } }
  );

  // Saved tournament rankings live on the group.
  await Group.updateMany(
    { ...(groupId ? { _id: groupId } : {}), 'rankingLists.order': userId },
    { $pull: { 'rankingLists.$[].order': userId } }
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
