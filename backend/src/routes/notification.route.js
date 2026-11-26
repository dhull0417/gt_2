import express from "express";
import { getNotifications, acceptInvite, declineInvite, markNotificationsAsRead, deleteNotification, clearNotifications } from "../controllers/notification.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, getNotifications);
router.post("/:id/accept", protectRoute, acceptInvite);
router.post("/:id/decline", protectRoute, declineInvite);
router.post("/mark-read", protectRoute, markNotificationsAsRead);
router.delete("/", protectRoute, clearNotifications);
router.delete("/:id", protectRoute, deleteNotification);

export default router;