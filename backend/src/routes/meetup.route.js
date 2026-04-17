import express from "express";
import { 
    updateMeetup, 
    deleteMeetup, 
    cancelMeetup 
} from "../controllers/meetup.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();


// --- Management ---
router.patch("/:meetupId/cancel", protectRoute, cancelMeetup);
router.put("/:meetupId", protectRoute, updateMeetup);
router.delete("/:meetupId", protectRoute, deleteMeetup);

export default router;