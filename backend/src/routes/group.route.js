import express from "express";
import {
  createGroup, getGroups, getGroupDetails, addMember, deleteGroup,
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, getGroups);
router.post("/create", protectRoute, createGroup);
router.get("/:groupId", protectRoute, getGroupDetails);
router.post("/:groupId/add-member", protectRoute, addMember);
router.delete("/:groupId", protectRoute, deleteGroup);

export default router;