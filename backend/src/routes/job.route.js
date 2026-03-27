import express from "express";
import { regenerateMeetups, expirePastMeetups, cleanupExpiredMeetups } from "../controllers/job.controller.js";
import { protectCron } from "../middleware/cron.middleware.js";

const router = express.Router();

router.post("/regenerate-meetups", protectCron, regenerateMeetups);
router.post("/expire-meetups", protectCron, expirePastMeetups); // New route for expiring meetups
router.post("/cleanup-meetups", protectCron, cleanupExpiredMeetups); // New route for cleaning up expired meetups

export default router;