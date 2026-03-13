import express from "express";
import { regenerateMeetups } from "../controllers/job.controller.js";
import { protectCron } from "../middleware/cron.middleware.js";

const router = express.Router();

router.post("/regenerate-meetups", protectCron, regenerateMeetups);

export default router;
