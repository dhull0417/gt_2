import express from "express";
import {
  getCurrentUser,
  getUserProfile,
  syncUser,
  updateProfile,
  searchUsers, // Import the new function
} from "../controllers/user.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/profile/:username", getUserProfile);
router.get("/search", protectRoute, searchUsers); // Add the new search route

router.post("/sync", protectRoute, syncUser);
router.get("/me", protectRoute, getCurrentUser);
router.put("/profile", protectRoute, updateProfile);

export default router;