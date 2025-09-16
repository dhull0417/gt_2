import express from "express";
import {
  createGroup,
  getGroups,
  getGroupDetails,
  addMember,
  deleteGroup,
  leaveGroup,
  removeMember,
  updateGroup, // 1. Import the new controller function
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, getGroups);
router.post("/create", protectRoute, createGroup);
router.get("/:groupId", protectRoute, getGroupDetails);
router.post("/:groupId/add-member", protectRoute, addMember);
router.delete("/:groupId", protectRoute, deleteGroup);
router.post("/:groupId/leave", protectRoute, leaveGroup);
router.post("/:groupId/remove-member", protectRoute, removeMember);
router.put("/:groupId", protectRoute, updateGroup);


export default router;