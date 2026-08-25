import asyncHandler from "express-async-handler";
import Meetup from "../models/meetup.model.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import Notification from "../models/notification.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import { parseTimeString } from "../utils/date.utils.js";
import { generateMeetupsForGroup } from "../utils/meetupGeneration.js";
import { canManageGroup, canManageMember } from "./group.controller.js";
import { notifyAndPersist } from "../utils/push.notifications.js";

/**
 * @desc    Get all meetups for the current user
 * @route   GET /api/meetups
 */
export const getMeetups = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const user = await User.findOne({ clerkId }).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const now = new Date();

    // Every meetup generated for a member is visible — the meetup tab caps how
    // many of each recurring series it displays (see the mobile dashboard), and
    // the group calendar shows everything, so there's no separate server-side
    // visibility window to apply here.
    const memberFilter = { members: user._id };

    const { since } = req.query;

    // Delta sync: the client already has a cached copy and only wants what
    // changed since its last sync, plus the current set of valid ids so it
    // can drop anything (left group, deleted meetup) that's no longer visible.
    if (since) {
        const sinceDate = new Date(since);
        if (isNaN(sinceDate.getTime())) {
            return res.status(400).json({ error: "Invalid 'since' timestamp." });
        }

        const [changed, validIds] = await Promise.all([
            Meetup.find({ ...memberFilter, updatedAt: { $gte: sinceDate } })
                .populate('group', 'name image owner moderators timezone defaultLocation visibilityLeadDays')
                .populate('members', 'firstName lastName profilePicture clerkId')
                .sort({ date: 1 }),
            Meetup.find(memberFilter).distinct('_id'),
        ]);

        return res.status(200).json({
            changed,
            validIds: validIds.map((id) => id.toString()),
            syncedAt: now.toISOString(),
        });
    }

    const meetups = await Meetup.find(memberFilter)
        .populate('group', 'name image owner moderators timezone defaultLocation visibilityLeadDays')
        .populate('members', 'firstName lastName profilePicture clerkId')
        .sort({ date: 1 });

    res.status(200).json(meetups);
});

/**
 * @desc    RSVP to a meetup
 * @route   POST /api/meetups/:meetupId/rsvp
 */
