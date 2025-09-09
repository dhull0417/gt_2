import express from "express";
import { getEvents } from "../controllers/event.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// This route will handle GET requests to /api/events
router.get("/", protectRoute, getEvents);

export default router;
