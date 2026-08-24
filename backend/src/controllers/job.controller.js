import asyncHandler from "express-async-handler";
import Meetup from "../models/meetup.model.js";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import Poll from "../models/poll.model.js";
import { RSVP_REMINDER_STAGES } from "../utils/date.utils.js";
import { generateMeetupsForGroup } from "../utils/meetupGeneration.js";
import { notifyAndPersist } from "../utils/push.notifications.js";

/**
 * @desc    Generate meetups for groups whose nextGenerationAt is now due.
 *          Only groups with work to do are loaded — idle runs cost near-zero CPU.
 * @route   POST /api/jobs/regenerate-meetups
 */
export const regenerateMeetups = asyncHandler(async (req, res) => {
  const now = new Date();

  const groups = await Group.find({
    nextGenerationAt: { $lte: now }
  });

  if (groups.length === 0) {
    return res.status(200).json({ generated: 0, message: "No groups due for generation." });
  }

  let generatedCount = 0;

  try {
    for (const group of groups) {
      const { generatedCount: count } = await generateMeetupsForGroup(group);
      generatedCount += count;
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
      await notifyAndPersist(members, {
        title: "RSVPs Are Open!",
        body: `You can now RSVP to "${meetup.name}" on ${dateStr}.`,
        data: { meetupId: meetup._id.toString(), type: 'rsvp_open', groupId: meetup.group.toString() },
        type: 'meetup-rsvp-open',
        meetup: meetup._id,
        group: meetup.group,
      });
    }
  }

  res.status(200).json({ message: `Notified for ${toNotify.length} meetup(s).` });
});

/**
 * @desc    Send a "starting soon" push notification 30 minutes before a meetup's startsAt.
 *          Compares reminderNotifiedFor against the live startsAt instead of a boolean flag,
 *          so an owner/moderator rescheduling the meetup automatically re-arms the reminder
 *          for the new time without any extra bookkeeping on the update path.
 * @route   POST /api/jobs/notify-meetup-reminder
 */
export const notifyMeetupReminder = asyncHandler(async (req, res) => {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

  const toNotify = await Meetup.find({
    status: 'scheduled',
    startsAt: { $gte: now, $lte: windowEnd },
    $expr: { $ne: [{ $ifNull: ['$reminderNotifiedFor', null] }, '$startsAt'] },
  });

  for (const meetup of toNotify) {
    await Meetup.updateOne({ _id: meetup._id }, { $set: { reminderNotifiedFor: meetup.startsAt } });

    // Remind everyone still planning to go or undecided — skip anyone who already said they're out.
    const recipientIds = [...new Set([...meetup.in, ...meetup.undecided].map(id => id.toString()))];
    if (recipientIds.length === 0) continue;

    const recipients = await User.find({
      _id: { $in: recipientIds },
      expoPushToken: { $exists: true, $ne: null },
      mutedGroups: { $ne: meetup.group },
      mutedUntilNextMeetup: { $ne: meetup.group },
    });

    if (recipients.length > 0) {
      await notifyAndPersist(recipients, {
        title: "⏰ 30 Minutes!",
        body: `"${meetup.name}" kicks off at ${meetup.time} — start heading over!`,
        data: { meetupId: meetup._id.toString(), type: 'meetup_reminder', groupId: meetup.group.toString() },
        type: 'meetup-starting-soon',
        meetup: meetup._id,
        group: meetup.group,
      });
    }
  }

  res.status(200).json({ message: `Reminded for ${toNotify.length} meetup(s).` });
});

// Reminder copy per stage key, shared between frequencies that behave
// identically (biweekly mirrors weekly; ordinal mirrors monthly).
const DAILY_REMINDER_COPY = {
  '4d':  (name) => `Don't forget to RSVP for "${name}"!`,
  '24h': (name) => `Tomorrow's the day — RSVP for "${name}" when you get a sec.`,
  '6h':  (name) => `Starting in a few hours — grab your spot for "${name}"!`,
};
const WEEKLY_REMINDER_COPY = {
  '7d':  (name) => `"${name}" is coming up next week — RSVP whenever you're ready.`,
  '3d':  (name) => `3 days until "${name}" — let us know if you're in!`,
  '24h': (name) => `Tomorrow's the day — RSVP for "${name}".`,
  '6h':  (name) => `"${name}" starts in a few hours — RSVP if you can make it!`,
};
const MONTHLY_REMINDER_COPY = {
  '14d': (name) => `Mark your calendar — "${name}" is two weeks out. RSVP whenever works.`,
  '7d':  (name) => `One week until "${name}" — RSVP when you get a chance.`,
  '3d':  (name) => `3 days until "${name}" — let us know if you're in!`,
  '24h': (name) => `Tomorrow's the day — RSVP for "${name}".`,
  '6h':  (name) => `"${name}" starts in a few hours — RSVP if you can make it!`,
};
const RSVP_REMINDER_COPY = {
  daily: DAILY_REMINDER_COPY,
  weekly: WEEKLY_REMINDER_COPY,
  biweekly: WEEKLY_REMINDER_COPY,
  monthly: MONTHLY_REMINDER_COPY,
  ordinal: MONTHLY_REMINDER_COPY,
};