export const rsvpMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;
    const { status, targetUserId } = req.body;

    const requester = await User.findOne({ clerkId }).lean();
    if (!requester) return res.status(404).json({ error: "User not found." });

    if (!['in', 'out'].includes(status)) {
        return res.status(400).json({ error: "Invalid RSVP status." });
    }

    // Owner/moderator overriding another member's RSVP — permission-check up front
    // and swap `user` to the target so the rest of the function (which only ever
    // reads/writes `user`) applies to them instead of the requester.
    let user = requester;
    let actingAdmin = null;

    if (targetUserId && targetUserId !== requester._id.toString()) {
        const [targetUser, meetupForPerm] = await Promise.all([
            User.findById(targetUserId).lean(),
            Meetup.findById(meetupId).populate('group'),
        ]);
        if (!targetUser || !meetupForPerm) return res.status(404).json({ error: "Resource not found." });
        if (!meetupForPerm.members.some(id => id.toString() === targetUserId)) {
            return res.status(400).json({ error: "That user is not a member of this meetup." });
        }
        if (!canManageMember(requester._id, targetUser._id, meetupForPerm.group)) {
            return res.status(403).json({ error: "Permission denied." });
        }
        user = targetUser;
        actingAdmin = requester;
    }

    // Concurrent RSVPs on the same meetup (e.g. several members racing for the
    // last open spot) can lose Mongoose's optimistic-concurrency check. Retry
    // with a fresh copy of the document rather than surfacing the conflict.
    const MAX_RETRIES = 3;
    let meetup;
    let promotedUserId = null;
    let statusUnchanged = false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        meetup = await Meetup.findById(meetupId);
        if (!meetup) return res.status(404).json({ error: "Meetup not found." });

        // Admin overrides bypass the open/deadline window — the point of a manual
        // override is to finalize status regardless of the automatic window.
        if (!actingAdmin && meetup.rsvpOpenDate && new Date(meetup.rsvpOpenDate) > new Date()) {
            return res.status(400).json({ error: "RSVPs are not open yet." });
        }

        if (!actingAdmin && meetup.rsvpCloseDate && new Date(meetup.rsvpCloseDate) < new Date()) {
            return res.status(400).json({ error: "The RSVP deadline has passed." });
        }

        // Re-tapping the same RSVP button shouldn't re-notify the group. "In" covers
        // both the 'in' and 'waitlist' arrays since both represent an 'in' request.
        const wasIn = meetup.in.some(id => id.equals(user._id));
        const wasOut = meetup.out.some(id => id.equals(user._id));
        const wasWaitlisted = meetup.waitlist.some(id => id.equals(user._id));
        statusUnchanged = status === 'in' ? (wasIn || wasWaitlisted) : wasOut;
        if (statusUnchanged) break;

        // Safely extract the user from all arrays first to prevent duplicates using Mongoose .pull()
        meetup.in.pull(user._id);
        meetup.out.pull(user._id);
        meetup.waitlist.pull(user._id);
        meetup.undecided.pull(user._id);

        promotedUserId = null;

        if (status === 'out') {
            meetup.out.push(user._id);

            // Auto-promote the first person in the waitlist if capacity allows
            if (meetup.capacity > 0 && meetup.waitlist.length > 0 && meetup.in.length < meetup.capacity) {
                promotedUserId = meetup.waitlist.shift();
                meetup.in.push(promotedUserId);
            }
        } else if (status === 'in') {
            // Push to waitlist if at capacity, otherwise 'in'
            if (meetup.capacity > 0 && meetup.in.length >= meetup.capacity) {
                meetup.waitlist.push(user._id);
            } else {
                meetup.in.push(user._id);
            }
        }

        try {
            await meetup.save();
            break;
        } catch (err) {
            if (err instanceof mongoose.Error.VersionError && attempt < MAX_RETRIES) {
                continue;
            }
            throw err;
        }
    }

    // Notify the promoted waitlister only after the save actually succeeded,
    // so a retried attempt can't double-send this.
    if (!statusUnchanged && promotedUserId) {
        const nextUser = await User.findById(promotedUserId);
        if (nextUser) {
            await notifyAndPersist([nextUser], {
                title: "You're In! 🎉",
                body: `A spot opened up for "${meetup.name}" and you've been moved off the waitlist!`,
                data: { meetupId: meetup._id.toString(), type: 'meetup_waitlist_promoted' },
                type: 'waitlist-promotion',
                sender: user._id,
                meetup: meetup._id,
                group: meetup.group,
            });

            const promotedName = nextUser.firstName && nextUser.lastName
                ? `${nextUser.firstName} ${nextUser.lastName}`
                : nextUser.email?.split('@')[0];
            const membersToNotify = await User.find({
                _id: { $in: meetup.members, $nin: [user._id, nextUser._id] }
            });
            if (membersToNotify.length > 0) {
                await notifyAndPersist(membersToNotify, {
                    title: meetup.name,
                    body: `${promotedName} is going to ${meetup.name}!`,
                    data: { meetupId: meetup._id.toString(), type: 'meetup-rsvp' },
                    type: 'meetup-rsvp-in',
                    sender: nextUser._id,
                    meetup: meetup._id,
                    group: meetup.group,
                });
            }
        }
    }

    // Notify all other group members that this user has RSVP'd
    const otherMembers = statusUnchanged
        ? []
        : await User.find({ _id: { $in: meetup.members, $ne: user._id } });
    if (otherMembers.length > 0) {
        const displayName = user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.email?.split('@')[0];
        const ordinal = (n) => {
            const s = ['th', 'st', 'nd', 'rd'];
            const v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };
        const waitlistPos = meetup.waitlist.findIndex(id => id.toString() === user._id.toString());
        const notifBody = status === 'out'
            ? `${displayName} can't make it to ${meetup.name}.`
            : waitlistPos >= 0
                ? `${displayName} is ${ordinal(waitlistPos + 1)} in the waitlist for ${meetup.name}.`
                : `${displayName} is going to ${meetup.name}!`;
        const persistedType = status === 'out'
            ? 'meetup-rsvp-out'
            : waitlistPos >= 0
                ? 'meetup-waitlist-join'
                : 'meetup-rsvp-in';
        await notifyAndPersist(otherMembers, {
            title: meetup.name,
            body: notifBody,
            data: { meetupId: meetup._id.toString(), type: 'meetup-rsvp' },
            type: persistedType,
            sender: user._id,
            meetup: meetup._id,
            group: meetup.group,
        });
    }

    // Let the target know an admin changed their status on their behalf
    if (actingAdmin && !statusUnchanged) {
        await notifyAndPersist([user], {
            title: meetup.name,
            body: `${actingAdmin.firstName || 'A group admin'} marked you as ${status === 'in' ? 'going' : 'not going'} to ${meetup.name}.`,
            data: { meetupId: meetup._id.toString(), type: 'meetup_rsvp_admin' },
            type: status === 'in' ? 'meetup-rsvp-admin-in' : 'meetup-rsvp-admin-out',
            sender: actingAdmin._id,
            meetup: meetup._id,
            group: meetup.group,
        });
    }

    // Re-query with populations to return a fresh representation to the frontend hook
    const updatedMeetup = await Meetup.findById(meetupId)
        .populate('group', 'name owner moderators timezone defaultLocation')
        .populate('members', 'firstName lastName profilePicture clerkId');

    res.status(200).json({ message: "RSVP updated successfully.", meetup: updatedMeetup });
});


