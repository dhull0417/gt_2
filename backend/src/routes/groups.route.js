import express from "express";
import {
  createGroup,
  getGroupProfile,
  joinGroup,
  leaveGroup,
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// protected routes
router.post("/create", protectRoute, createGroup);
router.get("/:groupId", protectRoute, getGroupProfile);
router.post("/join/:groupId", protectRoute, joinGroup);
router.post("/leave/:groupId", protectRoute, leaveGroup);

export default router;