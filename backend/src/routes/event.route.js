import express from "express";
import { getEvents, handleRsvp, updateEvent } from "../controllers/event.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, getEvents);
router.post("/:eventId/rsvp", protectRoute, handleRsvp);
router.put("/:eventId", protectRoute, updateEvent);

export default router;