import express from "express";
import { 
    getMeetups, 
    handleRsvp, 
    updateMeetup, 
    deleteMeetup, 
    cancelmeetup 
} from "../controllers/meetup.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// --- General ---
router.get("/", protectRoute, getMeetups);

// --- RSVP Logic ---
router.post("/:meetupId/rsvp", protectRoute, handleRsvp);

// --- Management ---
router.patch("/:meetupId/cancel", protectRoute, cancelMeetup);
router.put("/:meetupId", protectRoute, updateMeetup);
router.delete("/:meetupId", protectRoute, deleteMeetup);

export default router;