import express from "express";
import {
  getCurrentUser,
  syncUser,
  updateProfile,
  searchUsers,
  matchContacts,
  updatePushToken,
  updatePermissionStatus,
  toggleGroupMute,
  markGroupRead,
  deleteAccount,
} from "../controllers/user.controller.js";
import { getCalendarSyncUrl, getCalendarFeed } from "../controllers/calendar.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();  

router.get("/search", protectRoute, searchUsers);
router.post("/match-contacts", protectRoute, matchContacts);

router.post("/sync", protectRoute, syncUser);
router.get("/me", protectRoute, getCurrentUser);
router.put("/profile", protectRoute, updateProfile);
router.post("/push-token", protectRoute, updatePushToken);
router.patch("/permissions", protectRoute, updatePermissionStatus);
router.patch("/mute-group", protectRoute, toggleGroupMute);
router.patch("/groups/:groupId/read", protectRoute, markGroupRead);
router.delete("/account", protectRoute, deleteAccount);

// --- Calendar routes ---
// Protected: The mobile app fetches the user's specific URL
router.get("/calendar-url", protectRoute, getCalendarSyncUrl);

// Public: External calendars fetch the ICS file using the token query param
router.get("/calendar/feed", getCalendarFeed);

export default router;