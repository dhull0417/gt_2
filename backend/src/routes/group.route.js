import express from "express";
import {
  createGroup,
  getGroups,
  addMember,
  getGroupDetails, // 1. Import the new controller function
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// protected routes
router.get("/", protectRoute, getGroups);
router.post("/create", protectRoute, createGroup);

// 2. Add the new route for getting a single group's details
// This needs to be placed BEFORE the '/:groupId/add-member' route if you have routes with similar structures
// to avoid '/details' being interpreted as a groupId. In this case, the naming is distinct, so order is less critical.
router.get("/:groupId", protectRoute, getGroupDetails);

router.post("/:groupId/add-member", protectRoute, addMember);

export default router;

