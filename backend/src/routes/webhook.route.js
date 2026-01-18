import express from "express";
import { handleChatWebhook } from "../controllers/webhook.controller.js";

const router = express.Router();

// GetStream webhooks must be publicly accessible (no protectRoute)
// Stream will send a signature in the headers if you configure it in their dashboard
router.post("/chat", handleChatWebhook);

export default router;