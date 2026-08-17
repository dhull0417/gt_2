import express from "express";
import { regenerateMeetups, expirePastMeetups, cleanupExpiredMeetups, notifyRsvpOpen, notifyMeetupReminder, expirePolls } from "../controllers/job.controller.js";
import { protectCron } from "../middleware/cron.middleware.js";

const router = express.Router();

router.post("/regenerate-meetups", protectCron, regenerateMeetups);
router.post("/expire-meetups", protectCron, expirePastMeetups);
router.post("/cleanup-meetups", protectCron, cleanupExpiredMeetups);
router.post("/notify-rsvp-open", protectCron, notifyRsvpOpen);
router.post("/notify-meetup-reminder", protectCron, notifyMeetupReminder);
router.post("/expire-polls", protectCron, expirePolls);

export default router;
