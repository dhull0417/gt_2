import express from "express";
import {
  getCurrentUser,
  syncUser,
  updateProfile,
  matchContacts,
  searchUsers,
  updatePushToken,
  removePushToken,
  updateNotificationPrefs,
  updatePermissionStatus,
  toggleGroupMute,
  togglePinGroup,
  markGroupRead,
  deleteAccount,
  syncPremium,
} from "../controllers/user.controller.js";
import { getCalendarSyncUrl, getCalendarFeed } from "../controllers/calendar.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();  

// LEGACY: only app 1.3.x and older call this (Group Details member search). Remove once nobody runs those builds.
router.get("/search", protectRoute, searchUsers);
router.post("/match-contacts", protectRoute, matchContacts);

router.post("/sync", protectRoute, syncUser);
router.get("/me", protectRoute, getCurrentUser);
router.put("/profile", protectRoute, updateProfile);
router.post("/push-token", protectRoute, updatePushToken);
router.delete("/push-token", protectRoute, removePushToken);
router.patch("/notification-prefs", protectRoute, updateNotificationPrefs);
router.patch("/permissions", protectRoute, updatePermissionStatus);
router.patch("/mute-group", protectRoute, toggleGroupMute);
router.patch("/pin-group", protectRoute, togglePinGroup);
router.patch("/groups/:groupId/read", protectRoute, markGroupRead);
router.delete("/account", protectRoute, deleteAccount);
// Called by the app right after a purchase / restore so Premium shows up without waiting for the webhook.
router.post("/premium/sync", protectRoute, syncPremium);

// --- Calendar routes ---
// Protected: The mobile app fetches the user's specific URL
router.get("/calendar-url", protectRoute, getCalendarSyncUrl);

// Public: External calendars fetch the ICS file using the token query param
router.get("/calendar/feed", getCalendarFeed);

export default router;