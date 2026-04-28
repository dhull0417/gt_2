// backend/src/routes/user.route.js
import express from "express";
import {
  getCurrentUser,
  getUserProfile,
  syncUser,
  updateProfile,
  searchUsers,
  updatePushToken,
  toggleGroupMute,
  deleteAccount,
} from "../controllers/user.controller.js";
import { getCalendarSyncUrl, getCalendarFeed } from "../controllers/calendar.controller.js"; // <-- Add this import
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();  

router.get("/profile/:username", getUserProfile);
router.get("/search", protectRoute, searchUsers);

router.post("/sync", protectRoute, syncUser);
router.get("/me", protectRoute, getCurrentUser);
router.put("/profile", protectRoute, updateProfile);
router.post("/push-token", protectRoute, updatePushToken);
router.patch("/mute-group", protectRoute, toggleGroupMute);
router.delete("/account", protectRoute, deleteAccount);

// --- NEW CALENDAR ROUTES ---
// Protected: The mobile app fetches the user's specific URL
router.get("/calendar-url", protectRoute, getCalendarSyncUrl);

// Public: External calendars fetch the ICS file using the token query param
router.get("/calendar/feed", getCalendarFeed);

export default router;