/**
 * @desc    Edit an existing meetup instance (Owner/Moderator Only)
 * @route   PUT /api/meetups/:meetupId
 */
export const updateMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;
    const { 
        date, 
        time,
        // timezone is intentionally omitted from destructuring
        capacity, 
        location 
    } = req.body; 

    const meetup = await Meetup.findById(meetupId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();
    
    if (!meetup || !requester) return res.status(404).json({ error: "Resource not found." });

    const isPast = new Date(meetup.date) < new Date();
        if (meetup.status === 'cancelled' || meetup.status === 'expired' || isPast) {
            return res.status(400).json({ error: "This event is closed for adjustments." });
        }

    if (!canManageGroup(requester._id, meetup.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    // --- The source of truth for timezone is ALWAYS the parent group ---
    const groupTimezone = meetup.group.timezone;

    // Store old values for notification check
    const oldDateStr = new Date(meetup.date).toLocaleDateString('en-US', { timeZone: groupTimezone });
    const oldTime = meetup.time;
    const oldLocation = meetup.location;
    const oldCapacity = meetup.capacity;

    // --- Partial Update & Validation ---
    const newDate = date || meetup.date;
    const newTime = time || meetup.time;

    // Validate if date/time is being changed to a past date
    if (date || time) {
        const timeParts = parseTimeString(newTime);
        const meetupDateTime = DateTime.fromJSDate(new Date(newDate), { zone: groupTimezone }).set({ hour: timeParts.hours, minute: timeParts.minutes });
        const now = DateTime.now().setZone(groupTimezone);

        if (meetupDateTime < now) {
            return res.status(400).json({ error: "Cannot reschedule an meetup to the past." });
        }
    }

    // Apply updates
    meetup.time = newTime;
    meetup.timezone = groupTimezone; // Always enforce the group's timezone
    if (capacity !== undefined) meetup.capacity = capacity;
    if (location !== undefined) meetup.location = location;

    // Recompute startsAt whenever date or time changes
    if (date || time) {
        const { hours: sH, minutes: sM } = parseTimeString(meetup.time);
        const startsAtDT = DateTime.fromJSDate(new Date(newDate))
            .setZone(groupTimezone)
            .set({ hour: sH, minute: sM, second: 0, millisecond: 0 });
        meetup.startsAt = startsAtDT.toJSDate();
        // `date` must carry the same merged date+time instant as `startsAt` —
        // every isPast/expiry check reads `date`, so leaving it as the raw
        // `newDate` (which may still carry the old time-of-day) made a
        // freshly-rescheduled future meetup look already-expired.
        meetup.date = startsAtDT.toJSDate();

        // rsvpOpenDate/rsvpCloseDate are anchored to the old startsAt — recompute
        // them the same way generation does, or a meetup whose deadline had
        // already passed stays permanently un-RSVP-able after being moved to a
        // future date.
        const group = meetup.group;
        const { hours: leadH, minutes: leadM } = parseTimeString(group.generationLeadTime || "09:00 AM");
        const newRsvpOpenDate = group.generationLeadDays != null
            ? startsAtDT.minus({ days: group.generationLeadDays }).set({ hour: leadH, minute: leadM, second: 0, millisecond: 0 }).toJSDate()
            : null;

        const { hours: closeH, minutes: closeM } = parseTimeString(group.generationDeadlineTime || "09:00 AM");
        const newRsvpCloseDate = group.generationDeadlineDays != null
            ? startsAtDT.minus({ days: group.generationDeadlineDays }).set({ hour: closeH, minute: closeM, second: 0, millisecond: 0 }).toJSDate()
            : null;

        meetup.rsvpOpenDate = newRsvpOpenDate;
        meetup.rsvpCloseDate = newRsvpCloseDate;
        // Already open (no gate, or the new open date has already passed) needs
        // no further "RSVPs are open" ping; a future open date re-arms one.
        meetup.rsvpNotified = !newRsvpOpenDate || newRsvpOpenDate <= new Date();

        // Staged RSVP reminders are keyed off startsAt — a reschedule should
        // re-arm them relative to the new time rather than staying silent for
        // whatever's left of the old schedule.
        meetup.rsvpReminderStagesSent = [];
    }

    meetup.isOverride = true;
    await meetup.save();

    // --- Notification Logic ---
    const newDateStr = new Date(meetup.date).toLocaleDateString('en-US', { timeZone: groupTimezone });
    const dateOrTimeChanged = oldDateStr !== newDateStr || oldTime !== meetup.time;
    const locationChanged = location !== undefined && oldLocation !== meetup.location;
    const capacityChanged = capacity !== undefined && oldCapacity !== meetup.capacity;

    // Recorded on the notification so the bell-icon list can say exactly what
    // changed instead of a generic "details were updated".
    const changedFields = [
        ...(dateOrTimeChanged ? ['schedule'] : []),
        ...(locationChanged ? ['location'] : []),
        ...(capacityChanged ? ['capacity'] : []),
    ];

    if (changedFields.length > 0) {
        const fieldLabels = { schedule: 'date and time', location: 'location', capacity: 'capacity' };
        const changeSummary = changedFields.map(f => fieldLabels[f]).join(' and ');

        const membersToNotify = await User.find({ _id: { $in: meetup.members } });
        if (membersToNotify.length > 0) {
            await notifyAndPersist(membersToNotify, {
                title: `Meetup Updated: ${meetup.name}`,
                body: `The ${changeSummary} for "${meetup.name}" changed. Tap to see what's new.`,
                data: { meetupId: meetup._id.toString(), type: 'meetup_updated' },
                type: 'meetup-updated',
                sender: requester._id,
                meetup: meetup._id,
                group: meetup.group._id,
                meta: { changedFields },
            });
        }
    }

    // Re-fetch the meetup after saving to ensure all paths are populated correctly for the response.
    const populatedMeetup = await Meetup.findById(meetup._id)
        .populate([
            { path: 'group', select: 'name owner moderators' },
            { path: 'members', select: 'firstName lastName _id profilePicture' },
            { path: 'in', select: 'firstName lastName _id profilePicture' },
            { path: 'out', select: 'firstName lastName _id profilePicture' },
            { path: 'waitlist', select: 'firstName lastName _id profilePicture' }
        ]);

    res.status(200).json({ message: "Meetup updated successfully.", meetup: populatedMeetup });
});


/**
 * @desc    Cancel an meetup (Owner/Moderator Only)
 */
export const cancelMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;

    const meetup = await Meetup.findById(meetupId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();

    if (!meetup || !requester) return res.status(404).json({ error: "Resource not found." });

    const isPast = new Date(meetup.date) < new Date();
        if (meetup.status === 'cancelled' || meetup.status === 'expired' || isPast) {
            return res.status(400).json({ error: "This event is closed for adjustments." });
        }

    if (!canManageGroup(requester._id, meetup.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    if (meetup.status === 'expired') {
        return res.status(400).json({ error: "Cannot cancel a meetup that has already expired." });
    }

    meetup.status = 'cancelled';
    meetup.isOverride = true;
    await meetup.save();

    const membersToNotify = await User.find({ _id: { $in: meetup.members } });
    if (membersToNotify.length > 0) {
        await notifyAndPersist(membersToNotify, {
            title: "Meetup Cancelled",
            body: `The meetup "${meetup.name}" on ${new Date(meetup.date).toLocaleDateString('en-US', { timeZone: meetup.timezone })} has been cancelled.`,
            data: { meetupId: meetup._id.toString(), type: 'meetup_cancellation' },
            type: 'meetup-cancelled',
            sender: requester._id,
            meetup: meetup._id,
            group: meetup.group._id,
        });
    }

    res.status(200).json({ message: "Meetup cancelled successfully.", meetup });
});

/**
 * @desc    Send an RSVP reminder push notification to undecided meetup members
 *          (Owner/Moderator Only). Pass a `userId` in the body to remind a single
 *          member, or omit it to remind everyone still undecided.
 * @route   POST /api/meetups/:meetupId/remind
 */
export const remindUndecided = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(meetupId)) {
        return res.status(400).json({ error: "Invalid Meetup ID." });
    }
    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ error: "Invalid User ID." });
    }

    const meetup = await Meetup.findById(meetupId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();

    if (!meetup || !requester) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, meetup.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    const isPast = new Date(meetup.date) < new Date();
    if (meetup.status === 'cancelled' || meetup.status === 'expired' || isPast) {
        return res.status(400).json({ error: "This event is closed for adjustments." });
    }

    // Mirrors the "Undecided" derivation used on the meetup detail screen:
    // any member who hasn't shown up in in/out/waitlist.
    const respondedIds = new Set([
        ...meetup.in.map(id => id.toString()),
        ...meetup.out.map(id => id.toString()),
        ...meetup.waitlist.map(id => id.toString()),
    ]);
    const undecidedMemberIds = meetup.members
        .map(id => id.toString())
        .filter(id => !respondedIds.has(id));

    let targetIds;
    if (userId) {
        if (!undecidedMemberIds.includes(userId.toString())) {
            return res.status(400).json({ error: "That member has already responded." });
        }
        targetIds = [userId.toString()];
    } else {
        targetIds = undecidedMemberIds;
    }

    if (targetIds.length === 0) {
        return res.status(200).json({ message: "No undecided members to remind." });
    }

    const targetUsers = await User.find({ _id: { $in: targetIds } });
    await notifyAndPersist(targetUsers, {
        title: `RSVP Reminder: ${meetup.name}`,
        body: `Don't forget to RSVP for "${meetup.name}"!`,
        data: { meetupId: meetup._id.toString(), type: 'meetup_rsvp_reminder' },
        type: 'meetup-rsvp-reminder',
        sender: requester._id,
        meetup: meetup._id,
        group: meetup.group._id,
    });

    res.status(200).json({
        message: `Reminder sent to ${targetUsers.length} member${targetUsers.length === 1 ? '' : 's'}.`
    });
});

