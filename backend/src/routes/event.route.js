import express from "express";
import { 
    getEvents, 
    handleRsvp, 
    updateEvent, 
    deleteEvent, 
    cancelEvent 
} from "../controllers/event.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// --- General ---
router.get("/", protectRoute, getEvents);

// --- RSVP Logic ---
router.post("/:eventId/rsvp", protectRoute, handleRsvp);

// --- Management ---
router.patch("/:eventId/cancel", protectRoute, cancelEvent);
router.put("/:eventId", protectRoute, updateEvent);
router.delete("/:eventId", protectRoute, deleteEvent);

export default router;