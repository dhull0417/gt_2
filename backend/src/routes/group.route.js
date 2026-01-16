import express from "express";
import {
  createGroup, getGroups, getGroupDetails, addMember, deleteGroup, updateGroup,
  leaveGroup, removeMember, createOneOffEvent, inviteUser, updateGroupSchedule
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

// TEST ID: 777 - If you don't see this exact number in Vercel, 
// the server is running an older or different file.
console.log(">>> [TEST-777] GROUP ROUTE FILE INITIALIZING <<<");

const router = express.Router();

router.use((req, res, next) => {
    console.log(`>>> [TEST-777] Global Incoming: ${req.method} ${req.originalUrl} <<<`);
    next();
});

router.get("/", protectRoute, getGroups);
router.post("/create", protectRoute, createGroup);
router.get("/:groupId", protectRoute, getGroupDetails);
router.put("/:groupId", protectRoute, updateGroup);

// Troubleshooting Step: Add tracing to verify if request clears authentication
router.patch("/:groupId/schedule", (req, res, next) => {
    console.log(`>>> [TEST-777] Tracing: PATCH /schedule reached BEFORE protectRoute <<<`);
    next();
}, protectRoute, (req, res, next) => {
    console.log(`>>> [TEST-777] Tracing: PATCH /schedule reached AFTER protectRoute (Auth Passed) <<<`);
    next();
}, updateGroupSchedule);

router.delete("/:groupId", protectRoute, deleteGroup);
router.post("/:groupId/add-member", protectRoute, addMember);
router.post("/:groupId/leave", protectRoute, leaveGroup);
router.post("/:groupId/remove-member", protectRoute, removeMember);
router.post("/:groupId/events", protectRoute, createOneOffEvent);
router.post("/:groupId/invite", protectRoute, inviteUser);

export default router;