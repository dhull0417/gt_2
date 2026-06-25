import express from "express";
import {
    updateMeetup,
    deleteMeetup,
    cancelMeetup,
    getMeetups,
    rsvpMeetup
} from "../controllers/meetup.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getAuth } from "@clerk/express";
import Meetup from "../models/meetup.model.js";
import User from "../models/user.model.js";

const router = express.Router();

// --- Queries ---
router.get("/", protectRoute, getMeetups);

// --- Actions ---
router.post("/:meetupId/rsvp", protectRoute, rsvpMeetup);

router.patch("/:meetupId/guests", protectRoute, async (req, res) => {
    try {
        const { userId: clerkId } = getAuth(req);
        const { count } = req.body;
        if (typeof count !== 'number' || count < 0) {
            return res.status(400).json({ message: 'count must be a non-negative number' });
        }
        const meetup = await Meetup.findById(req.params.meetupId);
        if (!meetup) return res.status(404).json({ message: 'Meetup not found' });

        // Ensure guests array exists (handles documents created before this field was added)
        if (!meetup.guests) meetup.guests = [];

        const existingIdx = meetup.guests.findIndex(g => g.userId === clerkId);
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

        const updated = await Meetup.findById(meetup._id)
            .populate('group', 'name owner moderators timezone defaultLocation')
            .populate('members', 'firstName lastName username profilePicture clerkId');
        res.json({ meetup: updated });
    } catch (err) {
        console.error('Guest update error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// --- Management ---
router.patch("/:meetupId/cancel", protectRoute, cancelMeetup);
router.put("/:meetupId", protectRoute, updateMeetup);
router.delete("/:meetupId", protectRoute, deleteMeetup);

export default router;