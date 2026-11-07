import express from "express";
import {
    updateMeetup,
    deleteMeetup,
    cancelMeetup,
    restoreMeetup,
    getMeetups,
    rsvpMeetup,
  setAssignments,
  setAnswers,
  setTeams,
    remindUndecided
} from "../controllers/meetup.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getAuth } from "@clerk/express";
import Meetup from "../models/meetup.model.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import mongoose from "mongoose";
import { canEditGuestsOf, guestRoom, loadClerkIds, promoteWaitlist } from "../utils/waitlist.js";
import { notifyAndPersist } from "../utils/push.notifications.js";

const router = express.Router();

// --- Queries ---
router.get("/", protectRoute, getMeetups);

// --- Actions ---
router.post("/:meetupId/rsvp", protectRoute, rsvpMeetup);
router.put("/:meetupId/assignments", protectRoute, setAssignments);
router.put("/:meetupId/answers", protectRoute, setAnswers);
router.put("/:meetupId/teams", protectRoute, setTeams);
router.post("/:meetupId/remind", protectRoute, remindUndecided);

router.patch("/:meetupId/guests", protectRoute, async (req, res) => {
    try {
        const { userId: clerkId } = getAuth(req);
        const { count } = req.body;
        if (typeof count !== 'number' || count < 0) {
            return res.status(400).json({ message: 'count must be a non-negative number' });
        }
        if (!Number.isInteger(count) || count > 50) {
            return res.status(400).json({ message: 'count must be a whole number up to 50' });
        }
        if (!mongoose.Types.ObjectId.isValid(req.params.meetupId)) return res.status(400).json({ message: 'Invalid meetup id' });
        const meetup = await Meetup.findById(req.params.meetupId);
        if (!meetup) return res.status(404).json({ message: 'Meetup not found' });
        if (meetup.status !== 'scheduled') return res.status(400).json({ message: 'This meetup is closed for changes' });

        // Only members of the meetup's group may add guests to it.
        const [guestUser, guestGroup] = await Promise.all([
            User.findOne({ clerkId }).select('_id').lean(),
            Group.findById(meetup.group).select('members').lean(),
        ]);
        if (!guestUser || !guestGroup || !guestGroup.members.some(m => m.equals(guestUser._id))) {
            return res.status(403).json({ message: 'You are not a member of this group' });
        }

        // backfill: older docs may lack a guests array
        if (!meetup.guests) meetup.guests = [];

        const existingIdx = meetup.guests.findIndex(g => g.userId === clerkId);
        const previousCount = existingIdx >= 0 ? (meetup.guests[existingIdx].count || 0) : 0;

        // Guests take spots like everyone else: refuse more than there is room for, whether or not
        // the host is In yet (otherwise guests added while Out would over-fill the meetup on "I'm In").
        if (count > previousCount && meetup.capacity > 0) {
            const clerkIds = await loadClerkIds(meetup.in);
            const { ok, room } = guestRoom(meetup, clerkIds, { hostId: guestUser._id, hostClerkId: clerkId, nextCount: count });
            if (!ok) {
                return res.status(409).json({
                    error: 'meetup_full',
                    message: room === 0 ? 'There are no spots left for guests.' : `There's only room for ${room} guest${room === 1 ? '' : 's'}.`,
                    room,
                });
            }
        }
        if (count === 0) {
            // Remove the entry entirely
            meetup.guests = meetup.guests.filter(g => g.userId !== clerkId);
        } else if (existingIdx >= 0) {
            // Direct subdocument mutation requires markModified so Mongoose tracks the change
            meetup.guests[existingIdx].count = count;
        } else {
            meetup.guests.push({ userId: clerkId, count });
        }
        meetup.markModified('guests');
        await meetup.save();

        // Fewer guests frees spots for people waiting.
        if (count < previousCount) {
            try { await promoteWaitlist(meetup._id); } catch (e) { console.error('Waitlist promotion failed:', e); }
        }

        const updated = await Meetup.findById(meetup._id)
            .populate('group', 'name owner moderators timezone defaultLocation')
            .populate('members', 'firstName lastName profilePicture clerkId');
        res.json({ meetup: updated });
    } catch (err) {
        console.error('Guest update error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Owners and moderators can lower (or clear) another member's guests, e.g. when a plus-one
// can't come after all. Only decreases are allowed for someone else; the host is notified
// and freed spots go to the waitlist.
router.patch("/:meetupId/guests/:hostClerkId", protectRoute, async (req, res) => {
    try {
        const { userId: clerkId } = getAuth(req);
        const { hostClerkId } = req.params;
        const { count } = req.body;
        if (!Number.isInteger(count) || count < 0 || count > 50) {
            return res.status(400).json({ message: 'count must be a whole number from 0 to 50' });
        }
        if (!mongoose.Types.ObjectId.isValid(req.params.meetupId)) return res.status(400).json({ message: 'Invalid meetup id' });
        const meetup = await Meetup.findById(req.params.meetupId);
        if (!meetup) return res.status(404).json({ message: 'Meetup not found' });
        if (meetup.status !== 'scheduled') return res.status(400).json({ message: 'This meetup is closed for changes' });

        const [requester, host, group] = await Promise.all([
            User.findOne({ clerkId }).select('_id').lean(),
            User.findOne({ clerkId: hostClerkId }), // full record: the push needs their tokens and preferences
            Group.findById(meetup.group).select('owner moderators').lean(),
        ]);
        if (!requester || !host || !group) return res.status(404).json({ message: 'Not found' });
        if (!canEditGuestsOf(requester._id, host._id, group)) {
            return res.status(403).json({ message: "You can't change this member's guests" });
        }

        const entry = (meetup.guests || []).find(g => g.userId === hostClerkId);
        const previousCount = entry?.count || 0;
        const isSelf = String(requester._id) === String(host._id);
        if (!isSelf && count > previousCount) {
            return res.status(400).json({ message: "You can only remove another member's guests" });
        }
        if (count === previousCount) return res.json({ meetup: await populatedMeetup(meetup._id) });
        if (count > previousCount && meetup.capacity > 0) {
            const clerkIds = await loadClerkIds(meetup.in);
            const { ok, room } = guestRoom(meetup, clerkIds, { hostId: host._id, hostClerkId, nextCount: count });
            if (!ok) return res.status(409).json({ error: 'meetup_full', message: room === 0 ? 'There are no spots left for guests.' : `There's only room for ${room} guest${room === 1 ? '' : 's'}.`, room });
        }

        meetup.guests = (meetup.guests || []).filter(g => g.userId !== hostClerkId);
        if (count > 0) meetup.guests.push({ userId: hostClerkId, count });
        meetup.markModified('guests');
        await meetup.save();

        if (count < previousCount) {
            try { await promoteWaitlist(meetup._id); } catch (e) { console.error('Waitlist promotion failed:', e); }
        }
        if (!isSelf) {
            try {
                await notifyAndPersist([host], {
                    title: meetup.name,
                    body: count === 0
                        ? `Your guests were removed from "${meetup.name}".`
                        : `Your guests for "${meetup.name}" were changed to ${count}.`,
                    data: { meetupId: meetup._id.toString(), groupId: meetup.group.toString(), type: 'guests-removed' },
                    type: 'guests-removed',
                    sender: requester._id,
                    meetup: meetup._id,
                    group: meetup.group,
                    meta: { count },
                });
            } catch (e) { console.error('Guest removal notification failed:', e); }
        }
        res.json({ meetup: await populatedMeetup(meetup._id) });
    } catch (err) {
        console.error('Guest removal error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

const populatedMeetup = (id) => Meetup.findById(id)
    .populate('group', 'name owner moderators timezone defaultLocation')
    .populate('members', 'firstName lastName profilePicture clerkId');

// --- Management ---
router.patch("/:meetupId/cancel", protectRoute, cancelMeetup);
router.patch("/:meetupId/restore", protectRoute, restoreMeetup);
router.put("/:meetupId", protectRoute, updateMeetup);
router.delete("/:meetupId", protectRoute, deleteMeetup);

export default router;