/**
 * @desc    Permanently delete an meetup (Owner/Moderator Only)
 * Refined for Project 6: Loops to fill all due recurring spots after deletion.
 */
export const deleteMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(meetupId)) {
        return res.status(400).json({ error: "Invalid Meetup ID." });
    }

    const meetup = await Meetup.findById(meetupId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();
    if (!meetup || !requester) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, meetup.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    const wasRecurring = !meetup.isOverride;
    const parentGroup = meetup.group;

    await Meetup.findByIdAndDelete(meetupId);

    // If we delete a currently-active recurring meetup, immediately re-fill the
    // pipeline for every routine/dayTime on the group (rather than waiting for
    // the next cron tick) so the gap left behind is backfilled right away.
    if (wasRecurring && parentGroup.schedule?.routines?.length) {
        try {
            await generateMeetupsForGroup(parentGroup, {
                onMeetupCreated: async (newMeetup) => {
                    const membersToNotify = await User.find({ _id: { $in: parentGroup.members } });
                    if (membersToNotify.length > 0) {
                        await notifyAndPersist(membersToNotify, {
                            title: "New Meetup Scheduled",
                            body: `A new meetup for "${parentGroup.name}" has been scheduled for ${new Date(newMeetup.date).toLocaleDateString('en-US', { timeZone: parentGroup.timezone })}.`,
                            data: { meetupId: newMeetup._id.toString(), type: 'meetup_created', groupId: parentGroup._id.toString() },
                            type: 'meetup-created',
                            sender: requester._id,
                            meetup: newMeetup._id,
                            group: parentGroup._id,
                        });
                    }
                },
            });
        } catch (regenError) {
            console.error("Failed to regenerate meetups after deletion:", regenError);
        }
    }

    res.status(200).json({ message: "Meetup deleted successfully." });
});