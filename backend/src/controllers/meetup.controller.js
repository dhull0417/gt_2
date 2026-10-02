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
import { groupHasPremium, withGroupPremium } from "../utils/premium.js";
import { evaluateMinimumHeadcount, evaluateDueMeetups } from "../utils/minimumHeadcount.js";
import { canRsvpNow, userOpensAt, userTierIndex, notifyOpenTiers } from "../utils/priorityRsvp.js";

/**
 * @desc    Get all meetups for the current user
 * @route   GET /api/meetups
 */
export const getMeetups = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const user = await User.findOne({ clerkId }).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const now = new Date();

    // No server-side visibility window — the mobile dashboard caps how many of
    // each series it shows; the group calendar shows everything.
    const memberFilter = { members: user._id };

    const { since } = req.query;

    // Evaluate minimum headcount for any of this user's meetups whose deadline
    // just passed, so they never see "RSVPs closed" and then a later cancel.
    try {
        await evaluateDueMeetups({ members: user._id });
    } catch (err) {
        console.error("getMeetups minimum check failed:", err);
    }

    // Delta sync: returns what changed since last sync, plus valid ids so the
    // client can drop entries that are no longer visible.
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
            changed: await withGroupPremium(changed),
            validIds: validIds.map((id) => id.toString()),
            syncedAt: now.toISOString(),
        });
    }

    const meetups = await Meetup.find(memberFilter)
        .populate('group', 'name image owner moderators timezone defaultLocation visibilityLeadDays')
        .populate('members', 'firstName lastName profilePicture clerkId')
        .sort({ date: 1 });

    res.status(200).json(await withGroupPremium(meetups));
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

    // Admin override: after the permission check, swap `user` to the target so
    // the rest of the function applies to them instead of the requester.
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

    // Retry on version conflict — concurrent RSVPs racing for the last spot can
    // trip Mongoose's optimistic-concurrency check.
    const MAX_RETRIES = 3;
    let meetup;
    let promotedUserId = null;
    let bumpedUserId = null;
    let statusUnchanged = false;

    // Waitlist + auto-promotion is a Premium feature of the group's owner.
    // Looked up lazily (and once) since most RSVPs never touch it.
    let waitlistEnabled;
    const getWaitlistEnabled = async () => {
        if (waitlistEnabled === undefined) {
            const groupDoc = await Group.findById(meetup.group).select('owner').lean();
            waitlistEnabled = await groupHasPremium(groupDoc);
        }
        return waitlistEnabled;
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        meetup = await Meetup.findById(meetupId);
        if (!meetup) return res.status(404).json({ error: "Meetup not found." });

        // Deadline just passed and the minimum hasn't been evaluated: do it now,
        // so the outcome is either "cancelled: minimum not met" or a normal close.
        if (meetup.status === 'scheduled' && meetup.minAttendees > 0 && !meetup.minimumChecked
            && meetup.rsvpCloseDate && new Date(meetup.rsvpCloseDate) <= new Date()) {
            const outcome = await evaluateMinimumHeadcount(meetup._id);
            if (outcome === 'cancelled') {
                return res.status(400).json({ error: "This meetup was cancelled: the RSVP deadline passed and the minimum headcount wasn't met." });
            }
            meetup = await Meetup.findById(meetupId);
            if (!meetup) return res.status(404).json({ error: "Meetup not found." });
        }

        // Admin overrides bypass the open/deadline window by design.
        // Before the general open time, only members of a priority group whose window
        // has opened (on schedule, or early because the groups ahead have answered) may RSVP.
        if (!actingAdmin && meetup.rsvpOpenDate && new Date(meetup.rsvpOpenDate) > new Date()) {
            const tiersActive = (meetup.priorityTiers?.length ?? 0) > 0 && await getWaitlistEnabled();
            if (!canRsvpNow(meetup, user._id, tiersActive)) {
                return res.status(400).json({
                    error: tiersActive && userTierIndex(meetup, user._id) >= 0
                        ? "It's not your group's turn to RSVP yet."
                        : "RSVPs are not open yet.",
                    opensAt: tiersActive ? userOpensAt(meetup, user._id) : meetup.rsvpOpenDate,
                });
            }
        }

        if (!actingAdmin && meetup.rsvpCloseDate && new Date(meetup.rsvpCloseDate) < new Date()) {
            return res.status(400).json({ error: "The RSVP deadline has passed." });
        }

        // Skip re-notifying on a repeat tap; "in" covers both in and waitlist.
        const wasIn = meetup.in.some(id => id.equals(user._id));
        const wasOut = meetup.out.some(id => id.equals(user._id));
        const wasWaitlisted = meetup.waitlist.some(id => id.equals(user._id));
        // A waitlisted user's repeat "in" tap is a no-op only while the meetup is
        // still full; once a spot is open (e.g. the owner isn't Premium, so there
        // is no auto-promotion) the tap moves them in.
        const wasAtCapacity = meetup.capacity > 0 && meetup.in.length >= meetup.capacity;
        statusUnchanged = status === 'in' ? (wasIn || (wasWaitlisted && wasAtCapacity)) : wasOut;
        if (statusUnchanged) break;

        // pull from all arrays first to avoid duplicates
        meetup.in.pull(user._id);
        meetup.out.pull(user._id);
        meetup.waitlist.pull(user._id);
        meetup.undecided.pull(user._id);

        promotedUserId = null;
        bumpedUserId = null;

        if (status === 'out') {
            meetup.out.push(user._id);
            // Leaving frees up whatever they'd signed up to bring and their ride seat.
            if (meetup.bringClaims?.length) meetup.bringClaims = meetup.bringClaims.filter(c => !c.user.equals(user._id));
            if (meetup.rides?.length) meetup.rides = meetup.rides.filter(r => !r.user.equals(user._id));

            // Auto-promote the first person in the waitlist if capacity allows
            // (Premium only; without it people already waitlisted stay put and
            // can tap "I'm In" themselves once a spot is open).
            if (meetup.capacity > 0 && meetup.waitlist.length > 0 && meetup.in.length < meetup.capacity
                && await getWaitlistEnabled()) {
                promotedUserId = meetup.waitlist.shift();
                meetup.in.push(promotedUserId);
            }
        } else if (status === 'in') {
            // Push to waitlist if at capacity (Premium), otherwise 'in'
            if (meetup.capacity > 0 && meetup.in.length >= meetup.capacity) {
                // Priority RSVP: a member of a higher group takes a spot from the
                // lowest-priority person who's in (they go to the front of the waitlist).
                const myTier = (meetup.priorityTiers?.length ?? 0) > 0 ? userTierIndex(meetup, user._id) : -1;
                let victimId = null;
                if (myTier >= 0 && await getWaitlistEnabled()) {
                    let worst = -1;
                    for (const id of meetup.in) {
                        if (id.equals(user._id)) continue;
                        const t = userTierIndex(meetup, id);
                        const rank = t < 0 ? Infinity : t;
                        // must be strictly lower priority than the requester; ties go to
                        // the most recent RSVP (later in the array)
                        if (rank > myTier && rank >= worst) {
                            worst = rank;
                            victimId = id;
                        }
                    }
                }
                if (victimId) {
                    meetup.in.pull(victimId);
                    meetup.waitlist.unshift(victimId);
                    if (meetup.bringClaims?.length) meetup.bringClaims = meetup.bringClaims.filter(c => !c.user.equals(victimId));
                    if (meetup.rides?.length) meetup.rides = meetup.rides.filter(r => !r.user.equals(victimId));
                    bumpedUserId = victimId;
                    meetup.in.push(user._id);
                } else {
                    if (!(await getWaitlistEnabled())) {
                        // Nothing has been saved yet, so bailing out here changes no state.
                        return res.status(409).json({
                            error: "meetup_full",
                            message: "This meetup is full.",
                        });
                    }
                    meetup.waitlist.push(user._id);
                }
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

    // Notify only after save succeeds, so a retry can't double-send.
    if (!statusUnchanged && bumpedUserId) {
        const bumped = await User.findById(bumpedUserId);
        if (bumped) {
            await notifyAndPersist([bumped], {
                title: "Moved to the waitlist",
                body: `A member with RSVP priority took a spot in "${meetup.name}". You're first on the waitlist.`,
                data: { meetupId: meetup._id.toString(), type: 'meetup_waitlist_bumped' },
                type: 'priority-bumped',
                sender: user._id,
                meetup: meetup._id,
                group: meetup.group,
            });
        }
    }

    // If this answer completed a priority group, the next group's window opens right
    // away (ahead of schedule); let them know. Failures here must not fail the RSVP.
    if (!statusUnchanged && (meetup.priorityTiers?.length ?? 0) > 0) {
        try {
            await notifyOpenTiers(meetup._id);
        } catch (err) {
            console.error("RSVP notifyOpenTiers failed:", err);
        }
    }

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

    // re-fetch, fully populated, for the response
    const updatedMeetup = await Meetup.findById(meetupId)
        .populate('group', 'name owner moderators timezone defaultLocation')
        .populate('members', 'firstName lastName profilePicture clerkId');

    res.status(200).json({ message: "RSVP updated successfully.", meetup: await withGroupPremium(updatedMeetup) });
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
        location,
        description
    } = req.body;

    const meetup = await Meetup.findById(meetupId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();
    
    if (!meetup || !requester) return res.status(404).json({ error: "Resource not found." });

    const isPast = new Date(meetup.date) < new Date();
        if (meetup.status === 'cancelled' || meetup.status === 'expired' || isPast) {
            return res.status(400).json({ error: "This event is closed for adjustments." });
        }

    const isCreator = meetup.createdBy && meetup.createdBy.toString() === requester._id.toString();
    if (!canManageGroup(requester._id, meetup.group) && !isCreator) {
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
    if (description !== undefined) meetup.description = description;

    // Recompute startsAt whenever date or time changes
    if (date || time) {
        const { hours: sH, minutes: sM } = parseTimeString(meetup.time);
        const startsAtDT = DateTime.fromJSDate(new Date(newDate))
            .setZone(groupTimezone)
            .set({ hour: sH, minute: sM, second: 0, millisecond: 0 });
        meetup.startsAt = startsAtDT.toJSDate();
        // keep `date` in sync with `startsAt`: isPast/expiry checks read `date`,
        // and the old time-of-day made reschedules look already-expired.
        meetup.date = startsAtDT.toJSDate();

        // recompute rsvpOpenDate/CloseDate as generation does, or a past deadline
        // stays stuck even after the meetup moves to a future date. Settings come from the meetup's own linked schedule now
        // — a one-off meetup with no schedule keeps no RSVP gating at all.
        const linkedSchedule = meetup.schedule ? meetup.group.schedules?.id(meetup.schedule) : null;
        const { hours: leadH, minutes: leadM } = parseTimeString(linkedSchedule?.generationLeadTime || "09:00 AM");
        const newRsvpOpenDate = linkedSchedule?.generationLeadDays != null
            ? startsAtDT.minus({ days: linkedSchedule.generationLeadDays }).set({ hour: leadH, minute: leadM, second: 0, millisecond: 0 }).toJSDate()
            : null;

        const { hours: closeH, minutes: closeM } = parseTimeString(linkedSchedule?.generationDeadlineTime || "09:00 AM");
        const newRsvpCloseDate = linkedSchedule?.generationDeadlineDays != null
            ? startsAtDT.minus({ days: linkedSchedule.generationDeadlineDays }).set({ hour: closeH, minute: closeM, second: 0, millisecond: 0 }).toJSDate()
            : null;

        meetup.rsvpOpenDate = newRsvpOpenDate;
        meetup.rsvpCloseDate = newRsvpCloseDate;
        // mark already-open (no gate, or open date already past) to skip the ping;
        // a future open date re-arms it.
        meetup.rsvpNotified = !newRsvpOpenDate || newRsvpOpenDate <= new Date();

        // clear reminder stages so a reschedule re-arms them off the new time.
        meetup.rsvpReminderStagesSent = [];
    }

    meetup.isOverride = true;
    try {
        await meetup.save();
    } catch (err) {
        // Rescheduled onto a slot another meetup in the same series already
        // occupies (the unique index on group+schedule+date+time caught it) —
        // a real, if rare, case rather than a server error.
        if (err.code === 11000) {
            return res.status(409).json({ error: "Another meetup in this series is already scheduled at that date and time." });
        }
        throw err;
    }

    // --- Notification Logic ---
    const newDateStr = new Date(meetup.date).toLocaleDateString('en-US', { timeZone: groupTimezone });
    const dateOrTimeChanged = oldDateStr !== newDateStr || oldTime !== meetup.time;
    const locationChanged = location !== undefined && oldLocation !== meetup.location;
    const capacityChanged = capacity !== undefined && oldCapacity !== meetup.capacity;

    // lets the bell-icon list say exactly what changed
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

    // re-fetch, fully populated, for the response
    const populatedMeetup = await Meetup.findById(meetup._id)
        .populate([
            { path: 'group', select: 'name owner moderators' },
            { path: 'members', select: 'firstName lastName _id profilePicture' },
            { path: 'in', select: 'firstName lastName _id profilePicture' },
            { path: 'out', select: 'firstName lastName _id profilePicture' },
            { path: 'waitlist', select: 'firstName lastName _id profilePicture' }
        ]);

    res.status(200).json({ message: "Meetup updated successfully.", meetup: await withGroupPremium(populatedMeetup) });
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

    const isCreator = meetup.createdBy && meetup.createdBy.toString() === requester._id.toString();
    if (!canManageGroup(requester._id, meetup.group) && !isCreator) {
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

    res.status(200).json({ message: "Meetup cancelled successfully.", meetup: await withGroupPremium(meetup) });
});

/**
 * @desc    Restore a cancelled meetup back to scheduled (Owner/Moderator/Creator Only)
 * @route   PATCH /api/meetups/:meetupId/restore
 */
export const restoreMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;

    const meetup = await Meetup.findById(meetupId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();

    if (!meetup || !requester) return res.status(404).json({ error: "Resource not found." });

    const isCreator = meetup.createdBy && meetup.createdBy.toString() === requester._id.toString();
    if (!canManageGroup(requester._id, meetup.group) && !isCreator) {
        return res.status(403).json({ error: "Permission denied." });
    }

    if (meetup.status !== 'cancelled') {
        return res.status(400).json({ error: "Only a cancelled meetup can be restored." });
    }

    const isPast = new Date(meetup.date) < new Date();
    if (isPast) {
        return res.status(400).json({ error: "Cannot restore a meetup that is already in the past." });
    }

    meetup.status = 'scheduled';
    meetup.cancelReason = null;
    meetup.isOverride = true;
    await meetup.save();

    const membersToNotify = await User.find({ _id: { $in: meetup.members } });
    if (membersToNotify.length > 0) {
        await notifyAndPersist(membersToNotify, {
            title: "Meetup Restored",
            body: `The meetup "${meetup.name}" on ${new Date(meetup.date).toLocaleDateString('en-US', { timeZone: meetup.timezone })} is back on.`,
            data: { meetupId: meetup._id.toString(), type: 'meetup_restored' },
            type: 'meetup-restored',
            sender: requester._id,
            meetup: meetup._id,
            group: meetup.group._id,
        });
    }

    res.status(200).json({ message: "Meetup restored successfully.", meetup: await withGroupPremium(meetup) });
});

/**
 * @desc    Remind undecided members to RSVP (Owner/Moderator Only). Pass `userId`
 *          to remind one member, or omit to remind everyone undecided.
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

    // mirrors the detail screen's Undecided logic: members not in in/out/waitlist
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
 * @desc    Permanently delete a meetup (Owner/Moderator Only)
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

    const isCreator = meetup.createdBy && meetup.createdBy.toString() === requester._id.toString();
    if (!canManageGroup(requester._id, meetup.group) && !isCreator) {
        return res.status(403).json({ error: "Permission denied." });
    }

    const wasRecurring = !meetup.isOverride;
    const parentGroup = meetup.group;

    await Meetup.findByIdAndDelete(meetupId);

    // deleting an active recurring meetup backfills the pipeline immediately,
    // instead of waiting for the next cron tick.
    if (wasRecurring && parentGroup.schedules?.some(s => s.active !== false && s.routines?.length)) {
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

/**
 * @desc    Set what a member is bringing and/or their ride role for a meetup
 *          (Premium). Members set their own; owners/moderators can set it for
 *          members they manage by passing targetUserId.
 * @route   PUT /api/meetups/:meetupId/assignments
 * @body    { bring?: string[] (item ids), ride?: null | {role:'driver', seats:number} | {role:'passenger'}, targetUserId? }
 */
export const setAssignments = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;
    const { bring, ride, targetUserId } = req.body;

    const requester = await User.findOne({ clerkId }).lean();
    if (!requester) return res.status(404).json({ error: "User not found." });

    if (bring !== undefined && !Array.isArray(bring)) {
        return res.status(400).json({ error: "Invalid list of items." });
    }
    if (ride !== undefined && ride !== null) {
        if (!['driver', 'passenger'].includes(ride?.role)) {
            return res.status(400).json({ error: "Ride role must be driver or passenger." });
        }
        if (ride.role === 'driver') {
            const seats = Number(ride.seats);
            if (!Number.isInteger(seats) || seats < 0 || seats > 20) {
                return res.status(400).json({ error: "Seats must be a whole number from 0 to 20." });
            }
        }
    }

    let user = requester;
    let actingAdmin = null;
    if (targetUserId && targetUserId !== requester._id.toString()) {
        const [targetUser, meetupForPerm] = await Promise.all([
            User.findById(targetUserId).lean(),
            Meetup.findById(meetupId).populate('group'),
        ]);
        if (!targetUser || !meetupForPerm) return res.status(404).json({ error: "Resource not found." });
        if (!canManageMember(requester._id, targetUser._id, meetupForPerm.group)) {
            return res.status(403).json({ error: "Permission denied." });
        }
        user = targetUser;
        actingAdmin = requester;
    }

    const MAX_RETRIES = 3;
    let meetup;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        meetup = await Meetup.findById(meetupId);
        if (!meetup) return res.status(404).json({ error: "Meetup not found." });
        if (meetup.status !== 'scheduled') {
            return res.status(400).json({ error: "This meetup is closed for changes." });
        }
        if (!meetup.members.some(id => id.equals(user._id))) {
            return res.status(403).json({ error: "Not a member of this meetup." });
        }
        if (attempt === 1) {
            const groupDoc = await Group.findById(meetup.group).select('owner').lean();
            if (!(await groupHasPremium(groupDoc))) {
                return res.status(403).json({ error: "premium_required", message: "Meetup assignments require GroupThat Premium." });
            }
        }
        if (!meetup.in.some(id => id.equals(user._id))) {
            return res.status(400).json({ error: "RSVP \"I'm In\" first to choose what you're bringing." });
        }

        if (bring !== undefined) {
            const itemsById = new Map(meetup.bringItems.map(i => [i._id.toString(), i]));
            const wanted = [...new Set(bring.map(String))];
            for (const id of wanted) {
                if (!itemsById.has(id)) return res.status(400).json({ error: "Unknown item." });
            }
            const alreadyMine = new Set(
                meetup.bringClaims.filter(c => c.user.equals(user._id)).map(c => c.item.toString())
            );
            // Max applies to how many people have claimed an item; only newly
            // added claims are checked, so keeping an existing one never fails.
            for (const id of wanted) {
                if (alreadyMine.has(id)) continue;
                const item = itemsById.get(id);
                // Only people still going count toward the limit.
                const taken = meetup.bringClaims.filter(c =>
                    c.item.toString() === id && !c.user.equals(user._id) && meetup.in.some(u => u.equals(c.user))
                ).length;
                if (item.max && taken >= item.max) {
                    return res.status(409).json({
                        error: "item_full",
                        message: `"${item.name}" has already been taken.`,
                        itemId: id,
                    });
                }
            }
            meetup.bringClaims = [
                ...meetup.bringClaims.filter(c => !c.user.equals(user._id)),
                ...wanted.map(id => ({ user: user._id, item: id })),
            ];
        }

        if (ride !== undefined) {
            if (!meetup.ridesEnabled) {
                return res.status(400).json({ error: "Rides aren't set up for this meetup." });
            }
            meetup.rides = meetup.rides.filter(r => !r.user.equals(user._id));
            if (ride !== null) {
                meetup.rides.push({
                    user: user._id,
                    role: ride.role,
                    seats: ride.role === 'driver' ? Number(ride.seats) : 0,
                });
            }
        }

        // Forces a version check so two people grabbing the last of an item can't both win.
        meetup.increment();
        try {
            await meetup.save();
            break;
        } catch (err) {
            if (err instanceof mongoose.Error.VersionError && attempt < MAX_RETRIES) continue;
            throw err;
        }
    }

    const updatedMeetup = await Meetup.findById(meetupId)
        .populate('group', 'name owner moderators timezone defaultLocation')
        .populate('members', 'firstName lastName profilePicture clerkId');

    res.status(200).json({ message: "Assignments updated.", meetup: await withGroupPremium(updatedMeetup) });
});
