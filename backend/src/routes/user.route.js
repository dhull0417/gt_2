import express from "express";
import {
  getCurrentUser,
  getUserProfile,
  syncUser,
  updateProfile,
  searchUsers,
  updatePushToken,
  toggleGroupMute
} from "../controllers/user.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/profile/:username", getUserProfile);
router.get("/search", protectRoute, searchUsers);

router.post("/sync", protectRoute, syncUser);
router.get("/me", protectRoute, getCurrentUser);
router.put("/profile", protectRoute, updateProfile);
router.post("/push-token", protectRoute, updatePushToken);
router.patch("/mute-group", protectRoute, toggleGroupMute);

export default router;