import asyncHandler from "express-async-handler";
import Meetup from "../models/meetup.model.js";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import Poll from "../models/poll.model.js";
import { DateTime } from "luxon";
import { calculateNextMeetupDate, computeNextGenerationAt } from "../utils/date.utils.js";
import { notifyUsers } from "../utils/push.notifications.js";

const parseTimeString = (timeStr) => {
  if (!timeStr) return { hours: 9, minutes: 0 };
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return { hours, minutes };
};

const getVisibilityDays = (frequency) => {
  switch (frequency) {
    case 'daily':    return 3;
    case 'weekly':   return 7;
    case 'biweekly': return 14;
    case 'monthly':  return 31;
    default:         return 14;
  }
};

/**
 * @desc    Generate meetups for groups whose nextGenerationAt is now due.
 *          Only groups with work to do are loaded — idle runs cost near-zero CPU.
 * @route   POST /api/jobs/regenerate-meetups
 */
export const regenerateMeetups = asyncHandler(async (req, res) => {
  const now = DateTime.now();

  const groups = await Group.find({
    nextGenerationAt: { $lte: now.toJSDate() }
  });

  if (groups.length === 0) {
    return res.status(200).json({ generated: 0, message: "No groups due for generation." });
  }

  let generatedCount = 0;

  try {
    for (const group of groups) {
      const timezone = group.timezone;
      if (!group.schedule?.routines?.length) continue;

      const kickoffDate = group.schedule.startDate
        ? DateTime.fromJSDate(group.schedule.startDate, { zone: 'utc' })
            .setZone(timezone, { keepLocalTime: true })
            .startOf('day')
            .toJSDate()
        : now.setZone(timezone).startOf('day').toJSDate();

      const windowEndDT = now.setZone(timezone).plus({ days: 30 }).endOf('day');

      let earliestNextTrigger = null;

      for (const routine of group.schedule.routines) {
        for (const dtEntry of routine.dayTimes) {
          let currentAnchor = null;
          let fillingWindow = true;
          let safetyCounter = 0;

          while (fillingWindow && safetyCounter < 100) {
            safetyCounter++;

            const nextDate = calculateNextMeetupDate(
              routine.frequency === 'monthly' ? dtEntry.date : dtEntry.day,
              dtEntry.time,
              timezone,
              routine.frequency,
              currentAnchor,
              routine.frequency === 'ordinal' ? routine.rules?.[0] : null
            );

            const nextMeetupDT = DateTime.fromJSDate(nextDate).setZone(timezone);

            if (nextDate < kickoffDate) {
              currentAnchor = nextDate;
              safetyCounter++;
              continue;
            }

            if (nextMeetupDT > windowEndDT) {
              fillingWindow = false;
              break;
            }

            const alreadyExists = await Meetup.findOne({
              group: group._id,
              date: nextDate,
              time: dtEntry.time
            });

            if (!alreadyExists) {
              console.log(`[Regenerate] Creating: ${group.name} | ${nextMeetupDT.toISODate()}`);

              const { hours, minutes } = parseTimeString(group.generationLeadTime || "09:00 AM");

              const visibilityDT = nextMeetupDT
                .minus({ days: getVisibilityDays(routine.frequency) })
                .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

              const rsvpDT = nextMeetupDT
                .minus({ days: group.generationLeadDays || 1 })
                .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

              await Meetup.create({
                group: group._id,
                name: group.name,
                date: nextDate,
                time: dtEntry.time,
                timezone,
                location: group.defaultLocation || "",
                members: group.members,
                undecided: group.members,
                capacity: group.defaultCapacity || 0,
                isOverride: false,
                startsAt: nextDate,
                visibilityDate: visibilityDT.toJSDate(),
                rsvpOpenDate: rsvpDT.toJSDate()
              });

              generatedCount++;
            }

            currentAnchor = nextDate;
          }

          // Compute the trigger for the next occurrence beyond the window
          const trigger = computeNextGenerationAt(group, currentAnchor, routine, dtEntry);
          if (!earliestNextTrigger || trigger < earliestNextTrigger) {
            earliestNextTrigger = trigger;
          }
        }
      }

      if (earliestNextTrigger) {
        group.nextGenerationAt = earliestNextTrigger;
        await group.save();
      }
    }
  } catch (err) {
    console.error('[Regenerate] Error:', err);
  }

  res.status(200).json({ generated: generatedCount, message: "Regeneration complete." });
});

