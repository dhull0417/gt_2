import express from "express";
import {
  createGroup,
  getGroups,
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// protected routes
router.get("/", protectRoute, getGroups);
router.post("/create", protectRoute, createGroup);
//router.post("/join/:groupId", protectRoute, joinGroup);
//router.post("/leave/:groupId", protectRoute, leaveGroup);

export default router;