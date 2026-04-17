import express from "express";
import { 
    updateMeetup, 
    deleteMeetup, 
    cancelMeetup,
    getMeetups,
    rsvpMeetup
} from "../controllers/meetup.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// --- Queries ---
router.get("/", protectRoute, getMeetups);

// --- Actions ---
router.post("/:meetupId/rsvp", protectRoute, rsvpMeetup);

// --- Management ---
router.patch("/:meetupId/cancel", protectRoute, cancelMeetup);
router.put("/:meetupId", protectRoute, updateMeetup);
router.delete("/:meetupId", protectRoute, deleteMeetup);

export default router;