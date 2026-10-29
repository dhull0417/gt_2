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
import { headcountOf, loadClerkIds, promoteWaitlist } from "../utils/waitlist.js";

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

        // Guests take spots like everyone else: refuse more than there is room for.
        if (count > previousCount && meetup.capacity > 0 && meetup.in.some(id => id.equals(guestUser._id))) {
            const clerkIds = await loadClerkIds(meetup.in);
            const used = headcountOf(meetup, clerkIds);
            if (used + (count - previousCount) > meetup.capacity) {
                const room = Math.max(0, meetup.capacity - used);
                return res.status(409).json({
                    error: 'meetup_full',
                    message: room === 0 ? 'There are no spots left for guests.' : `Only ${room} more spot${room === 1 ? '' : 's'} left for guests.`,
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

// --- Management ---
router.patch("/:meetupId/cancel", protectRoute, cancelMeetup);
router.patch("/:meetupId/restore", protectRoute, restoreMeetup);
router.put("/:meetupId", protectRoute, updateMeetup);
router.delete("/:meetupId", protectRoute, deleteMeetup);

export default router;