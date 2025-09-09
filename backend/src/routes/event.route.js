import express from "express";
import { getEvents, handleRsvp } from "../controllers/event.controller.js"; // 1. Import handleRsvp
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, getEvents);

// 2. Add the new route for submitting an RSVP
router.post("/:eventId/rsvp", protectRoute, handleRsvp);

export default router;