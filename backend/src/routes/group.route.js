import express from "express";
import {
  createGroup, getGroups, getGroupDetails, addMember, deleteGroup, updateGroup,
  leaveGroup, removeMember, createOneOffEvent, inviteUser, updateGroupSchedule
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

// TEST ID: 777 - Verification tag
console.log(">>> [TEST-777] GROUP ROUTE FILE INITIALIZING <<<");

const router = express.Router();

// Step 3 Deep Capture: Log every single interaction with this router
router.use((req, res, next) => {
    console.log(`>>> [TEST-777] ROUTER HIT: ${req.method} ${req.originalUrl} | Params: ${JSON.stringify(req.params)} <<<`);
    next();
});

router.get("/", protectRoute, getGroups);
router.post("/create", protectRoute, createGroup);
router.get("/:groupId", protectRoute, getGroupDetails);
router.put("/:groupId", protectRoute, updateGroup);

// Troubleshooting Step: Catch ANY method hitting the schedule path
router.all("/:groupId/schedule", (req, res, next) => {
    console.log(`>>> [TEST-777] PATH MATCH: Captured ${req.method} on /schedule path for ID: ${req.params.groupId} <<<`);
    if (req.method === 'PATCH') {
        console.log(">>> [TEST-777] Status: Proceeding to protectRoute <<<");
        return next();
    }
    res.status(405).json({ error: `Method ${req.method} not allowed on this troubleshooting route.` });
}, protectRoute, updateGroupSchedule);

router.delete("/:groupId", protectRoute, deleteGroup);
router.post("/:groupId/add-member", protectRoute, addMember);
router.post("/:groupId/leave", protectRoute, leaveGroup);
router.post("/:groupId/remove-member", protectRoute, removeMember);
router.post("/:groupId/events", protectRoute, createOneOffEvent);
router.post("/:groupId/invite", protectRoute, inviteUser);

export default router;