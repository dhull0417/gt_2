import express from "express";
import {
  getCurrentUser,
  getUserProfile,
  syncUser,
  updateProfile,
  searchUsers,
  // FIXED: Import the updatePushToken controller function
  updatePushToken, 
} from "../controllers/user.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/profile/:username", getUserProfile);
router.get("/search", protectRoute, searchUsers);

router.post("/sync", protectRoute, syncUser);
router.get("/me", protectRoute, getCurrentUser);
router.put("/profile", protectRoute, updateProfile);

/**
 * Project 4: Push Notifications
 * Endpoint for the mobile app to register the device's push token.
 */
router.post("/push-token", protectRoute, updatePushToken);

export default router;