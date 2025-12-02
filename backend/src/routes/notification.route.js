import express from "express";
import { getNotifications, acceptInvite, declineInvite, markNotificationsAsRead } from "../controllers/notification.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, getNotifications);
router.post("/:id/accept", protectRoute, acceptInvite);
router.post("/:id/decline", protectRoute, declineInvite);
router.post("/mark-read", protectRoute, markNotificationsAsRead);

export default router;