/**
 * @desc    Staged "you haven't RSVP'd yet" reminders leading up to a meetup,
 *          scaled by recurrence frequency (see RSVP_REMINDER_STAGES). Only
 *          targets members still in `undecided`, and only once RSVP is open
 *          (rsvpOpenDate null or already passed) — a meetup with a later
 *          open date simply skips whichever stages would've fallen before
 *          it; notifyRsvpOpen's own ping covers the moment it opens.
 *          If the job was down long enough that multiple stages are overdue
 *          at once, only the most imminent one is sent — the skipped,
 *          longer-lead stages are marked sent without notifying, so they
 *          don't fire belatedly out of order.
 * @route   POST /api/jobs/notify-rsvp-reminder-stages
 */
// No meetup can have a due-but-unsent stage further out than the longest
// configured offset, so bounding the query on it keeps the scan proportional
// to what's actually imminent instead of every future recurring meetup.
const MAX_STAGE_OFFSET_HOURS = Math.max(
  ...Object.values(RSVP_REMINDER_STAGES).flat().map(s => s.offsetHours)
);

export const notifyRsvpReminderStages = asyncHandler(async (req, res) => {
  const now = new Date();
  const horizon = new Date(now.getTime() + MAX_STAGE_OFFSET_HOURS * 60 * 60 * 1000);

  const toCheck = await Meetup.find({
    status: 'scheduled',
    startsAt: { $gt: now, $lte: horizon },
    frequency: { $ne: null },
    'undecided.0': { $exists: true },
  });

  let notifiedCount = 0;

  for (const meetup of toCheck) {
    if (meetup.rsvpOpenDate && new Date(meetup.rsvpOpenDate) > now) continue;
    // RSVP is closed but the event hasn't happened yet — nothing left to remind about.
    if (meetup.rsvpCloseDate && new Date(meetup.rsvpCloseDate) <= now) continue;

    const stages = RSVP_REMINDER_STAGES[meetup.frequency];
    if (!stages) continue;

    const sentSet = new Set(meetup.rsvpReminderStagesSent);
    const hoursUntilStart = (new Date(meetup.startsAt) - now) / (1000 * 60 * 60);
    const sortedAsc = [...stages].sort((a, b) => a.offsetHours - b.offsetHours);

    const dueStage = sortedAsc.find(s => hoursUntilStart <= s.offsetHours && !sentSet.has(s.key));
    if (!dueStage) continue;

    const stagesToMark = sortedAsc
      .filter(s => s.offsetHours >= dueStage.offsetHours && !sentSet.has(s.key))
      .map(s => s.key);
    await Meetup.updateOne(
      { _id: meetup._id },
      { $addToSet: { rsvpReminderStagesSent: { $each: stagesToMark } } }
    );

    const recipients = await User.find({
      _id: { $in: meetup.undecided },
      expoPushToken: { $exists: true, $ne: null },
      mutedGroups: { $ne: meetup.group },
      mutedUntilNextMeetup: { $ne: meetup.group },
    });

    if (recipients.length > 0) {
      const buildBody = RSVP_REMINDER_COPY[meetup.frequency]?.[dueStage.key];
      await notifyAndPersist(recipients, {
        title: "RSVP Reminder",
        body: buildBody ? buildBody(meetup.name) : `Don't forget to RSVP for "${meetup.name}"!`,
        data: { meetupId: meetup._id.toString(), type: 'meetup_rsvp_reminder', groupId: meetup.group.toString() },
        type: 'meetup-rsvp-reminder',
        meta: { stage: dueStage.key },
        meetup: meetup._id,
        group: meetup.group,
      });
      notifiedCount++;
    }
  }

  res.status(200).json({ message: `Sent stage reminders for ${notifiedCount} meetup(s).` });
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
      await notifyAndPersist(members, {
        title: "Poll Closed",
        body,
        data: { pollId: poll._id.toString(), groupId: poll.group._id.toString(), type: 'poll_expired' },
        type: 'poll-closed',
        poll: poll._id,
        group: poll.group._id,
      });
    }
  }

  res.status(200).json({ message: `Job complete. Expired ${expiredCount} poll(s).` });
});
