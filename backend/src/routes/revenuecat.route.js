import express from "express";
import { handleWebhook } from "../controllers/revenuecat.controller.js";

const router = express.Router();

// Public on purpose: RevenueCat calls this. It authenticates with a shared secret header.
router.post("/webhook", handleWebhook);

export default router;
