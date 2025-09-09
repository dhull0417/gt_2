import express from "express";
import { regenerateEvents } from "../controllers/job.controller.js";
import { protectCron } from "../middleware/cron.middleware.js";

const router = express.Router();

// This route will handle POST requests to /api/jobs/regenerate-events
router.post("/regenerate-events", protectCron, regenerateEvents);

export default router;
