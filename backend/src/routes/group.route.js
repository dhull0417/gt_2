import express from "express";
import {
  createGroup, 
  getGroups, 
  getGroupDetails, 
  addMember, 
  deleteGroup, 
  updateGroup,
  leaveGroup, 
  removeMember, 
  createOneOffEvent, 
  inviteUser, 
  updateGroupSchedule,
  toggleModerator
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// --- Group Management ---
router.get("/", protectRoute, getGroups);
router.post("/create", protectRoute, createGroup);
router.get("/:groupId", protectRoute, getGroupDetails);
router.put("/:groupId", protectRoute, updateGroup);
router.delete("/:groupId", protectRoute, deleteGroup);

// --- Moderator Assignment ---
router.patch("/:groupId/moderator", protectRoute, toggleModerator);

// --- Schedule & Events ---
// This route handles recurring schedule updates and automatic event regeneration
router.patch("/:groupId/schedule", protectRoute, updateGroupSchedule);
router.post("/:groupId/events", protectRoute, createOneOffEvent);

// --- Membership & Invites ---
router.post("/:groupId/add-member", protectRoute, addMember);
router.post("/:groupId/leave", protectRoute, leaveGroup);
router.post("/:groupId/remove-member", protectRoute, removeMember);
router.post("/:groupId/invite", protectRoute, inviteUser);

export default router;