/**
 * @desc    Expire meetups whose start time has passed.
 *          Uses startsAt for a single atomic DB operation — no JS loop.
 * @route   POST /api/jobs/expire-meetups
 */
export const expirePastMeetups = asyncHandler(async (req, res) => {
  const now = new Date();

  const toExpire = await Meetup.find(
    { status: 'scheduled', startsAt: { $lte: now } },
    'group'
  );

  if (toExpire.length === 0) {
    return res.status(200).json({ message: "Job complete. Expired 0 meetups." });
  }

  const groupIds = [...new Set(toExpire.map(m => m.group.toString()))];

  const result = await Meetup.updateMany(
    { status: 'scheduled', startsAt: { $lte: now } },
    { $set: { status: 'expired' } }
  );

  if (groupIds.length > 0) {
    await User.updateMany(
      { mutedUntilNextMeetup: { $in: groupIds } },
      { $pull: { mutedUntilNextMeetup: { $in: groupIds } } }
    );
    console.log(`[Expire] Unmuted users for ${groupIds.length} group(s).`);
  }

  console.log(`[Expire] Expired ${result.modifiedCount} meetup(s).`);
  res.status(200).json({ message: `Job complete. Expired ${result.modifiedCount} meetups.` });
});

/**
 * @desc    Delete meetups that expired more than 10 days ago.
 * @route   POST /api/jobs/cleanup-meetups
 */
export const cleanupExpiredMeetups = asyncHandler(async (req, res) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 10);

  const result = await Meetup.deleteMany({
    status: 'expired',
    startsAt: { $lte: cutoff }
  });

  console.log(`[Cleanup] Deleted ${result.deletedCount} old meetup(s).`);
  res.status(200).json({ message: `Cleanup complete. Deleted ${result.deletedCount} old meetups.` });
});

/**
 * @desc    Send RSVP-open push notifications for meetups whose rsvpOpenDate just passed.
 *          Runs every minute independently of generation — cheap filtered query only.
 * @route   POST /api/jobs/notify-rsvp-open
 */
export const notifyRsvpOpen = asyncHandler(async (req, res) => {
  const now = new Date();

  const toNotify = await Meetup.find({
    status: 'scheduled',
    startsAt: { $gte: now },
    rsvpOpenDate: { $lte: now },
    rsvpNotified: false,
  });

  for (const meetup of toNotify) {
    await Meetup.updateOne({ _id: meetup._id }, { $set: { rsvpNotified: true } });
    const dateStr = new Date(meetup.date).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: meetup.timezone,
    });
    const members = await User.find({ _id: { $in: meetup.members } });
    if (members.length > 0) {
      await notifyUsers(members, {
        title: "RSVPs Are Open!",
        body: `You can now RSVP to "${meetup.name}" on ${dateStr}.`,
        data: { meetupId: meetup._id.toString(), type: 'rsvp_open', groupId: meetup.group.toString() },
      });
    }
  }

  res.status(200).json({ message: `Notified for ${toNotify.length} meetup(s).` });
});

/**
 * @desc    Expire polls whose expiresAt has passed and notify members of the winning option(s).
 *          Ties are announced/highlighted as co-winners.
 * @route   POST /api/jobs/expire-polls
 */
export const expirePolls = asyncHandler(async (req, res) => {
  const now = new Date();

  const toExpire = await Poll.find({
    status: 'active',
    expiresAt: { $lte: now },
  }).populate('group', 'members');

  let expiredCount = 0;

  for (const poll of toExpire) {
    poll.status = 'expired';
    await poll.save();
    expiredCount++;

    const maxVotes = Math.max(...poll.options.map(o => o.voters.length));
    const winners = maxVotes > 0 ? poll.options.filter(o => o.voters.length === maxVotes) : [];
    const winnerText = winners.length > 0
      ? winners.map(w => w.text).join(' & ')
      : null;

    const body = winnerText
      ? `"${poll.prompt}" has closed. Winner: ${winnerText}.`
      : `"${poll.prompt}" has closed with no votes.`;

    const members = await User.find({ _id: { $in: poll.group?.members || [] } });
    if (members.length > 0) {
      await notifyUsers(members, {
        title: "Poll Closed",
        body,
        data: { pollId: poll._id.toString(), groupId: poll.group._id.toString(), type: 'poll_expired' },
      });
    }
  }

  res.status(200).json({ message: `Job complete. Expired ${expiredCount} poll(s).` });
});
