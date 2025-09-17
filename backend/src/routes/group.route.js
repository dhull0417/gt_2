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
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, getGroups);
router.post("/create", protectRoute, createGroup);
router.get("/:groupId", protectRoute, getGroupDetails);
router.put("/:groupId", protectRoute, updateGroup);
router.delete("/:groupId", protectRoute, deleteGroup);
router.post("/:groupId/add-member", protectRoute, addMember);
router.post("/:groupId/leave", protectRoute, leaveGroup);
router.post("/:groupId/remove-member", protectRoute, removeMember);
router.post("/:groupId/events", protectRoute, createOneOffEvent);

export default router;