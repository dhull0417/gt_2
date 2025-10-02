import express from "express";
import { getNotifications, acceptInvite, declineInvite } from "../controllers/notification.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, getNotifications);
router.post("/:id/accept", protectRoute, acceptInvite);
router.post("/:id/decline", protectRoute, declineInvite);

export default router;